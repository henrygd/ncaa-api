import { getDivisionCode, getSeasonYear, newCodesBySport } from "../codes";
import { fetchGqlScoreboard } from "../scoreboard/scoreboard";
import type { Contest } from "../scoreboard/types";
import { ensureSport, openTeamScheduleDb, upsertGames, upsertTeams } from "./db";
import type { GameRecord, IngestOptions, IngestResult, TeamRecord } from "./types";

function toSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toUnixSeconds(startTimeEpoch: string | number | undefined, startDate: string | undefined) {
  const raw = Number(startTimeEpoch);
  if (Number.isFinite(raw) && raw > 0) {
    return raw > 1_000_000_000_000 ? Math.floor(raw / 1000) : Math.floor(raw);
  }

  if (startDate) {
    const fallback = Date.parse(`${startDate}T00:00:00Z`);
    if (!Number.isNaN(fallback)) {
      return Math.floor(fallback / 1000);
    }
  }

  return 0;
}

function toYyyyMmDd(contestDate: string) {
  const [month, day, year] = contestDate.split("/");
  if (!month || !day || !year) {
    throw new Error(`Invalid contestDate format: ${contestDate}`);
  }
  return `${year}/${month.padStart(2, "0")}/${day.padStart(2, "0")}`;
}

function mapContestGame(
  contest: Contest,
  sport: string,
  division: string,
  season: number
): { game: GameRecord; teams: TeamRecord[] } | null {
  const teams = contest.teams ?? [];
  const home = teams.find((team) => team.isHome);
  const away = teams.find((team) => !team.isHome);
  const gameId = Number(contest.contestId);

  if (!home || !away || !Number.isInteger(gameId)) {
    return null;
  }

  const homeSlug = home.seoname || toSlug(home.nameShort || "");
  const awaySlug = away.seoname || toSlug(away.nameShort || "");

  if (!homeSlug || !awaySlug) {
    return null;
  }

  return {
    game: {
      game_id: gameId,
      sport,
      division,
      season,
      start_unix: toUnixSeconds(contest.startTimeEpoch, contest.startDate),
      home_slug: homeSlug,
      home: home.nameShort || homeSlug,
      away_slug: awaySlug,
      away: away.nameShort || awaySlug,
    },
    teams: [
      {
        slug: homeSlug,
        pretty_name: home.nameShort || homeSlug,
      },
      {
        slug: awaySlug,
        pretty_name: away.nameShort || awaySlug,
      },
    ],
  };
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

interface ScheduleDateEntry {
  contestDate?: string;
}

interface ScheduleDatesResponse {
  data?: {
    schedules?: {
      games?: ScheduleDateEntry[];
    };
  };
}

async function fetchSeasonDates(sport: string, division: string, seasonYear: number) {
  const sportData = newCodesBySport[sport as keyof typeof newCodesBySport];
  if (!sportData) {
    throw new Error(`Unsupported sport: ${sport}`);
  }

  const divisionCode = getDivisionCode(sport, division);
  if (typeof sportData.code !== "string" || sportData.code.length === 0) {
    throw new Error(`Unsupported scoreboard sport code for ${sport}`);
  }
  if (typeof divisionCode !== "number") {
    throw new Error(`Unsupported division code for ${sport}/${division}`);
  }
  const extensions = encodeURIComponent(
    JSON.stringify({
      persistedQuery: {
        version: 1,
        sha256Hash: "a25ad021179ce1d97fb951a49954dc98da150089f9766e7e85890e439516ffbf",
      },
    })
  );
  const variables = encodeURIComponent(
    JSON.stringify({
      sportCode: sportData.code,
      division: Number(divisionCode),
      seasonYear,
    })
  );

  const url = `https://sdataprod.ncaa.com/?extensions=${extensions}&queryName=NCAA_schedules_today_web&variables=${variables}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch schedule dates (${response.status})`);
  }

  const json = (await response.json()) as ScheduleDatesResponse;
  const rawDates: string[] = (json.data?.schedules?.games ?? [])
    .map((entry) => entry.contestDate)
    .filter((value: string | undefined): value is string => typeof value === "string");

  const dates = rawDates
    .filter((date) => /^\d{2}\/\d{2}\/\d{4}$/.test(date))
    .map(toYyyyMmDd)
    .sort();

  if (dates.length === 0) {
    throw new Error(`No daily contest dates available for ${sport}/${division}/${seasonYear}`);
  }

  return [...new Set(dates)];
}

async function fetchGamesForDate(
  sport: string,
  division: string,
  seasonYear: number,
  contestDate: string
) {
  const sportData = newCodesBySport[sport as keyof typeof newCodesBySport];
  if (!sportData) {
    throw new Error(`Unsupported sport: ${sport}`);
  }

  const divisionCode = getDivisionCode(sport, division);
  if (typeof sportData.code !== "string" || sportData.code.length === 0) {
    throw new Error(`Unsupported scoreboard sport code for ${sport}`);
  }
  if (typeof divisionCode !== "number") {
    throw new Error(`Unsupported division code for ${sport}/${division}`);
  }
  const isFootball = sportData.code === "MFB";

  if (isFootball) {
    throw new Error("Football ingest is not supported in this script yet");
  }

  const scoreboardDate = new Date(contestDate);
  const inferredSeasonYear = Number.isNaN(scoreboardDate.getTime())
    ? seasonYear
    : getSeasonYear(scoreboardDate);

  const payload = await fetchGqlScoreboard({
    sportCode: sportData.code,
    division: Number(divisionCode),
    seasonYear: inferredSeasonYear,
    contestDate,
  });

  const contests: Contest[] = payload?.data?.contests ?? [];
  const mapped = contests
    .map((contest) => mapContestGame(contest, sport, division, seasonYear))
    .filter((value): value is { game: GameRecord; teams: TeamRecord[] } => value !== null);

  return {
    contests,
    games: mapped.map((entry) => entry.game),
    teams: mapped.flatMap((entry) => entry.teams),
  };
}

export async function ingestTeamSchedule(options: IngestOptions): Promise<IngestResult> {
  const {
    sport,
    division,
    seasonYear,
    dbPath,
    dryRun = false,
    delayMs = 350,
    maxDates,
  } = options;

  const allDates = await fetchSeasonDates(sport, division, seasonYear);
  const dates = typeof maxDates === "number" && maxDates > 0 ? allDates.slice(0, maxDates) : allDates;

  const db = dryRun ? null : openTeamScheduleDb(dbPath);
  let datesProcessed = 0;
  let contestsProcessed = 0;
  let gamesPrepared = 0;
  let gamesWritten = 0;
  let teamsUpserted = 0;

  try {
    const sportId = db ? ensureSport(db, sport) : 0;

    for (const date of dates) {
      const { contests, games, teams } = await fetchGamesForDate(sport, division, seasonYear, date);
      contestsProcessed += contests.length;
      gamesPrepared += games.length;
      datesProcessed++;

      if (db) {
        teamsUpserted += upsertTeams(db, teams);
        gamesWritten += upsertGames(db, sportId, games);
      }

      if (delayMs > 0) {
        await delay(delayMs);
      }
    }
  } finally {
    db?.close();
  }

  return {
    sport,
    division,
    seasonYear,
    datesFound: allDates.length,
    datesProcessed,
    contestsProcessed,
    gamesPrepared,
    gamesWritten,
    teamsUpserted,
  };
}
