document.addEventListener("DOMContentLoaded", async () => {
  const STORAGE_KEY = "repovault_repos";
  const PEOPLE_STORAGE_KEY = "repovault_people";
  const TOKEN_KEY = "repovault_gh_token";
  // if the server is running, use the database file; otherwise fall back to browser storage
  let useServer = location.protocol.startsWith("http");

  // ── Auth session ──────────────────────────────────────
  let sessionToken = localStorage.getItem("repovault_session") || "";
  let currentUsername = "";

  function authHeaders(extra) {
    const h = extra || {};
    if (sessionToken) h["Authorization"] = "Bearer " + sessionToken;
    return h;
  }

  // ── Auth UI helpers ───────────────────────────────────
  function showAuth() { document.getElementById("authOverlay").classList.remove("hidden"); }
  function hideAuth() { document.getElementById("authOverlay").classList.add("hidden"); }

  // ── GitHub API helper — adds the personal access token (if saved) to every call.
  // Without a token: 60 requests/hour. With one: 5000/hour.
  let ghToken = localStorage.getItem(TOKEN_KEY) || "";
  // GitHub API fetch with a 10-second timeout so buttons never hang forever
  const GH_TIMEOUT_MS = 10000;
  function ghFetch(url) {
    const headers = { Accept: "application/vnd.github+json" };
    if (ghToken) headers.Authorization = "Bearer " + ghToken;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GH_TIMEOUT_MS);
    return fetch(url, { headers, signal: controller.signal })
      .finally(() => clearTimeout(timer));
  }

  // GitHub language colors (common ones)
  const LANG_COLORS = {
    JavaScript: "#f1e05a", TypeScript: "#3178c6", Python: "#3572A5", Java: "#b07219",
    "C++": "#f34b7d", C: "#555555", "C#": "#178600", Go: "#00ADD8", Rust: "#dea584",
    Ruby: "#701516", PHP: "#4F5D95", Swift: "#F05138", Kotlin: "#A97BFF", Dart: "#00B4AB",
    HTML: "#e34c26", CSS: "#663399", Shell: "#89e051", Vue: "#41b883", Lua: "#000080",
    "Jupyter Notebook": "#DA5B0B", R: "#198CE7", Scala: "#c22d40", Haskell: "#5e5086",
    Elixir: "#6e4a7e", Zig: "#ec915c", Assembly: "#6E4C13", "Objective-C": "#438eff",
    Perl: "#0298c3", MATLAB: "#e16737", Svelte: "#ff3e00", Solidity: "#AA6746"
  };

  let repos = [];
  let people = [];

  const $ = id => document.getElementById(id);
  const grid = $("grid"), urlInput = $("urlInput"), addBtn = $("addBtn"),
        searchInput = $("searchInput"), langFilter = $("langFilter"),
        tagFilter = $("tagFilter"), sortBy = $("sortBy"), repoCount = $("repoCount");
  const peopleGrid = $("peopleGrid"), personInput = $("personInput"), personAddBtn = $("personAddBtn"),
        personSearchInput = $("personSearchInput"), relationFilter = $("relationFilter"),
        personSortBy = $("personSortBy"), personCount = $("personCount");

  function loadLocal() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch { return []; }
  }

  function loadLocalPeople() {
    try { return JSON.parse(localStorage.getItem(PEOPLE_STORAGE_KEY)) || []; }
    catch { return []; }
  }

  async function loadRepos() {
    if (useServer) {
      try {
        const res = await fetch("/api/repos", { headers: authHeaders() });
        if (res.ok) {
          repos = await res.json();
          const uKey = currentUsername || "_anon";
          if (localStorage.getItem("repovault_needs_sync_" + uKey) === "true") {
            syncLocalToServer();
          }
          serverDown = false;
          return;
        }
        if (res.status === 401) { showAuth(); return; }
        if (res.status === 500) { await promptRestore("repos"); return; }
      } catch { /* server not reachable */ }
      useServer = false;
    }
    repos = loadLocal();
  }

  async function loadPeople() {
    if (useServer) {
      try {
        const res = await fetch("/api/people", { headers: authHeaders() });
        if (res.ok) {
          people = await res.json();
          const uKey = currentUsername || "_anon";
          if (localStorage.getItem("repovault_needs_sync_" + uKey) === "true") {
            syncLocalToServer();
          }
          serverDown = false;
          return;
        }
        if (res.status === 401) { showAuth(); return; }
        if (res.status === 500) { await promptRestore("people"); return; }
      } catch { /* server not reachable */ }
    }
    people = loadLocalPeople();
  }

  // Show a dialog offering to restore from backup when data is corrupted
  async function promptRestore(kind) {
    const label = kind === "repos" ? "Repos database" : "People database";
    if (!confirm(label + " file is corrupted or unreadable.\n\nRestore from the latest backup? (If you cancel, a fresh empty vault will be used.)")) {
      if (kind === "repos") repos = [];
      else people = [];
      return;
    }
    try {
      const res = await fetch("/api/" + kind + "/restore", {
        method: "POST",
        headers: authHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        if (kind === "repos") repos = data.data;
        else people = data.data;
        toast(label + " restored from backup ✓");
      } else {
        const err = await res.json();
        toast("Restore failed: " + (err.error || "unknown error"), "error");
        if (kind === "repos") repos = [];
        else people = [];
      }
    } catch {
      toast("Server unreachable — could not restore", "error");
      if (kind === "repos") repos = [];
      else people = [];
    }
  }

  // Issue #004: localStorage fallback with per-user sync — data never lost on server failure
  let serverDown = false;

  function fallbackToLocal() {
    serverDown = true;
    try {
      const uKey = currentUsername || "_anon";
      localStorage.setItem(STORAGE_KEY + "_" + uKey, JSON.stringify(repos));
      localStorage.setItem(PEOPLE_STORAGE_KEY + "_" + uKey, JSON.stringify(people));
      localStorage.setItem("repovault_needs_sync_" + uKey, "true");
      toast("Server unavailable — data saved locally", "error");
    } catch {
      toast("Failed to save to database file!", "error");
    }
  }

  // When server comes back, merge per-user localStorage data that the server doesn't have
  function syncLocalToServer() {
    try {
      const uKey = currentUsername || "_anon";
      const localReposRaw = localStorage.getItem(STORAGE_KEY + "_" + uKey);
      const localPeopleRaw = localStorage.getItem(PEOPLE_STORAGE_KEY + "_" + uKey);
      const localRepos = localReposRaw ? JSON.parse(localReposRaw) : [];
      const localPeople = localPeopleRaw ? JSON.parse(localPeopleRaw) : [];
      let reposSynced = 0, peopleSynced = 0;

      if (localRepos.length) {
        const serverKeys = new Set(repos.map(r => (r.fullName || "").toLowerCase()));
        for (const lr of localRepos) {
          if (!serverKeys.has((lr.fullName || "").toLowerCase())) {
            repos.push(lr);
            reposSynced++;
          }
        }
      }

      if (localPeople.length) {
        const serverLogins = new Set(people.map(p => (p.login || "").toLowerCase()));
        for (const lp of localPeople) {
          if (!serverLogins.has((lp.login || "").toLowerCase())) {
            people.push(lp);
            peopleSynced++;
          }
        }
      }

      if (reposSynced || peopleSynced) {
        const parts = [];
        if (reposSynced) parts.push(`${reposSynced} repos`);
        if (peopleSynced) parts.push(`${peopleSynced} people`);
        toast(`Synced ${parts.join(" & ")} from local backup ✓`);
        persist();
        persistPeople();
      }

      // Clean up per-user keys
      localStorage.removeItem(STORAGE_KEY + "_" + uKey);
      localStorage.removeItem(PEOPLE_STORAGE_KEY + "_" + uKey);
      localStorage.removeItem("repovault_needs_sync_" + uKey);
    } catch {
      toast("Sync failed — local data preserved", "error");
    }
  }

  function persist() {
    if (useServer && !serverDown) {
      fetch("/api/repos", {
        method: "PUT",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(repos)
      })
        .then(res => { if (!res.ok) throw new Error("server error"); })
        .catch(() => fallbackToLocal());
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(repos));
    }
  }

  function persistPeople() {
    if (useServer && !serverDown) {
      fetch("/api/people", {
        method: "PUT",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(people)
      })
        .then(res => { if (!res.ok) throw new Error("server error"); })
        .catch(() => fallbackToLocal());
    } else {
      localStorage.setItem(PEOPLE_STORAGE_KEY, JSON.stringify(people));
    }
  }

  function toast(msg, type = "success") {
    const t = $("toast");
    $("toastMsg").textContent = msg;
    t.className = type;
    // force reflow so repeat toasts re-animate
    void t.offsetWidth;
    t.classList.add("show");
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove("show"), 2800);
  }

  // Parse owner/repo from any github URL form
  function parseGithubUrl(input) {
    input = input.trim();
    if (!input) return null;
    // allow "owner/repo" shorthand too
    let m = input.match(/^([\w.-]+)\/([\w.-]+)$/);
    if (m) return { owner: m[1], repo: m[2] };
    try {
      const u = new URL(input.startsWith("http") ? input : "https://" + input);
      if (!/(^|\.)github\.com$/i.test(u.hostname)) return null;
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts.length < 2) return null;
      return { owner: parts[0], repo: parts[1].replace(/\.git$/, "") };
    } catch { return null; }
  }

  // fetch GitHub info for one owner/repo; returns a repo entry (never throws)
  async function fetchRepoEntry(parsed) {
    let entry = {
      fullName: parsed.owner + "/" + parsed.repo,
      owner: parsed.owner,
      name: parsed.repo,
      url: `https://github.com/${parsed.owner}/${parsed.repo}`,
      description: "",
      stars: null,
      forks: null,
      language: null,
      avatar: `https://github.com/${parsed.owner}.png?size=88`,
      savedAt: Date.now(),
      tags: [],
      note: "",
      pinned: false
    };
    try {
      const res = await ghFetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}`);
      if (res.ok) {
        const d = await res.json();
        entry.fullName = d.full_name;
        entry.owner = d.owner.login;
        entry.name = d.name;
        entry.url = d.html_url;
        entry.description = d.description || "";
        entry.stars = d.stargazers_count;
        entry.forks = d.forks_count;
        entry.language = d.language;
        entry.avatar = d.owner.avatar_url;
      } else if (res.status === 404) {
        return { notFound: true, fullName: entry.fullName };
      } else if (res.status === 403 || res.status === 429) {
        // rate limited — still save the link, but flag it so the user is told
        entry._rateLimited = true;
      }
    } catch (err) {
      if (err.name === "AbortError") entry._timedOut = true; // request timed out
      /* offline — save basic entry anyway */
    }
    return entry;
  }

  async function addRepo() {
    // bulk-add: split pasted text into multiple URLs (space / comma / newline separated)
    const pieces = urlInput.value.split(/[\s,]+/).filter(Boolean);
    const parsedList = [];
    for (const p of pieces) {
      const parsed = parseGithubUrl(p);
      if (parsed) parsedList.push(parsed);
    }
    if (!parsedList.length) {
      toast("Please enter a valid GitHub repo URL (e.g. github.com/owner/repo)", "error");
      return;
    }

    addBtn.disabled = true;
    addBtn.textContent = parsedList.length > 1 ? `Fetching ${parsedList.length} repos...` : "Fetching...";

    let added = 0, skipped = 0, notFound = 0, rateLimited = 0, timedOut = 0;
    for (const parsed of parsedList) {
      const key = (parsed.owner + "/" + parsed.repo).toLowerCase();
      if (repos.some(r => r.fullName.toLowerCase() === key)) { skipped++; continue; }
      const entry = await fetchRepoEntry(parsed);
      if (entry.notFound) { notFound++; continue; }
      if (entry._rateLimited) { rateLimited++; delete entry._rateLimited; }
      if (entry._timedOut) { timedOut++; delete entry._timedOut; }
      repos.unshift(entry);
      added++;
    }

    if (added) {
      persist();
      urlInput.value = "";
      render();
    }

    if (parsedList.length === 1) {
      if (rateLimited) toast(`${repos[0].fullName} saved without details — GitHub rate limit! Add a 🔑 Token, or hit Refresh later`, "error");
      else if (timedOut) toast(`${repos[0].fullName} saved, but GitHub timed out — details will fill in on Refresh`, "error");
      else if (added) toast(`✓ ${repos[0].fullName} saved!`);
      else if (skipped) toast("This repo is already saved!", "error");
      else toast("Repo not found — please check the URL", "error");
    } else {
      const parts = [];
      if (added) parts.push(`${added} saved`);
      if (rateLimited) parts.push(`${rateLimited} without details (rate limit — use 🔑 Token)`);
      if (timedOut) parts.push(`${timedOut} timed out (will fill on Refresh)`);
      if (skipped) parts.push(`${skipped} already saved`);
      if (notFound) parts.push(`${notFound} not found`);
      toast(parts.join(" · "), added && !rateLimited ? "success" : "error");
    }
    resetAddBtn();
  }

  function resetAddBtn() {
    addBtn.disabled = false;
    addBtn.innerHTML = '<svg viewBox="0 0 16 16"><path d="M7.75 2a.75.75 0 0 1 .75.75V7h4.25a.75.75 0 0 1 0 1.5H8.5v4.25a.75.75 0 0 1-1.5 0V8.5H2.75a.75.75 0 0 1 0-1.5H7V2.75A.75.75 0 0 1 7.75 2Z"/></svg> Save';
  }

  function removeRepo(fullName) {
    repos = repos.filter(r => r.fullName !== fullName);
    persist();
    render();
    toast("Repo removed");
  }

  // re-fetch latest info (stars, description, etc.) for all saved repos
  async function refreshAll() {
    if (!repos.length) { toast("No repos to refresh", "error"); return; }
    const btn = $("refreshBtn");
    btn.disabled = true;
    let updated = 0, failed = 0;
    for (let i = 0; i < repos.length; i++) {
      btn.textContent = `🔄 ${i + 1}/${repos.length}`;
      const r = repos[i];
      try {
        const res = await ghFetch(`https://api.github.com/repos/${r.fullName}`);
        if (res.ok) {
          const d = await res.json();
          Object.assign(r, {
            fullName: d.full_name, owner: d.owner.login, name: d.name,
            url: d.html_url, description: d.description || "",
            stars: d.stargazers_count, forks: d.forks_count,
            language: d.language, avatar: d.owner.avatar_url
          });
          updated++;
        } else if (res.status === 403 || res.status === 429) {
          // rate limited — stop early instead of hammering the API
          toast(`GitHub rate limit reached — ${updated} updated, try again later`, "error");
          break;
        } else failed++;
      } catch { failed++; }
    }
    persist();
    render();
    btn.disabled = false;
    btn.textContent = "🔄 Refresh";
    if (updated) toast(`✓ ${updated} repos updated${failed ? `, ${failed} failed` : ""}`);
    else if (failed) toast("Could not refresh — check your internet", "error");
  }

  // ---------- edit modal (tags / note / pin) ----------
  let editingRepo = null;

  function openEditModal(fullName) {
    const r = repos.find(x => x.fullName === fullName);
    if (!r) return;
    editingRepo = r;
    $("editModalRepo").textContent = r.fullName;
    $("editTags").value = (r.tags || []).join(", ");
    $("editNote").value = r.note || "";
    $("editPin").checked = !!r.pinned;
    $("editModal").classList.add("open");
    $("editTags").focus();
  }

  function closeEditModal() {
    $("editModal").classList.remove("open");
    editingRepo = null;
  }

  function saveEdit() {
    if (!editingRepo) return;
    editingRepo.tags = $("editTags").value
      .split(",")
      .map(t => t.trim().toLowerCase())
      .filter(Boolean)
      .filter((t, i, a) => a.indexOf(t) === i);
    editingRepo.note = $("editNote").value.trim();
    editingRepo.pinned = $("editPin").checked;
    persist();
    closeEditModal();
    render();
    toast("✓ Changes saved!");
  }

  function copyUrl(url) {
    navigator.clipboard.writeText(url)
      .then(() => toast("Link copied!"))
      .catch(() => toast("Failed to copy", "error"));
  }

  function fmtNum(n) {
    if (n == null) return "—";
    if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k";
    return String(n);
  }

  function fmtDate(ts) {
    return new Date(ts).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  }

  function esc(s) {
    const d = document.createElement("div");
    d.textContent = s ?? "";
    return d.innerHTML;
  }

  function getFiltered() {
    const q = searchInput.value.trim().toLowerCase();
    const lang = langFilter.value;
    const tag = tagFilter.value;
    let list = repos.filter(r => {
      const matchQ = !q || r.fullName.toLowerCase().includes(q)
        || (r.description || "").toLowerCase().includes(q)
        || (r.note || "").toLowerCase().includes(q)
        || (r.tags || []).some(t => t.includes(q));
      const matchL = !lang || r.language === lang;
      const matchT = !tag || (r.tags || []).includes(tag);
      return matchQ && matchL && matchT;
    });
    switch (sortBy.value) {
      case "oldest": list = [...list].sort((a, b) => a.savedAt - b.savedAt); break;
      case "stars": list = [...list].sort((a, b) => (b.stars || 0) - (a.stars || 0)); break;
      case "name": list = [...list].sort((a, b) => a.name.localeCompare(b.name)); break;
      default: list = [...list].sort((a, b) => b.savedAt - a.savedAt);
    }
    // pinned repos always float to the top
    list.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    return list;
  }

  function renderLangFilter() {
    const langs = [...new Set(repos.map(r => r.language).filter(Boolean))].sort();
    const current = langFilter.value;
    langFilter.innerHTML = '<option value="">All languages</option>' +
      langs.map(l => `<option value="${esc(l)}">${esc(l)}</option>`).join("");
    if (langs.includes(current)) langFilter.value = current;
  }

  function renderTagFilter() {
    const tags = [...new Set(repos.flatMap(r => r.tags || []))].sort();
    const current = tagFilter.value;
    tagFilter.innerHTML = '<option value="">All tags</option>' +
      tags.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join("");
    if (tags.includes(current)) tagFilter.value = current;
  }

  function render() {
    renderLangFilter();
    renderTagFilter();
    repoCount.textContent = repos.length;
    $("tabRepoCount").textContent = repos.length;
    const list = getFiltered();

    if (!repos.length) {
      grid.innerHTML = `
        <div class="empty">
          <div class="empty-icon">📦</div>
          <h2>No repos saved yet</h2>
          <p>Paste a GitHub repo URL above to start your collection!</p>
        </div>`;
      return;
    }
    if (!list.length) {
      grid.innerHTML = `
        <div class="empty">
          <div class="empty-icon">🔍</div>
          <h2>Nothing found</h2>
          <p>Try changing your search or filter.</p>
        </div>`;
      return;
    }

    grid.innerHTML = list.map((r, i) => {
      const langColor = LANG_COLORS[r.language] || "#8b949e";
      const tags = r.tags || [];
      return `
      <div class="card${r.pinned ? " pinned" : ""}" style="animation-delay:${Math.min(i * 45, 400)}ms">
        ${r.pinned ? '<span class="pin-badge" title="Pinned">📌</span>' : ""}
        <span class="saved-date">${fmtDate(r.savedAt)}</span>
        <div class="card-top">
          <img class="avatar" src="${esc(r.avatar)}" alt="" loading="lazy"
               onerror="this.style.visibility='hidden'">
          <div class="repo-names">
            <div class="repo-owner">${esc(r.owner)}</div>
            <div class="repo-name">${esc(r.name)}</div>
          </div>
        </div>
        <p class="repo-desc">${esc(r.description) || "<i>No description</i>"}</p>
        ${tags.length ? `<div class="tags-row">${tags.map(t =>
          `<span class="tag${tagFilter.value === t ? " active-filter" : ""}" data-tag="${esc(t)}">${esc(t)}</span>`).join("")}</div>` : ""}
        ${r.note ? `<div class="repo-note">📝 ${esc(r.note)}</div>` : ""}
        <div class="meta-row">
          ${r.language ? `<span class="meta-item"><span class="lang-dot" style="background:${langColor}"></span>${esc(r.language)}</span>` : ""}
          <span class="meta-item stars"><svg viewBox="0 0 16 16"><path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z"/></svg>${fmtNum(r.stars)}</span>
          <span class="meta-item forks"><svg viewBox="0 0 16 16"><path d="M5 5.372v.878c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75v-.878a2.25 2.25 0 1 1 1.5 0v.878a2.25 2.25 0 0 1-2.25 2.25h-1.5v2.128a2.251 2.251 0 1 1-1.5 0V8.5h-1.5A2.25 2.25 0 0 1 3.5 6.25v-.878a2.25 2.25 0 1 1 1.5 0ZM5 3.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Zm6.75.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm-3 8.75a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z"/></svg>${fmtNum(r.forks)}</span>
        </div>
        <div class="card-actions">
          <a class="btn btn-open" href="${esc(r.url)}" target="_blank" rel="noopener">
            <svg viewBox="0 0 16 16"><path d="M3.75 2h3.5a.75.75 0 0 1 0 1.5h-3.5a.25.25 0 0 0-.25.25v8.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-3.5a.75.75 0 0 1 1.5 0v3.5A1.75 1.75 0 0 1 12.25 14h-8.5A1.75 1.75 0 0 1 2 12.25v-8.5C2 2.784 2.784 2 3.75 2Zm6.854-1h4.146a.25.25 0 0 1 .25.25v4.146a.25.25 0 0 1-.427.177L13.03 4.03 9.28 7.78a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042l3.75-3.75-1.543-1.543A.25.25 0 0 1 10.604 1Z"/></svg>
            Open
          </a>
          <button class="btn btn-icon" aria-label="Edit tags, note, pin" title="Edit tags, note, pin" data-edit="${esc(r.fullName)}">
            <svg viewBox="0 0 16 16"><path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm.176 4.823L9.75 4.81l-6.286 6.287a.253.253 0 0 0-.064.108l-.558 1.953 1.953-.558a.253.253 0 0 0 .108-.064Zm1.238-3.763a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354Z"/></svg>
          </button>
          <button class="btn btn-icon" aria-label="Copy repository link" title="Copy link" data-copy="${esc(r.url)}">
            <svg viewBox="0 0 16 16"><path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"/><path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"/></svg>
          </button>
          <button class="btn btn-icon del" aria-label="Remove repository" title="Remove" data-del="${esc(r.fullName)}">
            <svg viewBox="0 0 16 16"><path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.675l.66 6.6a.25.25 0 0 0 .249.225h5.19a.25.25 0 0 0 .249-.225l.66-6.6a.75.75 0 0 1 1.492.149l-.66 6.6A1.748 1.748 0 0 1 10.595 15h-5.19a1.75 1.75 0 0 1-1.741-1.575l-.66-6.6a.75.75 0 1 1 1.492-.15ZM6.5 1.75V3h3V1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25Z"/></svg>
          </button>
        </div>
      </div>`;
    }).join("");
  }

  // ================= PEOPLE (GitHub profiles to watch) =================

  // Parse username from a github profile URL or plain "username"
  function parseGithubUser(input) {
    input = input.trim().replace(/^@/, "");
    if (!input) return null;
    // plain username
    if (/^[\w-]+$/.test(input)) return input;
    try {
      const u = new URL(input.startsWith("http") ? input : "https://" + input);
      if (!/(^|\.)github\.com$/i.test(u.hostname)) return null;
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts.length !== 1) return null; // more than 1 part = repo url, not a profile
      return parts[0];
    } catch { return null; }
  }

  // fetch GitHub profile info for one username; returns a person entry (never throws)
  async function fetchPersonEntry(login) {
    let entry = {
      login,
      name: "",
      url: `https://github.com/${login}`,
      avatar: `https://github.com/${login}.png?size=128`,
      bio: "",
      followers: null,
      following: null,
      publicRepos: null,
      company: "",
      location: "",
      addedAt: Date.now(),
      lastChecked: Date.now(),
      prevFollowers: null,   // followers count at previous refresh — for the growth delta
      prevRepos: null,
      relation: "friend",
      note: ""
    };
    try {
      const res = await ghFetch(`https://api.github.com/users/${login}`);
      if (res.ok) {
        const d = await res.json();
        entry.login = d.login;
        entry.name = d.name || "";
        entry.url = d.html_url;
        entry.avatar = d.avatar_url;
        entry.bio = d.bio || "";
        entry.followers = d.followers;
        entry.following = d.following;
        entry.publicRepos = d.public_repos;
        entry.company = d.company || "";
        entry.location = d.location || "";
      } else if (res.status === 404) {
        return { notFound: true, login };
      } else if (res.status === 403 || res.status === 429) {
        // rate limited — still save the profile, but flag it so the user is told
        entry._rateLimited = true;
      }
    } catch (err) {
      if (err.name === "AbortError") entry._timedOut = true; // request timed out
      /* offline — save basic entry anyway */
    }
    return entry;
  }

  async function addPerson() {
    // bulk-add works here too (space / comma / newline separated)
    const pieces = personInput.value.split(/[\s,]+/).filter(Boolean);
    const logins = [];
    for (const p of pieces) {
      const login = parseGithubUser(p);
      if (login) logins.push(login);
    }
    if (!logins.length) {
      toast("Please enter a valid GitHub username or profile URL", "error");
      return;
    }

    personAddBtn.disabled = true;
    personAddBtn.textContent = logins.length > 1 ? `Fetching ${logins.length} profiles...` : "Fetching...";

    let added = 0, skipped = 0, notFound = 0, rateLimited = 0, timedOut = 0;
    for (const login of logins) {
      if (people.some(p => p.login.toLowerCase() === login.toLowerCase())) { skipped++; continue; }
      const entry = await fetchPersonEntry(login);
      if (entry.notFound) { notFound++; continue; }
      if (entry._rateLimited) { rateLimited++; delete entry._rateLimited; }
      if (entry._timedOut) { timedOut++; delete entry._timedOut; }
      people.unshift(entry);
      added++;
    }

    if (added) {
      persistPeople();
      personInput.value = "";
      renderPeople();
    }

    if (logins.length === 1) {
      if (rateLimited) toast(`${people[0].login} added without details — GitHub rate limit! Add a 🔑 Token, or hit Refresh later`, "error");
      else if (timedOut) toast(`${people[0].login} added, but GitHub timed out — details will fill in on Refresh`, "error");
      else if (added) toast(`✓ ${people[0].login} added!`);
      else if (skipped) toast("This person is already added!", "error");
      else toast("User not found — please check the username", "error");
    } else {
      const parts = [];
      if (added) parts.push(`${added} added`);
      if (rateLimited) parts.push(`${rateLimited} without details (rate limit — use 🔑 Token)`);
      if (timedOut) parts.push(`${timedOut} timed out (will fill on Refresh)`);
      if (skipped) parts.push(`${skipped} already added`);
      if (notFound) parts.push(`${notFound} not found`);
      toast(parts.join(" · "), added && !rateLimited ? "success" : "error");
    }
    personAddBtn.disabled = false;
    personAddBtn.innerHTML = '<svg viewBox="0 0 16 16"><path d="M7.75 2a.75.75 0 0 1 .75.75V7h4.25a.75.75 0 0 1 0 1.5H8.5v4.25a.75.75 0 0 1-1.5 0V8.5H2.75a.75.75 0 0 1 0-1.5H7V2.75A.75.75 0 0 1 7.75 2Z"/></svg> Add';
  }

  function removePerson(login) {
    people = people.filter(p => p.login !== login);
    persistPeople();
    renderPeople();
    toast("Person removed");
  }

  // re-fetch latest profile info for everyone; remembers previous counts to show growth
  async function refreshPeople() {
    if (!people.length) { toast("No people to refresh", "error"); return; }
    const btn = $("personRefreshBtn");
    btn.disabled = true;
    let updated = 0, failed = 0;
    for (let i = 0; i < people.length; i++) {
      btn.textContent = `🔄 ${i + 1}/${people.length}`;
      const p = people[i];
      try {
        const res = await ghFetch(`https://api.github.com/users/${p.login}`);
        if (res.ok) {
          const d = await res.json();
          // remember old counts so we can show ▲/▼ change since the last refresh
          p.prevFollowers = p.followers;
          p.prevRepos = p.publicRepos;
          Object.assign(p, {
            login: d.login, name: d.name || "", url: d.html_url,
            avatar: d.avatar_url, bio: d.bio || "",
            followers: d.followers, following: d.following,
            publicRepos: d.public_repos,
            company: d.company || "", location: d.location || "",
            lastChecked: Date.now()
          });
          updated++;
        } else if (res.status === 403 || res.status === 429) {
          // rate limited — stop early instead of hammering the API
          toast(`GitHub rate limit reached — ${updated} updated, try again later`, "error");
          break;
        } else failed++;
      } catch { failed++; }
    }
    persistPeople();
    renderPeople();
    btn.disabled = false;
    btn.textContent = "🔄 Refresh";
    if (updated) toast(`✓ ${updated} profiles updated${failed ? `, ${failed} failed` : ""}`);
    else if (failed) toast("Could not refresh — check your internet", "error");
  }

  // ---------- person edit modal (relation / note) ----------
  let editingPerson = null;

  function openPersonEditModal(login) {
    const p = people.find(x => x.login === login);
    if (!p) return;
    editingPerson = p;
    $("personEditModalName").textContent = p.name ? `${p.name} (@${p.login})` : "@" + p.login;
    $("personEditRelation").value = p.relation || "friend";
    $("personEditNote").value = p.note || "";
    $("personEditModal").classList.add("open");
  }

  function closePersonEditModal() {
    $("personEditModal").classList.remove("open");
    editingPerson = null;
  }

  function savePersonEdit() {
    if (!editingPerson) return;
    editingPerson.relation = $("personEditRelation").value;
    editingPerson.note = $("personEditNote").value.trim();
    persistPeople();
    closePersonEditModal();
    renderPeople();
    toast("✓ Changes saved!");
  }

  const RELATION_LABEL = { me: "🙋 me", friend: "🤝 friend", inspiration: "⭐ inspiration", other: "👤 other" };

  function deltaBadge(current, prev) {
    if (current == null || prev == null || current === prev) return "";
    const diff = current - prev;
    return `<span class="delta ${diff > 0 ? "up" : "down"}" title="Change since last refresh">${diff > 0 ? "▲" : "▼"}${fmtNum(Math.abs(diff))}</span>`;
  }

  function getFilteredPeople() {
    const q = personSearchInput.value.trim().toLowerCase();
    const rel = relationFilter.value;
    let list = people.filter(p => {
      const matchQ = !q || p.login.toLowerCase().includes(q)
        || (p.name || "").toLowerCase().includes(q)
        || (p.bio || "").toLowerCase().includes(q)
        || (p.note || "").toLowerCase().includes(q)
        || (p.location || "").toLowerCase().includes(q);
      const matchR = !rel || (p.relation || "other") === rel;
      return matchQ && matchR;
    });
    switch (personSortBy.value) {
      case "followers": list = [...list].sort((a, b) => (b.followers || 0) - (a.followers || 0)); break;
      case "growth": list = [...list].sort((a, b) =>
        ((b.followers || 0) - (b.prevFollowers ?? b.followers ?? 0)) -
        ((a.followers || 0) - (a.prevFollowers ?? a.followers ?? 0))); break;
      case "name": list = [...list].sort((a, b) => (a.name || a.login).localeCompare(b.name || b.login)); break;
      default: list = [...list].sort((a, b) => b.addedAt - a.addedAt);
    }
    return list;
  }

  function renderPeople() {
    personCount.textContent = people.length;
    $("tabPeopleCount").textContent = people.length;
    const list = getFilteredPeople();

    if (!people.length) {
      peopleGrid.innerHTML = `
        <div class="empty">
          <div class="empty-icon">👤</div>
          <h2>No people added yet</h2>
          <p>Add your friends or favorite GitHub developers above to keep an eye on their work!</p>
        </div>`;
      return;
    }
    if (!list.length) {
      peopleGrid.innerHTML = `
        <div class="empty">
          <div class="empty-icon">🔍</div>
          <h2>Nothing found</h2>
          <p>Try changing your search or filter.</p>
        </div>`;
      return;
    }

    peopleGrid.innerHTML = list.map((p, i) => {
      const rel = p.relation || "other";
      return `
      <div class="card${rel === "me" ? " me" : ""}" style="animation-delay:${Math.min(i * 45, 400)}ms">
        <span class="saved-date">${fmtDate(p.addedAt)}</span>
        <div class="card-top">
          <img class="person-avatar" src="${esc(p.avatar)}" alt="" loading="lazy"
               onerror="this.style.visibility='hidden'">
          <div class="repo-names">
            <div class="person-name">${esc(p.name) || esc(p.login)}</div>
            <div class="person-login">@${esc(p.login)}</div>
          </div>
        </div>
        <p class="person-bio">${esc(p.bio) || "<i>No bio</i>"}</p>
        <div class="person-stats">
          <div class="stat-box">
            <div class="stat-num">${fmtNum(p.followers)}${deltaBadge(p.followers, p.prevFollowers)}</div>
            <div class="stat-label">Followers</div>
          </div>
          <div class="stat-box">
            <div class="stat-num">${fmtNum(p.publicRepos)}${deltaBadge(p.publicRepos, p.prevRepos)}</div>
            <div class="stat-label">Repos</div>
          </div>
          <div class="stat-box">
            <div class="stat-num">${fmtNum(p.following)}</div>
            <div class="stat-label">Following</div>
          </div>
        </div>
        ${p.note ? `<div class="repo-note">📝 ${esc(p.note)}</div>` : ""}
        <div class="person-meta">
          <span class="relation-badge ${rel}">${RELATION_LABEL[rel] || rel}</span>
          ${p.location ? `<span class="meta-item"><svg viewBox="0 0 16 16"><path d="m12.596 11.596-3.535 3.536a1.5 1.5 0 0 1-2.122 0l-3.535-3.536a6.5 6.5 0 1 1 9.192-9.193 6.5 6.5 0 0 1 0 9.193Zm-1.06-8.132v-.001a5 5 0 1 0-7.072 7.072L8 14.07l3.536-3.534a5 5 0 0 0 0-7.072ZM8 9a2 2 0 1 1-.001-3.999A2 2 0 0 1 8 9Z"/></svg>${esc(p.location)}</span>` : ""}
          ${p.company ? `<span class="meta-item"><svg viewBox="0 0 16 16"><path d="M1.75 16A1.75 1.75 0 0 1 0 14.25V1.75C0 .784.784 0 1.75 0h8.5C11.216 0 12 .784 12 1.75v12.5c0 .085-.006.168-.018.25h2.268a.25.25 0 0 0 .25-.25V8.285a.25.25 0 0 0-.111-.208l-1.055-.703a.749.749 0 1 1 .832-1.248l1.055.703c.487.325.779.871.779 1.456v5.965A1.75 1.75 0 0 1 14.25 16h-3.5a.766.766 0 0 1-.197-.026c-.099.017-.2.026-.303.026h-3a.75.75 0 0 1-.75-.75V14h-1v1.25a.75.75 0 0 1-.75.75Zm-.25-1.75c0 .138.112.25.25.25H4v-1.25a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 .75.75v1.25h2.25a.25.25 0 0 0 .25-.25V1.75a.25.25 0 0 0-.25-.25h-8.5a.25.25 0 0 0-.25.25ZM3.75 6h.5a.75.75 0 0 1 0 1.5h-.5a.75.75 0 0 1 0-1.5ZM3 3.75A.75.75 0 0 1 3.75 3h.5a.75.75 0 0 1 0 1.5h-.5A.75.75 0 0 1 3 3.75Zm4 3A.75.75 0 0 1 7.75 6h.5a.75.75 0 0 1 0 1.5h-.5A.75.75 0 0 1 7 6.75ZM7.75 3h.5a.75.75 0 0 1 0 1.5h-.5a.75.75 0 0 1 0-1.5ZM3 9.75A.75.75 0 0 1 3.75 9h.5a.75.75 0 0 1 0 1.5h-.5A.75.75 0 0 1 3 9.75ZM7.75 9h.5a.75.75 0 0 1 0 1.5h-.5a.75.75 0 0 1 0-1.5Z"/></svg>${esc(p.company)}</span>` : ""}
        </div>
        <div class="card-actions">
          <a class="btn btn-open" href="${esc(p.url)}" target="_blank" rel="noopener">
            <svg viewBox="0 0 16 16"><path d="M3.75 2h3.5a.75.75 0 0 1 0 1.5h-3.5a.25.25 0 0 0-.25.25v8.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-3.5a.75.75 0 0 1 1.5 0v3.5A1.75 1.75 0 0 1 12.25 14h-8.5A1.75 1.75 0 0 1 2 12.25v-8.5C2 2.784 2.784 2 3.75 2Zm6.854-1h4.146a.25.25 0 0 1 .25.25v4.146a.25.25 0 0 1-.427.177L13.03 4.03 9.28 7.78a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042l3.75-3.75-1.543-1.543A.25.25 0 0 1 10.604 1Z"/></svg>
            Profile
          </a>
          <a class="btn btn-icon" aria-label="See their repositories" title="See their repositories" href="${esc(p.url)}?tab=repositories" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;justify-content:center;">
            <svg viewBox="0 0 16 16"><path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z"/></svg>
          </a>
          <button class="btn btn-icon" aria-label="Edit relation & note" title="Edit relation & note" data-person-edit="${esc(p.login)}">
            <svg viewBox="0 0 16 16"><path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm.176 4.823L9.75 4.81l-6.286 6.287a.253.253 0 0 0-.064.108l-.558 1.953 1.953-.558a.253.253 0 0 0 .108-.064Zm1.238-3.763a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354Z"/></svg>
          </button>
          <button class="btn btn-icon del" aria-label="Remove person" title="Remove" data-person-del="${esc(p.login)}">
            <svg viewBox="0 0 16 16"><path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.675l.66 6.6a.25.25 0 0 0 .249.225h5.19a.25.25 0 0 0 .249-.225l.66-6.6a.75.75 0 0 1 1.492.149l-.66 6.6A1.748 1.748 0 0 1 10.595 15h-5.19a1.75 1.75 0 0 1-1.741-1.575l-.66-6.6a.75.75 0 1 1 1.492-.15ZM6.5 1.75V3h3V1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25Z"/></svg>
          </button>
        </div>
      </div>`;
    }).join("");
  }

  // ---------- tabs ----------
  function switchTab(tab) {
    const isRepos = tab === "repos";
    $("tabRepos").classList.toggle("active", isRepos);
    $("tabPeople").classList.toggle("active", !isRepos);
    $("reposSection").classList.toggle("active", isRepos);
    $("peopleSection").classList.toggle("active", !isRepos);
  }

  // ---------- GitHub token modal ----------
  async function openTokenModal() {
    $("tokenInput").value = ghToken;
    $("tokenModal").classList.add("open");
    // show current rate limit status
    const status = $("tokenStatus");
    status.textContent = "Checking your current rate limit...";
    try {
      const res = await ghFetch("https://api.github.com/rate_limit");
      const d = await res.json();
      const core = d.resources.core;
      const resetTime = new Date(core.reset * 1000).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
      status.innerHTML = `Current limit: <b style="color:var(--text)">${core.remaining} / ${core.limit}</b> requests left this hour` +
        (core.remaining === 0 ? ` — resets at <b>${resetTime}</b>` : "") +
        (ghToken ? ` <span style="color:var(--green)">✓ token active</span>` : ` <span style="color:var(--gold)">(no token — only 60/hour)</span>`);
    } catch {
      status.textContent = "Could not check rate limit — are you online?";
    }
  }

  function closeTokenModal() { $("tokenModal").classList.remove("open"); }

  async function saveToken() {
    const t = $("tokenInput").value.trim();
    if (!t) { toast("Paste a token first (or use Remove)", "error"); return; }
    // validate the token before saving
    const res = await fetch("https://api.github.com/rate_limit", {
      headers: { Authorization: "Bearer " + t }
    }).catch(() => null);
    if (!res || res.status === 401) {
      toast("This token is invalid — check that you copied it fully", "error");
      return;
    }
    ghToken = t;
    localStorage.setItem(TOKEN_KEY, t);
    closeTokenModal();
    toast("✓ Token saved — you now have 5000 requests/hour!");
  }

  function removeToken() {
    ghToken = "";
    localStorage.removeItem(TOKEN_KEY);
    $("tokenInput").value = "";
    closeTokenModal();
    toast("Token removed");
  }

  // ---------- import stars from github ----------
  async function importStarsFromGitHub() {
    if (!ghToken) {
      toast("Add a GitHub token first (🔑 Token button) to import your stars", "error");
      return;
    }
    if (!confirm("Import all your starred repos from GitHub?\n\nThis will fetch your stars and add them to your vault. Already saved repos will be skipped.")) {
      return;
    }

    const btn = $("importStarsBtn");
    btn.disabled = true;
    btn.textContent = "Fetching stars...";

    let imported = 0, skipped = 0;
    let page = 1;
    const perPage = 100;
    let hasMore = true;

    try {
      while (hasMore) {
        btn.textContent = `Fetching page ${page}...`;
        const res = await ghFetch(`https://api.github.com/user/starred?per_page=${perPage}&page=${page}`);

        if (!res.ok) {
          if (res.status === 401) {
            toast("Token is invalid or expired. Please update your token.", "error");
          } else if (res.status === 403 || res.status === 429) {
            toast("GitHub rate limit reached. Try again later.", "error");
          } else {
            toast("Failed to fetch stars from GitHub", "error");
          }
          break;
        }

        const stars = await res.json();
        if (!stars.length) {
          hasMore = false;
          break;
        }

        for (let i = 0; i < stars.length; i++) {
          const s = stars[i];
          const fullName = s.full_name;

          btn.textContent = `Importing ${imported + skipped + 1} repos...`;

          if (repos.some(r => r.fullName.toLowerCase() === fullName.toLowerCase())) {
            skipped++;
            continue;
          }

          const entry = {
            fullName: fullName,
            owner: s.owner.login,
            name: s.name,
            url: s.html_url,
            description: s.description || "",
            stars: s.stargazers_count,
            forks: s.forks_count,
            language: s.language,
            avatar: s.owner.avatar_url,
            savedAt: Date.now(),
            tags: [],
            note: "",
            pinned: false
          };

          repos.unshift(entry);
          imported++;
        }

        const linkHeader = res.headers.get("link");
        if (linkHeader && linkHeader.includes('rel="next"')) {
          page++;
        } else {
          hasMore = false;
        }
      }

      if (imported > 0) {
        persist();
        render();
      }

      const parts = [];
      if (imported) parts.push(`${imported} imported`);
      if (skipped) parts.push(`${skipped} already saved`);
      toast(parts.length ? parts.join(" · ") : "No new repos to import", imported ? "success" : "error");

    } catch (err) {
      if (err.name === "AbortError") {
        toast("Request timed out. Try again or check your connection.", "error");
      } else {
        toast("Failed to import stars. Check your internet connection.", "error");
      }
    }

    btn.disabled = false;
    btn.textContent = "⭐ Import Stars";
  }

  // ---------- export / import ----------
  function exportData() {
    if (!repos.length && !people.length) { toast("Nothing to export", "error"); return; }
    // new format: repos + people together (old array-only backups still import fine)
    const payload = { repos, people };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "repovault-backup.json";
    a.click();
    URL.revokeObjectURL(a.href);
    toast("Backup downloaded!");
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        // old backups are a plain array of repos; new ones are {repos, people}
        const repoList = Array.isArray(data) ? data : (Array.isArray(data.repos) ? data.repos : []);
        const peopleList = !Array.isArray(data) && Array.isArray(data.people) ? data.people : [];
        if (!repoList.length && !peopleList.length) throw new Error();
        let added = 0, addedPeople = 0;
        for (const r of repoList) {
          if (!r || typeof r.fullName !== "string" || typeof r.url !== "string") continue;
          // Reject non-https URLs to prevent javascript: XSS
          if (!r.url.startsWith("https://")) continue;
          if (repos.some(x => x.fullName.toLowerCase() === r.fullName.toLowerCase())) continue;
          repos.push(r);
          added++;
        }
        const VALID_RELATIONS = ["me", "friend", "inspiration", "other"];
        for (const p of peopleList) {
          if (!p || typeof p.login !== "string") continue;
          // Reject non-https URLs to prevent javascript: XSS
          if (p.url && typeof p.url === "string" && !p.url.startsWith("https://")) continue;
          if (people.some(x => x.login.toLowerCase() === p.login.toLowerCase())) continue;
          // Sanitize relation field to prevent XSS via malicious import
          p.relation = VALID_RELATIONS.includes(p.relation) ? p.relation : "other";
          people.push(p);
          addedPeople++;
        }
        if (added) persist();
        if (addedPeople) persistPeople();
        render();
        renderPeople();
        const parts = [];
        if (added) parts.push(`${added} repos`);
        if (addedPeople) parts.push(`${addedPeople} people`);
        toast(parts.length ? `${parts.join(" & ")} imported!` : "Everything was already saved");
      } catch {
        toast("Invalid backup file", "error");
      }
    };
    reader.readAsText(file);
  }

  // ---------- events ----------
  addBtn.addEventListener("click", addRepo);
  urlInput.addEventListener("keydown", e => { if (e.key === "Enter") addRepo(); });
  searchInput.addEventListener("input", render);
  langFilter.addEventListener("change", render);
  tagFilter.addEventListener("change", render);
  sortBy.addEventListener("change", render);
  $("refreshBtn").addEventListener("click", refreshAll);
  $("tokenBtn").addEventListener("click", openTokenModal);
  $("tokenSave").addEventListener("click", saveToken);
  $("tokenCancel").addEventListener("click", closeTokenModal);
  $("tokenRemove").addEventListener("click", removeToken);
  $("tokenModal").addEventListener("click", e => {
    if (e.target === $("tokenModal")) closeTokenModal();
  });
  $("tokenInput").addEventListener("keydown", e => { if (e.key === "Enter") saveToken(); });
  $("exportBtn").addEventListener("click", exportData);
  $("importBtn").addEventListener("click", () => $("importFile").click());
  $("importFile").addEventListener("change", e => {
    if (e.target.files[0]) importData(e.target.files[0]);
    e.target.value = "";
  });
  $("importStarsBtn").addEventListener("click", importStarsFromGitHub);

  // people events
  $("tabRepos").addEventListener("click", () => switchTab("repos"));
  $("tabPeople").addEventListener("click", () => switchTab("people"));
  personAddBtn.addEventListener("click", addPerson);
  personInput.addEventListener("keydown", e => { if (e.key === "Enter") addPerson(); });
  personSearchInput.addEventListener("input", renderPeople);
  relationFilter.addEventListener("change", renderPeople);
  personSortBy.addEventListener("change", renderPeople);
  $("personRefreshBtn").addEventListener("click", refreshPeople);

  // person edit modal events
  $("personEditSave").addEventListener("click", savePersonEdit);
  $("personEditCancel").addEventListener("click", closePersonEditModal);
  $("personEditModal").addEventListener("click", e => {
    if (e.target === $("personEditModal")) closePersonEditModal();
  });

  // event delegation on people grid: edit / delete
  peopleGrid.addEventListener("click", e => {
    const editBtn = e.target.closest("[data-person-edit]");
    if (editBtn) { openPersonEditModal(editBtn.dataset.personEdit); return; }
    const delBtn = e.target.closest("[data-person-del]");
    if (delBtn && confirm(`Remove "${delBtn.dataset.personDel}"?`)) {
      removePerson(delBtn.dataset.personDel);
    }
  });

  // edit modal events
  $("editSave").addEventListener("click", saveEdit);
  $("editCancel").addEventListener("click", closeEditModal);
  $("editModal").addEventListener("click", e => {
    if (e.target === $("editModal")) closeEditModal();
  });
  $("editTags").addEventListener("keydown", e => { if (e.key === "Enter") saveEdit(); });

  // keyboard shortcuts: "/" focuses search, Escape closes modal / clears search
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      if ($("editModal").classList.contains("open")) { closeEditModal(); return; }
      if ($("personEditModal").classList.contains("open")) { closePersonEditModal(); return; }
      if ($("tokenModal").classList.contains("open")) { closeTokenModal(); return; }
      if (document.activeElement === searchInput && searchInput.value) {
        searchInput.value = "";
        render();
      }
      if (document.activeElement === personSearchInput && personSearchInput.value) {
        personSearchInput.value = "";
        renderPeople();
      }
      return;
    }
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (e.key === "/" && !typing) {
      e.preventDefault();
      // focus the search box of whichever tab is open
      ($("peopleSection").classList.contains("active") ? personSearchInput : searchInput).focus();
    }
  });

  // event delegation for edit / copy / delete / tag-click
  grid.addEventListener("click", e => {
    const tagEl = e.target.closest("[data-tag]");
    if (tagEl) {
      // toggle tag filter on click
      tagFilter.value = tagFilter.value === tagEl.dataset.tag ? "" : tagEl.dataset.tag;
      render();
      return;
    }
    const editBtn = e.target.closest("[data-edit]");
    if (editBtn) { openEditModal(editBtn.dataset.edit); return; }
    const copyBtn = e.target.closest("[data-copy]");
    if (copyBtn) { copyUrl(copyBtn.dataset.copy); return; }
    const delBtn = e.target.closest("[data-del]");
    if (delBtn && confirm(`Remove "${delBtn.dataset.del}"?`)) {
      removeRepo(delBtn.dataset.del);
    }
  });

  // ── Auth: Login/Register/Logout ───────────────────────
  $("showRegister").onclick = e => { e.preventDefault(); $("loginForm").style.display = "none"; $("registerForm").style.display = ""; $("regError").textContent = ""; };
  $("showLogin").onclick = e => { e.preventDefault(); $("registerForm").style.display = "none"; $("loginForm").style.display = ""; $("loginError").textContent = ""; };

  // Password visibility toggle
  document.querySelectorAll(".password-toggle").forEach(btn => {
    btn.onclick = () => {
      const targetId = btn.dataset.target;
      const input = $(targetId);
      if (input.type === "password") {
        input.type = "text";
        btn.textContent = "🙈";
        btn.title = "Hide password";
      } else {
        input.type = "password";
        btn.textContent = "👁";
        btn.title = "Show password";
      }
    };
  });

  // Forgot password modal — open from link, close on button or backdrop click
  $("showForgot").onclick = e => { e.preventDefault(); $("forgotModal").classList.add("open"); };
  $("forgotClose").onclick = () => { $("forgotModal").classList.remove("open"); };
  $("forgotModal").addEventListener("click", e => { if (e.target === $("forgotModal")) $("forgotModal").classList.remove("open"); });

  async function doLogin() {
    const u = $("loginUsername").value.trim();
    const p = $("loginPassword").value;
    if (!u || !p) { $("loginError").textContent = "Please enter username and password"; return; }
    $("loginBtn").disabled = true;
    $("loginBtn").innerHTML = '<span class="spinner"></span>Logging in...';
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: u, password: p })
      });
      const data = await res.json();
      if (data.ok) {
        sessionToken = data.token;
        currentUsername = data.username;
        localStorage.setItem("repovault_session", sessionToken);
        hideAuth();
        $("logoutBtn").style.display = "";
        $("logoutLabel").textContent = currentUsername;
        useServer = true;
        await loadRepos();
        await loadPeople();
        render();
        renderPeople();
      } else {
        $("loginError").textContent = data.error || "Login failed";
      }
    } catch {
      $("loginError").textContent = "Could not connect to server";
    }
    $("loginBtn").disabled = false;
    $("loginBtn").textContent = "Sign In";
  }

  async function doRegister() {
    const u = $("regUsername").value.trim();
    const p = $("regPassword").value;
    const c = $("regConfirm").value;
    if (!u || !p) { $("regError").textContent = "Please enter username and password"; return; }
    if (u.length < 3) { $("regError").textContent = "Username must be at least 3 characters"; return; }
    if (p.length < 8) { $("regError").textContent = "Password must be at least 8 characters"; return; }
    if (!/[A-Z]/.test(p)) { $("regError").textContent = "Password must contain at least one uppercase letter"; return; }
    if (!/[0-9]/.test(p)) { $("regError").textContent = "Password must contain at least one number"; return; }
    if (p !== c) { $("regError").textContent = "Passwords don't match"; return; }
    $("registerBtn").disabled = true;
    $("registerBtn").innerHTML = '<span class="spinner"></span>Creating account...';
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: u, password: p })
      });
      const data = await res.json();
      if (data.ok) {
        $("regError").textContent = "";
        $("registerForm").style.display = "none";
        $("loginForm").style.display = "";
        $("loginUsername").value = u;
        $("loginError").textContent = "Account created! Please login ✅";
      } else {
        $("regError").textContent = data.error || "Registration failed";
      }
    } catch {
      $("regError").textContent = "Could not connect to server";
    }
    $("registerBtn").disabled = false;
    $("registerBtn").textContent = "Create Account";
  }

  function doLogout() {
    if (!confirm("Are you sure you want to log out?")) return;
    if (sessionToken) {
      fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Authorization": "Bearer " + sessionToken }
      }).catch(() => {});
    }
    sessionToken = "";
    currentUsername = "";
    localStorage.removeItem("repovault_session");
    $("logoutBtn").style.display = "none";
    repos = [];
    people = [];
    render();
    renderPeople();
    showAuth();
  }

  // Button bindings
  $("loginBtn").onclick = doLogin;
  $("loginPassword").onkeydown = e => { if (e.key === "Enter") doLogin(); };
  $("loginUsername").onkeydown = e => { if (e.key === "Enter") $("loginPassword").focus(); };
  $("registerBtn").onclick = doRegister;
  $("regConfirm").onkeydown = e => { if (e.key === "Enter") doRegister(); };
  $("logoutBtn").onclick = doLogout;

  // Offline mode — skip login, use localStorage
  $("skipAuth").onclick = e => {
    e.preventDefault();
    useServer = false;
    hideAuth();
    repos = loadLocal();
    people = loadLocalPeople();
    render();
    renderPeople();
  };

  // ── Offline / Online detection ───────────────────────
  window.addEventListener("offline", () => {
    toast("You are offline — GitHub features disabled", "error");
  });
  window.addEventListener("online", () => {
    toast("Back online ✓");
  });

  // ── Startup: check session or show login ──────────────
  if (useServer && sessionToken) {
    try {
      const res = await fetch("/api/auth/me", { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        currentUsername = data.username;
        hideAuth();
        $("logoutBtn").style.display = "";
        $("logoutLabel").textContent = currentUsername;
        await loadRepos();
        await loadPeople();
        render();
        renderPeople();
      } else {
        // Session expired
        localStorage.removeItem("repovault_session");
        sessionToken = "";
        showAuth();
      }
    } catch {
      showAuth();
    }
  } else if (useServer) {
    showAuth();
  } else {
    // Offline mode
    hideAuth();
    await loadRepos();
    await loadPeople();
    render();
    renderPeople();
  }
});