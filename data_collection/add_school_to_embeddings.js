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
const embeddingsPath = path.resolve(
  __dirname,
  "../astro-viz/public/data/embeddings.tsv"
);

const database = new DatabaseSync(dbPath, { readonly: true });

console.log("Loading article data from database...");

// Get all article statistics in one query
// For each article, get the school with most edits (or latest if tie) and total edits
const articleDataQuery = database.prepare(`
  WITH school_counts AS (
    SELECT 
      title,
      school,
      COUNT(*) as edit_count,
      MAX(timestamp) as last_edit
    FROM edits
    WHERE school IS NOT NULL AND school <> ''
    GROUP BY title, school
  ),
  ranked_schools AS (
    SELECT 
      title,
      school,
      edit_count,
      last_edit,
      ROW_NUMBER() OVER (
        PARTITION BY title
        ORDER BY edit_count DESC, last_edit DESC
      ) as rn
    FROM school_counts
  ),
  top_schools AS (
    SELECT title, school
    FROM ranked_schools
    WHERE rn = 1
  ),
  total_edits AS (
    SELECT title, COUNT(*) as total_edits
    FROM edits
    GROUP BY title
  )
  SELECT 
    COALESCE(ts.title, te.title) as title,
    ts.school as school,
    COALESCE(te.total_edits, 0) as total_edits
  FROM total_edits te
  LEFT JOIN top_schools ts ON te.title = ts.title
`);

const articleData = articleDataQuery.all();

// Build a map for fast lookup
const articleMap = new Map();
for (const row of articleData) {
  articleMap.set(row.title, {
    school: row.school || "",
    totalEdits: row.total_edits || 0,
  });
}

console.log(`Loaded data for ${articleMap.size} articles from database`);

// Read the embeddings TSV file
console.log("Reading embeddings file...");
const embeddingsContent = fs.readFileSync(embeddingsPath, "utf-8");
const lines = embeddingsContent.trim().split("\n");

// Parse header
const header = lines[0].split("\t");
const titleIndex = header.indexOf("Title");

// Process each line
const outputLines = [];
outputLines.push(header.join("\t") + "\tSchool\tTotal_Edits");

console.log(`Processing ${lines.length - 1} articles...`);

for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  const columns = line.split("\t");
  const title = columns[titleIndex];

  // Look up article data
  const articleInfo = articleMap.get(title) || { school: "", totalEdits: 0 };

  // Add new columns
  const newLine =
    line + "\t" + articleInfo.school + "\t" + articleInfo.totalEdits;
  outputLines.push(newLine);

  if ((i - 1) % 10000 === 0) {
    console.log(`Processed ${i - 1} articles...`);
  }
}

// Write output
console.log("Writing output file...");
const outputContent = outputLines.join("\n") + "\n";
fs.writeFileSync(embeddingsPath, outputContent);

console.log(`Done! Added School and Total_Edits columns to ${embeddingsPath}`);
console.log(`Processed ${lines.length - 1} articles total`);

database.close();
