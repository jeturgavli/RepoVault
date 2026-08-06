// RepoVault Server — Auth + Encrypted Database
// To run: node server.js  (or double-click start.bat)
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// ── Config ──────────────────────────────────────────────
const PORT = 3000;
const DATA_DIR = path.join(__dirname, "Data_Base");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const HTML_FILE = path.join(__dirname, "repo-vault.html");

// ── Helpers ─────────────────────────────────────────────

// Read full request body
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

// JSON response
function json(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "http://localhost:3000",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  });
  res.end(JSON.stringify(data));
}

// Password hashing (PBKDF2)
function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
}

function generateSalt() {
  return crypto.randomBytes(16).toString("hex");
}

// AES-256-GCM encryption
function encrypt(plainText, key) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(plainText, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  // Store as: iv:authTag:ciphertext (all hex)
  return iv.toString("hex") + ":" + authTag + ":" + encrypted;
}

function decrypt(cipherText, key) {
  const parts = cipherText.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted format");
  const iv = Buffer.from(parts[0], "hex");
  const authTag = Buffer.from(parts[1], "hex");
  const encrypted = parts[2];
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// Derive encryption key from password
function deriveKey(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 32, "sha512");
}

// Generate random session token
function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

// ── Users Database ──────────────────────────────────────
function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) return [];
  return JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
}

// ── Per-User Encrypted Data ─────────────────────────────
function getUserDataDir(username) {
  const dir = path.join(DATA_DIR, "users", username);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getUserFile(username, filename) {
  return path.join(getUserDataDir(username), filename);
}

function readEncryptedFile(filePath, encryptionKey) {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, "utf8");
  if (!raw.trim()) return [];
  const decrypted = decrypt(raw, encryptionKey);
  return JSON.parse(decrypted);
}

function restoreFromBackup(filePath, encryptionKey) {
  const backupPath = filePath + ".backup";
  if (!fs.existsSync(backupPath)) throw new Error("No backup file found");
  const raw = fs.readFileSync(backupPath, "utf8");
  if (!raw.trim()) throw new Error("Backup file is empty");
  const decrypted = decrypt(raw, encryptionKey);
  const data = JSON.parse(decrypted);
  // Restore: copy backup over the main file
  fs.copyFileSync(backupPath, filePath);
  return data;
}

function writeEncryptedFile(filePath, data, encryptionKey) {
  // Backup before writing
  if (fs.existsSync(filePath)) {
    const backupPath = filePath + ".backup";
    fs.copyFileSync(filePath, backupPath);
  }
  const jsonStr = JSON.stringify(data, null, 2);
  const encrypted = encrypt(jsonStr, encryptionKey);
  fs.writeFileSync(filePath, encrypted, "utf8");
}

// ── Session Store ───────────────────────────────────────
// Map<token, { username, key: Buffer }>
const sessions = new Map();

