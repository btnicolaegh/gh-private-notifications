/**
 * background.js
 *
 * Polls the GitHub Enterprise REST API for unread notifications (inbox)
 * and fires browser/system notifications based on the user's granular
 * trigger settings.  Also polls the search API to detect new PRs opened
 * by watched users.
 */

"use strict";

const ALARM_NAME = "gh-notifications-poll";
const DEFAULT_POLL_INTERVAL_MINUTES = 5;

/**
 * IDs of notifications that have already been surfaced to the user in this
 * browser session.  Persisted across alarm wakes via browser.storage.local so
 * that we survive the event-page being unloaded.
 */
let seenIds = new Set();

// ─── helpers ────────────────────────────────────────────────────────────────

/** Load persisted seen-IDs from local storage. */
async function loadSeenIds() {
  const data = await browser.storage.local.get({ seenIds: [] });
  seenIds = new Set(data.seenIds);
}

/** Persist current seen-IDs to local storage (bounded to last 500 entries). */
async function saveSeenIds() {
  const arr = [...seenIds];
  // Keep only the most-recent 500 IDs to avoid unbounded growth.
  const trimmed = arr.slice(Math.max(0, arr.length - 500));
  await browser.storage.local.set({ seenIds: trimmed });
}

/** Read user settings from sync storage, falling back to sensible defaults. */
async function getSettings() {
  return browser.storage.sync.get({
    githubUrl: "",
    token: "",
    pollInterval: DEFAULT_POLL_INTERVAL_MINUTES,
    watchedUsers: "",
    notifyMyPRComments: true,
    notifyReviewRequested: true,
    notifyWatchedUserPR: true,
    notifyMentions: true,
    notifyAssigned: true,
    notifyOther: true,
  });
}

/** Extract "org/repo" from a GitHub HTML URL like https://host/org/repo/pull/1 */
function extractRepoFromUrl(htmlUrl) {
  try {
    const parts = new URL(htmlUrl).pathname.split("/").filter(Boolean);
    if (parts.length >= 2) return `${parts[0]}/${parts[1]}`;
  } catch (_) {}
  return "";
}

// ─── GitHub API ─────────────────────────────────────────────────────────────

/**
 * Fetch all unread notifications from the GitHub Enterprise instance.
 */
async function fetchNotifications(baseUrl, token) {
  const apiBase = baseUrl.replace(/\/+$/, "") + "/api/v3";
  const url = `${apiBase}/notifications?all=false&participating=false`;

  const response = await fetch(url, {
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github.v3+json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `GitHub API responded with ${response.status} ${response.statusText}`
    );
  }

  return response.json();
}

/**
 * Search for the most-recent open PRs authored by a given user.
 * Returns an empty array on any error to avoid blocking the poll cycle.
 */
async function searchOpenPRsByUser(apiBase, token, username) {
  const query = encodeURIComponent(`is:pr is:open author:${username}`);
  const url = `${apiBase}/search/issues?q=${query}&sort=created&order=desc&per_page=10`;
  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
    });
    if (!response.ok) return [];
    const data = await response.json();
    return data.items || [];
  } catch (_) {
    return [];
  }
}

// ─── notification helpers ────────────────────────────────────────────────────

/** Map a GitHub notification reason to a human-readable emoji prefix. */
function reasonLabel(reason) {
  const map = {
    mention: "📢 Mention",
    assign: "🔖 Assigned",
    author: "✍️ Author",
    comment: "💬 Comment",
    invitation: "📨 Invitation",
    manual: "👁 Subscribed",
    review_requested: "🔍 Review requested",
    security_alert: "🚨 Security alert",
    state_change: "🔄 State change",
    subscribed: "🔔 Subscribed",
    team_mention: "👥 Team mention",
    ci_activity: "⚙️ CI activity",
  };
  return map[reason] || "🔔 Notification";
}

/**
 * Decide whether to fire a browser notification for a GitHub notification
 * object, based on the user's granular trigger settings.
 *
 * Each category is mutually exclusive from "other":
 *   - notifyMyPRComments   → reason=author  + subject.type=PullRequest
 *   - notifyReviewRequested → reason=review_requested
 *   - notifyMentions        → reason=mention | team_mention
 *   - notifyAssigned        → reason=assign
 *   - notifyOther           → everything that didn't match the above
 */
function shouldNotify(notification, settings) {
  const reason = notification.reason;
  const type = notification.subject.type;

  const isMyPRActivity = type === "PullRequest" && reason === "author";
  const isReviewRequest = reason === "review_requested";
  const isMention = reason === "mention" || reason === "team_mention";
  const isAssigned = reason === "assign";

  if (isMyPRActivity) return settings.notifyMyPRComments;
  if (isReviewRequest) return settings.notifyReviewRequested;
  if (isMention) return settings.notifyMentions;
  if (isAssigned) return settings.notifyAssigned;

  // Anything that didn't fall into a specific category above
  return settings.notifyOther;
}

/** Show a single browser notification for a GitHub notification object. */
function showBrowserNotification(notification) {
  const label = reasonLabel(notification.reason);
  const repo = notification.repository.full_name;
  const title = `${label} — ${repo}`;
  const message = notification.subject.title;

  browser.notifications.create(notification.id, {
    type: "basic",
    iconUrl: browser.runtime.getURL("icons/icon.svg"),
    title,
    message,
  });
}

/** Update the browser-action badge with the current unread count. */
function updateBadge(count) {
  const text = count > 0 ? String(count) : "";
  browser.browserAction.setBadgeText({ text });
  browser.browserAction.setBadgeBackgroundColor({ color: "#cc0000" });
}

