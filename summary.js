/**
 * summary.js
 * Fetches and renders the PR summary page:
 *   - Open PRs authored by watched users
 *   - Open PRs where the current user's review is requested
 *   - Open PRs assigned to the current user
 */
"use strict";

const $ = (id) => document.getElementById(id);

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatRelativeTime(dateStr) {
  if (!dateStr) return "";
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

/** Extract "org/repo" from a PR html_url like https://host/org/repo/pull/1 */
function extractRepoName(htmlUrl) {
  try {
    const parts = new URL(htmlUrl).pathname.split("/").filter(Boolean);
    if (parts.length >= 2) return `${parts[0]}/${parts[1]}`;
  } catch (_) {}
  return "";
}

/**
 * Return a CSS-friendly text colour (#fff or #24292e) that contrasts
 * with the given 6-digit hex label colour.
 */
function labelTextColor(hexColor) {
  const r = parseInt(hexColor.substring(0, 2), 16);
  const g = parseInt(hexColor.substring(2, 4), 16);
  const b = parseInt(hexColor.substring(4, 6), 16);
  // Perceived brightness (ITU-R BT.601)
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#24292e" : "#ffffff";
}

// ─── DOM builders ─────────────────────────────────────────────────────────────

function buildLabel(label) {
  const span = document.createElement("span");
  span.className = "pr-label";
  span.style.backgroundColor = `#${label.color}`;
  span.style.color = labelTextColor(label.color);
  span.textContent = label.name;
  return span;
}

function buildPRCard(pr) {
  const isDraft = pr.draft === true;
  const repoName = extractRepoName(pr.html_url);

  // ── card wrapper ───────────────────────────────────────────────────────────
  const card = document.createElement("div");
  card.className = "pr-card";

  // ── header row: state badge + title ───────────────────────────────────────
  const header = document.createElement("div");
  header.className = "pr-card__header";

  const stateBadge = document.createElement("span");
  stateBadge.className = `pr-card__state ${isDraft ? "pr-card__state--draft" : "pr-card__state--open"}`;
  stateBadge.textContent = isDraft ? "Draft" : "Open";

  const titleLink = document.createElement("a");
  titleLink.className = "pr-card__title";
  titleLink.href = pr.html_url;
  titleLink.target = "_blank";
  titleLink.rel = "noopener noreferrer";
  titleLink.textContent = pr.title;

  header.appendChild(stateBadge);
  header.appendChild(titleLink);

  // ── meta row: avatar · author · repo · #number · updated ──────────────────
  const meta = document.createElement("div");
  meta.className = "pr-card__meta";

  const avatar = document.createElement("img");
  avatar.className = "pr-card__avatar";
  avatar.src = pr.user.avatar_url;
  avatar.alt = "";
  avatar.width = 16;
  avatar.height = 16;

  const authorLink = document.createElement("a");
  authorLink.className = "pr-card__author";
  authorLink.href = pr.user.html_url || "#";
  authorLink.target = "_blank";
  authorLink.rel = "noopener noreferrer";
  authorLink.textContent = `@${pr.user.login}`;

  function sep() {
    const s = document.createElement("span");
    s.className = "pr-card__sep";
    s.textContent = "·";
    return s;
  }

  const repoSpan = document.createElement("span");
  repoSpan.className = "pr-card__repo";
  repoSpan.textContent = repoName;

  const numSpan = document.createElement("span");
  numSpan.className = "pr-card__num";
  numSpan.textContent = `#${pr.number}`;

  const timeSpan = document.createElement("span");
  timeSpan.className = "pr-card__time";
  timeSpan.title = `Created ${formatRelativeTime(pr.created_at)}`;
  timeSpan.textContent = `updated ${formatRelativeTime(pr.updated_at)}`;

  meta.append(avatar, authorLink, sep(), repoSpan, sep(), numSpan, sep(), timeSpan);

  // ── labels row ─────────────────────────────────────────────────────────────
  const labelsRow = document.createElement("div");
  labelsRow.className = "pr-card__labels";
  if (pr.labels && pr.labels.length > 0) {
    pr.labels.forEach((lbl) => labelsRow.appendChild(buildLabel(lbl)));
  }

  // ── footer row: comment count ──────────────────────────────────────────────
  const footer = document.createElement("div");
  footer.className = "pr-card__footer";
  if (pr.comments > 0) {
    const commentsStat = document.createElement("span");
    commentsStat.className = "pr-card__stat";
    commentsStat.textContent = `💬 ${pr.comments}`;
    footer.appendChild(commentsStat);
  }

  // ── assemble ───────────────────────────────────────────────────────────────
  card.appendChild(header);
  card.appendChild(meta);
  if (pr.labels && pr.labels.length > 0) card.appendChild(labelsRow);
  if (pr.comments > 0) card.appendChild(footer);

  return card;
}

function renderList(containerId, countBadgeId, prs, emptyMsg) {
  const container = $(containerId);
  const badge = $(countBadgeId);
  container.innerHTML = "";

  if (!prs || prs.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-msg";
    empty.textContent = emptyMsg;
    container.appendChild(empty);
    if (badge) badge.textContent = "0";
    return;
  }

  prs.forEach((pr) => container.appendChild(buildPRCard(pr)));
  if (badge) badge.textContent = String(prs.length);
}

function showError(message) {
  const banner = $("error-banner");
  banner.textContent = message;
  banner.hidden = false;
}

// ─── GitHub API ───────────────────────────────────────────────────────────────

async function apiGet(url, token) {
  const response = await fetch(url, {
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github.v3+json",
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

async function searchPRs(apiBase, token, query, perPage = 25) {
  const data = await apiGet(
    `${apiBase}/search/issues?q=${encodeURIComponent(query)}&sort=updated&order=desc&per_page=${perPage}`,
    token
  );
  return data.items || [];
}

// ─── render ───────────────────────────────────────────────────────────────────

async function render() {
  // Reset UI
  $("error-banner").hidden = true;
  $("not-configured").hidden = true;

  const settings = await browser.storage.sync.get({
    githubUrl: "",
    token: "",
    watchedUsers: "",
  });

  if (!settings.githubUrl || !settings.token) {
    $("not-configured").hidden = false;
    $("main-content").hidden = true;
    return;
  }

  $("main-content").hidden = false;
  $("last-refreshed").textContent = "";

  const apiBase = settings.githubUrl.replace(/\/+$/, "") + "/api/v3";
  const { token } = settings;

  const watchedUsers = settings.watchedUsers
    .split(/[\s,]+/)
    .map((u) => u.trim())
    .filter(Boolean);

  // Show/hide watched section depending on whether users are configured.
  $("section-watched").hidden = watchedUsers.length === 0;

  // Mark all lists as loading.
  ["watched-prs-list", "review-prs-list", "assigned-prs-list"].forEach((id) => {
    const el = $(id);
    if (el) el.innerHTML = '<p class="loading">Loading…</p>';
  });

  // Fetch current user login for queries that need the actual username.
  let myLogin;
  try {
    const me = await apiGet(`${apiBase}/user`, token);
    myLogin = me.login;
  } catch (err) {
    showError(`Could not fetch your GitHub profile: ${err.message}`);
    return;
  }

  // Build the parallel fetch list.
  const fetchReview = searchPRs(apiBase, token, `is:pr is:open review-requested:${myLogin}`).catch(() => []);
  const fetchAssigned = searchPRs(apiBase, token, `is:pr is:open assignee:${myLogin}`).catch(() => []);
  const fetchWatched = watchedUsers.map((u) =>
    searchPRs(apiBase, token, `is:pr is:open author:${u}`).catch(() => [])
  );

  const [reviewPRs, assignedPRs, ...watchedPRArrays] = await Promise.all([
    fetchReview,
    fetchAssigned,
    ...fetchWatched,
  ]);

  // Merge and deduplicate watched-user PRs, sorted by most recently updated.
  // Parse dates once (Schwartzian transform) to avoid repeated Date construction.
  const watchedMap = new Map();
  for (const prs of watchedPRArrays) {
    for (const pr of prs) {
      watchedMap.set(pr.id, pr);
    }
  }
  const watchedPRs = [...watchedMap.values()]
    .map((pr) => ({ pr, t: new Date(pr.updated_at).getTime() }))
    .sort((a, b) => b.t - a.t)
    .map(({ pr }) => pr);

  renderList("watched-prs-list", "watched-count", watchedPRs, "No open PRs from watched users.");
  renderList("review-prs-list", "review-count", reviewPRs, "No PRs awaiting your review. 🎉");
  renderList("assigned-prs-list", "assigned-count", assignedPRs, "No PRs assigned to you.");

  $("last-refreshed").textContent = `Refreshed at ${new Date().toLocaleTimeString()}`;
}

// ─── event listeners ──────────────────────────────────────────────────────────

$("refresh-btn").addEventListener("click", render);

document.querySelectorAll("#open-settings-btn, #open-settings-btn-2").forEach((btn) => {
  btn.addEventListener("click", () => browser.runtime.openOptionsPage());
});

// ─── init ─────────────────────────────────────────────────────────────────────

render();
