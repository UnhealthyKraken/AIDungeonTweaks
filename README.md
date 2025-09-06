# AI Dungeon Tweaks – Browser Extension (Firefox & Chrome)

A browser extension for Firefox and Chrome that improves how **AI Dungeon** text is displayed. It automatically converts AI Dungeon’s inline formatting (like `*italics*` or `**bold**`) into properly styled content and adds customisation features for story text.

---

## ✨ Features

### Text Formatting
- Converts:
  - `*text*` / `_text_` → *italic*
  - `**text**` / `__text__` → **bold**
  - `~~text~~` → ~~strikethrough~~
  - `` `text` `` → `inline code`
  - `^^text^^` / `==text==` → ==highlight==
- Auto-closes unbalanced italics and quotation marks.
- Preserves valid HTML to avoid double formatting.

### Speech & Monologue

![Actions tab](docs/images/textformatting4.png)
- **Speech:** `"text"` → styled speech.
  Configurable: bold (`speechBold`), colour (`speechColor`).
- **Monologue:** `*"text"*` → italicised speech.  
  Configurable: bold (`monologueBold`), colour (`monologueColor`).
- Remembers monologues per tab to prevent re-formatting.

### Action Rows

![Actions tab](docs/images/actions1.png)
- Detects AI Dungeon action rows (`w_comment`, `w_run`).
- Configurable styles for:
  - Say (`sayBold`, `sayColor`)
  - Do (`doBold`, `doColor`)
  - Main text (`mainBold`, `mainColor`)
  - 
![Actions tab](docs/images/actions2.png)


### Keyword & CAPS Effects

![Actions tab](docs/images/textformatting5.png)
- Per-keyword styling with effects: `none`, `flash`, `strobe`, `rainbow`, `wave`, `breathe`, `static`.
- Optional per-keyword bold.
- Apply the same effects to ALL-CAPS words.
![Actions tab](docs/images/textformatting3.png)
![Actions tab](docs/images/textformatting2.png)

### Typography

![Actions tab](docs/images/textformattings1.png)
- Controls for `fontFamily`, `fontSize`, `fontWeight`, `lineHeight`, `letterSpacing`, `textAlign`.
- Includes system fonts and Google Fonts (`g:Inter`, etc.).
- Normalises spacing across story rows.

### Backgrounds

![Actions tab](docs/images/misc1.png)
- Options: `inherit`, `solid`, or `gradient`.
- Solid colour picker and CSS gradient input.
- Quick-apply recent colours and custom swatches.

### Settings & Sync

![Actions tab](docs/images/settings1.png)
- In-page settings panel (opens from toolbar of from the AI Dungeon Game button above "Exit Game").
- Section resets and global “Reset All”.
- Syncs via `browser.storage.sync` (falls back to local).

### Debug & Storage Hygiene

![Actions tab](docs/images/debug1.png)
- Debug toggles: `debug`, `debugFormatting`, `debugObserver`, `debugUI`.
- Tracks `schemaVersion` and prunes unknown keys on startup.

---

## 🛠 Installation

### Firefox
**Temporary (testing):**
1. Go to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…**.
3. Select this folder’s `manifest.json`.

**From file:**
1. Download the Firefox `.zip` from [Releases](https://github.com/UnhealthyKraken/AIDungeonTweaks/releases).
2. (Optional) Rename `.zip` → `.xpi`.
3. In `about:config`, set `xpinstall.signatures.required` → `false` (Dev/Nightly only).
4. Go to `about:addons` → ⚙ → **Install Add-on From File…**.
5. Select the `.xpi` / `.zip`.

### Chrome / Edge
**Temporary (testing):**
1. Open `chrome://extensions` or `edge://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the folder (ensure `manifest.chrome.json` is renamed to `manifest.json`).

**From zip:**
1. Download the Chrome `.zip` from [Releases](https://github.com/UnhealthyKraken/AIDungeonTweaks/releases).
2. Extract the zip.
3. In Extensions, enable Developer mode → **Load unpacked** → select the extracted folder.

---

## ⚙️ How It Works
- Targets AI Dungeon’s `transition-opacity` element.
- Uses `MutationObserver` to detect and reformat text changes.
- Converts formatting live while preserving site styling.
- Works across themes and dynamic content.

---

## 🌍 Localization
- Default: English (`en`).
- Included machine-generated translations: `es`, `de`, `fr`, `pt_BR`, `ru`, `zh_CN`, `hi`, `ar`, `ja`, `ko`, `it`, `tr`, `id`.
- Contributions welcome: edit `_locales/<lang>/messages.json`.

Settings UI supports language override (default: auto-detect from browser).

---

## 📜 Changelog
See [`CHANGELOG.md`](CHANGELOG.md) for version history.

---

## ❓ Troubleshooting
- Ensure you’re on an AI Dungeon page.
- Check Browser Console (`Ctrl+Shift+J` or `F12`) for errors.
- Refresh the page.
- Confirm extension is enabled.

Note: If you see `background.service_worker is disabled`, this repo already uses `background.scripts` for Firefox MV3.

---

## 🔒 Security & CSP
- No remote script injection.
- Fonts loaded via `<link>` if `g:` font selected.
- If a site blocks external stylesheets, system fonts are used instead.

---

## 🗑 Uninstalling
1. Go to `about:addons` / `chrome://extensions`.
2. Find **AI Dungeon Tweaks**.
3. Click menu → **Remove**.
4. Confirm.
