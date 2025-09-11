# Changelog

All notable changes to this project will be documented in this file.

## 1.4.9 – 2025-09-11
- Added
  - (none)
  - Backgrounds → Gradient mode (any CSS gradient) and image controls (size, position, repeat, attachment). Image‑in‑front mode respects these options.
  - Theme Presets (Default, Noir, Paperback, Neon, Solarized Dark) that update colors, fonts, and background settings in one click.
  - Keywords → case sensitivity.
  - Fonts → custom Google Fonts URL field.
  - Panel remembers last open tab across sessions.
- Changed
  - UI: Consolidated the two top toggles into a single master toggle. Enabling/disabling now also controls the internal paused state.
  - UI: Image Options controls aligned to the right to match other rows.
  - Storage hardening: replaced a remaining direct localStorage write with the resilient safeSet helper for ACTIVE_PROFILE.
  - Security: whitelist Custom Google Fonts URL to `https://fonts.googleapis.com/{css,css2}` and restrict params to `family` and `display` (defaulting to `swap`).
  - A11y: panel now uses robust dialog semantics (role="dialog", aria-modal, labelled/descr ibedby), restores focus on close, and announces open/close and ESC support to screen readers.
  - Perf: converted node caches to WeakMap and reset them on each reparse to prevent stale references and reduce GC pressure.
  - Perf: added a keyed scheduler to dedupe background apply retries with rAF scheduling and backoff.
  - Stability: introduced an observer factory that auto-registers, respects pause state, and is used for main observers.
  - i18n: debug builds now log missing translation keys once per key to aid coverage.
  - Regex: fixed IM line pattern to avoid false positives and added proper curly‑quote open matcher.
  - UX: cross‑tab settings sync — changes to profiles/bindings apply across tabs instantly.
  - Perf: unified post‑click retries using the keyed scheduler (less timer spam).
  - A11y: tabs now link tabs↔panels using aria-controls/aria-labelledby for better SR navigation.
  - i18n/RTL: panel direction set based on locale (ar/he/fa → rtl).
  - Perf/Debug: added performance.mark/measure around parse and inline styling when debug is on.
  - Stability: replaced legacy suppression+innerHTML path with safe DOM replace; removed unused suppression hook.
  - Regex: corrected curly‑quote matcher to use smart quotes for balanced detection.
  - Data hygiene: prune timer cleared on teardown to avoid lingering intervals; capped keywords to 200.
  - Perf: clone() now uses structuredClone when available (JSON fallback otherwise).
  - Perf: decodeEntities reuses a single element to reduce allocations.
  - i18n: localized remaining “Restore Defaults” labels in the panel.
  - Maintainability: hoisted overlay selector into an OVERLAY_SELECTOR constant.
  - Perf: styles use adoptedStyleSheets when supported; graceful <style> fallback remains.
  - Disconnect all MutationObservers on `pagehide`/`beforeunload` to avoid stale observers after SPA navigation.
  - Background-tab safety: observers pause when the tab is hidden and resume on return to avoid hidden-tab freezes while rapidly switching between play and beta.
  - Background writes are batched via requestAnimationFrame; initial parse includes a tiny randomized delay to avoid hydration collisions.
  - Locale packs resolve lazily for the active language (with en‑US fallback) to reduce startup parse cost.
  - Userscript metadata: removed redundant @match entries; wildcard covers play/beta.
  - Cache `AIDT_applySayDo` availability and use a single guard in hot paths.
  - Wrap animated effects in `@media (prefers-reduced-motion: no-preference)` so users with reduced motion preference see static styles.
  - Debounced settings writes (250ms) for live inputs to reduce localStorage churn during rapid changes.
  - Image Options now lay out as a single-column (1×1) stack for simplicity.
  - Settings panel uses dialog semantics (role/aria), supports ESC to close, and traps focus while open.
  - Micro‑caching of textContent per pass and reuse of precompiled regexes to reduce redundant work during formatting sweeps.
  - Precompiled common IM/speech regex and reused in latest observer paths.
  - Mobile ergonomics: 44px+ touch targets for tabs/buttons/inputs on coarse pointers.
  - A11y: keyboard-only focus rings using :focus-visible for buttons, tabs, inputs.
  - UI polish: disabled rows prevent hover/active effects and clicks for child controls.
  - Safety: guard against double injection of inline CSS and panel host on SPA re-init.
  - Micro‑perf: per‑frame memoized inline span styles; consolidated latest observer to schedule a single flush.
  - Robustness: localStorage hardened with try/catch and in‑memory fallback; debounced saves already in place.
  - Safety: input clamping for Font Size, Line Height, Letter Spacing, Backdrop Opacity.
  - Perf: add passive pointer listeners where safe (panel toggle, global pause).
  - Stability: guard against duplicate MutationObserver.observe calls by marking observed nodes.
  - Perf: moved repeated speech/IM/italics colors and weights to CSS variables; update vars instead of per-element inline styles.
  - Perf: background application now throttled to one run per frame when queued.
  - Data: export/import now includes a schema version and migration hook for future safety.
  - i18n: route new UI strings through translations (Theme Presets, Preset, Apply, Gradient, Image Options, Custom Google Fonts URL, Pause/Resume formatting).
  - A11y: panel transitions disabled under prefers-reduced-motion.
  - SPA teardown: remove panel host and temporary style tags on navigation to avoid leftovers.
  - Perf: keyword chips render via DocumentFragment with delegated events.
  - Perf: keyword colors/weight now use CSS variables on spans (fewer inline writes).
  - Security: sanitize background image URL (http/https only) and accept only CSS gradient() functions.
  - Background sanitization hardened at apply-time: only linear/radial/conic gradients; reject url()/var() inside gradients; restrict image URLs to http/https.
  - Stability: use WeakSet for observed-node markers instead of element properties.
  - Security: migrated panel sections (Actions/Format/Misc) to safe DOM construction; eliminated innerHTML in the panel.
  - Data: import validation added (size cap, structural checks) with user-friendly errors.
  - UX: Export active profile; Import now supports Merge vs Replace.
  - UX: per-section “Restore Defaults” buttons with confirmation (Do, Say, Main, Speech, IM, Italics, Keywords, All Caps, Background).
  - Perf: scoped formatting queries to likely containers instead of full-document scans.
  - Perf: skip heavy formatting while the tab is hidden; resume on visibility.
  - A11y: added aria-live region for status updates and ensured tab order matches visual order.
  - Profiles: show last modified timestamps in selector; prune orphaned story bindings.
  - UI: Profiles section tweaked — removed “Active” label; moved “Save” alongside profile controls; buttons laid out in two neat rows.
  - UI: Image Options now 1×1 single-column with compact controls (no full-width selects).
  - Safety: confirm dialog before Import (Replace).
  - UX: Added helpful tooltips for tabs and key background controls.
  - UX: Export filenames now include active profile and timestamp for easier tracking.
  - i18n: Filled missing strings like “Select…” across several locales.
  - Perf: Memoized theme preset resolution to avoid repeat allocations.
  - i18n/a11y: localized remaining labels (Image URL, Export/Import, Active, Custom Color…), switches expose role="switch" + aria-checked; chip delete buttons get labels.
  - Security/UX: keyword chips now render user text via textContent (no innerHTML); color/effect/bold wiring unchanged.
  - Per‑pass cache for pickTextElement and fast‑path skip when no markers/features are present.
  - Inline style updates are rAF‑batched (applyInlineSpanStyles) to reduce redundant writes.
  - Fonts → preconnect to Google Fonts to reduce latency.
