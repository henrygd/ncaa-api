// find hashes in the game page source code
export const playByPlayHashes = {
  "PlayByPlayBasketball": "6b1232714a3598954c5bacabc0f81570e16d6ee017c9a6b93b601a3d40dafb98",
  "PlayByPlayFootball": "47928f2cabc7a164f0de0ed535a623bdf5a852cce7c30d6a6972a38609ba46a2",
  "PlayByPlayGenericSport": "57f922d56d60d88326b62202b3d88e8cd3cfb6687931bc0b5b3dfab089b84faa",
};

export const boxscoreHashes = {
  "TeamStatsBasketball": "4a7fa26398db33de3ff51402a90eb5f25acef001cca28d239fe5361315d1419a",
  "TeamStatsFieldhockey": "eff2e8b300974fd628e8718bfeb476e8d1897eb2a0fda7f8fdcae5b29ce2e54e",
  "TeamStatsFootball": "babb939def47c602a6e81af7aa3f6b35197fb1f1b1a2f2b081f3a3e4924be82e",
  "TeamStatsIcehockey": "a4be206372277e685a002162f3caeecbfd9e61905835735d0ea9e48e336cddd4",
  "TeamStatsLacrosse": "dfd0e926e92e81c2917b8f4ae564fbdcd5c69cd0441a2a8095b6b09e4cee7c36",
  "TeamStatsSoccer": "c9070c4e5a76468a4025896df89f8a7b22be8275c54a22ff79619cbb27d63d7d",
  "TeamStatsSoftball": "8fcd4071199071483be215ff66a2e3676f98563e26a7ff1ba113d56ce28a398d",
  "TeamStatsVolleyball": "4320484382257c2a7ac3be318db2dee09a7fb74029448825c285d5dbdda365ae",
}

export const teamStatsHashes = {
  "TeamStatsBaseball": "9f790b12845d83075435a1d74724cecbf4af69f4ffe6ccad9c06005ceec2d0cd",
  "TeamStatsBasketball": "5fcf84602d59c003f37ddd1185da542578080e04fe854e935cbcaee590a0e8a2",
  "TeamStatsFieldhockey": "9391c78a5e3a61e4c2dbebcf3c94e48387f52f8bdf9896f7391915ec106d6539",
  "TeamStatsFootball": "b41348ee662d9236483167395b16bb6ab36b12e2908ef6cd767685ea8a2f59bd",
  "TeamStatsIcehockey": "dd68288eece4c3605421226f17dcb04bf162e17aaed6a634f7bd9b183bb4b47f",
  "TeamStatsLacrosse": "d2721fc23441f18b75ab813eadae585fc5c285d746a20c9a442c3c48fd6cb033",
  "TeamStatsSoccer": "d3009ee734557a3af9b80a1fd0326575799094e8046a4188c6aebea7072ea7bf",
  "TeamStatsSoftball": "9101d650b971f36a88a82c788a0a8a71cf7546e44cb93a0ce8211ffcc155433c",
  "TeamStatsVolleyball": "9b4d5dcdc81e3df6a8388700f2d54c43a4cf9680ee85eab5b89e4c0e17bedbb2"
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
