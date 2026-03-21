# NCAA API

Free API to return consumable data from ncaa.com.

Works with scores, stats, rankings, standings, schedules, brackets, history, logos, news, and game details (box score, play by play, scoring summary, team stats).

Try it out here: <https://ncaa-api.henrygd.me/openapi>

## Usage

Make a GET request using the same path as the URL on ncaa.com. You'll get a JSON response with the data.

You can test using the [demo API](https://ncaa-api.henrygd.me/openapi). [Host your own](#deployment) if you need it to be reliable long term.

> Note: The public API is limited to 5 requests per second per IP.

## Parameters

The following URL parameters are supported:

| Parameter | Description                 |
| --------- | --------------------------- |
| `page`    | Page number. Defaults to 1. |

## Routes

All routes can be tested here: <https://ncaa-api.henrygd.me/openapi>

### Scoreboard

Fetches live scores for a given sport, division, and date.

Website: <https://www.ncaa.com/scoreboard/football/fbs/2023/13/all-conf>

`GET /scoreboard/football/fbs/2023/13/all-conf`

### Stats

Website: <https://www.ncaa.com/stats/football/fbs/current/team/28>

`GET /stats/football/fbs/current/team/28`

Website: <https://www.ncaa.com/stats/football/fbs/current/individual/750>

`GET /stats/football/fbs/current/individual/750`

### Rankings

Website: <https://www.ncaa.com/rankings/football/fbs/associated-press>

`GET /rankings/football/fbs/associated-press`

### Standings

Website: <https://www.ncaa.com/standings/basketball-women/d1>

`GET /standings/basketball-women/d1`

### Game

Provides details of a single game.

Website: <https://www.ncaa.com/game/6305900>

- `GET /game/6305900` returns general information
- `GET /game/6305900/boxscore` returns box score
- `GET /game/6305900/play-by-play` returns play by play
- `GET /game/6305900/scoring-summary` returns scoring summary if available
- `GET /game/6305900/team-stats` returns team stats if available

### History

Website: <https://www.ncaa.com/history/bowling/nc>

`GET /history/bowling/nc`

### Schedule

Returns game dates for a given sport, division, and date range.

This is the only route that doesn't exactly match a website URL. The website doesn't have schedule pages, but the sport and division are consistent with other URLs.

It also requires different dates for different sports. Football uses YYYY, while basketball, hockey, and others use YYYY/MM.

`GET /schedule/basketball-men/d1/2023/02`

### Brackets

Tournament bracket for a given sport, division, and year, including live scores.

Like the official website, this endpoint does not include FBS football brackets prior to 2025.

Website: <https://www.ncaa.com/brackets/basketball-men/d1/2026>

`GET /brackets/basketball-men/d1/2026`

### News

News articles and videos for a given sport and division. Returns parsed RSS feed data in JSON format.

Website: <https://www.ncaa.com/news/basketball-men/d1/rss.xml>

`GET /news/basketball-men/d1`

### Schools Index

Returns a list of all schools.

Website: <https://www.ncaa.com/schools-index>

`GET /schools-index`

### Logos

Logos for all NCAA schools. Use the school `slug` or `team_seo` property.

- `GET /logo/michigan.svg`
- `GET /logo/michigan.svg?dark=true` returns a version of the logo that works better on dark backgrounds.

## Deployment

Use the included [docker-compose.yml](/docker-compose.yml) or run directly with Docker:

```bash
docker run --rm -p 3000:3000 henrygd/ncaa-api
```

The app should be available at [http://localhost:3000](http://localhost:3000/history/bowling/nc).

## Limiting Access

If you host your own instance, you may specify a custom header value to be present in all requests as a way to restrict access to the API.

To do this, set the `NCAA_HEADER_KEY` environment variable to the desired value and include the header `x-ncaa-key` in your requests. See the [docker-compose.yml](/docker-compose.yml) for an example.

## Development

This is an [ElysiaJS](https://elysiajs.com/) application. To start the development server run:

```bash
bun run dev
```

To run tests:

```bash
bun test
```

Contributions welcome.
