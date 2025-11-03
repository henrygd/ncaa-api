import { getSemaphore } from "@henrygd/semaphore";
import { createHash } from "crypto";
import { Elysia, NotFoundError, t } from "elysia";
import ExpiryMap from "expiry-map";
import { parseHTML } from "linkedom";
import {
  customHashesBySeason,
  type DivisionKey,
  getDivisionCode,
  getScheduleBySportAndDivision,
  newCodesBySport,
  Season,
  seasonIsNewFormat,
} from "./codes";
import { openapiSpec } from "./openapi";

const instance_id = createHash("md5").digest("hex");

// set cache expiry to 30 min
const cache_30m = new ExpiryMap(30 * 60 * 1000);

// set scores cache expiry to 1 min
const cache_45s = new ExpiryMap(1 * 45 * 1000);

// valid routes for the app with their respective caches
const validRoutes = new Map([
  ["stats", cache_30m],
  ["rankings", cache_30m],
  ["standings", cache_30m],
  ["history", cache_30m],
  ["schedule", cache_30m],
  ["schools-index", cache_30m],
  ["game", cache_45s],
  ["scoreboard", cache_45s],
  ["schedule-alt", cache_30m],
]);

/** log message to console with timestamp */
function log(str: string) {
  console.log(
    `[${new Date().toISOString().substring(0, 19).replace("T", " ")}] ${str}`
  );
}

//////////////////////////////////////////////////////////////////////////////
//////////////////////////////// ELYSIA //////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////

