# RepoVault 📦

A personal GitHub repository bookmark manager. Save links to interesting GitHub repos, organize them with tags and notes, follow the developers you admire, and keep everything **encrypted** and **password-protected** on your own machine — no account, no cloud, no tracking.

![Platform](https://img.shields.io/badge/platform-Windows-blue) ![Runtime](https://img.shields.io/badge/runtime-Node.js-green) ![Storage](https://img.shields.io/badge/storage-AES%20256%20GCM-orange) ![Auth](https://img.shields.io/badge/auth-Login%20%2F%20Register-brightgreen)

---

## Why RepoVault?

GitHub's own "Star" feature quickly becomes a messy, unsearchable list. RepoVault gives you:

- **Your own database** — everything lives in a local JSON file you control
- **Tags & notes** — remember *why* you saved a repo
- **Rich info at a glance** — stars, forks, language, and description fetched automatically from the GitHub API

---

## Features

| Feature | Description |
|---------|-------------|
| ⚡ **Quick add** | Paste a repo URL — details (stars, forks, description, language, avatar) are fetched automatically |
| 📚 **Bulk add** | Paste many URLs at once and add them all in one go |
| 🏷️ **Tags** | Organize repos with custom tags and filter by them |
| 📝 **Notes** | Attach a personal note to any repo |
| 📌 **Pin** | Keep important repos at the top |
| 🔄 **Refresh** | Re-fetch latest stats from GitHub anytime |
| 🔍 **Search** | Press `/` anywhere to jump to the search box |
| 💾 **Export / Import** | Back up or move your collection as a JSON file |
| 🛡️ **Auto-backup** | The server backs up the database before every write |
| 🌙 **Dark UI** | Single-page dark interface, easy on the eyes |
| 🔐 **Login & Register** | Create your own account — only you can access your vault |
| 🔒 **Encrypted database** | All data stored as AES-256-GCM encrypted files — opening the file directly shows garbled text |
| 🔑 **GitHub token** | Optional personal access token raises the API limit from 60 → 5000 requests/hour (🔑 Token button in the toolbar; stored only in your browser) |

### 👤 People — follow developers you admire

A dedicated **People** tab for keeping an eye on friends and inspiring GitHub users:

| Feature | Description |
|---------|-------------|
| ➕ **Add by username or URL** | Paste `torvalds` or `https://github.com/torvalds` — profile info is fetched automatically |
| 📊 **Profile stats** | Followers, public repos, and following shown on each card |
| 📈 **Growth tracking** | On refresh, ▲/▼ badges show how followers & repos changed since last check |
| 🏷️ **Relations** | Mark each person as 🙋 Me, 🤝 Friend, ⭐ Inspiration, or 👤 Other — and filter by it |
| 📝 **Notes** | Write what you want to learn from them |
| 🔀 **Sorting** | Sort by newest, most followers, fastest growing, or name |
| 📚 **Repos shortcut** | Jump straight to a person's repositories list on GitHub |

---

## Project Structure

```
Repo-Vault/
├── repo-vault.html             # Main HTML page (links to CSS + JS externally)
├── styles.css                  # All styles (dark UI, glassmorphic cards, auth overlay)
├── app.js                      # All JavaScript (auth, GitHub API, rendering, encryption client)
├── server.js                   # Node.js HTTP server (port 3000) + Auth + Encryption API
├── Data_Base/                  # All encrypted database files live here
│   ├── users.json              # User accounts (username + password hash)
│   └── users/
│       └── {username}/
│           ├── repos-database.json         # Encrypted repos data
│           ├── repos-database.backup.json  # Encrypted backup
│           ├── people-database.json        # Encrypted people data
│           └── people-database.backup.json # Encrypted backup
└── start.bat                   # One-click launcher (starts server + opens browser)
```

---

## Getting Started

### Requirements

- [Node.js](https://nodejs.org/) installed (any recent version — no npm packages needed)
- Windows (for `start.bat`; on other systems just run `node server.js`)

### Run it

**Option 1 — the easy way (recommended):**

Double-click **`start.bat`**. It starts the server and opens the site in your browser.

**Option 2 — manual:**

```bash
node server.js
```

Then open <http://localhost:3000> in your browser.

**First time?** Click "Register karo" to create an account (username + password). After registering, sign in to access your vault. Your data stays encrypted on your machine — only you can read it.

**Option 3 — no server (offline mode):**

Open `repo-vault.html` directly as a file, or click "Bina server ke chalao" on the login screen. It still works, but data is saved to the browser's localStorage instead of the encrypted JSON file (less safe — clearing browser data wipes your collection).

### Stop the server

Press `Ctrl+C` in the server window, or just close it.

---

## How Data Is Stored

- Each user gets their own folder: **`Data_Base/users/{username}/`** — all data files here are **AES-256-GCM encrypted**.
- If you open an encrypted file directly (e.g. in Notepad), you'll see garbled hex text — not readable JSON.
- The encryption key is derived from your password and lives **only in server memory** during your session. It's cleared on logout.
- Before every save, the server copies the current encrypted file to its `.backup.json` twin — so a bad write never destroys your data.
- User account credentials (`Data_Base/users.json`) store only the username + password hash — never the raw password.
- Each repo entry stores: `fullName`, `owner`, `name`, `url`, `description`, `stars`, `forks`, `language`, `avatar`, `savedAt`, `tags`, `note`, `pinned`.
- Each person entry stores: `login`, `name`, `url`, `avatar`, `bio`, `followers`, `following`, `publicRepos`, `company`, `location`, `addedAt`, `lastChecked`, `prevFollowers`, `prevRepos`, `relation`, `note`.

### API (used by the frontend)

| Method | Endpoint | Auth required | Description |
|--------|----------|:------------:|-------------|
| `GET` | `/` | ❌ | Serves the website |
| `POST` | `/api/auth/register` | ❌ | Create a new account (`{ username, password }`) |
| `POST` | `/api/auth/login` | ❌ | Login (`{ username, password }`) → returns session token |
| `POST` | `/api/auth/logout` | ✅ | Destroy current session |
| `GET` | `/api/auth/me` | ✅ | Check if logged in, returns username |
| `GET` | `/api/repos` | ✅ | Returns all saved repos (decrypted) |
| `PUT` | `/api/repos` | ✅ | Replaces the repos database (encrypted before saving) |
| `GET` | `/api/people` | ✅ | Returns all followed people (decrypted) |
| `PUT` | `/api/people` | ✅ | Replaces the people database (encrypted before saving) |

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `/` | Focus the search box (of whichever tab is open) |
| `Esc` | Close modal / clear search |

---

## Future Plans 🚀

Ideas for upcoming versions, roughly in priority order:

### Near term

- [ ] **Sort options** — sort by stars, date saved, name, or last updated
- [ ] **Tag manager** — rename, merge, and delete tags across all repos
- [ ] **Duplicate detection** — warn when adding a repo that's already saved
- [ ] **Collections / folders** — group repos beyond flat tags (e.g. "AI Tools", "Learning")
- [ ] **Repo health badges** — show last commit date / archived status so dead repos are easy to spot
- [ ] **People: recent activity** — show a person's latest public repos / recent pushes on their card
- [ ] **People: follower history chart** — tiny sparkline of follower growth over time

### Medium term

- [ ] **Auto-refresh scheduler** — refresh all repo stats automatically once a day
- [ ] **README preview** — view a repo's README inside RepoVault without opening GitHub
- [ ] **Star-history sparkline** — tiny chart of how a repo's stars grew since you saved it
- [x] **GitHub token support** — optional personal access token to raise the API rate limit ✅ Done
- [ ] **Import from GitHub Stars** — pull in everything you've already starred on GitHub

### Long term

- [ ] **Full-text search** — search inside notes, descriptions, and READMEs
- [ ] **Browser extension** — save a repo with one click while browsing GitHub
- [ ] **Sync between machines** — optional sync via a Git repo or cloud folder
- [ ] **Statistics dashboard** — charts of your collection by language, tags, and growth over time
- [ ] **Light theme** — for the brave

> Have an idea? Add it here — this file is the project's living roadmap.

---

## License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

You're free to use, modify, and distribute it. Just keep the copyright notice intact.
