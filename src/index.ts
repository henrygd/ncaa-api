import { getSemaphore } from "@henrygd/semaphore";
import { Elysia, NotFoundError, t } from "elysia";
import ExpiryMap from "expiry-map";
import { parseHTML } from "linkedom";
import {
  boxscoreHashes,
  type DivisionKey,
  getDivisionCode,
  getScheduleBySportAndDivision,
  getSeasonYear,
  newCodesBySport,
  playByPlayHashes,
  teamStatsHashes,
} from "./codes";
import { openapiSpec } from "./openapi";
import { parseStatSelect } from "./stats/stat-category-parser";
import {
  convertToOldFormat,
  fetchGqlScoreboard,
  fetchPlayoffScoreboard,
} from "./scoreboard/scoreboard";
import type { NewScoreboardParams } from "./scoreboard/types";

// 30 minute cache for most routes
const cache_30m = new ExpiryMap(30 * 60 * 1000);

// 45 second cache for scores
const cache_45s = new ExpiryMap(1 * 45 * 1000);

// 24 hour cache for stat metadata (stat paths rarely change)
const cache_24h = new ExpiryMap(24 * 60 * 60 * 1000);

// 5 minute cache for brackets
// const cache_5m = new ExpiryMap(5 * 60 * 1000);

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
  ["news", cache_30m],
  ["brackets", cache_45s] // make this 45s during the tournament
]);