- Fixed
  - Occasional reload-time freezes: hardened ambience suppression to avoid attribute-observer loops (idempotent flag and no observing 'style' changes), and deferred parsing until gameplay containers exist.
- Removed
  - Separate “Pause formatting” toggle; master toggle now covers pausing.

## 1.4.8.3 – 2025-09-10
- Added
  - (none)
- Fixed
  - (none)
- Changed
  - Paragraphs → New Line now places every quote/IM on its own line and trims any leading indentation on the following narration.
- Removed
  - (none)

## 1.4.8.2 – 2025-09-10
- Added
  - (none)
- Fixed
  - Paragraphs setting now persists across reloads; UI no longer overwrites saved value during refresh.
  - New Line mode refined to preserve narration and only isolate quotes/IM at paragraph boundaries (no mid‑sentence splits).
  - Prevent double‑escaping of ampersands/entities inside quotes and IM (e.g., R&D stays R&D).
  - Short punctuated quotes like "Yes," and "Yes." are now colored as speech.
- Changed
  - Changing Paragraphs setting keeps view pinned to the bottom of the page.
- Removed
  - (none)

## 1.4.8.1 – 2025-09-10
- Added
  - (none)
- Fixed
  - New Line paragraph mode now preserves narration as-is, adds a blank line before quotes/IM, and ensures exactly one newline after them. It no longer splits narration into separate sentences and no longer strips invisible spaces.
  - Double-blank lines between entries collapsed to a single blank line (handles spaces-only lines too).
  - Quotes and IM spacing unified so both use one blank line after, not two.