function getSession(req) {
  const auth = req.headers["authorization"];
  if (!auth || !auth.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  return sessions.get(token) || null;
}

// ── Ensure data/ folder exists ──────────────────────────
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ── Server ──────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url = req.url.split("?")[0];

  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, PUT, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    res.end();
    return;
  }

  // ── Serve HTML ────────────────────────────────────────
  if ((url === "/" || url === "/index.html") && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    fs.createReadStream(HTML_FILE).pipe(res);
    return;
  }

  // ── Serve static files (CSS, JS) ──────────────────────
  const STATIC_MAP = { "/styles.css": "text/css", "/app.js": "application/javascript" };
  if (STATIC_MAP[url] && req.method === "GET") {
    const filePath = path.join(__dirname, url.slice(1)); // remove leading /
    if (fs.existsSync(filePath)) {
      res.writeHead(200, { "Content-Type": STATIC_MAP[url] + "; charset=utf-8" });
      fs.createReadStream(filePath).pipe(res);
      return;
    }
  }

  // ── Auth: Register ────────────────────────────────────
  if (url === "/api/auth/register" && req.method === "POST") {
    try {
      const body = JSON.parse(await readBody(req));
      const { username, password } = body;

      if (!username || !password) {
        return json(res, 400, { ok: false, error: "Username and password are required" });
      }
      if (username.length < 3 || username.length > 30) {
        return json(res, 400, { ok: false, error: "Username must be at least 3 characters" });
      }
      if (password.length < 4) {
        return json(res, 400, { ok: false, error: "Password must be at least 4 characters" });
      }
      if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
        return json(res, 400, { ok: false, error: "Username can only contain letters, numbers, underscores, dashes" });
      }

      const users = loadUsers();
      if (users.find(u => u.username === username)) {
        return json(res, 409, { ok: false, error: "This username is already taken" });
      }

      const salt = generateSalt();
      const encSalt = generateSalt(); // separate salt for encryption key (not shared with auth hash)
      const passwordHash = hashPassword(password, salt);
      users.push({ username, salt, encSalt, passwordHash, createdAt: new Date().toISOString() });
      saveUsers(users);

      // Create user data folder
      getUserDataDir(username);

      json(res, 200, { ok: true });
    } catch {
      json(res, 400, { ok: false, error: "Invalid data sent" });
    }
    return;
  }

  // ── Auth: Login ───────────────────────────────────────
  if (url === "/api/auth/login" && req.method === "POST") {
    try {
      const body = JSON.parse(await readBody(req));
      const { username, password } = body;

      if (!username || !password) {
        return json(res, 400, { ok: false, error: "Username and password are required" });
      }

      const users = loadUsers();
      const user = users.find(u => u.username === username);
      if (!user) {
        return json(res, 401, { ok: false, error: "Invalid username or password" });
      }

      const hash = hashPassword(password, user.salt);
      if (hash !== user.passwordHash) {
        return json(res, 401, { ok: false, error: "Invalid username or password" });
      }

      // Derive encryption key using separate salt (fallback to auth salt for old users)
      const encKey = deriveKey(password, user.encSalt || user.salt);
      const token = generateToken();
      sessions.set(token, { username, key: encKey });

      json(res, 200, { ok: true, token, username });
    } catch {
      json(res, 400, { ok: false, error: "Invalid data sent" });
    }
    return;
  }

  // ── Auth: Logout ──────────────────────────────────────
  if (url === "/api/auth/logout" && req.method === "POST") {
    const auth = req.headers["authorization"];
    if (auth && auth.startsWith("Bearer ")) {
      sessions.delete(auth.slice(7));
    }
    json(res, 200, { ok: true });
    return;
  }

  // ── Auth: Check session ───────────────────────────────
  if (url === "/api/auth/me" && req.method === "GET") {
    const session = getSession(req);
    if (!session) {
      return json(res, 401, { ok: false, error: "Not logged in" });
    }
    json(res, 200, { ok: true, username: session.username });
    return;
  }

  // ── Protected Routes Below ────────────────────────────
  const session = getSession(req);
  if (!session) {
    return json(res, 401, { ok: false, error: "Please login first" });
  }

  const reposFile = getUserFile(session.username, "repos-database.json");
  const peopleFile = getUserFile(session.username, "people-database.json");

  // ── GET /api/repos ────────────────────────────────────
  if (url === "/api/repos" && req.method === "GET") {
    try {
      const data = readEncryptedFile(reposFile, session.key);
      json(res, 200, data);
    } catch {
      json(res, 500, { ok: false, error: "Data file is corrupted or unreadable", corrupted: true });
    }
    return;
  }

  // ── POST /api/repos/restore ───────────────────────────
  if (url === "/api/repos/restore" && req.method === "POST") {
    try {
      const data = restoreFromBackup(reposFile, session.key);
      json(res, 200, { ok: true, data });
    } catch (e) {
      json(res, 500, { ok: false, error: e.message });
    }
    return;
  }

  // ── PUT /api/repos ────────────────────────────────────
  if (url === "/api/repos" && req.method === "PUT") {
    try {
      const data = JSON.parse(await readBody(req));
      if (!Array.isArray(data)) throw new Error("expected an array");
      writeEncryptedFile(reposFile, data, session.key);
      json(res, 200, { ok: true });
    } catch {
      json(res, 400, { ok: false });
    }
    return;
  }

  // ── GET /api/people ───────────────────────────────────
  if (url === "/api/people" && req.method === "GET") {
    try {
      const data = readEncryptedFile(peopleFile, session.key);
      json(res, 200, data);
    } catch {
      json(res, 500, { ok: false, error: "Data file is corrupted or unreadable", corrupted: true });
    }
    return;
  }

  // ── POST /api/people/restore ──────────────────────────
  if (url === "/api/people/restore" && req.method === "POST") {
    try {
      const data = restoreFromBackup(peopleFile, session.key);
      json(res, 200, { ok: true, data });
    } catch (e) {
      json(res, 500, { ok: false, error: e.message });
    }
    return;
  }

  // ── PUT /api/people ───────────────────────────────────
  if (url === "/api/people" && req.method === "PUT") {
    try {
      const data = JSON.parse(await readBody(req));
      if (!Array.isArray(data)) throw new Error("expected an array");
      writeEncryptedFile(peopleFile, data, session.key);
      json(res, 200, { ok: true });
    } catch {
      json(res, 400, { ok: false });
    }
    return;
  }

  // ── 404 ───────────────────────────────────────────────
  json(res, 404, { error: "Not found" });
});

server.listen(PORT, () => {
  console.log("");
  console.log("  ✦ RepoVault is running!");
  console.log("  ✦ Open in browser:  http://localhost:" + PORT);
  console.log("  ✦ Database dir:     " + DATA_DIR);
  console.log("  ✦ Encryption:       AES-256-GCM");
  console.log("");
  console.log("  To stop: press Ctrl+C or close this window");
});
