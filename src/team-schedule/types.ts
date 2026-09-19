export interface TeamRecord {
  slug: string;
  pretty_name: string;
}

export interface GameRecord {
  game_id: number;
  sport: string;
  division: string;
  season: number;
  start_unix: number;
  home_slug: string;
  home: string;
  away_slug: string;
  away: string;
}

export interface IngestOptions {
  sport: string;
  division: string;
  seasonYear: number;
  dbPath?: string;
  delayMs?: number;
  maxDates?: number;
  dryRun?: boolean;
}

export interface IngestResult {
  sport: string;
  division: string;
  seasonYear: number;
  datesFound: number;
  datesProcessed: number;
  contestsProcessed: number;
  gamesPrepared: number;
  gamesWritten: number;
  teamsUpserted: number;
}

export interface TeamScheduleGame {
  game_id: number;
  start_unix: number;
  home: string;
  home_slug: string;
  away: string;
  away_slug: string;
}
