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

const sql = `
WITH article_stats AS (
  SELECT
    school,
    title,
    SUM(size) AS total_volume,
    COUNT(DISTINCT user) AS unique_editors,
    ROW_NUMBER() OVER (PARTITION BY school ORDER BY SUM(size) DESC) AS rn
  FROM edits
  WHERE school IS NOT NULL AND school <> ''
  GROUP BY school, title
),
ranked AS (
  SELECT
    school,
    title,
    total_volume,
    unique_editors
  FROM article_stats
  WHERE rn <= 15
)
SELECT
  school,
  json_group_array(
    json_object(
      'title', title,
      'total_volume', total_volume,
      'unique_editors', unique_editors
    )
  ) AS articles
FROM ranked
GROUP BY school
ORDER BY school;
`;

try {
  const rows = database.prepare(sql).all();
  const result = {};

  for (const row of rows) {
    result[row.school] = JSON.parse(row.articles ?? "[]");
  }

  const outputJson = JSON.stringify(result, null, 2);
  fs.writeFileSync(outputPath, outputJson);

  console.log(`Wrote top articles JSON to ${outputPath}`);
} finally {
  database.close();
}
