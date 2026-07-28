// RepoVault Server — saves all repos to the repos-database.json file
// To run: node server.js  (or double-click start.bat)
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 3000;
const DATA_DIR = path.join(__dirname, "Database");
const DB_FILE = path.join(DATA_DIR, "repos-database.json");
const BACKUP_FILE = path.join(DATA_DIR, "repos-database.backup.json");
const PEOPLE_FILE = path.join(DATA_DIR, "people-database.json");
const PEOPLE_BACKUP_FILE = path.join(DATA_DIR, "people-database.backup.json");
const HTML_FILE = path.join(__dirname, "repo-vault.html");

// create data folder and empty database files if they don't exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, "[]", "utf8");
if (!fs.existsSync(PEOPLE_FILE)) fs.writeFileSync(PEOPLE_FILE, "[]", "utf8");

const server = http.createServer((req, res) => {
  const url = req.url.split("?")[0];

  // serve the website
  if (url === "/" || url === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    fs.createReadStream(HTML_FILE).pipe(res);
    return;
  }

  // saare repos bhejo
  if (url === "/api/repos" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(fs.readFileSync(DB_FILE, "utf8"));
    return;
  }

  // save repos to the database file
  if (url === "/api/repos" && req.method === "PUT") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      try {
        const data = JSON.parse(body);
        if (!Array.isArray(data)) throw new Error("expected an array");
        // keep a backup of the previous state before overwriting
        if (fs.existsSync(DB_FILE)) fs.copyFileSync(DB_FILE, BACKUP_FILE);
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf8");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end('{"ok":true}');
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end('{"ok":false}');
      }
    });
    return;
  }

  // saare saved people (GitHub profiles) bhejo
  if (url === "/api/people" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(fs.readFileSync(PEOPLE_FILE, "utf8"));
    return;
  }

  // save people to the database file
  if (url === "/api/people" && req.method === "PUT") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      try {
        const data = JSON.parse(body);
        if (!Array.isArray(data)) throw new Error("expected an array");
        // keep a backup of the previous state before overwriting
        if (fs.existsSync(PEOPLE_FILE)) fs.copyFileSync(PEOPLE_FILE, PEOPLE_BACKUP_FILE);
        fs.writeFileSync(PEOPLE_FILE, JSON.stringify(data, null, 2), "utf8");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end('{"ok":true}');
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end('{"ok":false}');
      }
    });
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log("");
  console.log("  ✦ RepoVault is running!");
  console.log("  ✦ Open in browser:  http://localhost:" + PORT);
  console.log("  ✦ Database file:    " + DB_FILE);
  console.log("");
  console.log("  To stop: press Ctrl+C or close this window");
});
