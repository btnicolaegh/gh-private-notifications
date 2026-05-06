# gh-private-notifications

A browser extension for **Firefox** and **Chrome** that monitors your **GitHub Enterprise** inbox and @mentions and surfaces them as desktop (system) notifications — solving the common problem where enterprise email notifications are disabled by admins.

---

## Features

- 🔔 **System notifications** for new inbox items and @mentions
- 🏷 **Badge counter** on the toolbar icon showing unread count
- ⚙️ **Configurable** GitHub Enterprise URL, Personal Access Token, and polling interval
- 🔍 **Separate toggles** for inbox notifications and mention notifications
- 🖱 **One-click** to open the GitHub notifications page from a popup or from a notification itself
- 🔄 **Background polling** — works without keeping a tab open

---

## Installation

### 1. Get a Personal Access Token (PAT)

1. In your GitHub Enterprise instance, go to  
   **Settings → Developer settings → Personal access tokens → Tokens (classic)**
2. Click **Generate new token**
3. Select the **`notifications`** scope (read-only is sufficient)
4. Copy the generated token — you will need it during setup

---

### 2a. Install in Firefox

**Option A — Temporary installation (for development/testing)**

1. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…**
3. Select the `manifest.json` file from this repository

> Temporary add-ons are removed when Firefox is closed.

**Option B — Permanent installation via `web-ext`**

```bash
# Install web-ext globally (requires Node.js)
npm install -g web-ext

# Run in the repository root to launch a clean Firefox profile
web-ext run

# Or build a distributable .zip / .xpi
web-ext build
```

Submit the resulting `.zip` to [addons.mozilla.org (AMO)](https://addons.mozilla.org/) for a signed, permanent installation.

---

### 2b. Install in Chrome

**Option A — Temporary installation (for development/testing)**

1. Copy `manifest.chrome.json` to `manifest.json` inside a working copy of this folder  
   *(or keep both files — Chrome requires the active manifest to be named `manifest.json`)*:
   ```bash
   cp manifest.chrome.json /tmp/gh-notif-chrome/manifest.json
   cp -r background.js compat.js popup.* options.* summary.* icons /tmp/gh-notif-chrome/
   ```
2. Open Chrome and navigate to `chrome://extensions`
3. Enable **Developer mode** (toggle in the top-right corner)
4. Click **Load unpacked** and select the folder containing the copied files

> The extension persists across Chrome restarts in developer mode.

**Option B — Permanent installation via Chrome Web Store**

Build a distributable `.zip` containing all extension files with `manifest.chrome.json` renamed to `manifest.json`, then submit it to the [Chrome Web Store](https://chrome.google.com/webstore/devconsole).

> **Note:** Chrome extensions currently require PNG icons.  The extension uses an SVG icon which may appear missing in the toolbar; replace `icons/icon.svg` with `icons/icon-48.png` / `icons/icon-96.png` and update the icon paths in `manifest.chrome.json` if needed.

---

### 3. Configure the extension

1. After installation, click the 🔔 icon in the browser toolbar
2. Click **Open Settings** (or use the ⚙ link at the bottom of the popup)
3. Fill in:
   - **GitHub Enterprise URL** — e.g. `https://github.yourcompany.com`
   - **Personal Access Token** — the PAT you created above
   - **Poll interval** — how often to check (default: every 5 minutes)
   - **Notification filters** — toggle inbox items and/or @mentions
4. Click **Test connection** to verify your credentials
5. Click **Save settings**

The extension will start polling immediately after saving.

---

## How it works

```
┌────────────────────────────────────────────────────┐
│  background.js (event page / service worker)       │
│                                                    │
│  ① alarm fires every N minutes                    │
│  ② GET /api/v3/notifications  (PAT auth)           │
│  ③ diff against already-seen IDs                  │
│  ④ browser.notifications.create() for new items   │
│  ⑤ update badge count on toolbar icon             │
└────────────────────────────────────────────────────┘
```

All data stays **local to your browser** — your token is stored in `browser.storage.sync` and is never sent anywhere other than your own GitHub Enterprise instance.

---

## Permissions

| Permission | Why it is needed |
|---|---|
| `notifications` | Show desktop/system notifications |
| `storage` | Save settings and de-duplicate seen notifications |
| `alarms` | Schedule periodic background polls |
| `tabs` | Open the GitHub notifications page when a notification is clicked |
| `<all_urls>` | Reach any GitHub Enterprise domain you configure |

---

## Development

```bash
# Clone
git clone https://github.com/btnicolaegh/gh-private-notifications.git
cd gh-private-notifications

# Run with auto-reload in Firefox (requires Node.js + web-ext)
npm install -g web-ext
web-ext run --firefox-profile=<your-profile>

# Lint the extension (Firefox manifest)
web-ext lint

# Build a distributable zip for Firefox
web-ext build
```

For Chrome development, load the extension unpacked as described in [Install in Chrome](#2b-install-in-chrome) above.

### File overview

```
manifest.json         Firefox extension manifest (Manifest V2)
manifest.chrome.json  Chrome extension manifest (Manifest V3)
compat.js             Browser API compatibility shim (chrome ↔ browser)
background.js         Background event page / service worker — polling, notifications, badge
popup.html/js         Browser-action popup (status + quick links)
popup.css             Popup styles
options.html/js       Settings page (URL, token, interval, filters)
options.css           Settings page styles
summary.html/js       PR summary page (watched users, review requests, assignments)
summary.css           Summary page styles
icons/
  icon.svg            Toolbar and notification icon
```

---

## License

MIT
