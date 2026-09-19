import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Database } from "bun:sqlite";
import type { GameRecord, TeamRecord, TeamScheduleGame } from "./types";

const schema = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sports (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  pretty_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY,
  game_id INTEGER NOT NULL,
  sport_id INTEGER NOT NULL,
  division TEXT NOT NULL,
  season INTEGER NOT NULL,
  start_unix INTEGER NOT NULL,
  home_team_id INTEGER NOT NULL,
  away_team_id INTEGER NOT NULL,
  UNIQUE (sport_id, division, season, game_id),
  FOREIGN KEY (sport_id) REFERENCES sports(id),
  FOREIGN KEY (home_team_id) REFERENCES teams(id),
  FOREIGN KEY (away_team_id) REFERENCES teams(id)
);

CREATE INDEX IF NOT EXISTS idx_games_game_id
ON games (game_id);

CREATE INDEX IF NOT EXISTS idx_games_home_lookup
ON games (sport_id, season, division, home_team_id, start_unix);

CREATE INDEX IF NOT EXISTS idx_games_away_lookup
ON games (sport_id, season, division, away_team_id, start_unix);
`;

interface IdRow {
  id: number;
}

interface TeamIdRow {
  id: number;
  slug: string;
}

interface TeamScheduleRow {
  game_id: number;
  start_unix: number;
  home: string;
  home_slug: string;
  away: string;
  away_slug: string;
}

function migrateGamesTable(db: Database) {
  const columns = db
    .query("PRAGMA table_info(games)")
    .all() as Array<{ name: string; pk: number }>;

  if (columns.length === 0) {
    return;
  }

  const hasIdColumn = columns.some((column) => column.name === "id");
  const gameIdIsPrimaryKey = columns.some((column) => column.name === "game_id" && column.pk === 1);

  if (hasIdColumn && !gameIdIsPrimaryKey) {
    return;
  }

  db.exec("BEGIN TRANSACTION;");
  try {
    db.exec("ALTER TABLE games RENAME TO games_old;");
    db.exec(`
      CREATE TABLE games (
        id INTEGER PRIMARY KEY,
        game_id INTEGER NOT NULL,
        sport_id INTEGER NOT NULL,
        division TEXT NOT NULL,
        season INTEGER NOT NULL,
        start_unix INTEGER NOT NULL,
        home_team_id INTEGER NOT NULL,
        away_team_id INTEGER NOT NULL,
        UNIQUE (sport_id, division, season, game_id),
        FOREIGN KEY (sport_id) REFERENCES sports(id),
        FOREIGN KEY (home_team_id) REFERENCES teams(id),
        FOREIGN KEY (away_team_id) REFERENCES teams(id)
      );
    `);
    db.exec(`
      INSERT OR REPLACE INTO games (game_id, sport_id, division, season, start_unix, home_team_id, away_team_id)
      SELECT game_id, sport_id, division, season, start_unix, home_team_id, away_team_id
      FROM games_old;
    `);
    db.exec("DROP TABLE games_old;");
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
}

export function getDefaultDbPath() {
  return resolve(process.cwd(), "data", "team-schedules.sqlite");
}

export function openTeamScheduleDb(dbPath = getDefaultDbPath()) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath, { create: true, strict: true });
  db.exec(schema);
  migrateGamesTable(db);
  return db;
}

export function ensureSport(db: Database, slug: string) {
  db.query("INSERT INTO sports (slug) VALUES (?) ON CONFLICT (slug) DO NOTHING").run(slug);
  const row = db.query("SELECT id FROM sports WHERE slug = ?").get(slug) as IdRow | null;
  if (!row) {
    throw new Error(`Could not resolve sport id for ${slug}`);
  }
  return row.id;
}

export function upsertTeams(db: Database, teams: TeamRecord[]) {
  if (teams.length === 0) {
    return 0;
  }

  const uniqueTeams = new Map<string, TeamRecord>();
  for (const team of teams) {
    uniqueTeams.set(team.slug, team);
  }

  const upsert = db.query(
    `INSERT INTO teams (slug, pretty_name) VALUES (?, ?)
    ON CONFLICT (slug) DO UPDATE SET pretty_name = excluded.pretty_name`
  );

  const tx = db.transaction((rows: TeamRecord[]) => {
    for (const row of rows) {
      upsert.run(row.slug, row.pretty_name);
    }
  });

  const rows = [...uniqueTeams.values()];
  tx(rows);
  return rows.length;
}

function getTeamIds(db: Database, slugs: string[]) {
  if (slugs.length === 0) {
    return new Map<string, number>();
  }

  const uniqueSlugs = [...new Set(slugs)];
  const placeholders = uniqueSlugs.map(() => "?").join(", ");
  const rows = db
    .query(`SELECT id, slug FROM teams WHERE slug IN (${placeholders})`)
    .all(...uniqueSlugs) as TeamIdRow[];

  const teamIds = new Map<string, number>();
  for (const row of rows) {
    teamIds.set(row.slug, row.id);
  }
  return teamIds;
}

export function upsertGames(db: Database, sportId: number, games: GameRecord[]) {
  if (games.length === 0) {
    return 0;
  }

  const teamIds = getTeamIds(
    db,
    games.flatMap((game) => [game.home_slug, game.away_slug])
  );

  const upsert = db.query(
    `INSERT INTO games (
      game_id,
      sport_id,
      division,
      season,
      start_unix,
      home_team_id,
      away_team_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (sport_id, division, season, game_id) DO UPDATE SET
      start_unix = excluded.start_unix,
      home_team_id = excluded.home_team_id,
      away_team_id = excluded.away_team_id`
  );

  const tx = db.transaction((rows: GameRecord[]) => {
    for (const row of rows) {
      const homeTeamId = teamIds.get(row.home_slug);
      const awayTeamId = teamIds.get(row.away_slug);

      if (!homeTeamId || !awayTeamId) {
        throw new Error(`Missing team id for game ${row.game_id}`);
      }

      upsert.run(
        row.game_id,
        sportId,
        row.division,
        row.season,
        row.start_unix,
        homeTeamId,
        awayTeamId
      );
    }
  });

  tx(games);
  return games.length;
}

export function getTeamScheduleGames(
  db: Database,
  schoolSlug: string,
  sportSlug: string,
  division: string,
  season: number
): TeamScheduleGame[] {
  const sportRow = db.query("SELECT id FROM sports WHERE slug = ?").get(sportSlug) as IdRow | null;
  if (!sportRow) {
    return [];
  }

  const teamRow = db.query("SELECT id FROM teams WHERE slug = ?").get(schoolSlug) as IdRow | null;
  if (!teamRow) {
    return [];
  }

  const rows = db
    .query(
      `SELECT
        g.game_id,
        g.start_unix,
        ht.pretty_name AS home,
        ht.slug AS home_slug,
        at.pretty_name AS away,
        at.slug AS away_slug
      FROM games g
      JOIN teams ht ON g.home_team_id = ht.id
      JOIN teams at ON g.away_team_id = at.id
      WHERE g.sport_id = ?
        AND g.season = ?
        AND g.division = ?
        AND g.home_team_id = ?

      UNION ALL

      SELECT
        g.game_id,
        g.start_unix,
        ht.pretty_name AS home,
        ht.slug AS home_slug,
        at.pretty_name AS away,
        at.slug AS away_slug
      FROM games g
      JOIN teams ht ON g.home_team_id = ht.id
      JOIN teams at ON g.away_team_id = at.id
      WHERE g.sport_id = ?
        AND g.season = ?
        AND g.division = ?
        AND g.away_team_id = ?

      ORDER BY start_unix`
    )
    .all(
      sportRow.id,
      season,
      division,
      teamRow.id,
      sportRow.id,
      season,
      division,
      teamRow.id
    ) as TeamScheduleRow[];

  return rows;
}
