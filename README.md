# RepoVault 📦

A personal GitHub repository bookmark manager. Save links to interesting GitHub repos, organize them with tags and notes, follow the developers you admire, and keep everything **encrypted** and **password-protected** on your own machine — no cloud, no tracking.

![Platform](https://img.shields.io/badge/platform-Windows-blue) ![Runtime](https://img.shields.io/badge/runtime-Node.js-green) ![Storage](https://img.shields.io/badge/storage-AES%20256%20GCM-orange) ![Auth](https://img.shields.io/badge/auth-Login%20%2F%20Register-brightgreen)

---

## Why RepoVault?

GitHub's own "Star" feature quickly becomes a messy, unsearchable list. RepoVault gives you:

- **Your own encrypted database** — everything lives on your machine, encrypted with AES-256
- **Tags & notes** — remember *why* you saved a repo
- **Rich info at a glance** — stars, forks, language, and description fetched automatically
- **Zero dependencies** — no npm packages, no cloud, no accounts needed to run

---

## Features

### 📦 Repositories

| Feature | Description |
|---------|-------------|
| ⚡ **Quick add** | Paste a repo URL — stars, forks, description, language, avatar fetched automatically |
| 📚 **Bulk add** | Paste many URLs at once (space/comma/newline separated) |
| 🏷️ **Tags** | Organize repos with custom tags and filter by them |
| 📝 **Notes** | Attach a personal note to any repo |
| 📌 **Pin** | Keep important repos at the top |
| 🔄 **Refresh** | Re-fetch latest stats from GitHub for all repos |
| 🔍 **Search** | Press `/` anywhere to jump to the search box |
| 📊 **Sort** | Sort by newest, oldest, most stars, or name (A–Z) |
| 🔀 **Language filter** | Filter repos by programming language |
| 💾 **Export / Import** | Back up or restore your collection as a JSON file |

### 👤 People

| Feature | Description |
|---------|-------------|
| ➕ **Add by username or URL** | Paste `torvalds` or `https://github.com/torvalds` — profile info fetched automatically |
| 📊 **Profile stats** | Followers, public repos, and following shown on each card |
| 📈 **Growth tracking** | On refresh, ▲/▼ badges show how followers & repos changed since last check |
| 🏷️ **Relations** | Mark each person as 🙋 Me, 🤝 Friend, ⭐ Inspiration, or 👤 Other |
| 📝 **Notes** | Write what you want to learn from them |
| 🔀 **Sorting** | Sort by newest, most followers, fastest growing, or name |
| 📚 **Repos shortcut** | Jump straight to a person's repositories list on GitHub |

### 🔐 Security

| Feature | Description |
|---------|-------------|
| 🔑 **Login & Register** | Create your own account — only you can access your vault |
| 🔒 **AES-256-GCM encryption** | All data encrypted on disk — opening the file directly shows garbled text |
| 🔑 **Separate encryption salt** | Auth hash and encryption key use independent salts — cracking one doesn't compromise the other |
| 🛡️ **Auto-backup** | The server backs up the encrypted database before every write |
| 🔄 **Restore from backup** | If data corruption is detected, one-click restore from the last backup |
| 🛑 **Rate limiting** | Login & register limited to 5 attempts per minute — brute-force blocked |
| 🌐 **Localhost only** | Server binds to `127.0.0.1` — not exposed to your LAN |
| 🔗 **CORS restricted** | Only localhost can access the API — cross-origin attacks blocked |
| 💾 **Offline safety** | Server down? Data saves locally — auto-syncs back when server recovers (per-user, no cross-user leaks) |
| 🛡️ **XSS protection** | Import validates URLs (`https://` only) and sanitizes relation fields |

### 🎨 UI

| Feature | Description |
|---------|-------------|
| 🌙 **Dark UI** | GitHub-dark inspired theme with glassmorphic cards and ambient glow blobs |
| 📱 **Responsive** | Works on desktop and mobile (single-column grid under 560px) |
| 🔑 **GitHub token** | Optional personal access token raises the API limit from 60 → 5000 requests/hour |
| ⌨️ **Keyboard shortcuts** | `/` to search, `Esc` to close modals, `Enter` to submit forms |

---

## Project Structure

```
Repo-Vault/
├── repo-vault.html      # Main HTML page (links to CSS + JS externally)
├── styles.css           # All styles (dark UI, glassmorphic cards, auth overlay)
├── app.js               # All JavaScript (auth, GitHub API, rendering, offline sync)
├── server.js            # Node.js HTTP server (port 3000) + Auth + Encrypted Database
├── Data_Base/           # Encrypted database (git-ignored)
│   ├── users.json       # User accounts (username + password hash)
│   └── users/
│       └── {username}/
│           ├── repos-database.json          # Encrypted repos data
│           ├── repos-database.json.backup   # Encrypted backup
│           ├── people-database.json         # Encrypted people data
│           └── people-database.json.backup  # Encrypted backup
├── LICENSE              # MIT License
├── .gitignore           # Ignores Data_Base/, data/, issues/
└── start.bat            # One-click launcher (Windows)
```

---

## Getting Started

### Requirements

- [Node.js](https://nodejs.org/) installed (any recent version — no npm packages needed)
- Windows (for `start.bat`; on other systems just run `node server.js`)

### Run it

**Option 1 — the easy way:**

Double-click **`start.bat`**.

**Option 2 — manual:**

```bash
node server.js
```

Then open [http://localhost:3000](http://localhost:3000).

**First time?** Click **"Register"** to create an account (username + password). Then sign in to access your vault.

**Option 3 — no server (offline mode):**

Click **"Continue without server"** on the login screen. Data saves to browser localStorage (not encrypted).

### Stop the server

Press `Ctrl+C` in the server window, or just close it.

---

## How Data Is Stored

- Each user gets their own encrypted folder: **`Data_Base/users/{username}/`**
- Opening an encrypted file directly shows garbled hex text — not readable JSON
- The encryption key is derived from your password and lives **only in server memory** — cleared on logout
- Auth hash and encryption key use **separate salts** — cracking one doesn't compromise the other
- Before every save, the server backs up the previous encrypted file (never lost on bad writes)
- If a data file is corrupted, the server returns `500` and prompts you to restore from backup

---

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|:----:|-------------|
| `GET` | `/` | ❌ | Serves the website |
| `POST` | `/api/auth/register` | ❌ | Create account (`{ username, password }`) — rate limited |
| `POST` | `/api/auth/login` | ❌ | Login → returns session token |
| `POST` | `/api/auth/logout` | ✅ | Destroy session |
| `GET` | `/api/auth/me` | ✅ | Check if logged in |
| `GET` | `/api/repos` | ✅ | Get all repos (decrypted) |
| `PUT` | `/api/repos` | ✅ | Save repos (encrypted, backed up) |
| `POST` | `/api/repos/restore` | ✅ | Restore repos from backup |
| `GET` | `/api/people` | ✅ | Get all people (decrypted) |
| `PUT` | `/api/people` | ✅ | Save people (encrypted, backed up) |
| `POST` | `/api/people/restore` | ✅ | Restore people from backup |

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `/` | Focus the search box |
| `Esc` | Close modal / clear search |
| `Enter` | Submit login, register, or save edits |

---

## Tech Stack

- **Frontend:** Vanilla HTML + CSS + JavaScript (zero dependencies)
- **Backend:** Pure Node.js using only built-in modules (`http`, `fs`, `path`, `crypto`)
- **Encryption:** AES-256-GCM with PBKDF2 key derivation (100k iterations)
- **License:** [MIT](LICENSE)

---

## Future Plans 🚀

- [ ] **Tag manager** — rename, merge, and delete tags across all repos
- [ ] **Collections / folders** — group repos beyond flat tags
- [ ] **Repo health badges** — last commit date / archived status
- [ ] **People: recent activity** — latest public repos on their card
- [ ] **People: follower history chart** — tiny sparkline of growth
- [ ] **Auto-refresh scheduler** — refresh all repo stats daily
- [ ] **README preview** — view a repo's README inside RepoVault
- [ ] **Import from GitHub Stars** — pull in your starred repos
- [ ] **Statistics dashboard** — charts by language, tags, growth
- [ ] **Browser extension** — save repos with one click from GitHub
- [ ] **Sync between machines** — optional sync via Git or cloud folder
- [ ] **Light theme** — for the brave

> Have an idea? Add it here — this file is the project's living roadmap.

---

## License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.
