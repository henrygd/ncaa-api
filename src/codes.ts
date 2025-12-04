const basketballHashes = {
  boxscore: '4a7fa26398db33de3ff51402a90eb5f25acef001cca28d239fe5361315d1419a',
  playbyplay: '6b1232714a3598954c5bacabc0f81570e16d6ee017c9a6b93b601a3d40dafb98',
  teamStats: '5fcf84602d59c003f37ddd1185da542578080e04fe854e935cbcaee590a0e8a2'
}

const iceHockeyHashes = {
  boxscore: 'a4be206372277e685a002162f3caeecbfd9e61905835735d0ea9e48e336cddd4',
  playbyplay: '57f922d56d60d88326b62202b3d88e8cd3cfb6687931bc0b5b3dfab089b84faa',
  scoringSummary: '7f86673d4875cd18102b7fa598e2bc5da3f49d05a1c15b1add0e2367ee890198',
  teamStats: 'dd68288eece4c3605421226f17dcb04bf162e17aaed6a634f7bd9b183bb4b47f',
}

export const newCodesBySport: Record<
  string,
  { code: string; divisions: Record<string, number>; metas?: Record<string, string> }
> = {
  ////// FALL SPORTS //////
  football: {
    code: "MFB",
    divisions: {
      fbs: 11,
      fcs: 12,
    },
  },
  fieldhockey: {
    code: "WFH",
    divisions: {
      d1: 1,
      d2: 2,
      d3: 3,
    },
  },
  "soccer-men": {
    code: "MSO",
    divisions: {
      d1: 1,
      d2: 2,
      d3: 3,
    },
  },
  "soccer-women": {
    code: "WSO",
    divisions: {
      d1: 1,
      d2: 2,
      d3: 3,
    },
  },
  "volleyball-women": {
    code: "WVB",
    divisions: {
      d1: 1,
      d2: 2,
      d3: 3,
    },
  },
  "waterpolo-men": {
    code: "MWP",
    divisions: {
      d1: 1,
    },
  },
  ////// WINTER SPORTS //////
  "basketball-men": {
    code: "MBB",
    divisions: {
      d1: 1,
      d2: 2,
      d3: 3,
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
  "icehockey-men": {
    code: "MIH",
    divisions: {
      d1: 1,
      d3: 3,
    },
  },
  "icehockey-women": {
    code: "WIH",
    divisions: {
      d1: 1,
      d3: 3,
    },
  },
  ////// SPRING SPORTS //////
  baseball: {
    code: "MBA",
    divisions: {
      d1: 1,
      d2: 2,
      d3: 3,
    },
  },
  "lacrosse-men": {
    code: "MLA",
    divisions: {
      d1: 1,
      d2: 2,
      d3: 3,
    },
  },
  "lacrosse-women": {
    code: "WLA",
    divisions: {
      d1: 1,
      d2: 2,
      d3: 3,
    },
  },
  softball: {
    code: "WSB",
    divisions: {
      d1: 1,
      d2: 2,
      d3: 3,
    },
  },
  "volleyball-men": {
    code: "MVB",
    divisions: {
      d1: 1,
      d3: 3,
    },
  },
  "waterpolo-women": {
    code: "WWP",
    divisions: {
      d1: 1,
    },
  },
};

export const customHashesBySeason: Record<string, Record<string, string>> = {
  '634': basketballHashes,
  '635': basketballHashes,
  '636': basketballHashes,

  '649': iceHockeyHashes,

  '650': basketballHashes,
  '651': basketballHashes,
  '652': basketballHashes,
  '653': basketballHashes,
  '654': basketballHashes,
}

/**
 * Checks if the new API supports the given date and year. New API supports 2026 and after, and 2025 starting in August.
 * @param date - The date to check
 * @param year - The year to check
 * @returns True if the new API supports the given date and year, false otherwise
 */
export function doesSupportScoreboardNewApi(sport: string, year: number, month: number) {
  if (year >= 2026) {
    return true
  }
  // handle football special case (only have year and week)
  if (sport === "football" && year === 2025) {
    return true
  }
  if (year === 2025 && month >= 8) {
    return true
  }
  return false
}

export const getDivisionCode = (sport: string, division: string) => {
  const sportData = newCodesBySport[sport as keyof typeof newCodesBySport];
  if (!sportData) {
    throw errNotSupported(sport, division);
  }
  return (
    sportData.divisions[division as keyof typeof sportData.divisions] ??
    division
  );
};

export const supportedSports = Object.keys(newCodesBySport);

export const supportedDivisions = [
  ...Object.keys(newCodesBySport.football.divisions),
  ...Object.keys(newCodesBySport.fieldhockey.divisions),
] as const;

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

  const url = `https://sdataprod.ncaa.com/?extensions={"persistedQuery":{"version":1,"sha256Hash":"a25ad021179ce1d97fb951a49954dc98da150089f9766e7e85890e439516ffbf"}}&queryName=NCAA_schedules_today_web&variables={"sportCode":"${sportData.code
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
  // convert MM/DD/YYYY to YYYY/MM/DD (exclude football which is WEEK/YYYY)
  const todaySplit = today.split("/");
  if (todaySplit.length === 3) {
    return `${todaySplit[2]}/${todaySplit[0]}/${todaySplit[1]}`;
  }
  return today;
}