- Changed
  - (none)
- Removed
  - Risky overlay token-wrapping (reparenting) on the live split-word overlay to avoid intermittent NextJS removeChild errors and page crashes. Paragraph formatting still applies to the newest paragraph via safe overlay normalization.

## 1.4.8 – 2025-09-09
- Added
  - Background “Image URL” mode (under Misc → Background). Paste any image URL to use it as the page background. The image option is applied immediately and persists per profile.
  - Text Formatting → Font → Paragraphs setting (Default, Basic, New Line):
    - Default: leave story text as-is.
    - Basic: insert a blank line between paragraphs (keeps existing lines intact).
    - New Line: place each sentence and each quoted line on its own line with a blank line between entries. Abbreviation-aware (e.g., “Mr.”, “Dr.”, “U.S.”, “a.m.”) and ignores ellipses, so it won’t split mid‑abbreviation.
- Fixed
  - (none)
- Changed
  - Paragraphs option applies instantly and is reversible; switching modes re-renders the newest/visible output without a page refresh.
- Removed
  - (none)

## 1.4.7.1 – 2025-09-09
- Added
  - (none)
- Fixed
  - Compatibility on play.aidungeon.com – navbar mount now targets the correct Menu/Settings button when duplicates exist, preserves pointer events, and pins the AIDT control at the far right.
- Changed
  - Separate Chrome vs Firefox handling for the navbar control (Chrome uses capture‑phase pointer handlers and debounce; Firefox uses a standard click), covering both play and beta domains.
- Removed
  - (none)

## 1.4.7 – 2025-09-09
- Added
  - (none)
- Fixed
  - Occasionally unclickable or double‑toggling navbar control in Chrome.
- Changed
  - AIDT navbar button refined for Chrome/Firefox: true button element, keyboard support, capture‑phase handling and debounce to avoid double toggles; remains far‑right in the bar.
- Removed
  - (none)

## 1.4.6 – 2025-09-09
- Added
  - (none)
- Fixed
  - Emoji/special characters no longer break parsing/formatting in the newest paragraph.
  - Say/Do rows keep their coloring/weight after erasing the following model reply.
  - Quote detection refined so heights/measurements like 5'8" or 3" aren’t treated as dialogue.
  - Newest‑paragraph speech wrapping on the overlay is more robust and avoids mutation loops/freezes.
- Changed
  - Moved the AIDT button into the top navbar (next to Settings). The floating button now auto‑hides on mobile to avoid covering text or the send button. The navbar control uses a distinct 🧩 icon.