/** log message to console with timestamp */
function log(str: string) {
  console.log(`[${new Date().toISOString().substring(0, 19).replace("T", " ")}] ${str}`);
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
  // fetch and return logo svg
  .get("/logo/:school", async ({ params: { school }, query: { dark }, set, status }) => {
    const slug = school.replace(".svg", "");
    if (!/^[a-z0-9-]+$/i.test(slug)) {
      return status(400, "Invalid school slug");
    }
    const bgParam = dark !== undefined && dark !== "false" ? "bgd" : "bgl";
    const url = `https://www.ncaa.com/sites/default/files/images/logos/schools/${bgParam}/${slug}.svg`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });

    if (!res.ok) {
      return status(404, "Logo not found");
    }

    try {
      const svgContent = await res.text();
      set.headers["Content-Type"] = "image/svg+xml";
      set.headers["Cache-Control"] = "public, max-age=604800";
      return svgContent;
    } catch (err) {
      log(`Error fetching logo: ${err}`);
      return status(500, "Error fetching data");
    }
  },
    { detail: { hide: true } }
  )
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
    // strip /all-conf from path for caching purposes since it's the default
    if (path.endsWith("/all-conf")) {
      path = path.replace("/all-conf", "");
    }
    return {
      basePath,
      cache: validRoutes.get(basePath) ?? cache_45s,
      cacheKey: page ? `${path}?page=${page}` : path,
    };
  })
  .onBeforeHandle(({ set, cache, cacheKey }) => {
    set.headers["Content-Type"] = "application/json";
    set.headers["Cache-Control"] = `public, max-age=${cache === cache_45s ? 60 : 1800}`;
    set.headers["X-Content-Type-Options"] = "nosniff";
    set.headers["X-Frame-Options"] = "DENY";
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }
  })
  // schools-index route to return list of all schools
  .get("/schools-index", async ({ cache, cacheKey, status }) => {
    const req = await fetch("https://www.ncaa.com/json/schools", { signal: AbortSignal.timeout(10000) });
    if (!req.ok) {
      return status(502, "Error fetching data");
    }
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
      log(`Error fetching schools: ${err}`);
      return status(500, "Error fetching data");
    }
  },
    { detail: { hide: true } }
  )
  // news route to fetch and parse RSS feed
  .get("/news/:sport/:division", async ({ params, cache, cacheKey, status }) => {
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }

    const url = `https://www.ncaa.com/news/${params.sport}/${params.division}/rss.xml`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });

    if (!res.ok) {
      return status(404, "RSS feed not found");
    }

    try {
      const xmlContent = await res.text();
      const { document } = parseHTML(xmlContent);

      // Get text content, handling CDATA (raw or converted to HTML comments)
      const getText = (el: Element | null) => {
        const text = el?.textContent?.trim();
        if (text) {
          // Strip raw CDATA wrapper if present
          const cdataMatch = text.match(/^<!\[CDATA\[([\s\S]*)\]\]>$/);
          return cdataMatch ? cdataMatch[1].trim() : text;
        }
        // linkedom converts CDATA to comments when it contains HTML, extract from innerHTML
        const html = el?.innerHTML ?? "";
        const match = html.match(/^<!--\[CDATA\[([\s\S]*)\]\]-->$/);
        return match ? match[1].trim() : "";
      };

      // linkedom treats <link> as void element, URL becomes next sibling text node
      const getLink = (parent: Element | null) => {
        const link = parent?.querySelector("link");
        return link?.nextSibling?.textContent?.trim() ?? "";
      };

      const channel = document.querySelector("channel");

      const result = {
        title: getText(channel?.querySelector("title") ?? null),
        link: getLink(channel),
        description: getText(channel?.querySelector("description") ?? null),
        language: getText(channel?.querySelector("language") ?? null),
        items: [...document.querySelectorAll("item")].map((item) => {
          let description = getText(item.querySelector("description"));
          let image = "";

          // Extract image URL from description HTML if present
          const imgMatch = description.match(/<img[^>]+src=["']([^"']+)["']/i);
          if (imgMatch) {
            image = imgMatch[1];
            description = description.replace(/<img[^>]*>\s*/i, "").trim();
          }

          return {
            title: getText(item.querySelector("title")),
            link: getLink(item),
            description,
            image,
            pubDate: getText(item.querySelector("pubDate")),
            creator: getText(item.querySelector("dc\\:creator")),
            category: getText(item.querySelector("category")),
            enclosure: getText(item.querySelector("enclosure")),
          };
        }),
      };

      const data = JSON.stringify(result);
      cache.set(cacheKey, data);
      return data;
    } catch (err) {
      log(`Error parsing RSS feed: ${err}`);
      return status(500, "Error parsing RSS feed");
    }
  },
    { detail: { hide: true } }
  )
  .group("/game", (app) =>
    app
      // game route to retrieve game details
      .get("/:id", async ({ cache, cacheKey, status, params: { id } }) => {
        const req = await fetch(
          `https://sdataprod.ncaa.com/?meta=GetGamecenterGameById_web&extensions=${encodeURIComponent('{"persistedQuery":{"version":1,"sha256Hash":"93a02c7193c89d85bcdda8c1784925d9b64657f73ef584382e2297af555acd4b"}}')}&variables=${encodeURIComponent(JSON.stringify({ id: String(id), week: null, staticTestEnv: null }))}`,
          { signal: AbortSignal.timeout(10000) }
        );
        if (!req.ok) {
          return status(404, "Resource not found");
        }
        const json = await req.json();
        if (!json?.data) {
          return status(502, "Invalid upstream response");
        }
        const data = JSON.stringify(json.data);
        cache.set(cacheKey, data);
        return data;
      },
        {
          detail: { hide: true },
          params: t.Object({
            id: t.Number({ minimum: 999999, maximum: 99999999 }),
          }),
        }
      )
      .get("/:id/boxscore", async ({ cache, cacheKey, status, params: { id } }) => {
        const hashes = [boxscoreHashes.TeamStatsBasketball];
        const maxAttempts = 2;
        for (let i = 0; i < hashes.length && i < maxAttempts; i++) {
          const hash = hashes[i];
          if (!hash) continue;
          const req = await fetch(
            `https://sdataprod.ncaa.com/?extensions=${encodeURIComponent(JSON.stringify({ persistedQuery: { version: 1, sha256Hash: hash } }))}&variables=${encodeURIComponent(JSON.stringify({ contestId: String(id), staticTestEnv: null }))}`,
            { signal: AbortSignal.timeout(10000) }
          );
          if (!req.ok) {
            continue;
          }
          const json = await req.json();

          // check if team stats data is empty (only has type name property)
          // if so, use type name as identifier to find correct hash from allHashes
          const teamStats: undefined | Record<string, unknown> =
            json?.data?.boxscore?.teamBoxscore?.at(0)?.teamStats;
          if (Object.keys(teamStats ?? {}).length < 2) {
            const typeName = teamStats?.__typename as string | undefined;
            if (typeName && typeName in boxscoreHashes) {
              hashes.push(boxscoreHashes[typeName as keyof typeof boxscoreHashes]);
            }
            continue;
          }
          const data = JSON.stringify(json.data.boxscore);
          cache.set(cacheKey, data);
          return data;
        }
        return status(502, "Error fetching data");
      },
        {
          detail: { hide: true },
          params: t.Object({
            id: t.Number({ minimum: 999999, maximum: 99999999 }),
          }),
        }
      )
      .get("/:id/play-by-play", async ({ cache, cacheKey, status, params: { id } }) => {
        const hashes = [playByPlayHashes.PlayByPlayGenericSport];
        const maxAttempts = 2;
        for (let i = 0; i < hashes.length && i < maxAttempts; i++) {
          const hash = hashes[i];
          if (!hash) continue;
          const req = await fetch(
            `https://sdataprod.ncaa.com/?extensions=${encodeURIComponent(JSON.stringify({ persistedQuery: { version: 1, sha256Hash: hash } }))}&variables=${encodeURIComponent(JSON.stringify({ contestId: String(id), staticTestEnv: null }))}`,
            { signal: AbortSignal.timeout(10000) }
          );
          if (!req.ok) {
            continue;
          }
          const json = await req.json();

          // check if pbp data is empty (only has type name property)
          // if so, use type name as identifier to find correct hash from allHashes
          const pbpStat: undefined | Record<string, unknown> = json?.data?.playbyplay?.periods
            ?.at(0)
            ?.playbyplayStats?.at(0);
          if (Object.keys(pbpStat ?? {}).length < 2) {
            const typeName = pbpStat?.__typename as string | undefined;
            if (typeName && typeName in playByPlayHashes) {
              hashes.push(playByPlayHashes[typeName as keyof typeof playByPlayHashes]);
            }
            continue;
          }
          const data = JSON.stringify(json.data.playbyplay);
          cache.set(cacheKey, data);
          return data;
        }
        return status(502, "Error fetching data");
      },
        {
          detail: { hide: true },
          params: t.Object({
            id: t.Number({ minimum: 999999, maximum: 99999999 }),
          }),
        }
      )
      .get("/:id/scoring-summary", async ({ cache, cacheKey, status, params: { id } }) => {
        const hash = "7f86673d4875cd18102b7fa598e2bc5da3f49d05a1c15b1add0e2367ee890198";
        const req = await fetch(
          `https://sdataprod.ncaa.com/?extensions=${encodeURIComponent(JSON.stringify({ persistedQuery: { version: 1, sha256Hash: hash } }))}&variables=${encodeURIComponent(JSON.stringify({ contestId: String(id), staticTestEnv: null }))}`,
          { signal: AbortSignal.timeout(10000) }
        );
        if (req.ok) {
          const json = await req.json();
          if (json?.data?.scoringSummary) {
            const data = JSON.stringify(json.data.scoringSummary);
            cache.set(cacheKey, data);
            return data;
          }
        }
        return status(502, "Error fetching data");
      },
        {
          detail: { hide: true },
          params: t.Object({
            id: t.Number({ minimum: 999999, maximum: 99999999 }),
          }),
        }
      )
      .get("/:id/team-stats", async ({ cache, cacheKey, status, params: { id } }) => {
        const hashes = [teamStatsHashes.TeamStatsBasketball];
        const maxAttempts = 2;
        for (let i = 0; i < hashes.length && i < maxAttempts; i++) {
          const hash = hashes[i];
          if (!hash) continue;
          const req = await fetch(
            `https://sdataprod.ncaa.com/?extensions=${encodeURIComponent(JSON.stringify({ persistedQuery: { version: 1, sha256Hash: hash } }))}&variables=${encodeURIComponent(JSON.stringify({ contestId: String(id), staticTestEnv: null }))}`,
            { signal: AbortSignal.timeout(10000) }
          );
          if (!req.ok) {
            continue;
          }
          const json = await req.json();

          // check if team stats data is empty (only has type name property)
          // if so, use type name as identifier to find correct hash from allHashes
          const teamStats: undefined | Record<string, unknown> =
            json?.data?.boxscore?.teamBoxscore?.at(0)?.teamStats;
          if (Object.keys(teamStats ?? {}).length < 2) {
            const typeName = teamStats?.__typename as string | undefined;
            if (typeName && typeName in teamStatsHashes) {
              hashes.push(teamStatsHashes[typeName as keyof typeof teamStatsHashes]);
            }
            continue;
          }
          const data = JSON.stringify(json.data.boxscore);
          cache.set(cacheKey, data);
          return data;
        }
        return status(502, "Error fetching data");
      },
        {
          detail: { hide: true },
          params: t.Object({
            id: t.Number({ minimum: 999999, maximum: 99999999 }),
          }),
        }
      )
  )
  // brackets route to retrieve tournament brackets
  .get("/brackets/:sport/:division/:year", async ({ cache, cacheKey, params, status }) => {
    let divisionCode: string | number;
    try {
      divisionCode = getDivisionCode(params.sport, params.division);
    } catch (_) {
      return status(400, "Invalid sport or division");
    }

    const yearInt = parseInt(params.year, 10);
    if (!/^\d{4}$/.test(params.year) || Number.isNaN(yearInt)) {
      return status(400, "Invalid year");
    }

    const variables = {
      sportUrl: params.sport,
      division: Number(divisionCode),
      year: yearInt,
    };
    const extensions = {
      persistedQuery: {
        version: 1,
        sha256Hash: "e651c2602fb9e82cdad6e947389600c6b69e0e463e437b78bf7ec614d6d15f80",
      },
    };
    const url = `https://sdataprod.ncaa.com/?operationName=get_championship_ncaa&variables=${encodeURIComponent(
      JSON.stringify(variables)
    )}&extensions=${encodeURIComponent(JSON.stringify(extensions))}`;

    const req = await fetch(url, { signal: AbortSignal.timeout(10000) });

    if (!req.ok) {
      return status(404, "Resource not found");
    }

    try {
      const json = await req.json();
      if (!json?.data?.championships || json.data.championships.length === 0) {
        return status(404, "Resource not found");
      }
      const data = JSON.stringify(json.data);
      cache.set(cacheKey, data);
      return data;
    } catch (err) {
      log(`Error parsing brackets response: ${err}`);
      return status(502, "Error parsing upstream response");
    }
  },
    {
      detail: { hide: true },
      params: t.Object({
        sport: t.String(),
        division: t.String(),
        year: t.String(),
      }),
    }
  )
  // schedule route to retrieve game dates
  .get("/schedule/:sport/:division/:year/:month?", async ({ cache, cacheKey, params, status }) => {
    const yearInt = parseInt(params.year, 10);
    if (Number.isNaN(yearInt) || yearInt < 1950 || yearInt > 2027) {
      return status(404, "Resource not found");
    }
    const urlPathSegments = [params.sport, params.division, params.year, params.month]
    const urlPath = urlPathSegments.filter(Boolean).join("/");
    const req = await fetch(
      `https://data.ncaa.com/casablanca/schedule/${urlPath}/schedule-all-conf.json`,
      { signal: AbortSignal.timeout(10000) }
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
  .get("/schedule-alt/:sport/:division/:year", async ({ cache, cacheKey, params, status }) => {
    const sportData = newCodesBySport[params.sport as keyof typeof newCodesBySport];
    if (!sportData) {
      return status(400, "Invalid sport");
    }
    let divisionCode: string | number;
    try {
      divisionCode = getDivisionCode(params.sport, params.division);
    } catch (_) {
      return status(400, "Invalid division");
    }
    const variables = { sportCode: sportData.code, division: divisionCode, seasonYear: parseInt(params.year, 10) || params.year };
    const url = `https://sdataprod.ncaa.com/?extensions=${encodeURIComponent(JSON.stringify({ persistedQuery: { version: 1, sha256Hash: "a25ad021179ce1d97fb951a49954dc98da150089f9766e7e85890e439516ffbf" } }))}&queryName=NCAA_schedules_today_web&variables=${encodeURIComponent(JSON.stringify(variables))}`;
    const req = await fetch(url, { signal: AbortSignal.timeout(10000) });

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
  .get("/scoreboard/:sport/*", async ({ cache, cacheKey, params, set, status }) => {
    const sportCodes = newCodesBySport[params.sport];
    if (!sportCodes) {
      return status(400, { "message": "Invalid sport" });
    }
    const semCacheKey = getSemaphore(cacheKey);
    await semCacheKey.acquire();
    try {
      if (cache.has(cacheKey)) {
        set.headers["x-score-cache"] = "hit";
        return cache.get(cacheKey);
      }

      // Parse URL path to extract year and week parameters
      const rest = decodeURIComponent(params["*"]);
      const [division, year] = rest.split("/");

      if (sportCodes.divisions[division] === undefined) {
        return status(400, { "message": "Invalid division" });
      }

      // find date in url
      const urlDateMatcher = /(\d{4}\/\d{2}\/\d{2})|(\d{4}\/(\d{2}|P))/;
      let urlDate = rest.match(urlDateMatcher)?.[0];

      if (urlDate) {
        // reject if date is unrealistic (runaway bots requesting every year until infinity)
        const currentYear = new Date().getFullYear();
        const urlYear = parseInt(urlDate.split("/")[0], 10);
        if (urlYear < 2010 || urlYear > currentYear + 1) {
          return status(400, "Invalid date");
        }
      } else {
        // if date not in passed in url, fetch date from today.json
        try {
          urlDate = await getTodayUrl(params.sport, division);
        } catch (err) {
          log(`Error fetching today URL: ${err}`);
          return status(400, "Could not determine date for scoreboard");
        }
      }

      const scoreboardDate = new Date(urlDate);

      // Use the year from URL (prefer the one in the date)
      const yearFromUrlDate = urlDate ? parseInt(urlDate.split("/")[0], 10) : null;
      const effectiveYear = yearFromUrlDate || parseInt(year, 10) || new Date().getFullYear();


      const sportCode = sportCodes.code;
      if (sportCode) {
        try {
          // Check week-based cache first for shared caching
          const weekCacheKey = `${sportCode}_${division}_${urlDate}`;
          if (cache.has(weekCacheKey)) {
            set.headers["x-score-cache"] = "hit";
            return cache.get(weekCacheKey);
          }

          const divisionCode = getDivisionCode(params.sport, division);

          const isFootball = sportCode === "MFB";
          const seasonYear =
            isFootball || Number.isNaN(scoreboardDate.getTime())
              ? effectiveYear
              : getSeasonYear(scoreboardDate);

          const newParams: NewScoreboardParams = {
            sportCode,
            division: divisionCode,
            seasonYear,
          };

          const weekCode = urlDate.split("/")[1] ?? "1";
          const isPlayoff = isFootball && weekCode === "P";

          if (isFootball && !isPlayoff) {
            newParams.week = parseInt(weekCode, 10);
          } else if (!isPlayoff) {
            newParams.contestDate = urlDate;
          }

          // Fetch playoff weeks combined or single week/date
          const newData = isPlayoff
            ? await fetchPlayoffScoreboard(newParams)
            : await fetchGqlScoreboard(newParams);
          const convertedData = await convertToOldFormat(
            newData,
            params.sport,
            division,
            urlDate,
            effectiveYear
          );
          const data = JSON.stringify(convertedData);

          // Use week-based cache key for shared caching across different URL formats
          cache.set(weekCacheKey, data);

          // Also cache under the original cache key for consistency
          cache.set(cacheKey, data);
          return data;
        } catch (err) {
          log(`Failed to fetch from new endpoint, falling back to old endpoint: ${err}`);
          // Fall through to old endpoint logic
        }
      }

      // Use old endpoint logic - only supports 2025 and earlier
      if (effectiveYear > 2025) {
        return status(404, { "message": "Resource not found" });
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
        const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) {
          return status(404, { "message": "Resource not found" });
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
  // stats route to return available stat categories for a sport/division
  .get("/stats/:sport/:division", async ({ params, cacheKey, status, set }) => {
    const cache = cache_24h;
    set.headers["Cache-Control"] = `public, max-age=86400`;
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }
    const url = `https://www.ncaa.com/stats/${params.sport}/${params.division}`;
    const res = await fetch(url);
    if (!res.ok) {
      return status(404, "Stats not found for this sport/division");
    }
    const { document } = parseHTML(await res.text());
    const individual = parseStatSelect(document, "select-container-individual", "individual");
    const team = parseStatSelect(document, "select-container-team", "team");
    if (individual.length === 0 && team.length === 0) {
      return status(404, "No stat categories found for this sport/division");
    }
    const sport = document.querySelector("h2.page-title")?.textContent?.trim() ?? params.sport;
    const data = JSON.stringify({ sport, individual, team });
    cache.set(cacheKey, data);
    return data;
  },
    { detail: { hide: true } }
  )
  // all other routes fetch data by scraping ncaa.com
  .get("/*", async ({ query: { page }, path, cache, cacheKey }) => {
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
    const today = await getScheduleBySportAndDivision(sport, division as DivisionKey);
    cache_30m.set(cacheKey, today);
    return today;
  } catch (err) {
    log(`Failed to fetch schedule from new endpoint, falling back to old endpoint: ${err}`);
    // Fall through to old endpoint logic
  }
  const req = await fetch(
    `https://data.ncaa.com/casablanca/schedule/${sport}/${division}/today.json`,
    { signal: AbortSignal.timeout(10000) }
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
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });

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
  const sport = document.querySelector("h2.page-title")?.textContent?.trim() ?? "";

  let title = "";
  const titleEl = document.querySelectorAll(
    ".stats-header__lower__title, main option[selected], main h1.node__title"
  )?.[0];

  if (titleEl) {
    titleEl.querySelector(".hidden")?.remove();
    title = titleEl.textContent?.trim() ?? "";
  } else {
    title = route === "standings" ? "ALL CONFERENCES" : document.title.split(" |")[0];
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
    page = [...tablePageLinks].findIndex((li) => li.classList.contains("active")) + 1;
    pages = tablePageLinks.length;
  }

  const data = route === "standings" ? parseStandings(document) : parseTable(table);

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
