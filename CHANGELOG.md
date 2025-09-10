# Changelog

All notable changes to this project will be documented in this file.

## 1.4.8.3 – 2025-09-10
- Changed: Paragraphs → New Line now places every quote/IM on its own line and trims any leading indentation on the following narration.

## 1.4.8.2 – 2025-09-10
- Fixed: Paragraphs setting now persists across reloads; UI no longer overwrites saved value during refresh.
- Changed: Changing Paragraphs setting keeps view pinned to the bottom of the page.
- Fixed: New Line mode refined to preserve narration and only isolate quotes/IM at paragraph boundaries (no mid‑sentence splits).
- Fixed: Prevent double‑escaping of ampersands/entities inside quotes and IM (e.g., R&D stays R&D).
- Fixed: Short punctuated quotes like "Yes," and "Yes." are now colored as speech.

## 1.4.8.1 – 2025-09-10
- Fixed: New Line paragraph mode now preserves narration as-is, adds a blank line before quotes/IM, and ensures exactly one newline after them. It no longer splits narration into separate sentences and no longer strips invisible spaces.
- Fixed: Double-blank lines between entries collapsed to a single blank line (handles spaces-only lines too).
- Fixed: Quotes and IM spacing unified so both use one blank line after, not two.
- Stability: Disabled risky overlay token-wrapping (reparenting) on the live split-word overlay to avoid intermittent NextJS removeChild errors and page crashes. Paragraph formatting still applies to the newest paragraph via safe overlay normalization.

## 1.4.8 – 2025-09-09
- Added: Background “Image URL” mode (under Misc → Background). Paste any image URL to use it as the page background. The image option is applied immediately and persists per profile.
- Added: Text Formatting → Font → Paragraphs setting (Default, Basic, New Line):
  - Default: leave story text as-is.
  - Basic: insert a blank line between paragraphs (keeps existing lines intact).
  - New Line: place each sentence and each quoted line on its own line with a blank line between entries. Abbreviation-aware (e.g., “Mr.”, “Dr.”, “U.S.”, “a.m.”) and ignores ellipses, so it won’t split mid‑abbreviation.
- Changed: Paragraphs option applies instantly and is reversible; switching modes re-renders the newest/visible output without a page refresh.

## 1.4.7.1 – 2025-09-09
- Fixed: Compatibility on play.aidungeon.com – navbar mount now targets the correct Menu/Settings button when duplicates exist, preserves pointer events, and pins the AIDT control at the far right.
- Changed: Separate Chrome vs Firefox handling for the navbar control (Chrome uses capture‑phase pointer handlers and debounce; Firefox uses a standard click), covering both play and beta domains.

## 1.4.7 – 2025-09-09
- Changed: AIDT navbar button refined for Chrome/Firefox: true button element, keyboard support, capture‑phase handling and debounce to avoid double toggles; remains far‑right in the bar.
- Fixed: Occasionally unclickable or double‑toggling navbar control in Chrome.

## 1.4.6 – 2025-09-09
- Changed: Moved the AIDT button into the top navbar (next to Settings). The floating button now auto‑hides on mobile to avoid covering text or the send button. The navbar control uses a distinct 🧩 icon.
- Fixed: Emoji/special characters no longer break parsing/formatting in the newest paragraph.
- Fixed: Say/Do rows keep their coloring/weight after erasing the following model reply.
- Fixed: Quote detection refined so heights/measurements like 5'8" or 3" aren’t treated as dialogue.
- Fixed: Newest‑paragraph speech wrapping on the overlay is more robust and avoids mutation loops/freezes.

