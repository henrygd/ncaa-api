export enum Season {
  Fall,
  Winter,
  Spring,
}

export const newCodesBySport: Record<
  string,
  { code: string; season: Season; divisions: Record<string, number> }
> = {
  football: {
    code: "MFB",
    season: Season.Fall,
    divisions: {
      fbs: 11,
      fcs: 12,
    },
  },
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
  baseball: {
    code: "MBA",
    season: Season.Spring,
    divisions: {
      d1: 1,
      d2: 2,
      d3: 3,
    },
  },
  fieldhockey: {
    code: "WFH",
    season: Season.Fall,
    divisions: {
      d1: 1,
      d2: 2,
      d3: 3,
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
  "waterpolo-men": {
    code: "MWP",
    season: Season.Fall,
    divisions: {
      d1: 1,
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
};

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

// TODO: check if we can just use >= 645
export const supportedSeasons = new Set(["645", "646", "647", "648", "649"]);

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

  const url = `https://sdataprod.ncaa.com/?extensions={"persistedQuery":{"version":1,"sha256Hash":"a25ad021179ce1d97fb951a49954dc98da150089f9766e7e85890e439516ffbf"}}&queryName=NCAA_schedules_today_web&variables={"sportCode":"${
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
  // convert MM/DD/YYYY to YYYY/MM/DD (exclude football which is WEEK/YYYY)
  const todaySplit = today.split("/");
  if (todaySplit.length === 3) {
    return `${todaySplit[2]}/${todaySplit[0]}/${todaySplit[1]}`;
  }
  return today;
}
