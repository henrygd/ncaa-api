import { describe, expect, it } from "bun:test";
import { getScheduleBySportAndDivision } from "../src/codes";
import { app } from "../src/index";

describe("General", () => {
  it("home route redirects to openapi", async () => {
    const response = await app.handle(new Request("http://localhost/"));
    expect(response.headers.get("Location")).toBe("/openapi");
  });
  it("invalid route returns 400", async () => {
    const response = await app.handle(new Request("http://localhost/invalid"));
    expect(response.status).toBe(400);
  });
  it("invalid page param returns 400", async () => {
    const response = await app.handle(
      new Request("http://localhost/stats/test?page=invalid")
    );
    expect(response.status).toBe(400);
  });
  it("rankings route returns good data", async () => {
    const response = await app.handle(
      new Request("http://localhost/rankings/football/fbs/associated-press")
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=1800");
    const { data } = await response.json();
    expect(data.length).toBeGreaterThan(0);
    expect(data[0]).toContainKeys(["RANK", "SCHOOL"]);
  });
  it("scoreboard route returns good data", async () => {
    const response = await app.handle(
      new Request("http://localhost/scoreboard/basketball-men/d1/2024/01/01")
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=60");
    const data = await response.json();
    expect(data).toContainKey("games");
  });
  it("base game route returns good data", async () => {
    const response = await app.handle(
      new Request("http://localhost/game/6351551")
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=60");
    const data = await response.json();
    expect(data).toContainKey("contests");
    expect(data.contests).toBeArray();
    expect(data.contests[0]).toContainKeys([
      "clock",
      "gameState",
      "linescores",
    ]);
  });
  it("game boxscore route returns good data", async () => {
    const response = await app.handle(
      new Request("http://localhost/game/6351551/boxscore")
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=60");
    const data = await response.json();
    expect(data).toContainKey("teams");
    expect(data.teamBoxscore?.[0]?.playerStats).toBeArray();
  });
  it("game play by play route returns good data", async () => {
    const response = await app.handle(
      new Request("http://localhost/game/6305900/play-by-play")
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=60");
    const data = await response.json();
    expect(data).toContainKey("periods");
    expect(data.periods).toBeArray();
    expect(data.periods[0]?.playbyplayStats).toBeArray()
  });
  it("game team stats route returns good data", async () => {
    const response = await app.handle(
      new Request("http://localhost/game/6305900/team-stats")
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=60");
    const data = await response.json();
    expect(data).toContainKey("teams");
    expect(data.teamBoxscore?.[0]?.teamStats).toBeObject()
  });
  it("game scoring summary route returns good data", async () => {
    const response = await app.handle(
      new Request("http://localhost/game/6305900/scoring-summary")
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=60");
    const data = await response.json();
    expect(data).toContainKey("periods");
    expect(data.periods[0]?.summary).toBeArray()
  });
  it("schools index route returns good data", async () => {
    const response = await app.handle(
      new Request("http://localhost/schools-index")
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=1800");
    const data = await response.json();
    expect(data).toBeArray();
    expect(data[0]).toContainKeys(["slug", "name", "long"]);
  });
  it("re-request uses cached data", async () => {
    const start = performance.now();
    await app.handle(
      new Request("http://localhost/rankings/football/fbs/associated-press")
    );
    const finish = performance.now() - start;
    expect(finish).toBeLessThan(10);
  });
  it("new scoreboard football route returns good data", async () => {
    const response = await app.handle(
      new Request("http://localhost/scoreboard/football/fbs/2025/01")
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=60");
    const data = await response.json();
    expect(data).toContainKey("games");
    expect(data.games).toBeArray();
    const gameOne = data.games[0];
    expect(gameOne?.game?.gameID).toBe("6458983");
    expect(gameOne?.game?.away?.score).toBe("24");
  });
  it("new scoreboard soccer route returns good data", async () => {
    const response = await app.handle(
      new Request("http://localhost/scoreboard/soccer-men/d1/2025/09/29")
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=60");
    const data = await response.json();
    expect(data).toContainKey("games");
    expect(data.games).toBeArray();
    const gameOne = data.games[0];
    expect(gameOne?.game?.gameID).toBe("6463999");
    expect(gameOne?.game?.away?.score).toBe("1");
  });
  it("new scoreboard basketball route for 2026 returns games from 2025 season", async () => {
    const response = await app.handle(
      new Request("http://localhost/scoreboard/basketball-men/d1/2026/01/01")
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.games.length).toBeGreaterThan(0);
    // Liberty vs Western Kentucky game ID from 2025 season
    expect(data.games[0].game.gameID).toBe("6502144");
  });
  it("semaphore queues simultaneous requests for same scoreboard resource", async () => {
    const requests = [];
    // will fail when baseball season starts again bc date will be different
    // should be replace with whatever sport has the longest until it starts again
    const routes = [
      "/scoreboard/baseball/d1",
      "/scoreboard/baseball/d1/2025/06/22/all-conf",
    ];
    for (let i = 0; i < 3; i++) {
      for (const route of routes) {
        requests.push(
          app
            .handle(new Request(`http://localhost${route}`))
            .then((res) => res.headers)
        );
      }
    }
    const headers = await Promise.all(requests);
    let nonCached = 0;
    let cached = 0;
    for (const header of headers) {
      if (header.get("x-score-cache") === "hit") {
        cached++;
      } else {
        nonCached++;
      }
    }
    expect(cached).toBe(headers.length - 1);
    expect(nonCached).toBe(1);
  });
  it("new schedule function returns good data", async () => {
    const today = await getScheduleBySportAndDivision("football", "fbs");
    expect(today).toBeString();
    expect(today).toContain(new Date().getFullYear().toString());
  });

  // Tests for new basketball hashes (seasons 650, 651, 653, 654)
  it("basketball boxscore with new hashes returns good data", async () => {
    const gameId = "6506241";
    const response = await app.handle(
      new Request(`http://localhost/game/${gameId}/boxscore`)
    );
    // Skip test if game doesn't exist yet (404), but validate structure if it does
    if (response.status === 200) {
      expect(response.headers.get("cache-control")).toBe("public, max-age=60");
      const data = await response.json();
      expect(data).toContainKeys(["teams", "teamBoxscore"]);
      expect(data.teamBoxscore[0]?.teamStats).toContainKey("fieldGoalsMade");
    } else {
      expect(response.status).toBe(404);
    }
  });
});

describe("Header validation", () => {
  // Custom header tests (must be last due to env var)
  it("valid custom header returns 200", async () => {
    Bun.env.NCAA_HEADER_KEY = "valid";
    const response = await app.handle(
      new Request("http://localhost/rankings/football/fbs/associated-press", {
        headers: { "x-ncaa-key": "valid" },
      })
    );
    expect(response.status).toBe(200);
  });
  it("invalid custom header returns 401", async () => {
    const response = await app.handle(
      new Request("http://localhost/rankings/football/fbs/associated-press", {
        headers: { "x-ncaa-key": "invalid" },
      })
    );
    expect(response.status).toBe(401);
  });
  it("lack of custom header returns 401", async () => {
    const response = await app.handle(
      new Request("http://localhost/stats/test")
    );
    expect(response.status).toBe(401);
  });
});
