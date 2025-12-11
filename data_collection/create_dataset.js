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

// We'll select separately the Top 15 by net (SUM(sizediff)), total (SUM(ABS(sizediff))),
// unique (unique editors), edits (number of edits), and net_asc (SUM(sizediff) ascending) for each school.
// Output will be:
// { "SCHOOL": { "net": [top 15 by net], "total": [top 15 by total], "unique": [...], "edits": [...], "net_asc": [...] }, ... }

const netSql = `
WITH article_stats AS (
  SELECT
    school,
    title,
    SUM(sizediff) AS net_size,
    SUM(ABS(sizediff)) AS total_size,
    COUNT(DISTINCT user) AS unique_editors,
    COUNT(*) AS edits,
    ROW_NUMBER() OVER (PARTITION BY school ORDER BY SUM(sizediff) DESC) AS rn
  FROM edits
  WHERE school IS NOT NULL AND school <> ''
  GROUP BY school, title
)
SELECT
  school,
  json_group_array(
    json_object(
      'title', title,
      'net', net_size,
      'total', total_size,
      'unique_editors', unique_editors,
      'edits', edits
    )
  ) AS articles
FROM article_stats
WHERE rn <= 15
GROUP BY school
ORDER BY school;
`;

const totalSql = `
WITH article_stats AS (
  SELECT
    school,
    title,
    SUM(sizediff) AS net_size,
    SUM(ABS(sizediff)) AS total_size,
    COUNT(DISTINCT user) AS unique_editors,
    COUNT(*) AS edits,
    ROW_NUMBER() OVER (PARTITION BY school ORDER BY SUM(ABS(sizediff)) DESC) AS rn
  FROM edits
  WHERE school IS NOT NULL AND school <> ''
  GROUP BY school, title
)
SELECT
  school,
  json_group_array(
    json_object(
      'title', title,
      'net', net_size,
      'total', total_size,
      'unique_editors', unique_editors,
      'edits', edits
    )
  ) AS articles
FROM article_stats
WHERE rn <= 15
GROUP BY school
ORDER BY school;
`;

const uniqueSql = `
WITH article_stats AS (
  SELECT
    school,
    title,
    SUM(sizediff) AS net_size,
    SUM(ABS(sizediff)) AS total_size,
    COUNT(DISTINCT user) AS unique_editors,
    COUNT(*) AS edits,
    ROW_NUMBER() OVER (PARTITION BY school ORDER BY COUNT(DISTINCT user) DESC) AS rn
  FROM edits
  WHERE school IS NOT NULL AND school <> ''
  GROUP BY school, title
)
SELECT
  school,
  json_group_array(
    json_object(
      'title', title,
      'net', net_size,
      'total', total_size,
      'unique_editors', unique_editors,
      'edits', edits
    )
  ) AS articles
FROM article_stats
WHERE rn <= 15
GROUP BY school
ORDER BY school;
`;

const editsSql = `
WITH article_stats AS (
  SELECT
    school,
    title,
    SUM(sizediff) AS net_size,
    SUM(ABS(sizediff)) AS total_size,
    COUNT(DISTINCT user) AS unique_editors,
    COUNT(*) AS edits,
    ROW_NUMBER() OVER (PARTITION BY school ORDER BY COUNT(*) DESC) AS rn
  FROM edits
  WHERE school IS NOT NULL AND school <> ''
  GROUP BY school, title
)
SELECT
  school,
  json_group_array(
    json_object(
      'title', title,
      'net', net_size,
      'total', total_size,
      'unique_editors', unique_editors,
      'edits', edits
    )
  ) AS articles
FROM article_stats
WHERE rn <= 15
GROUP BY school
ORDER BY school;
`;

const netAscSql = `
WITH article_stats AS (
  SELECT
    school,
    title,
    SUM(sizediff) AS net_size,
    SUM(ABS(sizediff)) AS total_size,
    COUNT(DISTINCT user) AS unique_editors,
    COUNT(*) AS edits,
    ROW_NUMBER() OVER (PARTITION BY school ORDER BY SUM(sizediff) ASC) AS rn
  FROM edits
  WHERE school IS NOT NULL AND school <> ''
  GROUP BY school, title
)
SELECT
  school,
  json_group_array(
    json_object(
      'title', title,
      'net', net_size,
      'total', total_size,
      'unique_editors', unique_editors,
      'edits', edits
    )
  ) AS articles
FROM article_stats
WHERE rn <= 15
GROUP BY school
ORDER BY school;
`;

try {
  // Get top by each method
  const netRows = database.prepare(netSql).all();
  const totalRows = database.prepare(totalSql).all();
  const uniqueRows = database.prepare(uniqueSql).all();
  const editsRows = database.prepare(editsSql).all();
  const netAscRows = database.prepare(netAscSql).all();
  const result = {};

  // Initialize with all present schools from any sort (avoids missing, keeps data for all)
  const allSchools = new Set([
    ...netRows.map(r => r.school),
    ...totalRows.map(r => r.school),
    ...uniqueRows.map(r => r.school),
    ...editsRows.map(r => r.school),
    ...netAscRows.map(r => r.school)
  ]);

  for (const school of allSchools) {
    result[school] = { net: [], total: [], unique: [], edits: [], net_asc: [] };
  }

  for (const row of netRows) {
    result[row.school].net = JSON.parse(row.articles ?? "[]");
  }
  for (const row of totalRows) {
    result[row.school].total = JSON.parse(row.articles ?? "[]");
  }
  for (const row of uniqueRows) {
    result[row.school].unique = JSON.parse(row.articles ?? "[]");
  }
  for (const row of editsRows) {
    result[row.school].edits = JSON.parse(row.articles ?? "[]");
  }
  for (const row of netAscRows) {
    result[row.school].net_asc = JSON.parse(row.articles ?? "[]");
  }

  const outputJson = JSON.stringify(result, null, 2);
  fs.writeFileSync(outputPath, outputJson);

  console.log(`Wrote top articles JSON (with net, total, unique, edits, net_asc) to ${outputPath}`);
} finally {
  database.close();
}
