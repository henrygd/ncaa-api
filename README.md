# NCAA API

Free API to return consumable data from ncaa.com. Works with scores, stats, rankings, standings, schedules, and history.

## Usage

Make a GET request using the same path as the URL on the main website. You'll get a JSON response with the data.

You can test the API using the example site below. Host your own if you need it to be reliable long term.

https://ncaa-api.henrygd.me/rankings/football/fbs/associated-press

## Parameters

The following URL parameters are supported:

| Parameter | Description                 |
| --------- | --------------------------- |
| `page`    | Page number. Defaults to 1. |

## Routes

### Scores

Fetches live scores for a given sport, division, and date.

Website: https://www.ncaa.com/scoreboard/football/fbs/2023/13/all-conf

`GET /scoreboard/football/fbs/2023/13/all-conf`

```json
{
  "inputMD5Sum": "946b0d7ecce3877d6cd036a19daf95ed",
  "instanceId": "52aa051f77b7475da1baba2df45d5e98",
  "updated_at": "01-19-2024 23:50:30",
  "hideRank": false,
  "games": [
    {
      "game": {
        "away": {
          "score": "24",
          "names": {
            "char6": "OHIOST",
            "short": "Ohio St.",
            "seo": "ohio-st",
            "full": "The Ohio State University"
          },
          "winner": false,
          "seed": "",
          "description": "(11-1)",
          "rank": "2",
          "conferences": [
            {
              "conferenceName": "Big Ten",
              "conferenceSeo": "big-ten"
            },
            {
              "conferenceName": "Top 25",
              "conferenceSeo": "top-25"
            }
          ]
        },
        "home": {
          "score": "30",
          "names": {
            "char6": "MICH",
            "short": "Michigan",
            "seo": "michigan",
            "full": "University of Michigan"
          },
          "winner": true,
          "seed": "",
          "description": "(12-0)",
          "rank": "3",
          "conferences": [
            {
              "conferenceName": "Big Ten",
              "conferenceSeo": "big-ten"
            },
            {
              "conferenceName": "Top 25",
              "conferenceSeo": "top-25"
            }
          ]
        },
        "gameID": "3146430",
        "finalMessage": "FINAL",
        "bracketRound": "",
        "title": "Michigan Ohio St.",
        "contestName": "",
        "url": "/game/6154104",
        "network": "",
        "liveVideoEnabled": false,
        "startTime": "12:00PM ET",
        "startTimeEpoch": "1700931600",
        "bracketId": "",
        "gameState": "final",
        "startDate": "11-25-2023",
        "currentPeriod": "FINAL",
        "videoState": "",
        "bracketRegion": "",
        "contestClock": "0:00"
      }
    },
    ...
  ]
}
```

### Stats

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

Website: https://www.ncaa.com/stats/football/fbs/current/individual/750

`GET /stats/football/fbs/current/individual/750`

```json
{
  "sport": "Football",
  "title": "Rushing TDs",
  "updated": "Monday, January 08, 2024 11:52 pm - Through games Monday, January 08, 2024",
  "page": 1,
  "pages": 6,
  "data": [
    {
      "Rank": "1",
      "Name": "Blake Corum",
      "Team": "Michigan",
      "Cl": "Sr.",
      "Position": "RB",
      "G": "15",
      "Rush TD": "27"
    },
    {
      "Rank": "2",
      "Name": "Ollie Gordon",
      "Team": "Oklahoma St.",
      "Cl": "So.",
      "Position": "RB",
      "G": "14",
      "Rush TD": "21"
    },
    ...
  ]
}
```

### Rankings

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

### Standings

Website: https://www.ncaa.com/standings/basketball-women/d1

`GET /standings/basketball-women/d1`

```json
{
  "sport": "Women's Basketball",
  "title": "ALL CONFERENCES",
  "updated": "Feb 03, 2024 05:08 AM EDT",
  "page": 1,
  "pages": 1,
  "data": [
    {
      "conference": "ASUN",
      "standings": [
        {
          "School": "FGCU",
          "Conference W": "9",
          "Conference L": "0",
          "Conference PCT": "1.000",
          "Overall W": "19",
          "Overall L": "4",
          "Overall PCT": "0.826",
          "Overall STREAK": "Won 12"
        },
        {
          "School": "Central Ark.",
          "Conference W": "7",
          "Conference L": "1",
          "Conference PCT": "0.875",
          "Overall W": "15",
          "Overall L": "6",
          "Overall PCT": "0.714",
          "Overall STREAK": "Won 4"
        },
        ...
      ]
    },
    ...
  ]
}
```

### History

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

### Schedule

Returns game dates for a given sport, division, and date range.

This is the only route that doesn't exactly match a website URL. The website doesn't have schedule pages, but the sport and division are consistent with other URLs.

It also requires different dates for different sports. Football uses YYYY, while basketball, hockey, and others use YYYY/MM.

`GET /schedule/basketball-men/d1/2023/02`

```json
{
  "division": "d1",
  "inputMD5Sum": "ba47f9e21af54d3d4b5f81fc38048e29",
  "month": "02",
  "conference_name": "all-conf",
  "created_at": "08-07-2023 15:32:05",
  "season": "2022",
  "sport": "MBB",
  "gameDates": [
    {
      "contest_date": "02-01-2023",
      "year": "2023",
      "weekday": "Wed",
      "games": 47,
      "season": "2022",
      "day": "01"
    },
    {
      "contest_date": "02-02-2023",
      "year": "2023",
      "weekday": "Thu",
      "games": 75,
      "season": "2022",
      "day": "02"
    },
    ...
  ]
}
```

## Deployment

Use the included [docker-compose.yml](/docker-compose.yml) or run directly with docker:

```bash
docker run -p 3000:3000 henrygd/ncaa-api
```

The app should be available at [http://localhost:3000](http://localhost:3000/history/bowling/nc).

## Limiting Access

If you host your own instance, you may specify a custom header value to be present in all requests as a way to restrict access to the API. This isn't the most secure method, but it's better than nothing.

To do this, set the `NCAA_HEADER_KEY` environment variable to the desired value and include the header `x-ncaa-key` in your requests. See the [docker-compose.yml](/docker-compose.yml) for an example.

## Development

This is a minimal [ElysiaJS](https://elysiajs.com/) app. To start the development server run:

```bash
bun run dev
```

To run tests:

```bash
bun test
```

Contributions welcome.
