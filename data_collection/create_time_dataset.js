import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(
  __dirname,
  "../astro-viz/public/data/ucbwiki_data.db"
);
const outputPath = path.resolve(
  __dirname,
  "../astro-viz/public/data/top_articles_by_school.json"
);

const database = new DatabaseSync(dbPath, { readonly: true });

const startYear = 2001;
const endYear = 2025;

// Get list of all schools that appear in the data
const schoolRows = database.prepare(
  "SELECT DISTINCT school FROM edits WHERE school IS NOT NULL AND school <> ''"
).all();
const schools = schoolRows.map(r => r.school);

console.log(`Found ${schools.length} schools`);

const result = [];

for (let year = startYear; year <= endYear; ++year) {
  const yearObj = { year };
  for (const school of schools) {
    // Sum of edits for this school up until Dec 31 of this year, inclusive
    console.log(`Getting edits for ${school} in ${year}`);
    const r = database.prepare(
      "SELECT SUM(size) as edit_count FROM edits WHERE school = ? AND timestamp <= ?"
    ).get(
      school,
      `${year}-12-31T23:59:59Z`
    );
    const r_2 = database.prepare(
      "SELECT COUNT(*) as edit_volume FROM edits WHERE school = ? AND timestamp <= ?"
    ).get(
      school,
      `${year}-01-01T00:00:00Z`
    );
    console.log(`Found ${r?.edit_count} edits for ${school} in ${year}`);
    console.log(`Found ${r_2?.edit_volume} edits for ${school} in ${year}`);
    yearObj[school] = {
      edit_count: r?.edit_count ?? 0,
      edit_volume: r_2?.edit_volume ?? 0
    };
  }
  result.push(yearObj);
}

const outputJson = JSON.stringify(result, null, 2);
const timeOutputPath = path.resolve(
  __dirname,
  "../astro-viz/public/data/top_articles_by_school_time.json"
);
fs.writeFileSync(timeOutputPath, outputJson);

console.log(`Wrote time series articles JSON to ${timeOutputPath}`);

database.close();
