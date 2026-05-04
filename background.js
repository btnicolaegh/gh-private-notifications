/**
 * background.js
 *
 * Polls the GitHub Enterprise REST API for unread notifications (inbox + mentions)
 * and fires browser/system notifications for any new items.
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
    showInbox: true,
    showMentions: true,
  });
}

// ─── GitHub API ─────────────────────────────────────────────────────────────

/**
 * Fetch all unread notifications from the GitHub Enterprise instance.
 *
 * @param {string} baseUrl  Root URL of the GHE instance, e.g. "https://github.example.com"
 * @param {string} token    Personal Access Token with `notifications` scope
 * @returns {Promise<Array>} Array of GitHub notification objects
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

// ─── notifications ──────────────────────────────────────────────────────────

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

// ─── core poll logic ─────────────────────────────────────────────────────────

/** Perform one poll cycle: fetch, diff, notify. */
async function pollNotifications() {
  const settings = await getSettings();

  if (!settings.githubUrl || !settings.token) {
    // Not yet configured — nothing to do.
    updateBadge(0);
    return;
  }

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

      const isMention =
        n.reason === "mention" || n.reason === "team_mention";

      if (
        (settings.showMentions && isMention) ||
        (settings.showInbox && !isMention)
      ) {
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

/** Open the notifications page when the user clicks a browser notification. */
browser.notifications.onClicked.addListener(async (notificationId) => {
  const { githubUrl } = await getSettings();
  if (githubUrl) {
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