// ─── watched-user PR polling ─────────────────────────────────────────────────

/**
 * Poll the search API for new open PRs from each watched user and fire a
 * browser notification for any that haven't been seen before.
 *
 * Strategy: store the creation timestamp of the newest PR seen per user.
 * On the very first poll for a user we record the timestamp without notifying,
 * so users don't get a flood of alerts when they first add someone to the list.
 */
async function pollWatchedUserPRs(apiBase, token, watchedUsers) {
  const data = await browser.storage.local.get({
    watchedUserLastPRTime: {},
    notifUrls: {},
  });
  const lastPRTime = data.watchedUserLastPRTime;
  const notifUrls = data.notifUrls;
  let changed = false;

  for (const username of watchedUsers) {
    const prs = await searchOpenPRsByUser(apiBase, token, username);

    if (!(username in lastPRTime)) {
      // First time seeing this user — seed with the current time so only
      // PRs created after this poll will trigger notifications.
      lastPRTime[username] = Date.now();
      changed = true;
      continue;
    }

    const userLastTime = lastPRTime[username];
    let maxTime = userLastTime;

    for (const pr of prs) {
      const prTime = new Date(pr.created_at).getTime();
      if (prTime > maxTime) maxTime = prTime;

      if (prTime > userLastTime) {
        const notifId = `watched-pr-${pr.id}`;
        const repo = extractRepoFromUrl(pr.html_url);
        browser.notifications.create(notifId, {
          type: "basic",
          iconUrl: browser.runtime.getURL("icons/icon.svg"),
          title: `👥 New PR from @${pr.user.login}`,
          message: `${pr.title}${repo ? ` — ${repo}` : ""}`,
        });
        notifUrls[notifId] = pr.html_url;
        changed = true;
      }
    }

    lastPRTime[username] = maxTime;
  }

  if (changed) {
    await browser.storage.local.set({ watchedUserLastPRTime: lastPRTime, notifUrls });
  }
}

// ─── core poll logic ─────────────────────────────────────────────────────────

/** Perform one poll cycle: fetch notifications, diff, notify. */
async function pollNotifications() {
  const settings = await getSettings();

  if (!settings.githubUrl || !settings.token) {
    // Not yet configured — nothing to do.
    updateBadge(0);
    return;
  }

  const apiBase = settings.githubUrl.replace(/\/+$/, "") + "/api/v3";

  await loadSeenIds();

  let notifications;
  try {
    notifications = await fetchNotifications(settings.githubUrl, settings.token);
  } catch (err) {
    console.error("[gh-private-notifications] fetch failed:", err.message);
    // Store error so the popup can surface it.
    await browser.storage.local.set({ lastError: err.message });
    return;
  }

  // Clear any previous error on success.
  await browser.storage.local.set({ lastError: null, lastChecked: Date.now() });

  // Surface new notifications that match the user's filter preferences.
  let newCount = 0;
  for (const n of notifications) {
    if (!seenIds.has(n.id)) {
      seenIds.add(n.id);
      newCount++;

      if (shouldNotify(n, settings)) {
        showBrowserNotification(n);
      }
    }
  }

  if (newCount > 0) {
    await saveSeenIds();
  }

  updateBadge(notifications.length);
  // Store unread count for the popup.
  await browser.storage.local.set({ unreadCount: notifications.length });

  // Poll watched user PRs if the trigger is enabled and users are configured.
  const watchedUsers = settings.watchedUsers
    .split(/[\s,]+/)
    .map((u) => u.trim())
    .filter(Boolean);

  if (settings.notifyWatchedUserPR && watchedUsers.length > 0) {
    await pollWatchedUserPRs(apiBase, settings.token, watchedUsers);
  }
}

// ─── alarm management ────────────────────────────────────────────────────────

async function setupAlarm() {
  const { pollInterval } = await getSettings();
  const interval =
    typeof pollInterval === "number" && pollInterval >= 1
      ? pollInterval
      : DEFAULT_POLL_INTERVAL_MINUTES;

  await browser.alarms.clear(ALARM_NAME);
  browser.alarms.create(ALARM_NAME, { periodInMinutes: interval });
}

// ─── event listeners ─────────────────────────────────────────────────────────

browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    pollNotifications();
  }
});

/**
 * Open the right URL when the user clicks a browser notification.
 * Watched-user PR notifications open the PR directly; all others open
 * the GitHub notifications inbox.
 */
browser.notifications.onClicked.addListener(async (notificationId) => {
  const { githubUrl } = await getSettings();
  const { notifUrls = {} } = await browser.storage.local.get({ notifUrls: {} });

  if (notifUrls[notificationId]) {
    browser.tabs.create({ url: notifUrls[notificationId] });
    // Clean up stored URL for this notification.
    delete notifUrls[notificationId];
    await browser.storage.local.set({ notifUrls });
  } else if (githubUrl) {
    browser.tabs.create({
      url: `${githubUrl.replace(/\/+$/, "")}/notifications`,
    });
  }

  browser.notifications.clear(notificationId);
});

/** Re-schedule the alarm whenever relevant settings change. */
browser.storage.onChanged.addListener((changes, area) => {
  if (area === "sync") {
    const relevant = ["githubUrl", "token", "pollInterval"];
    if (relevant.some((k) => k in changes)) {
      setupAlarm().then(() => pollNotifications());
    }
  }
});

/** Allow the popup to trigger an immediate poll. */
browser.runtime.onMessage.addListener((message) => {
  if (message && message.type === "pollNow") {
    pollNotifications();
  }
});

// ─── initialisation ──────────────────────────────────────────────────────────

async function initialize() {
  await setupAlarm();
  await pollNotifications();
}

initialize();
