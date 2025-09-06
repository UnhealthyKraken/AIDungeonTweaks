# Changelog

All notable changes to this project will be documented in this file.

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