export const app = new Elysia()
  .use(openapiSpec)
  .onError(({ error, code }) => {
    if (code === "VALIDATION") return error.detail(error.message);
  })
  // redirect index to github page
  .get("/", ({ redirect }) => redirect("/openapi"), { detail: { hide: true } })
  // validate request / set cache key
  .resolve(({ request, path, query: { page }, status }) => {
    // validate custom header value
    if (
      process.env.NCAA_HEADER_KEY &&
      request.headers.get("x-ncaa-key") !== process.env.NCAA_HEADER_KEY
    ) {
      return status(401);
    }
    // check that page param is an int
    if (page && !/^\d+$/.test(page)) {
      return status(400, "Page parameter must be an integer");
    }
    // check that resource is valid
    const basePath = path.split("/")[1];
    if (!validRoutes.has(basePath)) {
      return status(400, "Invalid resource");
    }
    return {
      basePath,
      cache: validRoutes.get(basePath) ?? cache_45s,
      cacheKey: path + (page ?? ""),
    };
  })
  .onBeforeHandle(({ set, cache, cacheKey }) => {
    set.headers["Content-Type"] = "application/json";
    set.headers["Cache-Control"] =
      `public, max-age=${cache === cache_45s ? 60 : 1800}`;
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }
  })
  // schools-index route to return list of all schools
  .get(
    "/schools-index",
    async ({ cache, cacheKey, status }) => {
      const req = await fetch("https://www.ncaa.com/json/schools");
      try {
        const json = (await req.json()).map(
          (school: Record<string, string>) => ({
            slug: school.slug,
            name: school.name?.trim(),
            long: school.long_name?.trim(),
          })
        );
        const data = JSON.stringify(json);
        cache.set(cacheKey, data);
        return data;
      } catch (_) {
        return status(500, "Error fetching data");
      }
    },
    { detail: { hide: true } }
  )
  .group("/game", (app) =>
    app
      // game route to retrieve game details
      .get(
        "/:id",
        async ({ cache, cacheKey, status, params: { id } }) => {
          const req = await fetch(
            `https://sdataprod.ncaa.com/?meta=GetGamecenterGameById_web&extensions={%22persistedQuery%22:{%22version%22:1,%22sha256Hash%22:%2293a02c7193c89d85bcdda8c1784925d9b64657f73ef584382e2297af555acd4b%22}}&variables={%22id%22:%22${id}%22,%22week%22:null,%22staticTestEnv%22:null}`
          );
          if (!req.ok) {
            return status(404, "Resource not found");
          }
          const data = JSON.stringify((await req.json())?.data);
          cache.set(cacheKey, data);
          return data;
        },
        { detail: { hide: true } }
      )
      .get(
        "/:id/boxscore",
        async ({ cache, cacheKey, status, params: { id } }) => {
          // new boxscore graphql endpoint
          if (seasonIsNewFormat(id)) {
            const hash = customHashesBySeason[id.slice(0, 3)]?.boxscore ?? "babb939def47c602a6e81af7aa3f6b35197fb1f1b1a2f2b081f3a3e4924be82e"
            const req = await fetch(`https://sdataprod.ncaa.com/?extensions={"persistedQuery":{"version":1,"sha256Hash":"${hash}"}}&variables={"contestId":"${id}","staticTestEnv":null}`);
            if (req.ok) {
              const json = await req.json();
              if (json?.data?.boxscore) {
                const data = JSON.stringify(json.data.boxscore);
                cache.set(cacheKey, data);
                return data;
              }
            }
          }
          // handle other game routes
          const req = await fetch(
            `https://data.ncaa.com/casablanca/game/${id}/boxscore.json`
          );
          if (!req.ok) {
            return status(404, "Resource not found");
          }
          const data = JSON.stringify(await req.json());
          cache.set(cacheKey, data);
          return data;
        },
        { detail: { hide: true } }
      )
      .get(
        "/:id/play-by-play",
        async ({ cache, cacheKey, status, params: { id } }) => {
          // new football play by play graphql endpoint
          if (seasonIsNewFormat(id)) {
            const hash = customHashesBySeason[id.slice(0, 3)]?.playbyplay ?? "47928f2cabc7a164f0de0ed535a623bdf5a852cce7c30d6a6972a38609ba46a2"
            const req = await fetch(
              `https://sdataprod.ncaa.com/?extensions={"persistedQuery":{"version":1,"sha256Hash":"${hash}"}}&variables={"contestId":"${id}","staticTestEnv":null}`
            );
            if (req.ok) {
              const json = await req.json();
              if (json?.data?.playbyplay) {
                const data = JSON.stringify(json.data.playbyplay);
                cache.set(cacheKey, data);
                return data;
              }
            }
          }
          const req = await fetch(
            `https://data.ncaa.com/casablanca/game/${id}/pbp.json`
          );
          if (!req.ok) {
            return status(404, "Resource not found");
          }
          const data = JSON.stringify(await req.json());
          cache.set(cacheKey, data);
          return data;
        },
        { detail: { hide: true } }
      )
      .get(
        "/:id/scoring-summary",
        async ({ cache, cacheKey, status, params: { id } }) => {
          // new football scoring summary graphql endpoint
          if (seasonIsNewFormat(id)) {
            const req = await fetch(
              `https://sdataprod.ncaa.com/?extensions={"persistedQuery":{"version":1,"sha256Hash":"7f86673d4875cd18102b7fa598e2bc5da3f49d05a1c15b1add0e2367ee890198"}}&variables={"contestId":"${id}","staticTestEnv":null}`
            );
            if (req.ok) {
              const json = await req.json();
              if (json?.data?.scoringSummary) {
                const data = JSON.stringify(json.data.scoringSummary);
                cache.set(cacheKey, data);
                return data;
              }
            }
          }
          const req = await fetch(
            `https://data.ncaa.com/casablanca/game/${id}/scoringSummary.json`
          );
          if (!req.ok) {
            return status(404, "Resource not found");
          }
          const data = JSON.stringify(await req.json());
          cache.set(cacheKey, data);
          return data;
        },
        { detail: { hide: true } }
      )
      .get(
        "/:id/team-stats",
        async ({ cache, cacheKey, status, params: { id } }) => {
          // new football team stats graphql endpoint
          if (seasonIsNewFormat(id)) {
            const hash = customHashesBySeason[id.slice(0, 3)]?.teamStats ?? "b41348ee662d9236483167395b16bb6ab36b12e2908ef6cd767685ea8a2f59bd"
            const req = await fetch(
              `https://sdataprod.ncaa.com/?extensions={"persistedQuery":{"version":1,"sha256Hash":"${hash}"}}&variables={"contestId":"${id}","staticTestEnv":null}`
            );
            if (req.ok) {
              const json = await req.json();
              if (json?.data?.boxscore) {
                const data = JSON.stringify(json.data.boxscore);
                cache.set(cacheKey, data);
                return data;
              }
            }
          }
          const req = await fetch(
            `https://data.ncaa.com/casablanca/game/${id}/teamStats.json`
          );
          if (!req.ok) {
            return status(404, "Resource not found");
          }
          const data = JSON.stringify(await req.json());
          cache.set(cacheKey, data);
          return data;
        },
        { detail: { hide: true } }
      )
  )
  // schedule route to retrieve game dates
  .get(
    "/schedule/:sport/:division/*",
    async ({ cache, cacheKey, params, status }) => {
      const req = await fetch(
        `https://data.ncaa.com/casablanca/schedule/${params.sport}/${params.division}/${params["*"]}/schedule-all-conf.json`
      );

      if (!req.ok) {
        return status(404, "Resource not found");
      }

      const data = JSON.stringify(await req.json());
      cache.set(cacheKey, data);
      return data;
    },
    { detail: { hide: true } }
  )
  .get(
    "/schedule-alt/:sport/:division/:year",
    async ({ cache, cacheKey, params, status }) => {
      const sportCode =
        newCodesBySport[params.sport as keyof typeof newCodesBySport].code;
      if (!sportCode) {
        return status(400, "Invalid sport");
      }
      const divisionCode = getDivisionCode(params.sport, params.division);
      if (!divisionCode) {
        return status(400, "Invalid division");
      }
      const url = `https://sdataprod.ncaa.com/?extensions={"persistedQuery":{"version":1,"sha256Hash":"a25ad021179ce1d97fb951a49954dc98da150089f9766e7e85890e439516ffbf"}}&queryName=NCAA_schedules_today_web&variables={"sportCode":"${sportCode}","division":${divisionCode},"seasonYear":${params.year}}`;
      const req = await fetch(url);

      if (!req.ok) {
        return status(404, "Resource not found");
      }

      const data = JSON.stringify(await req.json());
      cache.set(cacheKey, data);
      return data;
    },
    { detail: { hide: true } }
  )
  // scoreboard route to fetch data from data.ncaa.com json endpoint
  .get(
    "/scoreboard/:sport/*",
    async ({ cache, cacheKey, params, set, status }) => {
      const semCacheKey = getSemaphore(cacheKey);
      await semCacheKey.acquire();
      try {
        if (cache.has(cacheKey)) {
          set.headers["x-score-cache"] = "hit";
          return cache.get(cacheKey);
        }

        // Parse URL path to extract year and week parameters
        const [division, year] = params["*"].split("/");

        // find date in url
        const urlDateMatcher = /(\d{4}\/\d{2}\/\d{2})|(\d{4}\/(\d{2}|P))/;
        let urlDate = params["*"].match(urlDateMatcher)?.[0];

        if (urlDate) {
          // return 400 if date is more than a year in the future
          // (had runaway bot requesting every day until I noticed it in 2195)
          if (new Date(urlDate).getFullYear() > new Date().getFullYear() + 1) {
            return status(400, "Invalid date");
          }
        } else {
          // if date not in passed in url, fetch date from today.json
          urlDate = await getTodayUrl(params.sport, division);
        }

        // Check if we should use new endpoint
        // Use the year from URL
        const effectiveYear = year || new Date().getFullYear().toString();
        const supportsNewApi =
          effectiveYear >= "2026" ||
          (effectiveYear === "2025" &&
            [Season.Fall, Season.Winter].includes(newCodesBySport[params.sport]?.season));

        if (params.sport in newCodesBySport && supportsNewApi) {
          try {
            const sportCode = newCodesBySport[params.sport].code;
            // Check week-based cache first for shared caching
            const weekCacheKey = `${sportCode}_${division}_${urlDate}`;
            if (cache.has(weekCacheKey)) {
              set.headers["x-score-cache"] = "hit";
              return cache.get(weekCacheKey);
            }

            const divisionCode = getDivisionCode(params.sport, division);

            const newParams: NewScoreboardParams = {
              sportCode,
              division: divisionCode,
              seasonYear: parseInt(effectiveYear, 10),
            };

            if (sportCode === "MFB") {
              newParams.week = parseInt(urlDate.split("/")[1] ?? "1", 10);
            } else {
              newParams.contestDate = urlDate;
            }

            const newData = await fetchGqlScoreboard(newParams);
            const convertedData = await convertToOldFormat(
              newData,
              params.sport,
              division,
              urlDate
            );
            const data = JSON.stringify(convertedData);

            // Use week-based cache key for shared caching across different URL formats
            cache.set(weekCacheKey, data);

            // Also cache under the original cache key for consistency
            cache.set(cacheKey, data);
            return data;
          } catch (err) {
            log(
              `Failed to fetch from new endpoint, falling back to old endpoint: ${err}`
            );
            // Fall through to old endpoint logic
          }
        }

        // Use old endpoint logic
        const url = `https://data.ncaa.com/casablanca/scoreboard/${params.sport}/${division}/${urlDate}/scoreboard.json`;

        const semUrl = getSemaphore(url);
        await semUrl.acquire();
        try {
          // check cache
          if (cache.has(url)) {
            set.headers["x-score-cache"] = "hit";
            return cache.get(url);
          }
          // fetch data
          const res = await fetch(url);
          if (!res.ok) {
            return status(404, "Resource not found");
          }
          const data = JSON.stringify(await res.json());
          cache.set(cacheKey, data);
          cache.set(url, data);
          return data;
        } finally {
          semUrl.release();
        }
      } finally {
        semCacheKey.release();
      }
    },
    { detail: { hide: true } }
  )
  // all other routes fetch data by scraping ncaa.com
  .get(
    "/*",
    async ({ query: { page }, path, cache, cacheKey }) => {
      if (cache.has(cacheKey)) {
        return cache.get(cacheKey);
      }
      // fetch data
      const data = JSON.stringify(await getData({ path, page }));
      cache.set(cacheKey, data);
      return data;
    },
    { detail: { hide: true } }
  )
  .listen(3000);

