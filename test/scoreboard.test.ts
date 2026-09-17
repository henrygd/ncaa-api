import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { app } from "../src/index";
import {
  type Contest,
  fetchGqlScoreboard,
  fetchPlayoffScoreboard,
} from "../src/scoreboard/scoreboard";

afterEach(() => mock.restore());

const params = { sportCode: "MBB", division: 1, seasonYear: 2025 };
const upstreamError = { errors: [{ message: "Upstream unavailable" }] };

function contest(id: string): Contest {
  return {
    contestId: id,
    teams: [
      { isHome: true, isWinner: false, nameShort: "Home" },
      { isHome: false, isWinner: false, nameShort: "Away" },
    ],
  };
}

describe("GraphQL scoreboards", () => {
  for (const contests of [[], [contest("6502144")]]) {
    it(`accepts a valid response with ${contests.length} contests`, async () => {
      const response = { data: { contests } };
      spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json(response));
      expect(await fetchGqlScoreboard(params)).toEqual(response);
    });
  }

  for (const [name, response] of [
    ["errors without data", upstreamError],
    ["errors with partial data", { ...upstreamError, data: { contests: [contest("6502144")] } }],
    ["null response", null],
    ["missing data", {}],
    ["null data", { data: null }],
    ["missing contests", { data: {} }],
    ["null contests", { data: { contests: null } }],
    ["non-array contests", { data: { contests: {} } }],
  ] as const) {
    it(`rejects HTTP-200 ${name}`, async () => {
      spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json(response));
      await expect(fetchGqlScoreboard(params)).rejects.toThrow();
    });
  }

  it("does not report a partial playoff schedule when one week fails", async () => {
    spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const variables = JSON.parse(new URL(String(input)).searchParams.get("variables") ?? "");
      return Response.json(variables.week === 18
        ? upstreamError
        : { data: { contests: [contest(String(variables.week))] } });
    });

    await expect(fetchPlayoffScoreboard({ ...params, sportCode: "MFB" })).rejects.toThrow();
  });

  it("combines successful playoff weeks, including weeks without games", async () => {
    spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const variables = JSON.parse(new URL(String(input)).searchParams.get("variables") ?? "");
      return Response.json({
        data: { contests: variables.week === 18 ? [] : [contest(String(variables.week))] },
      });
    });

    const result = await fetchPlayoffScoreboard({ ...params, sportCode: "MFB" });
    expect(result.data.contests.map((game) => game.contestId)).toEqual(["16", "17", "19", "20"]);
  });
});

describe("Scoreboard error recovery", () => {
  it("retries an errored response instead of caching an empty scoreboard", async () => {
    const upstream = spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json(upstreamError))
      .mockResolvedValueOnce(Response.json({ data: { contests: [contest("6502144")] } }));
    const request = () => new Request("http://localhost/scoreboard/basketball-men/d1/2026/09/16");

    const failed = await app.handle(request());
    expect(failed.status).toBe(404);
    const recovered = await app.handle(request());
    expect(recovered.status).toBe(200);
    const data = await recovered.json();
    expect(data.games.map(({ game }: { game: { gameID: string } }) => game.gameID)).toEqual(["6502144"]);
    expect(await (await app.handle(request())).json()).toEqual(data);
    expect(upstream).toHaveBeenCalledTimes(2);
  });

  it("keeps caching a valid empty scoreboard", async () => {
    const upstream = spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ data: { contests: [] } }));
    const request = () => new Request("http://localhost/scoreboard/basketball-men/d1/2026/09/15");

    for (let i = 0; i < 2; i++) {
      const response = await app.handle(request());
      expect(response.status).toBe(200);
      expect((await response.json()).games).toEqual([]);
    }
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it("uses the legacy fallback when GraphQL returns errors", async () => {
    const legacy = { games: [{ game: { gameID: "6351551" } }] };
    const upstream = spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json(upstreamError))
      .mockResolvedValueOnce(Response.json(legacy));

    const response = await app.handle(
      new Request("http://localhost/scoreboard/basketball-men/d1/2025/03/25"),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(legacy);
    expect(upstream).toHaveBeenCalledTimes(2);
    expect(String(upstream.mock.calls[1][0])).toContain("data.ncaa.com/casablanca/scoreboard/");
  });
});
