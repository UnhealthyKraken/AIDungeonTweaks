// MV3 service worker background script: open embedded in-page settings panel on toolbar click
// Use action API in MV3

try {
  chrome.action.onClicked.addListener(function(tab) {
    try {
      // If Chrome passes the active tab in callback (MV3), use it; else query
      const send = (t) => {
        if (!t) return;
        try { chrome.tabs.sendMessage(t.id, { type: 'OPEN_EMBEDDED_PANEL', open: 'bgColor' }); } catch (_) {}
      };
      if (tab && tab.id) {
        send(tab);
      } else {
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
          const t = (tabs && tabs[0]) || null;
          send(t);
        });
      }
    } catch (_) {}
  });
} catch (_) {}

// One-time storage schema migration / hygiene (runs on startup)
try {
  const SCHEMA_VERSION = 3;
  const KNOWN_KEYS = [
    'speechBold','speechColor','monologueColor','monologueBold',
    'sayBold','sayColor','doBold','doColor','mainBold','mainColor',
    'capsEffect','keywordEffects','fontFamily','fontSize','fontWeight',
    'lineHeight','letterSpacing','textAlign','debug','debugFormatting',
    'debugObserver','debugUI','syncEnabled','bgType','bgColor','bgGrad',
    // UI language override and profiles support
    'uiLanguage','profiles','activeProfileId','profileBindings',
    'schemaVersion'
  ];
  const pruneUnknown = (obj) => {
    const out = {};
    Object.keys(obj || {}).forEach((k) => { if (KNOWN_KEYS.includes(k)) out[k] = obj[k]; });
    return out;
  };
  if (chrome && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(null, (all) => {
      try {
        const currentVersion = (all && typeof all.schemaVersion === 'number') ? all.schemaVersion : 0;
        if (currentVersion < SCHEMA_VERSION) {
          const cleaned = pruneUnknown(all || {});
          cleaned.schemaVersion = SCHEMA_VERSION;
          chrome.storage.local.set(cleaned, function(){ /* no-op */ });
        } else if (currentVersion === SCHEMA_VERSION) {
          // Ensure unknown keys are pruned if any were added by older versions
          const cleaned = pruneUnknown(all || {});
          if (Object.keys(cleaned).length !== Object.keys(all || {}).length) {
            chrome.storage.local.set(cleaned, function(){ /* no-op */ });
          }
        }
      } catch (_) {}
    });
  }
} catch (_) {}