log(`Server is running at ${app.server?.url}`);

//////////////////////////////////////////////////////////////////////////////
/////////////////////////////// FUNCTIONS ////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////

interface NewScoreboardParams {
  sportCode: string;
  division: number;
  seasonYear: number;
  week?: number;
  contestDate?: string;
}

/**
 * Fetch scoreboard data from new NCAA GraphQL endpoint
 */
async function fetchGqlScoreboard(params: NewScoreboardParams) {
  const url = `https://sdataprod.ncaa.com/?extensions={"persistedQuery":{"version":1,"sha256Hash":"7287cda610a9326931931080cb3a604828febe6fe3c9016a7e4a36db99efdb7c"}}&variables=${JSON.stringify(params)}`;

  const req = await fetch(url);
  if (!req.ok) {
    throw new Error("Failed to fetch football scoreboard data");
  }

  const response = await req.json();
  return response;
}

/**
 * Convert new NCAA GraphQL format to old format for backwards compatibility
 * @param newData - data from new GraphQL endpoint
 * @param sport - sport to fetch
 * @param division - division to fetch
 * @param date - date to fetch
 * @returns data in old format
 */
async function convertToOldFormat(
  newData: any,
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
  let oldFormatData = null;
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

  const contests = newData?.data?.contests || [];
  const games = await Promise.all(
    contests.map(async (contest: any) => {
      const teams = contest.teams || [];
      const homeTeam = teams.find((team: any) => team.isHome);
      const awayTeam = teams.find((team: any) => !team.isHome);

      if (!homeTeam || !awayTeam) {
        return null;
      }

      // Try to find matching game in old format data
      const findMatchingGame = (team1Name: string, team2Name: string) => {
        if (!oldFormatData?.games) return null;

        // Look for game with matching team names
        return oldFormatData.games.find((game: any) => {
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
      const formatTeam = (team: any, isWinner: boolean, isHome: boolean) => {
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

/**
 * Check if this is a D1 football request that should use new endpoint
 * @param sport - sport parameter
 * @param division - division parameter
 * @param year - year from URL (optional)
 * @returns boolean indicating if new endpoint should be used
 */
// function shouldUseNewEndpoint(sport: string, division: string, year?: string) {
//   return sport === "football" && division === "fbs" && year === "2025";
// }

/**
 * Fetch proper url date for today from ncaa.com
 * @param sport - sport to fetch
 * @param division - division to fetch
 */
async function getTodayUrl(sport: string, division: string): Promise<string> {
  // check cache
  const cacheKey = `today-${sport}-${division}`;
  if (cache_30m.has(cacheKey)) {
    return cache_30m.get(cacheKey);
  }

  log(`Fetching today.json for ${sport} ${division}`);
  try {
    const today = await getScheduleBySportAndDivision(
      sport,
      division as DivisionKey
    );
    cache_30m.set(cacheKey, today);
    return today;
  } catch (err) {
    log(
      `Failed to fetch schedule from new endpoint, falling back to old endpoint: ${err}`
    );
    // Fall through to old endpoint logic
  }
  const req = await fetch(
    `https://data.ncaa.com/casablanca/schedule/${sport}/${division}/today.json`
  );
  if (!req.ok) {
    throw new NotFoundError(JSON.stringify({ message: "Resource not found" }));
  }
  const data = await req.json();
  cache_30m.set(cacheKey, data.today);
  return data.today as string;
}

/**
 * Fetch data from ncaa.com
 * @param opts.path - path to fetch from ncaa.com
 * @param opts.page - page number to fetch
 */
async function getData(opts: { path: string; page?: string }) {
  // fetch html
  const url = `https://www.ncaa.com${opts.path}${opts.page && Number(opts.page) > 1 ? `/p${opts.page}` : ""
    }`;
  log(`Fetching ${url}`);
  const res = await fetch(url);

  if (!res.ok) {
    throw new NotFoundError(JSON.stringify({ message: "Resource not found" }));
  }

  // parse with linkedom
  const { document } = parseHTML(await res.text());

  const table = document.querySelector("main table") as HTMLTableElement;

  if (!table) {
    throw new Error("Could not parse data");
  }

  const route = opts.path.split("/")[1];

  // find general info
  const sport =
    document.querySelector("h2.page-title")?.textContent?.trim() ?? "";

  let title = "";
  const titleEl = document.querySelectorAll(
    ".stats-header__lower__title, main option[selected], main h1.node__title"
  )?.[0];

  if (titleEl) {
    titleEl.querySelector(".hidden")?.remove();
    title = titleEl.textContent?.trim() ?? "";
  } else {
    title =
      route === "standings" ? "ALL CONFERENCES" : document.title.split(" |")[0];
  }

  const updated =
    document
      .querySelectorAll(
        ".stats-header__lower__desc, .rankings-last-updated, .standings-last-updated"
      )?.[0]
      ?.textContent?.replace(/Last updated /i, "")
      .trim() ?? "";

  // figure out pages
  let page = 1;
  let pages = 1;
  const tablePageLinks = document.querySelectorAll(
    "ul.stats-pager li:not(.stats-pager__li--prev):not(.stats-pager__li--next)"
  );
  if (tablePageLinks.length > 0) {
    page =
      [...tablePageLinks].findIndex((li) => li.classList.contains("active")) +
      1;
    pages = tablePageLinks.length;
  }

  const data =
    route === "standings" ? parseStandings(document) : parseTable(table);

  return { sport, title, updated, page, pages, data };
}

/**
 * Parse standings pages (multiple tables)
 * @param document - document to parse
 */
function parseStandings(document: Document) {
  const data = [];

  const conferenceTitles = document.querySelectorAll(".standings-conference");

  for (const conf of conferenceTitles) {
    const confTable = conf.nextElementSibling as HTMLTableElement;
    if (!confTable) {
      throw new Error("Could not parse data");
    }
    data.push({
      conference: conf.textContent?.trim() ?? "",
      standings: parseTable(confTable),
    });
  }

  return data;
}

/**
 * Parse table elements
 * @param table - table element to parse
 */
function parseTable(table: HTMLTableElement) {
  const data = [];

  let keys: (string | null)[] = [];

  // standings tables have subheaders :/
  const hasSubheader = table.querySelector(".standings-table-subheader");

  if (hasSubheader) {
    keys = getStandingsHeaders(table);
  } else {
    keys = [...table.querySelectorAll("thead th")].map((th) => th.textContent);
  }

  const rows = table.querySelectorAll("tbody tr:not(.subdiv-header)");
  for (const row of rows) {
    const rowData: Record<string, string> = {};
    const cells = row.querySelectorAll("td");
    for (let i = 0; i < cells.length; i++) {
      const key = keys[i];
      if (key) {
        rowData[key] = cells[i].textContent?.trim() ?? "";
      }
    }
    data.push(rowData);
  }
  return data;
}

/**
 * Merge table headers that span multiple columns.
 * Use the first row of headers as the base according to colspan and
 * concat the second row th textContent to the first row th textContent
 * @param table - table element to parse
 */
function getStandingsHeaders(table: HTMLTableElement) {
  const tableRowOne = table.querySelector(".standings-table-header");
  const tableRowTwo = table.querySelector(".standings-table-subheader");

  if (!tableRowOne || !tableRowTwo) {
    throw new Error("Could not parse data");
  }

  const headings: (string | null)[] = [];
  const rowOneHeadings: string[] = [];

  const rowOneThs = tableRowOne.querySelectorAll("th");
  for (const th of rowOneThs) {
    const colspan = Number(th.getAttribute("colspan")) || 1;
    const heading = th.textContent?.trim() ?? "";
    for (let i = 0; i < colspan; i++) {
      rowOneHeadings.push(heading);
    }
  }

  const rowTwoThs = tableRowTwo.querySelectorAll("th");
  for (let i = 0; i < rowTwoThs.length; i++) {
    const th = rowTwoThs[i];
    const heading = th.textContent?.trim() ?? "";
    headings.push(rowOneHeadings[i] + (heading ? ` ${heading}` : ""));
  }

  return headings;
}

process.on("SIGINT", async () => {
  console.log("\nShutting down...");
  await app.stop();
  process.exit(0);
});
