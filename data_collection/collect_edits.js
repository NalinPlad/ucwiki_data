import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const database = new DatabaseSync("./ucbwiki_data.db");


// TODO Check UCB Ranges, might have found more on UCLA doc site
const IP_PREFIX = {
//   UCB_Misc: ["128.32.", "169.229."],

//   UCB_Main: ["2607:F140:400:", "136.152.214.", "136.152.215."],

//   UCB_Visitor: ["2607:f140:6000:", "10.56.", "136.152.209."],

//   UCB_Remote: [
//     "2607:f140:800:1:",
//     "136.152.16.",
//     "136.152.17.",
//     "136.152.18.",
//     "136.152.19.",
//     "136.152.20.",
//     "136.152.21.",
//     "136.152.22.",
//     "136.152.23.",
//     "136.152.24.",
//     "136.152.25.",
//     "136.152.26.",
//     "136.152.27.",
//     "136.152.28.",
//     "136.152.29.",
//     "136.152.30.",
//     "136.152.31.",

//     "136.152.210.",
//     "136.152.211.",
//   ],

//   UCD_Main: [
//     "128.120.",
//     "169.237.",

//   ],

//   UCD_Community: Array.from({length: 127}, (_, i) => `168.150.${i+1}.`),

//   UCD_Medical: [
//     "152.79."
//   ]

    // UCI_Main: [
    //     "128.195.",
    //     "128.200.",
    //     "169.234."
    // ],

    // UCI_Health: ["160.87."]

    // UCLA_Main: [
    //     "128.97.",
    //     "131.179.",
    //     "149.142.",
    //     "164.67.",
    //     "169.232.",
    //     ...Array.from({length: 16}, (_, i) => `172.${16 + i}.`),
    //     "172.27.",
    //     "2607:F010:"
    // ]

    // UCM_Main: [
    //     "169.236."
    // ],

    // UCR_Main: [
    //     "138.23.",
    //     "2607:F290:0"
    // ]

    // UCSD_Main: [
    //     "128.54.",
    //     "132.239.",
    //     "137.110.",
    //     "169.228.",
    // ],

    // UCSD_Marine: ["192.135.237.", "192.135.238."],

    // UCSD_UC_Regents: [
    // ...Array.from({length: 32}, (_, i) => `69.196.${i + 32}.`),
    // ]

    // UCSF_Main: [
    //     "64.54.",
    //     "128.218.",
    //     "169.230."
    // ]

    // UCSB_Main: [
    //     "128.111.",
    //     "169.231.",
    //     "192.35.222."
    // ]

    // UCSC_Main: [
    //     "128.114.",
    //     "169.233."
    // ]

    UCOP_Main: [
        "128.48."
    ]

    // DHS_Main: [
      
    // ]





  
};

const API_URL = "https://en.wikipedia.org/w/api.php";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONTINUE_FILE = path.join(__dirname, "last_continue_params.json");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readContinueParams() {
  try {
    if (fs.existsSync(CONTINUE_FILE)) {
      const text = fs.readFileSync(CONTINUE_FILE, "utf8");
      const obj = JSON.parse(text);
      return obj && typeof obj === "object" ? obj : {};
    }
  } catch (_) {}
  return {};
}

function writeContinueParams(obj) {
  try {
    fs.writeFileSync(CONTINUE_FILE, JSON.stringify(obj, null, 2));
  } catch (err) {}
}

function clearContinueParams() {
  try {
    fs.writeFileSync(CONTINUE_FILE, JSON.stringify({}, null, 2));
  } catch (err) {}
}