- Removed
  - (none)

## 1.4.5 – 2025-09-07
- Added
  - Italics (unquoted) style with its own Bold/Colour settings, separate from Internal Monologue.
  - Colour preset dropdowns for Do, Say, Main Text, Speech, Internal Monologue, and Italics.
  - ALL CAPS exclusions list (e.g., HQ, CEO, NASA) with instant apply; chips UI for add/remove.
- Fixed
  - Overlay sync with split-word layer (game-backdrop-saturate) to ensure newest paragraph reflects changes.
  - Latest paragraph targeting to prefer the newest overlay/copy elements.
  - Quoted speech misclassified as Internal Monologue when preceded by a trailing *; tightened IM detection to single-line and boundary-aware.
  - Stray IM placeholder producing empty golden quotes (“”); ignore empty/whitespace IM captures.
  - Locale strings with apostrophes (French) escaped to remove linter errors.
  - Keyword “Custom Color…” flow; color picker persists and restyles existing keyword spans immediately.
- Changed
  - Moved ALL CAPS exclusions UI under All Caps Effects section; updated labels to include new Italics section.
- Removed
  - (none)

## 1.4.0 – 2025-09-07
- Added:
  - One‑click install link and userscript‑focused README.
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
- Fixed
  - (none)  
- Changed:
  - Full rewrite from browser extension to userscript (Tampermonkey/Violentmonkey).
  - Distribution via raw GitHub URLs with `@downloadURL`/`@updateURL`; auto‑updates handled by the manager.
  - Settings now persist in local storage with Export/Import from the in‑page panel; per‑story profile bindings retained.
- Removed:
  - Extension packaging, manifests, background scripts, popup UI.

## 1.3 – 2025-09-06
- Added
  - (none)
- Fixed
  - Profile bind/unbind reliably detects story scope (beta domain supported); immediate apply to page; auto-apply on reload.
  - Export/Import robustness and sanitization; safer writes and reload of settings.
  - In-game menu integration orientation/placement so the settings button aligns with the existing menu.
- Changed
  - (none)
- Removed
  - (none)

## 1.2 – 2025-09-05
- Added
  - Cross-browser Chrome MV3 manifest (service_worker). Bumped version to 1.2.
  - Profiles — per-story bindings (host+path) auto-apply; Profiles UI: bind/unbind, rename, duplicate.
  - i18n — color/profile strings (en); prepared for locale propagation.
- Fixed
  - (none)
- Changed
  - Storage/Popup — reduced redundant writes via change detection; groundwork for per-key diffs.
  - Security — embedded panel constructed via DOM APIs (no innerHTML).
  - Fonts — preconnect to fonts.googleapis.com; retry/backoff on load; session cache per family.
  - UI — moved Profiles and Export/Import under Misc in alphabetical order.
- Removed
  - (none)

## 1.1 – 2025-09-05
- Added
  - Settings — Sync (local vs sync), Language selector/override, Debug toggles surfaced in UI.
- Fixed
  - (none)
- Changed
  - Migrated to Manifest V3 (Firefox using background.scripts).
  - Refactored settings load logic; added storage schema version and pruning.
  - Security — restricted postMessage targets; reduced permissions.
  - UI — safer keyword rendering, deferred script, i18n scaffolding and locales (AI‑translated drafts), localized option labels.
  - Background customization improvements and font loading UX (aria-busy).
  - README updates — features, CSP, packaging, localization.
- Removed
  - (none)

## 1.0 – 2025-09-04
- Added
  - Initial version — text formatting (italic/bold/strike/code/highlight), speech/monologue handling, action row styling, background customization, settings UI.
  - All Caps Effects for emphasis.
  - Keywords with effects (animated/static color, optional bold).
  - Fonts — family selection (including Google fonts), size, weight, line height, letter spacing, alignment.
- Fixed
  - (none)
- Changed
  - (none)
- Removed
  - (none)