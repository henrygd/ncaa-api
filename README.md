# NCAA API

API to return consumable data from ncaa.com. Works with stats, rankings, standings, and history.

## Usage

Make a GET request using the same path as the URL on the main website. You'll get a JSON response with the data.

You can test the API using the example host below. Host your own if you need it to be reliable long term.

https://ncaa-api.henrygd.me/rankings/football/fbs/associated-press

## Parameters

The following URL parameters are supported:

| Parameter | Description                 |
| --------- | --------------------------- |
| `page`    | Page number. Defaults to 1. |

## Examples

### Football - Associated Press rankings

Website: https://www.ncaa.com/rankings/football/fbs/associated-press

`GET /rankings/football/fbs/associated-press`

```json
{
  "sport": "Football",
  "title": "College football rankings: Associated Press Top 25",
  "updated": "Through Games JAN. 8, 2024",
  "page": 1,
  "pages": 1,
  "data": [
    {
      "RANK": "1",
      "SCHOOL": "Michigan (61)",
      "POINTS": "1525 ",
      "PREVIOUS": "1",
      "RECORD": "15-0"
    },
    {
      "RANK": "2",
      "SCHOOL": "Washington",
      "POINTS": "1459",
      "PREVIOUS": "2",
      "RECORD": "14-1"
    },
    ...
  ]
}
```

### Football - scoring defense

Website: https://www.ncaa.com/stats/football/fbs/current/team/28

`GET /stats/football/fbs/current/team/28`

```json
{
  "sport": "Football",
  "title": "Scoring Defense",
  "updated": "Monday, January 08, 2024 11:52 pm - Through games Monday, January 08, 2024",
  "page": 1,
  "pages": 3,
  "data": [
    {
      "Rank": "1",
      "Team": "Michigan",
      "G": "15",
      "TDs": "17",
      "Opp XP": "15",
      "2PT": "0",
      "Opp DXP": "0",
      "Opp FGM": "13",
      "Opp Saf": "0",
      "Pts": "156.00",
      "Avg": "10.40"
    },
    {
      "Rank": "2",
      "Team": "Ohio St.",
      "G": "13",
      "TDs": "15",
      "Opp XP": "14",
      "2PT": "0",
      "Opp DXP": "0",
      "Opp FGM": "14",
      "Opp Saf": "0",
      "Pts": "146.00",
      "Avg": "11.23"
    },
    ...
  ]
}
```

### Women's Basketball - ASUN conference rankings

Website: https://www.ncaa.com/standings/basketball-women/d1/asun

`GET /standings/basketball-women/d1/asun`

```json
{
  "sport": "Women's Basketball",
  "title": "ASUN CONFERENCE",
  "updated": "Jan 26, 2024 05:03 AM EDT",
  "page": 1,
  "pages": 1,
  "data": [
    {
      "School ": "FGCU",
      "Conference W": "6",
      "Conference L": "0",
      "Conference PCT": "1.000",
      "Overall W": "16",
      "Overall L": "4",
      "Overall PCT": "0.800",
      "Overall STREAK": "Won 9"
    },
    {
      "School ": "Central Ark.",
      "Conference W": "5",
      "Conference L": "1",
      "Conference PCT": "0.833",
      "Overall W": "13",
      "Overall L": "6",
      "Overall PCT": "0.684",
      "Overall STREAK": "Won 2"
    },
    ...
  ]
}
```

### Women's Ice Hockey - Individual faceoff wins

Website: https://www.ncaa.com/stats/icehockey-women/d1/current/individual/1261

`GET /stats/icehockey-women/d1/current/individual/1261`

```json
{
  "sport": "Women's Ice Hockey",
  "title": "Faceoff wins",
  "updated": "Wednesday, January 24, 2024 10:04 pm - Through games Wednesday, January 24, 2024",
  "page": 1,
  "pages": 6,
  "data": [
    {
      "Rank": "1",
      "Name": "Tessa Janecke",
      "Team": "Penn St.",
      "Cl": "So.",
      "Games Plyd.": "26",
      "FO won": "439",
      "FO lost": "240"
    },
    {
      "Rank": "2",
      "Name": "Sadie Peart",
      "Team": "Quinnipiac",
      "Cl": "Sr.",
      "Games Plyd.": "27",
      "FO won": "372",
      "FO lost": "290"
    },
    ...
  ]
}
```

### Bowling - NCAA championship history

Website: https://www.ncaa.com/history/bowling/nc

`GET /history/bowling/nc`

```json
{
  "sport": "Bowling",
  "title": "Championship History",
  "updated": "",
  "page": 1,
  "pages": 1,
  "data": [
    {
      "Year": "2023",
      "Champion": "Vanderbilt",
      "Coach": "John Williamson",
      "Games": "3",
      "Runner-Up": "Arkansas State",
      "Host/Site": "Las Vegas, NV"
    },
    {
      "Year": "2022",
      "Champion": "McKendree",
      "Coach": "Shannon O'Keefe",
      "Games": "0",
      "Runner-Up": "Stephen F. Austin",
      "Host/Site": "Columbus, OH"
    },
    ...
  ]
}
```

## Deployment

TODO - public docker image

## Limiting Access

If you host your own instance, you may specify a custom header value to be present in all requests as a way to restrict access to the API. This isn't the most secure method, but it's better than nothing.

To do this, set the `NCAA_HEADER_KEY` environment variable to the desired value and include the header `x-ncaa-key` in your requests. See the [docker-compose.yml](/docker-compose.yml) for an example.

## Development

This is an [Elysia](https://elysiajs.com/) app. To start the development server run:

```bash
bun run dev
```

TODO - tests
