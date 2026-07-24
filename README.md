# RepoVault 📦

A personal GitHub repository bookmark manager. Save links to interesting GitHub repos, organize them with tags and notes, follow the developers you admire, and keep everything stored safely on your own machine — no account, no cloud, no tracking.

![Platform](https://img.shields.io/badge/platform-Windows-blue) ![Runtime](https://img.shields.io/badge/runtime-Node.js-green) ![Storage](https://img.shields.io/badge/storage-local%20JSON-orange)

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
Cluade_testing/
├── repo-vault.html             # The entire website (single-page app, dark UI)
├── server.js                   # Node.js HTTP server (port 3000) + JSON storage API
├── repos-database.json         # Your saved repos (the database)
├── repos-database.backup.json  # Auto-backup, written before every save
├── people-database.json        # Your followed people (GitHub profiles)
├── people-database.backup.json # Auto-backup for people
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

**Option 3 — no server:**

Open `repo-vault.html` directly as a file. It still works, but data is saved to the browser's localStorage instead of the JSON file (less safe — clearing browser data wipes your collection).

### Stop the server

Press `Ctrl+C` in the server window, or just close it.

---

## How Data Is Stored

- Repos live in **`repos-database.json`**, followed people in **`people-database.json`** — both simple JSON arrays.
- Before every save, the server copies the current file to its `.backup.json` twin — so a bad write never destroys your data.
- Each repo entry stores: `fullName`, `owner`, `name`, `url`, `description`, `stars`, `forks`, `language`, `avatar`, `savedAt`, `tags`, `note`, `pinned`.
- Each person entry stores: `login`, `name`, `url`, `avatar`, `bio`, `followers`, `following`, `publicRepos`, `company`, `location`, `addedAt`, `lastChecked`, `prevFollowers`, `prevRepos`, `relation`, `note`.

### API (used by the frontend)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Serves the website |
| `GET` | `/api/repos` | Returns all saved repos |
| `PUT` | `/api/repos` | Replaces the repos database with the sent array (backs up first) |
| `GET` | `/api/people` | Returns all followed people |
| `PUT` | `/api/people` | Replaces the people database with the sent array (backs up first) |

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

Personal project — use it however you like.
