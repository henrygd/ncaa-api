const newCodesBySport = {
  football: {
    code: "MFB",
    divisions: {
      fbs: 11,
      fcs: 12,
    },
  },
  "basketball-men": {
    code: "MBB",
    divisions: {
      d1: 1,
      d2: 2,
    },
  },
  "basketball-women": {
    code: "WBB",
    divisions: {
      d1: 1,
      d2: 2,
      d3: 3,
    },
  },
  // softball: {
  //   code: "WSB",
  //   divisions: {
  //     d1: 1,
  //     d2: 2,
  //     d3: 3,
  //   },
  // },
  // "soccer-women": {
  //   code: "WSK",
  //   divisions: {
  //     d1: 1,
  //     d2: 2,
  //     d3: 3,
  //   },
  // },
  // "soccer-men": {
  //   code: "MSK",
  //   divisions: {
  //     d1: 1,
  //     d2: 2,
  //     d3: 3,
  //   },
  // },
};

const supportedSports = Object.keys(newCodesBySport);

// Define division type as union of all possible division keys
export type DivisionKey = "fbs" | "fcs" | "d1" | "d2" | "d3";

const errNotSupported = (sport: string, division: string) =>
  new Error(`${sport} ${division} is not supported`);

export async function getScheduleBySportAndDivision(
  sport: string,
  division: DivisionKey
) {
  if (!supportedSports.includes(sport)) {
    throw errNotSupported(sport, division);
  }
  const sportData = newCodesBySport[sport as keyof typeof newCodesBySport];
  if (!sportData) {
    throw errNotSupported(sport, division);
  }
  const divisionCode =
    sportData.divisions[division as keyof typeof sportData.divisions];
  if (!divisionCode) {
    throw errNotSupported(sport, division);
  }

  const url = `https://sdataprod.ncaa.com/?meta=NCAA_schedules_today_web&extensions={"persistedQuery":{"version":1,"sha256Hash":"a25ad021179ce1d97fb951a49954dc98da150089f9766e7e85890e439516ffbf"}}&queryName=NCAA_schedules_today_web&variables={"sportCode":"${
    sportData.code
  }","division":${divisionCode},"seasonYear":${new Date().getFullYear()}}`;

  const req = await fetch(url);
  if (!req.ok) {
    throw new Error(`Failed to fetch schedule: ${req.statusText}`);
  }

  const json = await req.json();
  const today = json.data?.schedules?.today?.date;
  if (!today) {
    throw new Error("Failed to fetch schedule");
  }
  return today;
}

// example response:
// {
//   "data": {
//     "schedules": {
//       "games": [
//         {
//           "count": 96,
//           "contestDate": "08/23/2025-09/01/2025"
//         },
//         {
//           "count": 83,
//           "contestDate": "09/05/2025-09/07/2025"
//         },
//         {
//           "count": 70,
//           "contestDate": "09/11/2025-09/14/2025"
//         },
//         {
//           "count": 62,
//           "contestDate": "09/18/2025-09/20/2025"
//         },
//         {
//           "count": 53,
//           "contestDate": "09/25/2025-09/27/2025"
//         },
//         {
//           "count": 51,
//           "contestDate": "10/02/2025-10/04/2025"
//         },
//         {
//           "count": 56,
//           "contestDate": "10/08/2025-10/12/2025"
//         },
//         {
//           "count": 60,
//           "contestDate": "10/14/2025-10/18/2025"
//         },
//         {
//           "count": 53,
//           "contestDate": "10/21/2025-10/25/2025"
//         },
//         {
//           "count": 52,
//           "contestDate": "10/28/2025-11/01/2025"
//         },
//         {
//           "count": 52,
//           "contestDate": "11/04/2025-11/08/2025"
//         },
//         {
//           "count": 59,
//           "contestDate": "11/11/2025-11/15/2025"
//         },
//         {
//           "count": 64,
//           "contestDate": "11/18/2025-11/22/2025"
//         },
//         {
//           "count": 66,
//           "contestDate": "11/25/2025-11/29/2025"
//         },
//         {
//           "count": 1,
//           "contestDate": "12/13/2025-12/13/2025"
//         }
//       ],
//       "today": {
//         "date": "2025/2",
//         "week": 2,
//         "season": 2025
//       }
//     }
//   }
// }
