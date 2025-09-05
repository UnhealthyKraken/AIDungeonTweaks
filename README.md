# AI Dungeon Tweaks - Browser Extension (Firefox & Chrome)

This Firefox browser extension tweaks and formats AI Dungeon story text to properly display asterisk‑wrapped text as italicized content.

## What it does

When the AI in AIDungeon uses text formatting, this extension automatically converts it to properly styled content instead of showing the literal formatting characters.

## Supported Formats

- `*text*` or `_text_` → *italic text*
- `**text**` or `__text__` → **bold text**
- `~~text~~` → ~~strikethrough text~~
- `` `text` `` → `inline code`
- `^^text^^` or `==text==` → ==highlighted text==

## Features

- Text formatting engine
  - Converts `*italic*`, `_italic_`, `**bold**`, `__bold__`, `~~strike~~`, `` `code` ``, and `^^/== highlight ==` into styled HTML.
  - Preserves existing valid HTML and avoids double-formatting.
  - Auto-closes unbalanced single-asterisk italics at the end of a line.

- Speech and monologue detection
  - Speech: plain quotes like "text" are styled as speech; configurable bold (`speechBold`) and color (`speechColor`). Quotes are preserved.
  - Monologue: `*"text"*` (or `*"text"`) becomes italic speech with optional bold (`monologueBold`) and color (`monologueColor`).
  - Remembers monologue contents per tab to prevent reformatting on rerenders.

- Action row styling
  - Detects AIDungeon action rows (e.g., `w_comment` and `w_run`).
  - Separate toggles for Say (`sayBold`, `sayColor`), Do (`doBold`, `doColor`), and Main text (`mainBold`, `mainColor`).

- Keyword effects
  - Per-keyword styling with effects: `none`, `flash`, `strobe`, `rainbow`, `wave`, `breathe`, or `static` color.
  - Optional per-keyword bold.
  - Safe UI: keywords are rendered with DOM APIs (no `innerHTML` for user text).

- ALL‑CAPS effects
  - Apply a visual effect to ALL‑CAPS sequences via `capsEffect` (same effect options as keywords).

- Typography controls
  - `fontFamily` (includes common system families and Google fonts like `g:Inter`).
  - `fontSize`, `fontWeight`, `lineHeight`, `letterSpacing`, `textAlign`.
  - Applies consistently to story rows; normalizes spacing based on line height.

- Background customization
  - `bgType`: `inherit`, `solid`, or `gradient`.
  - Solid color picker (`bgColor`) and CSS gradient input (`bgGrad`).
  - Recent color swatches with quick apply; custom color options in selects.

- Settings UI and sync
  - Toolbar click opens an embedded in‑page settings panel for a seamless on‑site experience.
  - Per‑section reset buttons and a global “Reset All”.
  - Optional sync: when enabled, settings are written to `browser.storage.sync` (falls back to local).

- Debug options
  - `debug`, `debugFormatting`, `debugObserver`, `debugUI` toggles to help diagnose behavior.

- Storage hygiene (internal)
  - Maintains a `schemaVersion` and prunes unknown keys on startup to keep storage clean.

## Installation

### Firefox (temporary install for testing)
1. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on..."
3. Select this folder's `manifest.json` (the Firefox manifest)
4. The extension installs temporarily and works until you restart Firefox

### Firefox (packaging / permanent)
To publish permanently, package and submit to AMO (addons.mozilla.org). For local permanent installs, Firefox restricts unsigned add-ons unless using Developer Edition with the signing requirement disabled.

### Chrome/Edge (temporary install for testing)
1. Open `chrome://extensions` (or `edge://extensions`) and enable Developer mode
2. Click "Load unpacked"
3. Select this folder after copying/renaming `manifest.chrome.json` to `manifest.json`, or point to the folder with a symlinked manifest

### Chrome/Edge (packaging)
Zip the folder with `manifest.json` set to the Chrome manifest (service worker). Upload to the Chrome Web Store (or Edge Add-ons) following their publishing guidelines.

## How it works

The extension:
- Targets the specific element with ID `transition-opacity` on AI Dungeon pages
- Monitors for text changes using MutationObserver
- Automatically converts various formatting patterns to proper HTML elements
        - Preserves all original styling while adding appropriate formatting
        - Works with all themes
        - Handles dynamic content updates in real-time
- Supports multiple formatting styles: italic, bold, strikethrough, inline code, and highlighting

## Files

- `manifest.json` - MV3 configuration (Firefox uses `background.scripts`)
- `manifest.chrome.json` - MV3 configuration for Chrome/Edge (uses `background.service_worker`)
- `background.js` - Action click handler and storage hygiene
- `content.js` - Formatting logic injected into AI Dungeon pages
- `popup.html` / `popup.js` / `styles.css` - Settings UI (toolbar or embedded)
- `README.md` - This documentation file
 - `_locales/` - Translatable strings for i18n (default: `en`)

## Permissions

The extension requires:
- `tabs` and `storage`
- Host permissions: `*://*.aidungeon.io/*` and `*://*.aidungeon.com/*`

## Compatibility

- Firefox 109+ (MV3)
- AI Dungeon domains: `aidungeon.io` and `aidungeon.com`
- Works with light/dark themes; responsive UI

## Localization (i18n)

- Default locale: `en` (English). Manifest strings and the settings UI support localization.
- Included locales (AI‑translated initial drafts): `es`, `de`, `fr`, `pt_BR`, `ru`, `zh_CN`, `hi`, `ar`, `ja`, `ko`, `it`, `tr`, `id`.
- These translations were machine‑generated and may contain inaccuracies. Native speakers are welcome to improve them by editing the files under `_locales/<lang>/messages.json`.

### Language selector

- The settings UI includes a Language section to preview/select a UI language override. By default, it follows the browser language (Auto). The override only affects the extension UI.

## Changelog

See `CHANGELOG.md` for version history and notable changes.

## Troubleshooting

If the extension doesn't work:
1. Make sure you're on an AIDungeon page
2. Check the Browser Console (Ctrl+Shift+J) for errors
3. Try refreshing the page
4. Ensure the extension is enabled in `about:addons`

If you see "background.service_worker is currently disabled", switch the manifest background to `scripts` (this repo already uses `background.scripts` for Firefox MV3).

## Security & CSP

- The extension does not inject remote scripts. Styling and fonts are applied via CSS.
- Google Fonts are loaded by adding a `<link rel="stylesheet">` when a `g:` font family is selected in settings.
- If a target site uses a strict Content Security Policy that blocks external stylesheets, web fonts may not load. The extension will continue to function with system fonts.

## Build, Release & Packaging

- Versioning: Update the `version` in `manifest.json` and document changes in `CHANGELOG.md`.
- Optional build step: simple script to swap manifests before packaging (e.g., `copy manifest.chrome.json manifest.json`).

### GitHub Actions (CI)

This repo includes a GitHub Actions workflow that:
- Lints the extension using `web-ext` (Firefox)
- Packages Firefox and Chrome zip artifacts

Artifacts appear in the Actions run as `firefox-zip` and `chrome-zip`.

Trigger: pushes to `main` or any pull request. See `.github/workflows/ci.yml`.


## Uninstalling

To remove the extension:
1. Go to `about:addons`
2. Find "AI Dungeon Tweaks" in the list
3. Click the three dots menu and select "Remove"
4. Confirm the removal
