import { getSeasonYear } from "../codes";
import { getDefaultDbPath } from "./db";
import { ingestTeamSchedule } from "./ingest";

function getArg(flag: string) {
  const prefix = `${flag}=`;
  const pair = Bun.argv.find((arg) => arg.startsWith(prefix));
  if (pair) {
    return pair.slice(prefix.length);
  }

  const index = Bun.argv.findIndex((arg) => arg === flag);
  if (index === -1) {
    return undefined;
  }
  return Bun.argv[index + 1];
}

function hasFlag(flag: string) {
  return Bun.argv.includes(flag);
}

function printUsage() {
  console.log("Usage: bun src/team-schedule/cli.ts [options]");
  console.log("");
  console.log("Options:");
  console.log("  --sport <value>         default: basketball-men");
  console.log("  --division <value>      default: d1");
  console.log(`  --season-year <value>   default: ${getSeasonYear(new Date())}`);
  console.log(`  --db-path <value>       default: ${getDefaultDbPath()}`);
  console.log("  --max-dates <value>     process only first N dates");
  console.log("  --delay-ms <value>      delay between upstream fetches (default: 350)");
  console.log("  --dry-run               fetch and map only, do not write sqlite");
}

if (hasFlag("--help") || hasFlag("-h")) {
  printUsage();
  process.exit(0);
}

const sport = getArg("--sport") ?? "basketball-men";
const division = getArg("--division") ?? "d1";
const seasonYearRaw = getArg("--season-year");
const seasonYear = seasonYearRaw ? parseInt(seasonYearRaw, 10) : getSeasonYear(new Date());
const maxDatesRaw = getArg("--max-dates");
const maxDates = maxDatesRaw ? parseInt(maxDatesRaw, 10) : undefined;
const delayMsRaw = getArg("--delay-ms");
const delayMs = delayMsRaw ? parseInt(delayMsRaw, 10) : 350;
const dryRun = hasFlag("--dry-run");
const dbPath = getArg("--db-path") ?? getDefaultDbPath();

if (Number.isNaN(seasonYear)) {
  throw new Error("Invalid --season-year value");
}
if (maxDatesRaw && Number.isNaN(maxDates)) {
  throw new Error("Invalid --max-dates value");
}
if (delayMsRaw && Number.isNaN(delayMs)) {
  throw new Error("Invalid --delay-ms value");
}

console.log(`Starting ingest for ${sport}/${division}/${seasonYear}`);
console.log(`Mode: ${dryRun ? "dry-run" : "write"}`);
console.log(`DB path: ${dbPath}`);
if (typeof maxDates === "number") {
  console.log(`Date limit: ${maxDates}`);
}

const result = await ingestTeamSchedule({
  sport,
  division,
  seasonYear,
  dbPath,
  maxDates,
  delayMs,
  dryRun,
});

console.log("Done");
console.log(JSON.stringify(result, null, 2));
