import openapi from "@elysiajs/openapi";
import type { OpenAPIV3 } from "openapi-types";

import { supportedDivisions, supportedSports } from "./codes";

function makeExamples(strings: string[]) {
  const examples: Record<string, { value: string }> = {};
  for (let i = 0; i < strings.length; i++) {
    examples[i] = {
      value: strings[i],
    };
  }
  return examples;
}

const sportExamples = makeExamples(supportedSports);

const divisionExamples = makeExamples(Object.values(supportedDivisions));

export const openapiSpec = openapi({
  documentation: {
    // servers: [
    //   {
    //     url: "https://ncaa-api.henrygd.me",
    //     description: "Public API",
    //   },
    //   {
    //     url: "http://localhost:3000",
    //     description: "Development",
    //   },
    // ],
    info: {
      title: "NCAA API",
      description:
        "API to return consumable data from ncaa.com. You can also [host your own deployment](https://github.com/henrygd/ncaa-api#deployment).\n\nThe public API is limited to 5 requests per second per IP.\n\nhttps://github.com/henrygd/ncaa-api\n\nhttps://buymeacoffee.com/henrygd",
      version: "3.0.0-beta.1",
      license: {
        name: "MIT",
        url: "https://github.com/henrygd/ncaa-api/blob/main/LICENSE",
      },
      contact: {
        name: "henrygd",
        url: "https://github.com/henrygd/ncaa-api",
      },
    },
    paths: {
      "/scoreboard/{sport}/{path}": {
        get: {
          summary: "Scoreboard",
          description:
            "Scores for a given sport and division. Most sports use `YYYY/MM/DD`, but football uses `YYYY/WK`.\n\nOmitting the date will return scores for today or the previous game date.\n\nhttps://www.ncaa.com/scoreboard/football/fbs\n\nhttps://www.ncaa.com/scoreboard/football/fbs/2025/01/all-conf",
          parameters: [
            {
              name: "sport",
              in: "path",
              schema: { type: "string" },
              required: true,
              examples: sportExamples,
            },
            {
              name: "path",
              in: "path",
              schema: { type: "string" },
              required: true,
              examples: makeExamples([
                "fbs",
                "fbs/2025/01/all-conf",
                "d1/2024/01/all-conf",
              ]),
            },
          ],
        },
      },
      "/game/{id}": {
        get: {
          summary: "Game information",
          description:
            "General information about a game.\n\nhttps://www.ncaa.com/game/6459218",
          parameters: [
            {
              name: "id",
              in: "path",
              schema: { type: "string" },
              required: true,
              examples: makeExamples(["6459218", "6305900"]),
            },
          ] as OpenAPIV3.ParameterObject[],
        },
      },
      "/game/{id}/boxscore": {
        get: {
          summary: "Game boxscore",
          description:
            "Note that response format is different for seasons starting in Fall 2025 or later (game IDs starting with `645` or higher).\n\nhttps://www.ncaa.com/game/6459218/boxscore",
          parameters: [
            {
              name: "id",
              in: "path",
              schema: { type: "string" },
              required: true,
              examples: makeExamples(["6459218", "6305900"]),
            },
          ] as OpenAPIV3.ParameterObject[],
        },
      },
      "/game/{id}/play-by-play": {
        get: {
          summary: "Game play by play",
          description:
            "Note that response format is different for seasons starting in Fall 2025 or later (game IDs starting with `645` or higher).\n\nhttps://www.ncaa.com/game/6459218/play-by-play",
          parameters: [
            {
              name: "id",
              in: "path",
              schema: { type: "string" },
              required: true,
              examples: makeExamples(["6459218", "6305900"]),
            },
          ] as OpenAPIV3.ParameterObject[],
        },
      },
      "/game/{id}/scoring-summary": {
        get: {
          summary: "Game scoring summary",
          description:
            "Note that response format is different for seasons starting in Fall 2025 or later (game IDs starting with `645` or higher).\n\nhttps://www.ncaa.com/game/6459218/scoring-summary",
        },
        parameters: [
          {
            name: "id",
            in: "path",
            schema: { type: "string" },
            required: true,
            examples: makeExamples(["6459218", "6305900"]),
          },
        ] as OpenAPIV3.ParameterObject[],
      },
      "/game/{id}/team-stats": {
        get: {
          summary: "Game team stats",
          description:
            "Note that response format is different for seasons starting in Fall 2025 or later (game IDs starting with `645` or higher).\n\nhttps://www.ncaa.com/game/6459218/team-stats",
        },
        parameters: [
          {
            name: "id",
            in: "path",
            schema: { type: "string" },
            required: true,
            examples: makeExamples(["6459218", "6305900"]),
          },
        ] as OpenAPIV3.ParameterObject[],
      },
      "/stats/{sport}/{division}/{year}/{path}": {
        get: {
          summary: "Stats",
          description:
            "Stats for a given sport and division.\n\nhttps://www.ncaa.com/stats/football/fbs/current/individual/20\n\nhttps://www.ncaa.com/stats/football/fbs/2024/team/28",
          parameters: [
            {
              name: "sport",
              in: "path",
              schema: { type: "string" },
              required: true,
              examples: sportExamples,
            },
            {
              name: "division",
              in: "path",
              schema: { type: "string" },
              required: true,
              examples: divisionExamples,
            },
            {
              name: "year",
              in: "path",
              schema: { type: "string" },
              required: true,
              examples: makeExamples(["current"]),
            },
            {
              name: "path",
              in: "path",
              schema: { type: "string" },
              required: true,
              examples: makeExamples(["individual/20", "team/28"]),
            },
          ] as OpenAPIV3.ParameterObject[],
        },
      },
      "/standings/{sport}/{path}": {
        get: {
          summary: "Standings",
          description:
            "Standings for a given sport and division.\n\nhttps://www.ncaa.com/standings/football/fbs\n\nhttps://www.ncaa.com/standings/basketball-women/d1/asun",
          parameters: [
            {
              name: "sport",
              in: "path",
              schema: { type: "string" },
              required: true,
              examples: sportExamples,
            },
            {
              name: "path",
              in: "path",
              schema: { type: "string" },
              required: true,
              examples: makeExamples(["fbs", "fbs/big-ten", "d1/asun"]),
            },
          ],
        },
      },
      "/history/{path}": {
        get: {
          summary: "History",
          description:
            "Championship history for a given sport.\n\nhttps://www.ncaa.com/history/bowling/nc",
          parameters: [
            {
              name: "path",
              in: "path",
              schema: { type: "string" },
              required: true,
              examples: makeExamples(["bowling/nc", "basketball-women/d1"]),
            },
          ] as OpenAPIV3.ParameterObject[],
        },
      },
      "/rankings/{path}": {
        get: {
          summary: "Rankings",
          description:
            "Rankings for a given sport.\n\nhttps://www.ncaa.com/rankings/football/fbs/associated-press",
          parameters: [
            {
              name: "path",
              in: "path",
              schema: { type: "string" },
              required: true,
              examples: makeExamples([
                "football/fbs/associated-press",
                "basketball-women/d1/associated-press",
                "soccer-men/d1/united-soccer-coaches",
              ]),
            },
          ] as OpenAPIV3.ParameterObject[],
        },
      },
      "/schedule/{sport}/{division}/{path}": {
        get: {
          summary: "Schedule",
          description:
            "Game dates for a given sport and division. Most sports use `YYYY/MM`, but football uses `YYYY`.",
          parameters: [
            {
              name: "sport",
              in: "path",
              schema: { type: "string" },
              required: true,
              examples: sportExamples,
            },
            {
              name: "division",
              in: "path",
              schema: { type: "string" },
              required: true,
              examples: divisionExamples,
            },
            {
              name: "path",
              in: "path",
              schema: { type: "string" },
              required: true,
              examples: makeExamples(["2025", "2024/01"]),
            },
          ] as OpenAPIV3.ParameterObject[],
        },
      },
      "/schedule-alt/{sport}/{division}/{year}": {
        get: {
          summary: "Schedule (alt)",
          description: "Game dates for a given sport and division and year",
        },
        parameters: [
          {
            name: "sport",
            in: "path",
            schema: { type: "string" },
            required: true,
            examples: sportExamples,
          },
          {
            name: "division",
            in: "path",
            schema: { type: "string" },
            required: true,
            examples: divisionExamples,
          },
          {
            name: "year",
            in: "path",
            schema: { type: "string" },
            required: true,
            examples: makeExamples(["2025", "2024"]),
          },
        ],
      },
      "/schools-index": {
        get: {
          summary: "Schools index",
          description:
            "Returns a list of all schools with slug, name, and long name.\n\nhttps://www.ncaa.com/schools-index",
        },
      },
    },
  },
});
