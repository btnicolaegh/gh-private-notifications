/**
 * popup.js
 * Renders current notification state in the browser-action popup.
 */
"use strict";

const $ = (id) => document.getElementById(id);

function formatRelativeTime(ts) {
  if (!ts) return "";
  const diffMs = Date.now() - ts;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 10) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr}h ago`;
}

async function render() {
  const { githubUrl, token } = await browser.storage.sync.get({
    githubUrl: "",
    token: "",
  });

  if (!githubUrl || !token) {
    $("not-configured").hidden = false;
    return;
  }

  const local = await browser.storage.local.get({
    unreadCount: 0,
    lastChecked: null,
    lastError: null,
  });

  if (local.lastError) {
    $("error-state").hidden = false;
    $("error-message").textContent = local.lastError;
  } else {
    $("status-ok").hidden = false;
    $("unread-badge").textContent = local.unreadCount;
    $("last-checked").textContent = local.lastChecked
      ? `Last checked: ${formatRelativeTime(local.lastChecked)}`
      : "Not yet checked";
  }
}

async function openTab(path) {
  const { githubUrl } = await browser.storage.sync.get({ githubUrl: "" });
  if (githubUrl) {
    browser.tabs.create({ url: `${githubUrl.replace(/\/+$/, "")}${path}` });
    window.close();
  }
}

// ─── event listeners ──────────────────────────────────────────────────────

$("open-options")?.addEventListener("click", () => {
  browser.runtime.openOptionsPage();
  window.close();
});

$("settings-btn").addEventListener("click", () => {
  browser.runtime.openOptionsPage();
  window.close();
});

$("open-inbox").addEventListener("click", () => openTab("/notifications"));
$("open-mentions").addEventListener("click", () =>
  openTab("/notifications?query=reason%3Amention")
);

$("check-now-btn").addEventListener("click", async () => {
  // Trigger background to poll immediately by sending a one-off alarm.
  await browser.runtime.sendMessage({ type: "pollNow" }).catch(() => {
    // background may not listen — fire the alarm directly
  });
  window.close();
});

$("retry-btn")?.addEventListener("click", async () => {
  await browser.runtime.sendMessage({ type: "pollNow" }).catch(() => {});
  window.close();
});

render();
