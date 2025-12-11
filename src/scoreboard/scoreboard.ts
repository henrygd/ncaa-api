import { createHash } from "crypto";
import type {
  Contest,
  GraphQLResponse,
  NewScoreboardParams,
  OldFormatData,
  OldFormatGame,
  Team,
} from "./types";

// Re-export types for convenience
export type {
  NewScoreboardParams,
  GraphQLResponse,
  Contest,
  Team,
  OldFormatData,
  OldFormatGame,
};

const instance_id = createHash("md5").digest("hex");

/**
 * Fetch scoreboard data from new NCAA GraphQL endpoint
 */
export async function fetchGqlScoreboard(params: NewScoreboardParams) {
  const url = `https://sdataprod.ncaa.com/?extensions={"persistedQuery":{"version":1,"sha256Hash":"7287cda610a9326931931080cb3a604828febe6fe3c9016a7e4a36db99efdb7c"}}&variables=${JSON.stringify(params)}`;

  const req = await fetch(url);
  if (!req.ok) {
    throw new Error("Failed to fetch football scoreboard data");
  }

  const response = await req.json();
  return response;
}

/** Playoff weeks for college football (first round through championship) */
const PLAYOFF_WEEKS = [16, 17, 18, 19, 20];

/**
 * Fetch all playoff weeks and combine contests
 */
export async function fetchPlayoffScoreboard(
  baseParams: Omit<NewScoreboardParams, "week">
) {
  const responses = await Promise.all(
    PLAYOFF_WEEKS.map((week) => fetchGqlScoreboard({ ...baseParams, week }))
  );

  // Combine all contests from each week
  const allContests = responses.flatMap(
    (response) => response?.data?.contests || []
  );

  // Return in same structure as single week response
  return {
    data: {
      contests: allContests,
    },
  };
}

/**
 * Convert new NCAA GraphQL format to old format for backwards compatibility
 * @param newData - data from new GraphQL endpoint
 * @param sport - sport to fetch
 * @param division - division to fetch
 * @param date - date to fetch
 * @returns data in old format
 */
export async function convertToOldFormat(
  newData: GraphQLResponse,
  sport: string,
  division: string,
  date: string
) {
  // Helper function to normalize game state to compatible values
  const normalizeGameState = (gameState: string): string => {
    switch (gameState) {
      case "F":
        return "final";
      case "P":
        return "pre";
      case "I":
        return "live";
      default:
        return "pre"; // Default to pre for unknown states
    }
  };

  // Try to fetch old format data to get missing fields
  let oldFormatData: OldFormatData | null = null;
  if (!sport.startsWith("basket") && !sport.startsWith("football")) {
    // basketball and football are always 404 (possibly all of them as of late 2025)
    try {
      // Format week with leading zero for old endpoint compatibility
      const oldUrl = `https://data.ncaa.com/casablanca/scoreboard/${sport}/${division}/${date}/scoreboard.json`;
      const oldResponse = await fetch(oldUrl);
      if (oldResponse.ok) {
        oldFormatData = await oldResponse.json();
      } else {
        console.log(`Old endpoint returned status: ${oldResponse.status}`);
      }
    } catch (err) {
      // If old endpoint fails, continue with new data only
      console.log("Could not fetch old format data:", err);
    }
  }

  const contests = newData?.data?.contests || [];
  const games = await Promise.all(
    contests.map(async (contest: Contest) => {
      const teams = contest.teams || [];
      const homeTeam = teams.find((team: Team) => team.isHome);
      const awayTeam = teams.find((team: Team) => !team.isHome);

      if (!homeTeam || !awayTeam) {
        return null;
      }

      // Try to find matching game in old format data
      const findMatchingGame = (team1Name: string, team2Name: string) => {
        if (!oldFormatData?.games) return null;

        // Look for game with matching team names
        return oldFormatData.games.find((game: OldFormatGame) => {
          const homeShort = game.game?.home?.names?.short?.toLowerCase();
          const awayShort = game.game?.away?.names?.short?.toLowerCase();
          const team1Lower = team1Name.toLowerCase();
          const team2Lower = team2Name.toLowerCase();

          return (
            (homeShort === team1Lower && awayShort === team2Lower) ||
            (homeShort === team2Lower && awayShort === team1Lower)
          );
        });
      };

      const matchingOldGame = findMatchingGame(
        homeTeam.nameShort,
        awayTeam.nameShort
      );

      // Helper function to format team data
      const formatTeam = (team: Team, isWinner: boolean, isHome: boolean) => {
        // Try to get data from old format if available
        let conferenceName = "";
        let fullName = "";
        let description = "";

        if (matchingOldGame?.game) {
          const oldTeamData = isHome
            ? matchingOldGame.game.home
            : matchingOldGame.game.away;
          conferenceName = oldTeamData?.conferences?.[0]?.conferenceName || "";
          fullName = oldTeamData?.names?.full || "";
          description = oldTeamData?.description || "";
        }

        return {
          score: team.score?.toString() || "",
          names: {
            char6: team.name6Char || "",
            short: team.nameShort || "",
            seo: team.seoname || "",
            full: fullName, // Use old format data if available
          },
          winner: isWinner,
          seed: team.seed?.toString() || "",
          description: description, // Use old format data if available
          rank: team.teamRank?.toString() || "",
          conferences: [
            {
              conferenceName: conferenceName, // Use old format data if available
              conferenceSeo: team.conferenceSeo || "",
            },
          ],
        };
      };

      // Determine winner
      const isHomeWinner = homeTeam.isWinner;
      const isAwayWinner = awayTeam.isWinner;

      // Format start time to match old format
      let startTime = contest.startTime || "";
      if (startTime && contest.startDate) {
        // Convert to old format like "12:00PM ET"
        const date = new Date(`${contest.startDate} ${startTime}`);
        if (!Number.isNaN(date.getTime())) {
          startTime = `${date.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          })} ET`;
        }
      }

      return {
        game: {
          gameID: contest.contestId?.toString() || "",
          away: formatTeam(awayTeam, isAwayWinner, false),
          finalMessage: contest.finalMessage || "",
          bracketRound: "",
          title: contest.teams
            ? `${awayTeam.nameShort || ""} ${homeTeam.nameShort || ""}`
            : "",
          contestName: "",
          url: contest.url || "",
          network:
            matchingOldGame?.game?.network || contest.broadcasterName || "",
          home: formatTeam(homeTeam, isHomeWinner, true),
          liveVideoEnabled: (contest.liveVideos || []).length > 0,
          startTime: startTime,
          startTimeEpoch: contest.startTimeEpoch?.toString() || "",
          bracketId: "",
          gameState: normalizeGameState(contest.gameState || ""),
          startDate: contest.startDate || "",
          currentPeriod: contest.currentPeriod || "",
          videoState: "",
          bracketRegion: "",
          contestClock: contest.contestClock || "0:00",
        },
      };
    })
  );

  const filteredGames = games.filter(Boolean);

  // Generate MD5 sum of the games data for backwards compatibility
  const gamesString = JSON.stringify(filteredGames);
  const md5Sum = createHash("md5").update(gamesString).digest("hex");

  return {
    inputMD5Sum: md5Sum,
    instanceId: instance_id,
    updated_at: new Date().toISOString().replace("T", " ").substring(0, 19),
    games: filteredGames,
  };
}
