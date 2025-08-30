import { Elysia, NotFoundError } from "elysia";
import { parseHTML } from "linkedom";
import ExpiryMap from "expiry-map";
import { getSemaphore } from "@henrygd/semaphore";
import { createHash } from "crypto";

const instance_id = createHash("md5").digest("hex");

// set cache expiry to 30 min
const cache_30m = new ExpiryMap(30 * 60 * 1000);

// set scores cache expiry to 1 min
const cache_1m = new ExpiryMap(1 * 60 * 1000);

// valid routes for the app with their respective caches
const validRoutes = new Map([
  ["stats", cache_30m],
  ["rankings", cache_30m],
  ["standings", cache_30m],
  ["history", cache_30m],
  ["schedule", cache_30m],
  ["schools-index", cache_30m],
  ["game", cache_1m],
  ["scoreboard", cache_1m],
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
  // redirect index to github page
  .get("/", ({ redirect }) => redirect("https://github.com/henrygd/ncaa-api"))
  // validate request / set cache key
  .resolve(({ request, path, error, query: { page } }) => {
    // validate custom header value
    if (
      process.env.NCAA_HEADER_KEY &&
      request.headers.get("x-ncaa-key") !== process.env.NCAA_HEADER_KEY
    ) {
      return error(401);
    }
    // check that page param is an int
    if (page && !/^\d+$/.test(page)) {
      return error(400, "Page parameter must be an integer");
    }
    // check that resource is valid
    const basePath = path.split("/")[1];
    if (!validRoutes.has(basePath)) {
      return error(400, "Invalid resource");
    }
    return {
      basePath,
      cache: validRoutes.get(basePath) ?? cache_1m,
      cacheKey: path + (page ?? ""),
    };
  })
  .onBeforeHandle(({ set, cache, cacheKey }) => {
    set.headers["Content-Type"] = "application/json";
    set.headers["Cache-Control"] = `public, max-age=${
      cache === cache_1m ? 60 : 1800
    }`;
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }
  })
  // schools-index route to return list of all schools
  .get("/schools-index", async ({ cache, cacheKey, error }) => {
    const req = await fetch("https://www.ncaa.com/json/schools");
    try {
      const json = (await req.json()).map((school: Record<string, string>) => ({
        slug: school.slug,
        name: school.name?.trim(),
        long: school.long_name?.trim(),
      }));
      const data = JSON.stringify(json);
      cache.set(cacheKey, data);
      return data;
    } catch (err) {
      return error(500, "Error fetching data");
    }
  })
  // game route to retrieve game details
  .get(
    "/game/:id?/:page?",
    async ({ cache, cacheKey, error, params: { id, page } }) => {
      if (!id) {
        return error(400, "Game id is required");
      }
      // handle base game route
      if (!page) {
        const req = await fetch(
          `https://sdataprod.ncaa.com/?meta=GetGamecenterGameById_web&extensions={%22persistedQuery%22:{%22version%22:1,%22sha256Hash%22:%2293a02c7193c89d85bcdda8c1784925d9b64657f73ef584382e2297af555acd4b%22}}&variables={%22id%22:%22${id}%22,%22week%22:null,%22staticTestEnv%22:null}`
        );
        if (!req.ok) {
          return error(404, "Resource not found");
        }
        const data = JSON.stringify((await req.json())?.data);
        cache.set(cacheKey, data);
        return data;
      }
      // handle other game routes
      if (page === "play-by-play") {
        page = "pbp";
      } else if (page === "scoring-summary") {
        page = "scoringSummary";
      } else if (page === "team-stats") {
        page = "teamStats";
      }
      const req = await fetch(
        `https://data.ncaa.com/casablanca/game/${id}/${page}.json`
      );
      if (!req.ok) {
        return error(404, "Resource not found");
      }
      const data = JSON.stringify(await req.json());
      cache.set(cacheKey, data);
      return data;
    }
  )
  // schedule route to retrieve game dates
  .get(
    "/schedule/:sport/:division/*",
    async ({ cache, cacheKey, params, error }) => {
      const { sport, division } = params;

      const req = await fetch(
        `https://data.ncaa.com/casablanca/schedule/${sport}/${division}/${params["*"]}/schedule-all-conf.json`
      );

      if (!req.ok) {
        return error(404, "Resource not found");
      }

      const data = JSON.stringify(await req.json());
      cache.set(cacheKey, data);
      return data;
    }
  )
  // scoreboard route to fetch data from data.ncaa.com json endpoint
  .get(
    "/scoreboard/:sport/*",
    async ({ cache, cacheKey, params, set, error }) => {
      const semCacheKey = getSemaphore(cacheKey);
      await semCacheKey.acquire();
      try {
        if (cache.has(cacheKey)) {
          set.headers["x-score-cache"] = "hit";
          return cache.get(cacheKey);
        }

        // get division from url
        const division = params["*"].split("/")[0];

        // Parse URL path to extract year and week parameters for new football endpoint (TEMPORARY)
        const pathParts = params["*"].split("/");
        const year = pathParts[1]; // e.g., "2025"

        // Check if we should use new endpoint for D1 football in 2025
        if (shouldUseNewEndpoint(params.sport, division, year)) {
          const weekParam = pathParts[2]; // e.g., "1" or "week"
          const weekValue = pathParts[3]; // e.g., "1" if weekParam is "week"
          try {
            // Parse week parameter - support both direct week numbers and /week/X format
            let week: number | undefined = undefined;
            if (weekParam && !isNaN(parseInt(weekParam))) {
              // Direct week number: /2025/1
              week = parseInt(weekParam);
            } else if (
              weekParam === "week" &&
              weekValue &&
              !isNaN(parseInt(weekValue))
            ) {
              // Week format: /2025/week/1
              week = parseInt(weekValue);
            } else {
              // Default to current week or week 1 if no week specified
              week = 1;
            }

            log(
              `Fetching football scoreboard from new endpoint for ${year}, week ${week}`
            );

            const contestDate = undefined;

            const newData = await fetchFootballScoreboard(
              "MFB",
              11,
              parseInt(year),
              week,
              contestDate
            );
            const convertedData = convertToOldFormat(newData);
            const data = JSON.stringify(convertedData);
            cache.set(cacheKey, data);
            return data;
          } catch (err) {
            log(
              `Failed to fetch from new endpoint, falling back to old endpoint: ${err}`
            );
            // Fall through to old endpoint logic
          }
        }

        // find date in url
        const urlDateMatcher = /(\d{4}\/\d{2}\/\d{2})|(\d{4}\/(\d{2}|P))/;
        let urlDate = params["*"].match(urlDateMatcher)?.[0];

        if (urlDate) {
          // return 400 if date is more than a year in the future
          // (had runaway bot requesting every day until I noticed it in 2195)
          if (new Date(urlDate).getFullYear() > new Date().getFullYear() + 1) {
            return error(400, "Invalid date");
          }
        } else {
          // if date not in passed in url, fetch date from today.json
          urlDate = await getTodayUrl(params.sport, division);
        }

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
          log(`Fetching ${url}`);
          const res = await fetch(url);
          if (!res.ok) {
            return error(404, "Resource not found");
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
    }
  )
  // all other routes fetch data by scraping ncaa.com
  .get("/*", async ({ query: { page }, path, cache, cacheKey }) => {
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }
    // fetch data
    const data = await getData({ path, page });
    cache.set(cacheKey, data);
    return data;
  })
  .listen(3000);

log(`Server is running at ${app.server?.url}`);

//////////////////////////////////////////////////////////////////////////////
/////////////////////////////// FUNCTIONS ////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////

/**
 * Fetch football scoreboard data from new NCAA GraphQL endpoint
 * @param sport - sport code (e.g., 'MFB' for football)
 * @param division - division number
 * @param seasonYear - season year
 * @param week - week number (optional)
 * @param contestDate - specific date (optional)
 */
async function fetchFootballScoreboard(
  sport: string,
  division: number,
  seasonYear: number,
  week?: number,
  contestDate?: string
) {
  const variables = {
    sportCode: sport,
    division,
    seasonYear,
    contestDate,
    week,
  };

  const url = `https://sdataprod.ncaa.com/?meta=GetContests_web&extensions={"persistedQuery":{"version":1,"sha256Hash":"7287cda610a9326931931080cb3a604828febe6fe3c9016a7e4a36db99efdb7c"}}&variables=${encodeURIComponent(
    JSON.stringify(variables)
  )}`;

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
 * @returns data in old format
 */
function convertToOldFormat(newData: any) {
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

  const contests = newData?.data?.contests || [];
  const games = contests
    .map((contest: any) => {
      const teams = contest.teams || [];
      const homeTeam = teams.find((team: any) => team.isHome);
      const awayTeam = teams.find((team: any) => !team.isHome);

      if (!homeTeam || !awayTeam) {
        return null;
      }

      // Helper function to format team data
      const formatTeam = (team: any, isWinner: boolean) => ({
        score: team.score?.toString() || "",
        names: {
          char6: team.name6Char || "",
          short: team.nameShort || "",
          seo: team.seoname || "",
          full: "", // New format doesn't have full name, we'll leave empty
        },
        winner: isWinner,
        seed: team.seed?.toString() || "",
        description: "", // New format doesn't have description
        rank: team.teamRank?.toString() || "",
        conferences: [
          {
            conferenceName: "", // New format doesn't have conference name
            conferenceSeo: team.conferenceSeo || "",
          },
        ],
      });

      // Determine winner
      const isHomeWinner = homeTeam.isWinner;
      const isAwayWinner = awayTeam.isWinner;

      return {
        game: {
          gameID: contest.contestId?.toString() || "",
          away: formatTeam(awayTeam, isAwayWinner),
          finalMessage: contest.finalMessage || "",
          bracketRound: "",
          title: contest.teams
            ? `${awayTeam.nameShort || ""} ${homeTeam.nameShort || ""}`
            : "",
          contestName: "",
          url: contest.url || "",
          network: contest.broadcasterName || "",
          home: formatTeam(homeTeam, isHomeWinner),
          liveVideoEnabled: (contest.liveVideos || []).length > 0,
          startTime: contest.startTime || "",
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
    .filter(Boolean);

  // Generate MD5 sum of the games data for backwards compatibility
  const gamesString = JSON.stringify(games);
  const md5Sum = createHash("md5").update(gamesString).digest("hex");

  return {
    inputMD5Sum: md5Sum,
    instanceId: instance_id,
    updated_at: new Date().toISOString().replace("T", " ").substring(0, 19),
    games,
  };
}

/**
 * Check if this is a D1 football request that should use new endpoint
 * @param sport - sport parameter
 * @param division - division parameter
 * @param year - year from URL (optional)
 * @returns boolean indicating if new endpoint should be used
 */
function shouldUseNewEndpoint(sport: string, division: string, year?: string) {
  return sport === "football" && division === "fbs" && year === "2025";
}

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
  const url = `https://www.ncaa.com${opts.path}${
    opts.page && Number(opts.page) > 1 ? `/p${opts.page}` : ""
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

  let updated =
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