function initDatabase() {
  database.exec("PRAGMA journal_mode=WAL;");
  database.exec("PRAGMA synchronous=NORMAL;");
  database.exec(
    "CREATE TABLE IF NOT EXISTS edits (" +
      "revid INTEGER PRIMARY KEY, " +
      "parentid INTEGER, " +
      "pageid INTEGER, " +
      "ns INTEGER, " +
      "title TEXT, " +
      "user TEXT, " +
      "userid INTEGER, " +
      "timestamp TEXT, " +
      "comment TEXT, " +
      "parsedcomment TEXT, " +
      "size INTEGER, " +
      "minor INTEGER, " +
      "bot INTEGER, " +
      "new INTEGER, " +
      "top INTEGER, " +
      "tags TEXT, " +
      "category TEXT" +
      ")"
  );
  database.exec("CREATE INDEX IF NOT EXISTS idx_edits_user ON edits(user)");
  database.exec(
    "CREATE INDEX IF NOT EXISTS idx_edits_timestamp ON edits(timestamp)"
  );
  database.exec(
    "CREATE INDEX IF NOT EXISTS idx_edits_category ON edits(category)"
  );
}

function insertEdits(edits, category) {
  const insert = database.prepare(
    "INSERT OR IGNORE INTO edits (revid, parentid, pageid, ns, title, user, userid, timestamp, comment, parsedcomment, size, minor, bot, new, top, tags, category) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
  );
  database.exec("BEGIN");
  try {
    for (const e of edits) {
      const tags = Array.isArray(e.tags) ? JSON.stringify(e.tags) : null;
      insert.run(
        e.revid ?? null,
        e.parentid ?? null,
        e.pageid ?? null,
        e.ns ?? null,
        e.title ?? null,
        e.user ?? null,
        e.userid ?? null,
        e.timestamp ?? null,
        e.comment ?? null,
        e.parsedcomment ?? null,
        e.size ?? null,
        e.minor ? 1 : 0,
        e.bot ? 1 : 0,
        e.new ? 1 : 0,
        e.top ? 1 : 0,
        tags,
        category
      );
    }
    database.exec("COMMIT");
  } catch (err) {
    database.exec("ROLLBACK");
    throw err;
  }
}

function paramsToQuery(params) {
  const url = new URL(API_URL);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "")
      url.searchParams.append(k, String(v));
  }
  return url;
}

async function fetchPage(continueParams, userPrefix) {
  const baseParams = {
    action: "query",
    format: "json",
    formatversion: "2",
    list: "usercontribs",
    ucprop: "ids|title|timestamp|comment|size|flags|parsedcomment|userid|tags",
    uclimit: "max",
    ucdir: "older",
    ucuserprefix: userPrefix,
    maxlag: "5",
  };
  const params = Object.assign({}, baseParams, continueParams || {});
  const url = paramsToQuery(params);
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent": "ucwiki_data (utility script)",
    },
  });
  if (!res.ok) {
    throw new Error("HTTP " + res.status + " from API");
  }
  const data = await res.json();
  if (data && data.error) {
    const info = data.error && data.error.info ? String(data.error.info) : "";
    if (
      String(data.error.code || "").includes("maxlag") ||
      info.includes("maxlag")
    ) {
      await sleep(5000);
      return fetchPage(continueParams, userPrefix);
    }
    throw new Error("API error: " + JSON.stringify(data.error));
  }
  return data;
}

async function runForPrefix(category, prefix) {
  console.log(`Fetching edits for ${category} with prefix: ${prefix}`);
  let continueParams = readContinueParams();
  let total = 0;

  for (;;) {
    const data = await fetchPage(continueParams, prefix);
    const edits =
      data && data.query && data.query.usercontribs
        ? data.query.usercontribs
        : [];
    if (edits.length) {
      insertEdits(edits, category);
      total += edits.length;
      console.log(`  Added ${edits.length} edits (total: ${total})`);
    }
    if (data && data.continue) {
      writeContinueParams(data.continue);
      continueParams = data.continue;
      await sleep(200);
    } else {
      clearContinueParams();
      break;
    }
  }

  console.log(`Completed ${category}: ${total} total edits`);
  return total;
}

async function run() {
  initDatabase();
  let grandTotal = 0;

  for (const [category, prefixes] of Object.entries(IP_PREFIX)) {
    for (const prefix of prefixes) {
      const count = await runForPrefix(category, prefix);
      grandTotal += count;
      await sleep(1000);
    }
  }

  console.log(`\nAll done! Total edits collected: ${grandTotal}`);
}

run()
  .then(() => {})
  .catch((err) => {});
