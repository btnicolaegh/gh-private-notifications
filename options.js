/**
 * options.js
 * Handles saving/loading settings and testing the GitHub connection.
 */
"use strict";

const $ = (id) => document.getElementById(id);

// ─── helpers ─────────────────────────────────────────────────────────────────

function setFeedback(el, message, type) {
  el.textContent = message;
  el.className = `feedback feedback--${type}`;
}

function clearFeedback(el) {
  el.textContent = "";
  el.className = "feedback";
}

// ─── load settings ───────────────────────────────────────────────────────────

async function loadSettings() {
  const settings = await browser.storage.sync.get({
    githubUrl: "",
    token: "",
    pollInterval: 5,
    watchedUsers: "",
    notifyMyPRComments: true,
    notifyReviewRequested: true,
    notifyWatchedUserPR: true,
    notifyMentions: true,
    notifyAssigned: true,
    notifyOther: true,
  });

  $("github-url").value = settings.githubUrl;
  $("token").value = settings.token;
  $("poll-interval").value = settings.pollInterval;
  $("watched-users").value = settings.watchedUsers;
  $("notify-my-pr-comments").checked = settings.notifyMyPRComments;
  $("notify-review-requested").checked = settings.notifyReviewRequested;
  $("notify-watched-user-pr").checked = settings.notifyWatchedUserPR;
  $("notify-mentions").checked = settings.notifyMentions;
  $("notify-assigned").checked = settings.notifyAssigned;
  $("notify-other").checked = settings.notifyOther;
}

// ─── save settings ───────────────────────────────────────────────────────────

async function saveSettings(event) {
  event.preventDefault();
  clearFeedback($("save-result"));

  const githubUrl = $("github-url").value.trim().replace(/\/+$/, "");
  const token = $("token").value.trim();
  const pollInterval = Math.max(1, Math.min(60, parseInt($("poll-interval").value, 10) || 5));
  const watchedUsers = $("watched-users").value.trim();
  const notifyMyPRComments = $("notify-my-pr-comments").checked;
  const notifyReviewRequested = $("notify-review-requested").checked;
  const notifyWatchedUserPR = $("notify-watched-user-pr").checked;
  const notifyMentions = $("notify-mentions").checked;
  const notifyAssigned = $("notify-assigned").checked;
  const notifyOther = $("notify-other").checked;

  if (!githubUrl) {
    setFeedback($("save-result"), "Please enter the GitHub Enterprise URL.", "error");
    $("github-url").focus();
    return;
  }

  if (!token) {
    setFeedback($("save-result"), "Please enter your Personal Access Token.", "error");
    $("token").focus();
    return;
  }

  try {
    new URL(githubUrl); // validates URL format
  } catch (_) {
    setFeedback($("save-result"), "The URL is not valid. Example: https://github.example.com", "error");
    $("github-url").focus();
    return;
  }

  await browser.storage.sync.set({
    githubUrl,
    token,
    pollInterval,
    watchedUsers,
    notifyMyPRComments,
    notifyReviewRequested,
    notifyWatchedUserPR,
    notifyMentions,
    notifyAssigned,
    notifyOther,
  });

  setFeedback($("save-result"), "✔ Settings saved.", "ok");
  setTimeout(() => clearFeedback($("save-result")), 3000);
}

// ─── test connection ─────────────────────────────────────────────────────────

async function testConnection() {
  clearFeedback($("test-result"));

  const githubUrl = $("github-url").value.trim().replace(/\/+$/, "");
  const token = $("token").value.trim();

  if (!githubUrl || !token) {
    setFeedback($("test-result"), "Enter the URL and token first.", "error");
    return;
  }

  setFeedback($("test-result"), "Connecting…", "info");
  $("test-btn").disabled = true;

  try {
    const url = `${githubUrl}/api/v3/notifications?all=false&participating=false`;
    const response = await fetch(url, {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (response.ok) {
      const data = await response.json();
      setFeedback(
        $("test-result"),
        `✔ Connected. ${data.length} unread notification${data.length !== 1 ? "s" : ""}.`,
        "ok"
      );
    } else if (response.status === 401) {
      setFeedback($("test-result"), "✘ Unauthorized — check your token.", "error");
    } else if (response.status === 404) {
      setFeedback($("test-result"), "✘ Not found — check the Enterprise URL.", "error");
    } else {
      setFeedback($("test-result"), `✘ Error ${response.status}: ${response.statusText}`, "error");
    }
  } catch (err) {
    setFeedback($("test-result"), `✘ Network error: ${err.message}`, "error");
  } finally {
    $("test-btn").disabled = false;
  }
}

// ─── test notification ───────────────────────────────────────────────────────

async function sendTestNotification() {
  clearFeedback($("test-notif-result"));

  try {
    await browser.notifications.create("test-notification", {
      type: "basic",
      iconUrl: browser.runtime.getURL("icons/icon.svg"),
      title: "GitHub Private Notifications — Test",
      message: "🎉 Notifications are working! You will see alerts like this.",
    });
    setFeedback($("test-notif-result"), "✔ Test notification sent.", "ok");
    setTimeout(() => clearFeedback($("test-notif-result")), 3000);
  } catch (err) {
    setFeedback(
      $("test-notif-result"),
      `✘ Could not send notification: ${err.message}`,
      "error"
    );
  }
}

// ─── toggle token visibility ─────────────────────────────────────────────────

function toggleTokenVisibility() {
  const input = $("token");
  if (input.type === "password") {
    input.type = "text";
    $("toggle-token").textContent = "🙈";
    $("toggle-token").title = "Hide token";
  } else {
    input.type = "password";
    $("toggle-token").textContent = "👁";
    $("toggle-token").title = "Show token";
  }
}

// ─── event listeners ─────────────────────────────────────────────────────────

document.getElementById("settings-form").addEventListener("submit", saveSettings);
$("test-btn").addEventListener("click", testConnection);
$("test-notif-btn").addEventListener("click", sendTestNotification);
$("toggle-token").addEventListener("click", toggleTokenVisibility);

// ─── init ─────────────────────────────────────────────────────────────────────

loadSettings();
