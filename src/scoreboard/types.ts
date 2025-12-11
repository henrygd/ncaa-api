// Type definitions for NCAA API data structures

export interface NewScoreboardParams {
  sportCode: string;
  division: number;
  seasonYear: number;
  week?: number;
  contestDate?: string;
}

export interface Team {
  isHome: boolean;
  isWinner: boolean;
  score?: number;
  nameShort: string;
  name6Char?: string;
  seoname?: string;
  seed?: number;
  teamRank?: number;
  conferenceSeo?: string;
}

export interface Contest {
  contestId?: string;
  teams: Team[];
  startTime?: string;
  startDate?: string;
  finalMessage?: string;
  url?: string;
  broadcasterName?: string;
  liveVideos?: unknown[];
  startTimeEpoch?: string;
  gameState?: string;
  currentPeriod?: string;
  contestClock?: string;
}

export interface GraphQLResponse {
  data: {
    contests: Contest[];
  };
}

export interface OldFormatTeam {
  names?: {
    short?: string;
    full?: string;
  };
  conferences?: Array<{
    conferenceName?: string;
  }>;
  description?: string;
}

export interface OldFormatGame {
  game?: {
    home?: OldFormatTeam;
    away?: OldFormatTeam;
    network?: string;
  };
}

export interface OldFormatData {
  games?: OldFormatGame[];
}
