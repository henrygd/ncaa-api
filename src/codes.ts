export enum Season {
  Fall,
  Winter,
  Spring,
}

export const newCodesBySport: Record<
  string,
  { code: string; season: Season; divisions: Record<string, number>; metas?: Record<string, string> }
> = {
  ////// FALL SPORTS //////
  fieldhockey: {
    code: "WFH",
    season: Season.Fall,
    divisions: {
      d1: 1,
      d2: 2,
      d3: 3,
    },
  },
  football: {
    code: "MFB",
    season: Season.Fall,
    divisions: {
      fbs: 11,
      fcs: 12,
    },
  },
  "soccer-men": {
    code: "MSO",
    season: Season.Fall,
    divisions: {
      d1: 1,
      d2: 2,
      d3: 3,
    },
  },
  "soccer-women": {
    code: "WSO",
    season: Season.Fall,
    divisions: {
      d1: 1,
      d2: 2,
      d3: 3,
    },
  },
  "volleyball-women": {
    code: "WVB",
    season: Season.Fall,
    divisions: {
      d1: 1,
      d2: 2,
      d3: 3,
    },
  },
  "waterpolo-men": {
    code: "MWP",
    season: Season.Fall,
    divisions: {
      d1: 1,
    },
  },
  ////// WINTER SPORTS //////
  "basketball-men": {
    code: "MBB",
    season: Season.Winter,
    divisions: {
      d1: 1,
      d2: 2,
    },
  },
  "basketball-women": {
    code: "WBB",
    season: Season.Winter,
    divisions: {
      d1: 1,
      d2: 2,
      d3: 3,
    },
  },
  "icehockey-men": {
    code: "MIH",
    season: Season.Winter,
    divisions: {
      d1: 1,
      d3: 3,
    },
  },
  "icehockey-women": {
    code: "WIH",
    season: Season.Winter,
    divisions: {
      d1: 1,
      d3: 3,
    },
  },
  ////// SPRING SPORTS //////
  baseball: {
    code: "MBA",
    season: Season.Spring,
    divisions: {
      d1: 1,
      d2: 2,
      d3: 3,
    },
  },
  "lacrosse-men": {
    code: "MLA",
    season: Season.Spring,
    divisions: {
      d1: 1,
      d2: 2,
      d3: 3,
    },
  },
  "lacrosse-women": {
    code: "WLA",
    season: Season.Spring,
    divisions: {
      d1: 1,
      d2: 2,
      d3: 3,
    },
  },
  softball: {
    code: "WSB",
    season: Season.Spring,
    divisions: {
      d1: 1,
      d2: 2,
      d3: 3,
    },
  },
  "volleyball-men": {
    code: "MVB",
    season: Season.Spring,
    divisions: {
      d1: 1,
      d3: 3,
    },
  },
  "waterpolo-women": {
    code: "WWP",
    season: Season.Spring,
    divisions: {
      d1: 1,
    },
  },
};

const newBasketballHashes = {
  boxscore: '4a7fa26398db33de3ff51402a90eb5f25acef001cca28d239fe5361315d1419a',
  playbyplay: '6b1232714a3598954c5bacabc0f81570e16d6ee017c9a6b93b601a3d40dafb98',
  teamStats: '5fcf84602d59c003f37ddd1185da542578080e04fe854e935cbcaee590a0e8a2'
}

const newHockeyHashes = {
  boxscore: 'a4be206372277e685a002162f3caeecbfd9e61905835735d0ea9e48e336cddd4',
  playbyplay: '57f922d56d60d88326b62202b3d88e8cd3cfb6687931bc0b5b3dfab089b84faa',
  scoringSummary: '7f86673d4875cd18102b7fa598e2bc5da3f49d05a1c15b1add0e2367ee890198',
  teamStats: 'dd68288eece4c3605421226f17dcb04bf162e17aaed6a634f7bd9b183bb4b47f',
}

export const customHashesBySeason: Record<string, Record<string, string>> = {
  '649': newHockeyHashes,
  '650': newBasketballHashes,
  '651': newBasketballHashes,
  '653': newBasketballHashes,
  '654': newBasketballHashes,
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

// export const supportedSeasons = new Set(["645", "646", "647", "648", "649"]);
export const seasonIsNewFormat = (season: string) => {
  return parseInt(season.slice(0, 3)) >= 645;
};

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
