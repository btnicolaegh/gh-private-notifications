# gh-private-notifications

A **Firefox browser extension** that monitors your **GitHub Enterprise** inbox and @mentions and surfaces them as desktop (system) notifications — solving the common problem where enterprise email notifications are disabled by admins.

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

### 2. Install the extension in Firefox

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

### 3. Configure the extension

1. After installation, click the 🔔 icon in the Firefox toolbar
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
│  background.js (event page, wakes on alarm)        │
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

# Run with auto-reload (requires Node.js + web-ext)
npm install -g web-ext
web-ext run --firefox-profile=<your-profile>

# Lint the extension
web-ext lint

# Build a distributable zip
web-ext build
```

### File overview

```
manifest.json   Extension manifest (Manifest V2)
background.js   Background event page — polling, notifications, badge
popup.html/js   Browser-action popup (status + quick links)
popup.css       Popup styles
options.html/js Settings page (URL, token, interval, filters)
options.css     Settings page styles
icons/
  icon.svg      Toolbar and notification icon
```

---

## License

MIT