## 1.4.5 – 2025-09-07
- Added: Italics (unquoted) style with its own Bold/Colour settings, separate from Internal Monologue.
- Added: Colour preset dropdowns for Do, Say, Main Text, Speech, Internal Monologue, and Italics.
- Added: ALL CAPS exclusions list (e.g., HQ, CEO, NASA) with instant apply; chips UI for add/remove.
- Fixed: Overlay sync with split-word layer (game-backdrop-saturate) to ensure newest paragraph reflects changes.
- Fixed: Latest paragraph targeting to prefer the newest overlay/copy elements.
- Fixed: Quoted speech misclassified as Internal Monologue when preceded by a trailing *; tightened IM detection to single-line and boundary-aware.
- Fixed: Stray IM placeholder producing empty golden quotes (“”); ignore empty/whitespace IM captures.
- Fixed: Locale strings with apostrophes (French) escaped to remove linter errors.
- Fixed: Keyword “Custom Color…” flow; color picker persists and restyles existing keyword spans immediately.
- Changed: Moved ALL CAPS exclusions UI under All Caps Effects section; updated labels to include new Italics section.

## 1.4.0 – 2025-09-07
- Changed: Full rewrite from browser extension to userscript (Tampermonkey/Violentmonkey).
- Changed: Distribution via raw GitHub URLs with `@downloadURL`/`@updateURL`; auto‑updates handled by the manager.
- Changed: Settings now persist in local storage with Export/Import from the in‑page panel; per‑story profile bindings retained.
- Added: One‑click install link and userscript‑focused README.
- Features (parity and polish):
  - Text formatting: italic, bold, strikethrough, inline code, highlights; preserves valid HTML.
  - Speech & Internal Monologue: "text" and *"text"* with customizable bold/colour.
  - Action rows: Do & Say colouring/weight, applies up the row structure.
  - Keyword effects: Flash, Strobe, Rainbow, Wave, Breathe; optional bold.
  - All‑Caps effects applied to contiguous ALL‑CAPS tokens.
  - Typography: Font, Font Size, Weight, Line Height, Letter Spacing, Alignment.
  - Backgrounds: Default, Backdrop (behind overlays), Solid (override overlays); opacity for Backdrop.
  - Profiles: create/rename/duplicate/delete; bind profiles to specific stories.
  - Localization: built‑in LOCALES map with multiple languages; language override.
  - Panel UX: compact tabs, instant apply, debounced reparsing, robust last‑paragraph handling.
- Removed: Extension packaging, manifests, background scripts, popup UI.

## 1.3 – 2025-09-06
- Fixed: Profile bind/unbind reliably detects story scope (beta domain supported); immediate apply to page; auto-apply on reload.
- Fixed: Export/Import robustness and sanitization; safer writes and reload of settings.
- Fixed: In-game menu integration orientation/placement so the settings button aligns with the existing menu.

## 1.2 – 2025-09-05
- Cross-browser: added Chrome MV3 manifest (service_worker). Bumped version to 1.2.
- Profiles: per-story bindings (host+path) auto-apply; Profiles UI: bind/unbind, rename, duplicate.
- i18n: added color/profile strings (en); prepared for locale propagation.
- Storage/Popup: reduced redundant writes via change detection; groundwork for per-key diffs.
- Security: embedded panel constructed via DOM APIs (no innerHTML).
- Fonts: preconnect to fonts.googleapis.com; retry/backoff on load; session cache per family.
- UI: moved Profiles and Export/Import under Misc in alphabetical order.

## 1.1 – 2025-09-05
- Migrated to Manifest V3 (Firefox using background.scripts).
- Refactored settings load logic; added storage schema version and pruning.
- Security polish: restricted postMessage targets; reduced permissions.
- UI: safer keyword rendering, deferred script, i18n scaffolding and locales (AI‑translated drafts), localized option labels.
- Background customization improvements and font loading UX (aria-busy).
- Settings: Sync (local vs sync), Language selector/override, Debug toggles surfaced in UI.
- README updates: features, CSP, packaging, localization.

## 1.0 – 2025-09-04
- Initial version: text formatting (italic/bold/strike/code/highlight), speech/monologue handling, action row styling, background customization, settings UI.
- All Caps Effects for emphasis.
- Keywords with effects (animated/static color, optional bold).
- Fonts: family selection (including Google fonts), size, weight, line height, letter spacing, alignment.


