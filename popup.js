// Popup script for AI Dungeon Tweaks extension
// Ensure embedded iframes hide the internal popup title without relying on inline script
// Keep support for embedded context if needed later, but DO NOT hide title in iframe
(function(){
    try {
        var params = new URLSearchParams(location.search);
        var isEmbeddedParam = params.get('embedded');
        var isEmbeddedContext = (typeof window !== 'undefined' && window.parent && window.parent !== window);
        if (isEmbeddedParam === '1' || isEmbeddedParam === 'true' || isEmbeddedContext) {
            document.documentElement.setAttribute('data-embedded','1');
        }
    } catch (_) {}
})();
// Cross-browser shim: provide Promise-based browser.* API on Chrome
(function(){
    try {
        if (typeof window !== 'undefined' && typeof window.browser === 'undefined' && typeof window.chrome !== 'undefined') {
            var c = window.chrome;
            var wrap = function(fn) { return function() { var args = Array.prototype.slice.call(arguments); return new Promise(function(resolve) { fn.apply(c, args.concat([function(res){ resolve(res); }])); }); }; };
            var shim = {
                storage: c.storage ? {
                    local: {
                        get: function(keys){ return new Promise(function(resolve){ c.storage.local.get(keys, function(items){ resolve(items || {}); }); }); },
                        set: function(items){ return new Promise(function(resolve){ c.storage.local.set(items, function(){ resolve(); }); }); }
                    },
                    onChanged: c.storage.onChanged
                } : undefined,
                tabs: c.tabs ? {
                    query: function(q){ return new Promise(function(resolve){ c.tabs.query(q, function(tabs){ resolve(tabs || []); }); }); },
                    sendMessage: function(tabId, msg){ return new Promise(function(resolve){ try { c.tabs.sendMessage(tabId, msg, function(resp){ resolve(resp); }); } catch(_) { resolve(undefined); } }); }
                } : undefined,
                runtime: c.runtime ? {
                    sendMessage: function(msg){ return new Promise(function(resolve){ try { c.runtime.sendMessage(msg, function(resp){ resolve(resp); }); } catch(_) { resolve(undefined); } }); }
                } : undefined
            };
            try { window.browser = shim; } catch(_){}
        }
    } catch(_){}
})();
document.addEventListener('DOMContentLoaded', function() {
    // i18n with optional UI language override
    let overrideLang = null;
    let overrideMessages = null;
    function getBrowserMsg(k){ try { return (browser && browser.i18n && typeof browser.i18n.getMessage === 'function') ? (browser.i18n.getMessage(k) || '') : ''; } catch(_) { return ''; } }
    function getMsg(k){ if (overrideMessages && overrideMessages[k]) return overrideMessages[k]; return getBrowserMsg(k); }
    function applyI18nStrings() {
        try {
            document.querySelectorAll('[data-i18n]').forEach(function(el){
                var key = el.getAttribute('data-i18n');
                var msg = getMsg(key);
                if (msg) { el.textContent = msg; }
            });
            document.querySelectorAll('[data-i18n-title]').forEach(function(el){
                var key = el.getAttribute('data-i18n-title');
                var msg = getMsg(key);
                if (msg) { el.setAttribute('title', msg); }
            });
            // Standardize small reset button titles
            var resetTitle = getMsg('titleReset') || 'Reset';
            document.querySelectorAll('.reset-btn:not(.reset-btn--label)').forEach(function(btn){
                if (!btn.getAttribute('data-i18n-title')) {
                    btn.setAttribute('title', resetTitle);
                }
            });
            // Section reset button titles
            var setTitle = function(id, key){
                var el = document.getElementById(id);
                if (el) {
                    var t = getMsg(key);
                    if (t) { el.setAttribute('title', t); el.setAttribute('aria-label', t); }
                }
            };
            setTitle('resetActions', 'titleResetActions');
            setTitle('resetTextFormatting', 'titleResetTextFormatting');
            setTitle('resetFont', 'titleResetFont');
            setTitle('resetAll', 'titleResetAll');
        } catch(_) {}
    }
    function loadOverride(lang) {
        overrideLang = (lang && lang.trim()) ? lang.trim() : '';
        if (!overrideLang) { overrideMessages = null; applyI18nStrings(); return; }
        try {
            const url = (browser && browser.runtime && typeof browser.runtime.getURL === 'function') ? browser.runtime.getURL(`_locales/${overrideLang}/messages.json`) : null;
            if (!url) { overrideMessages = null; applyI18nStrings(); return; }
            fetch(url).then(r => r.ok ? r.json() : Promise.reject()).then(json => {
                try {
                    const map = {};
                    Object.keys(json || {}).forEach(k => { const v = json[k]; if (v && typeof v.message === 'string') map[k] = v.message; });
                    overrideMessages = map;
                } catch(_) { overrideMessages = null; }
                applyI18nStrings();
            }).catch(() => { overrideMessages = null; applyI18nStrings(); });
        } catch(_) { overrideMessages = null; applyI18nStrings(); }
    }
    // Initialize override from localStorage
    try {
        const stored = localStorage.getItem('aid_ui_lang') || '';
        if (typeof stored === 'string' && stored) { loadOverride(stored); }
        else { applyI18nStrings(); }
        // Reflect stored value in selector if present
        try { const sel = document.getElementById('langSelect'); if (sel) sel.value = stored || ''; } catch(_) {}
    } catch(_) { applyI18nStrings(); }
    // Set aria-labels on reset buttons from their titles
    try {
        document.querySelectorAll('.reset-btn').forEach(function(btn){
            if (btn && !btn.getAttribute('aria-label')) {
                var t = btn.getAttribute('title');
                if (t) btn.setAttribute('aria-label', t);
            }
        });
    } catch(_) {}
    let isLoadingSettings = false;
    let isPickingColor = false;
    let didUserInteractBg = false;
    const isEmbeddedPopup = (document.documentElement.getAttribute('data-embedded') === '1');
    let initialOpenParam = null;
    try { const p = new URLSearchParams(location.search); initialOpenParam = p.get('open'); } catch(_) {}
    
    // Tab functionality
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabPanels = document.querySelectorAll('.tab-panel');
    const tabIndicator = document.querySelector('.tab-indicator');
    
    function switchTab(tabNumber) {
        // Remove active class from all buttons and panels
        tabButtons.forEach(btn => btn.classList.remove('active'));
        tabPanels.forEach(panel => panel.classList.remove('active'));
        
        // Add active class to selected button and panel
        const activeButton = document.querySelector(`[data-tab="${tabNumber}"]`);
        const activePanel = document.getElementById(`tab-${tabNumber}`);
        
        if (activeButton && activePanel) {
            activeButton.classList.add('active');
            activePanel.classList.add('active');
            
            // Update indicator position
            if (tabIndicator) {
                tabIndicator.setAttribute('data-active', tabNumber);
            }
        }
    }
    
    // Add click event listeners to tab buttons
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabNumber = button.getAttribute('data-tab');
            switchTab(tabNumber);
            try { localStorage.setItem('aid_last_tab', String(tabNumber)); } catch(_) {}
        });
    });
    
    // Initialize with last-opened tab or 1
    try {
        const lastTab = localStorage.getItem('aid_last_tab') || '1';
        switchTab(lastTab);
    } catch(_) { switchTab('1'); }
    const speechBoldToggle = document.getElementById('speechBold');
    const speechColorSelect = document.getElementById('speechColor');
    const monologueColorSelect = document.getElementById('monologueColor');
    const monologueBoldToggle = document.getElementById('monologueBold');
    const sayBoldToggle = document.getElementById('sayBold');
    const sayColorSelect = document.getElementById('sayColor');
    const doBoldToggle = document.getElementById('doBold');
    const doColorSelect = document.getElementById('doColor');
    const mainBoldToggle = document.getElementById('mainBold');
    const mainColorSelect = document.getElementById('mainColor');
    const capsEffectSelect = document.getElementById('capsEffect');
    const keywordInput = document.getElementById('keywordInput');
    const addKeywordBtn = document.getElementById('addKeyword');
    const keywordsList = document.getElementById('keywordsList');
    const fontFamilySelect = document.getElementById('fontFamily');
    const fontSizeSlider = document.getElementById('fontSize');
    const fontSizeValue = document.getElementById('fontSizeValue');
    const fontSizeReset = document.getElementById('fontSizeReset');
    const fontWeightSelect = document.getElementById('fontWeight');
    const lineHeightSlider = document.getElementById('lineHeight');
    const lineHeightValue = document.getElementById('lineHeightValue');
    const letterSpacingSlider = document.getElementById('letterSpacing');
    const letterSpacingValue = document.getElementById('letterSpacingValue');
    const resetActionsBtn = document.getElementById('resetActions');
    const resetTextFormattingBtn = document.getElementById('resetTextFormatting');
    const resetFontBtn = document.getElementById('resetFont');
    const debugToggle = document.getElementById('debugToggle');
    const debugFormattingToggle = document.getElementById('debugFormatting');
    const debugObserverToggle = document.getElementById('debugObserver');
    const debugUIToggle = document.getElementById('debugUI');
    const resetAllBtn = document.getElementById('resetAll');
    const syncToggle = document.getElementById('syncToggle');
    const langSelect = document.getElementById('langSelect');
    const bgTypeSelect = document.getElementById('bgType');
    const bgColorInput = document.getElementById('bgColor');
    const bgGradInput = document.getElementById('bgGrad');
    const bgTypeReset = document.getElementById('bgTypeReset');
    const bgColorReset = document.getElementById('bgColorReset');
    const bgGradReset = document.getElementById('bgGradReset');
    // Background UI visibility helpers
    const bgColorRow = (function(){ try { return bgColorInput ? bgColorInput.closest('.setting-item') : null; } catch(_) { return null; } })();
    const bgGradRow = (function(){ try { return bgGradInput ? bgGradInput.closest('.setting-item') : null; } catch(_) { return null; } })();
    function updateBackgroundVisibility() {
        try {
            const type = bgTypeSelect ? bgTypeSelect.value : 'inherit';
            const showSolid = (type === 'solid');
            const showGrad = (type === 'gradient');
            if (bgColorRow) bgColorRow.style.display = showSolid ? '' : 'none';
            if (bgGradRow) bgGradRow.style.display = showGrad ? '' : 'none';
        } catch(_) {}
    }
    // Per-control reset buttons
    const btns = {
        sayColorReset: document.getElementById('sayColorReset'),
        doColorReset: document.getElementById('doColorReset'),
        speechColorReset: document.getElementById('speechColorReset'),
        monologueColorReset: document.getElementById('monologueColorReset'),
        mainColorReset: document.getElementById('mainColorReset'),
        fontWeightReset: document.getElementById('fontWeightReset'),
        lineHeightReset: document.getElementById('lineHeightReset'),
        letterSpacingReset: document.getElementById('letterSpacingReset'),
        textAlignReset: document.getElementById('textAlignReset'),
    };
    const textAlignSelect = document.getElementById('textAlign');
    const swatches = {
        sayColor: document.getElementById('sayColorSwatches'),
        doColor: document.getElementById('doColorSwatches'),
        speechColor: document.getElementById('speechColorSwatches'),
        monologueColor: document.getElementById('monologueColorSwatches'),
        mainColor: document.getElementById('mainColorSwatches')
    };

    function openControl(key) {
        if (key === 'bgColor' && bgColorInput) {
            // Do not change bgType automatically; respect user's current type
            try {
                bgColorInput.scrollIntoView({ block: 'center', behavior: 'smooth' });
                bgColorInput.focus();
                if (typeof bgColorInput.showPicker === 'function') {
                    bgColorInput.showPicker();
                } else {
                    bgColorInput.click();
                }
                // If browser blocks programmatic picker (no user activation), open on next user click inside iframe
                const openOnFirstInteraction = (ev) => {
                    try {
                        ev.preventDefault();
                        if (typeof bgColorInput.showPicker === 'function') {
                            bgColorInput.showPicker();
                        } else {
                            bgColorInput.click();
                        }
                    } catch(_) {}
                    try { document.removeEventListener('pointerdown', openOnFirstInteraction, true); } catch(_) {}
                };
                document.addEventListener('pointerdown', openOnFirstInteraction, true);
            } catch(_) {}
        }
    }

    // If running embedded and asked to open a control, wait for styles, then open
    if (isEmbeddedPopup && initialOpenParam) {
        const onReady = () => {
            // Allow a brief delay for stylesheet/layout to settle before focusing/picking
            setTimeout(() => openControl(initialOpenParam), 160);
        };
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            // Wait for stylesheet to finish applying
            requestAnimationFrame(onReady);
        } else {
            document.addEventListener('DOMContentLoaded', onReady, { once: true });
        }
    }
    // Listen for parent page requests to open a specific control
    try {
        window.addEventListener('message', (e) => {
            const data = e && e.data;
            if (!data || data.type !== 'OPEN_CONTROL') return;
            if (!isEmbeddedPopup) return;
            try {
                const extOrigin = (typeof browser !== 'undefined' && browser.runtime) ? new URL(browser.runtime.getURL('/')).origin : null;
                if (extOrigin && e.origin !== extOrigin) return;
            } catch(_) {}
            openControl(data.open);
        });
    } catch(_) {}

    const SWATCH_KEY = 'recentColors';
    const MAX_SWATCHES = 8;

    function getRecentColors() {
        try {
            const raw = localStorage.getItem(SWATCH_KEY);
            const arr = JSON.parse(raw || '[]');
            if (!Array.isArray(arr)) return [];
            // Normalize and dedupe while preserving order
            const seen = new Set();
            const normalized = [];
            for (const val of arr) {
                if (typeof val !== 'string') continue;
                const hex = val.toLowerCase();
                if (!/^#([0-9a-fA-F]{3}){1,2}$/.test(hex)) continue;
                if (!seen.has(hex)) { seen.add(hex); normalized.push(hex); }
            }
            return normalized.slice(0, MAX_SWATCHES);
        } catch (_) { return []; }
    }

    function pushRecentColor(hex) {
        if (!hex || !/^#([0-9a-fA-F]{3}){1,2}$/.test(hex)) return;
        const newHex = hex.toLowerCase();
        const list = getRecentColors();
        // If it's identical to the most recent entry, ignore
        if (list[0] === newHex) { return; }
        const seen = new Set([newHex]);
        const next = [newHex];
        for (const c of list) {
            if (!seen.has(c)) { seen.add(c); next.push(c); }
            if (next.length >= MAX_SWATCHES) break;
        }
        try { localStorage.setItem(SWATCH_KEY, JSON.stringify(next)); } catch (_) {}
        renderSwatches();
    }

    function renderSwatches() {
        const list = getRecentColors();
        Object.entries(swatches).forEach(([key, container]) => {
            if (!container) return;
            container.innerHTML = '';
            list.forEach((hex, idx) => {
                const btn = document.createElement('span');
                btn.className = 'color-swatch';
                btn.setAttribute('role', 'button');
                btn.setAttribute('tabindex', '0');
                btn.title = hex.toUpperCase();
                btn.style.backgroundColor = hex;
                btn.style.backgroundImage = 'none';
                btn.dataset.hex = hex;
                btn.dataset.index = String(idx);
                const apply = () => {
                    const select = document.getElementById(key);
                    if (!select) return;
                    // Prefer builtin option if exists
                    const builtin = Array.from(select.options).find(o => o.value === hex && !(o.dataset && o.dataset.customHex === 'true'));
                    if (builtin) {
                        select.value = hex;
                    } else {
                        ensureCustomLoaded(select, hex);
                    }
                    saveSettings();
                    // Bump this color to front of recents
                    pushRecentColor(hex);
                };
                btn.addEventListener('click', apply);
                btn.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); apply(); } });
                container.appendChild(btn);
            });
        });
    }
    
    // Fallback: fetch live settings from the active tab (content script) if storage lacks background values
    function requestActiveTabSettings() {
        // Try a direct runtime broadcast first (content scripts listen on runtime.onMessage)
        try {
            if (browser && browser.runtime && typeof browser.runtime.sendMessage === 'function') {
                return browser.runtime.sendMessage({ type: 'REQUEST_SETTINGS' })
                    .then((resp) => resp || null)
                    .catch(() => {
                        // Fall through to tab-targeted messaging
                        return requestActiveTabSettingsViaTabs();
                    });
            }
        } catch(_) {}
        return requestActiveTabSettingsViaTabs();
    }

    function requestActiveTabSettingsViaTabs() {
        try {
            if (!(browser && browser.tabs && typeof browser.tabs.query === 'function')) return Promise.resolve(null);
            // Try lastFocusedWindow first (popup may be currentWindow)
            return browser.tabs.query({ active: true, lastFocusedWindow: true }).then((tabs) => {
                let tab = (tabs && tabs[0]) || null;
                const trySend = (t) => {
                    if (!t || !browser.tabs.sendMessage) return Promise.resolve(null);
                    return browser.tabs.sendMessage(t.id, { type: 'REQUEST_SETTINGS' }).then((resp) => resp || null).catch(() => null);
                };
                const tryCurrent = () => browser.tabs.query({ active: true, currentWindow: true }).then(tt => trySend((tt && tt[0]) || null));
                if (tab) return trySend(tab).then((r) => r || tryCurrent());
                return tryCurrent();
            }).catch(() => null);
        } catch(_) { return Promise.resolve(null); }
    }

    function applyBackgroundUIFrom(settingsLike) {
        if (!settingsLike || didUserInteractBg) return;
        try {
            const type = settingsLike.bgType;
            const color = settingsLike.bgColor;
            const grad = settingsLike.bgGrad;
            if (bgTypeSelect) {
                if (type === 'solid' || (color && !grad)) {
                    bgTypeSelect.value = 'solid';
                } else if (type === 'gradient' || (grad && !color)) {
                    bgTypeSelect.value = 'gradient';
                } else {
                    bgTypeSelect.value = 'inherit';
                }
            }
            if (bgColorInput && typeof color === 'string' && color) {
                bgColorInput.value = color;
            }
            if (bgGradInput) {
                bgGradInput.value = (typeof grad === 'string' && grad) ? grad : '';
            }
            // Persist so the standalone popup reflects live state next time
            saveSettings();
        } catch(_) {}
    }

    // Load current settings
    function loadSettings() {
        isLoadingSettings = true;
        if (typeof browser !== 'undefined' && browser.storage) {
            const KEYS = ['speechBold', 'speechColor', 'monologueColor', 'monologueBold', 'sayBold', 'sayColor', 'doBold', 'doColor', 'mainBold', 'mainColor', 'capsEffect', 'keywordEffects', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'textAlign', 'debug', 'debugFormatting', 'debugObserver', 'debugUI', 'syncEnabled', 'uiLanguage', 'bgType', 'bgColor', 'bgGrad'];
            const useSyncApi = (browser.storage.sync && typeof browser.storage.sync.get === 'function');
            const getter = (area) => area.get(KEYS);
            const safeGet = (area) => getter(area).catch(() => ({}));
            const getBoth = useSyncApi ? Promise.all([safeGet(browser.storage.sync), safeGet(browser.storage.local)]) : Promise.all([safeGet(browser.storage.local), safeGet(browser.storage.local)]);
            getBoth.then(([syncRes, localRes]) => {
                const srcSync = syncRes || {};
                const srcLocal = localRes || {};
                const useSync = !!(srcSync && srcSync.syncEnabled);
                const pick = (key) => {
                    if (useSync && srcSync[key] !== undefined) return srcSync[key];
                    if (srcLocal[key] !== undefined) return srcLocal[key];
                    return undefined;
                };
                const result = {};
                ['speechBold','speechColor','monologueColor','monologueBold','sayBold','sayColor','doBold','doColor','mainBold','mainColor','capsEffect','keywordEffects','fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','textAlign','debug','debugFormatting','debugObserver','debugUI','syncEnabled','uiLanguage','bgType','bgColor','bgGrad'].forEach(k => { result[k] = pick(k); });
                speechBoldToggle.checked = !!result.speechBold; // Default to false
                speechColorSelect.value = result.speechColor || 'inherit'; // Default to inherit
                monologueColorSelect.value = result.monologueColor || 'inherit'; // Default to inherit
                monologueBoldToggle.checked = !!result.monologueBold; // Default to false
                if (sayBoldToggle) sayBoldToggle.checked = !!result.sayBold;
                if (sayColorSelect) sayColorSelect.value = result.sayColor || 'inherit';
                if (doBoldToggle) doBoldToggle.checked = !!result.doBold;
                if (doColorSelect) doColorSelect.value = result.doColor || 'inherit';
                if (mainBoldToggle) mainBoldToggle.checked = !!result.mainBold;
                if (mainColorSelect) mainColorSelect.value = result.mainColor || 'inherit';
                if (capsEffectSelect) capsEffectSelect.value = result.capsEffect || 'none';
                renderKeywords(result.keywordEffects || []);
                if (fontFamilySelect) fontFamilySelect.value = result.fontFamily || 'inherit';
                if (fontSizeSlider) {
                    const sz = result.fontSize || 16;
                    fontSizeSlider.value = sz;
                    if (fontSizeValue) fontSizeValue.textContent = `(${sz}px)`;
                }
                if (fontWeightSelect) fontWeightSelect.value = (result.fontWeight === undefined || result.fontWeight === null || result.fontWeight === '') ? '' : String(result.fontWeight);
                if (lineHeightSlider) {
                    const lh = (result.lineHeight === undefined || result.lineHeight === null) ? 1.5 : result.lineHeight;
                    lineHeightSlider.value = lh;
                    if (lineHeightValue) lineHeightValue.textContent = `(${lh})`;
                }
                if (letterSpacingSlider) {
                    const ls = (result.letterSpacing !== undefined) ? result.letterSpacing : 0;
                    letterSpacingSlider.value = ls;
                    if (letterSpacingValue) letterSpacingValue.textContent = `(${ls}px)`;
                }
                if (textAlignSelect) textAlignSelect.value = result.textAlign || 'inherit';
                if (debugToggle) debugToggle.checked = !!result.debug;
                if (debugFormattingToggle) debugFormattingToggle.checked = !!result.debugFormatting;
                if (debugObserverToggle) debugObserverToggle.checked = !!result.debugObserver;
                if (debugUIToggle) debugUIToggle.checked = !!result.debugUI;
                if (syncToggle) syncToggle.checked = !!(result.syncEnabled);
                if (langSelect) {
                    langSelect.value = (typeof result.uiLanguage === 'string') ? result.uiLanguage : '';
                    try { localStorage.setItem('aid_ui_lang', langSelect.value || ''); } catch(_) {}
                    try { if (typeof langSelect.value === 'string') { if (langSelect.value) loadOverride(langSelect.value); else loadOverride(''); } } catch(_) {}
                }
                if (!didUserInteractBg) {
                    if (bgTypeSelect) bgTypeSelect.value = result.bgType || 'inherit';
                    if (bgColorInput && result.bgColor) bgColorInput.value = result.bgColor;
                    if (bgGradInput) bgGradInput.value = result.bgGrad || '';
                }
                // Normalize type ONLY if value came from storage
                try {
                    if (!didUserInteractBg && bgTypeSelect) {
                        if (result.bgGrad && (!result.bgType || result.bgType === 'inherit')) {
                            bgTypeSelect.value = 'gradient';
                        } else if (result.bgColor && (!result.bgType || result.bgType === 'inherit')) {
                            bgTypeSelect.value = 'solid';
                        }
                    }
                } catch(_) {}
                // Ensure custom colors show labeled and selected on load
                try {
                    ensureCustomLoaded(speechColorSelect, result.speechColor);
                    ensureCustomLoaded(sayColorSelect, result.sayColor);
                    ensureCustomLoaded(doColorSelect, result.doColor);
                    ensureCustomLoaded(monologueColorSelect, result.monologueColor);
                    ensureCustomLoaded(mainColorSelect, result.mainColor);
                } catch (_) {}
                renderSwatches();
                isLoadingSettings = false;
                updateBackgroundVisibility();
                // Reconcile with the live page only when storage lacks background info and user isn't interacting
                const hasBg = (
                    (typeof result.bgType === 'string' && result.bgType !== 'inherit') ||
                    (typeof result.bgColor === 'string' && !!result.bgColor) ||
                    (typeof result.bgGrad === 'string' && !!result.bgGrad)
                );
                if (!hasBg && !didUserInteractBg && !isPickingColor) {
                    requestActiveTabSettings().then((resp) => {
                        if (resp && resp.settings) {
                            applyBackgroundUIFrom(resp.settings);
                        }
                    });
                }
            });
        }
    }
    
    // Save settings and notify content script
    function normalizeCustomOption(selectEl) {
        if (!selectEl) return;
        const val = selectEl.value;
        const selectedOpt = selectEl.options[selectEl.selectedIndex];
        const selectedIsCustomHex = !!(selectedOpt && selectedOpt.dataset && selectedOpt.dataset.customHex === 'true');
        if (val === 'custom' || selectedIsCustomHex) {
            // Open color picker
            const input = document.createElement('input');
            input.type = 'color';
            // Prefill with currently selected color if valid, else last custom, else #ffffff
            try {
                const selectedVal = (typeof selectEl.value === 'string' && /^#([0-9a-fA-F]{3}){1,2}$/.test(selectEl.value)) ? selectEl.value : null;
                const existing = Array.from(selectEl.options).find(o => o.dataset && o.dataset.customHex === 'true');
                input.value = (selectedVal || (existing ? existing.value : '#ffffff'));
            } catch (_) { input.value = '#ffffff'; }
            input.style.position = 'fixed';
            input.style.left = '-9999px';
            document.body.appendChild(input);
            isPickingColor = true;
            // Live updates while dragging the picker
            let didInput = false;
            const onInput = () => {
                didInput = true;
                const raw = input.value || '#ffffff';
                const hex = String(raw).toLowerCase();
                // Create/update a custom option reflecting the color
                // If the selected value matches a built-in option (not custom), don't relabel it
                const builtin = Array.from(selectEl.options).find(o => (String(o.value).toLowerCase() === hex) && !(o.dataset && o.dataset.customHex === 'true'));
                if (builtin) {
                    selectEl.value = builtin.value;
                    saveSettings();
                    return;
                }
                let opt = Array.from(selectEl.options).find(o => o.dataset && o.dataset.customHex === 'true');
                if (!opt) {
                    opt = document.createElement('option');
                    opt.dataset.customHex = 'true';
                    selectEl.appendChild(opt);
                }
                opt.value = hex;
                opt.textContent = `Custom - ${hex.toUpperCase()}`;
                selectEl.value = opt.value;
                saveSettings();
            };
            input.addEventListener('input', onInput);
            // Ensure final value saved and cleanup when picker closes
            input.addEventListener('change', () => {
                onInput();
                if (!didInput) {
                    // User confirmed without moving; avoid saving default white to recents
                    isPickingColor = false;
                    try { document.body.removeChild(input); } catch(_){ }
                    return;
                }
                pushRecentColor(String(input.value || '').toLowerCase());
                isPickingColor = false;
                try { document.body.removeChild(input); } catch(_){ }
            });
            input.click();
        }
    }

    function ensureCustomLoaded(selectEl, value) {
        if (!selectEl) return;
        if (typeof value === 'string' && /^#([0-9a-fA-F]{3}){1,2}$/.test(value)) {
            const valueLower = value.toLowerCase();
            // If a built-in (non-custom) option already matches this value, don't relabel it
            const hasBuiltin = Array.from(selectEl.options).some(o => (String(o.value).toLowerCase() === valueLower) && !(o.dataset && o.dataset.customHex === 'true'));
            if (hasBuiltin) {
                // Use the exact builtin value to avoid duplicate custom options
                const builtin = Array.from(selectEl.options).find(o => (String(o.value).toLowerCase() === valueLower) && !(o.dataset && o.dataset.customHex === 'true'));
                if (builtin) { selectEl.value = builtin.value; }
                return;
            }
            // Otherwise, add/update a "Custom - #HEX" option
            let opt = Array.from(selectEl.options).find(o => (o.dataset && o.dataset.customHex === 'true'));
            if (!opt) {
                opt = document.createElement('option');
                opt.dataset.customHex = 'true';
                selectEl.appendChild(opt);
            }
            opt.value = valueLower;
            opt.textContent = `Custom - ${valueLower.toUpperCase()}`;
            selectEl.value = opt.value;
        }
    }

    // Throttle saves to reduce churn while sliders are moving
    let saveTimer;
    function saveSettings() {
        // Determine background values based on the selected type so defaults don't force Solid
        const selectedBgType = bgTypeSelect ? bgTypeSelect.value : 'inherit';
        // Only persist the specific background value matching the selected type; otherwise leave undefined to avoid forcing solid on unrelated changes
        const persistedBgColor = (selectedBgType === 'solid' && bgColorInput) ? String(bgColorInput.value || '').trim() : undefined;
        const persistedBgGrad = (selectedBgType === 'gradient' && bgGradInput) ? String(bgGradInput.value || '').trim() : undefined;

        const settings = {
            speechBold: speechBoldToggle.checked,
            speechColor: speechColorSelect.value,
            monologueColor: monologueColorSelect.value,
            monologueBold: monologueBoldToggle.checked,
            sayBold: sayBoldToggle?.checked || false,
            sayColor: sayColorSelect?.value || 'inherit',
            doBold: doBoldToggle?.checked || false,
            doColor: doColorSelect?.value || 'inherit',
            mainBold: mainBoldToggle?.checked || false,
            mainColor: mainColorSelect?.value || 'inherit',
            capsEffect: capsEffectSelect?.value || 'none',
            keywordEffects: getKeywordsFromDOM(),
            fontFamily: fontFamilySelect?.value || 'inherit',
            fontSize: fontSizeSlider ? parseInt(fontSizeSlider.value, 10) : 16,
            fontWeight: fontWeightSelect && fontWeightSelect.value !== '' ? parseInt(fontWeightSelect.value, 10) : undefined,
            lineHeight: lineHeightSlider ? parseFloat(lineHeightSlider.value) : undefined,
            letterSpacing: letterSpacingSlider ? (parseFloat(letterSpacingSlider.value) === 0 ? undefined : parseFloat(letterSpacingSlider.value)) : undefined,
            textAlign: textAlignSelect ? textAlignSelect.value : 'inherit',
            debug: debugToggle ? !!debugToggle.checked : false,
            debugFormatting: debugFormattingToggle ? !!debugFormattingToggle.checked : false,
            debugObserver: debugObserverToggle ? !!debugObserverToggle.checked : false,
            debugUI: debugUIToggle ? !!debugUIToggle.checked : false,
            syncEnabled: syncToggle ? !!syncToggle.checked : false,
            uiLanguage: langSelect ? String(langSelect.value || '') : '',
            bgType: selectedBgType || 'inherit',
            bgColor: persistedBgColor,
            bgGrad: persistedBgGrad,
        };
        // Do not force bgType here; rely on user selection or input listeners
        
        // Save settings
        
        if (typeof browser !== 'undefined' && browser.storage) {
            try {
                clearTimeout(saveTimer);
                const doWrite = () => {
                    const ops = [];
                    if (browser.storage.local && typeof browser.storage.local.set === 'function') {
                        ops.push(browser.storage.local.set(settings));
                    }
                    if (settings.syncEnabled && browser.storage.sync && typeof browser.storage.sync.set === 'function') {
                        try { ops.push(browser.storage.sync.set(settings)); } catch(_) {}
                    }
                    Promise.allSettled(ops).catch(() => {});
                };
                // Short debounce for rapid changes (e.g., sliders); longer if syncing
                saveTimer = setTimeout(doWrite, settings.syncEnabled ? 250 : 120);
            } catch(_) {}
            
            // Prefer tabs messaging when available; otherwise fall back to runtime.sendMessage
            try {
                if (browser.tabs && browser.tabs.query) {
                    // First, try the tab that was active in the last focused window (the page window)
                    browser.tabs.query({ active: true, lastFocusedWindow: true }).then((tabsLf) => {
                        const candidate = (tabsLf && tabsLf[0]) || null;
                        const sendTo = (tab) => {
                            if (!tab) return Promise.resolve();
                            return browser.tabs.sendMessage(tab.id, { type: 'UPDATE_SETTINGS', settings, persist: true }).catch(() => {});
                        };
                        const tryCurrent = () => browser.tabs.query({ active: true, currentWindow: true }).then((tabsCw) => sendTo((tabsCw && tabsCw[0]) || null)).catch(() => {});
                        const p = candidate ? sendTo(candidate).catch(() => tryCurrent()) : tryCurrent();
                        p.finally(() => {
                            // Also broadcast to all AIDungeon tabs in case targeting misses while popup focused
                            try {
                                browser.tabs.query({ url: ['*://*.aidungeon.io/*', '*://aidungeon.io/*', '*://*.aidungeon.com/*', '*://aidungeon.com/*'] }).then((tabsAll) => {
                                    (tabsAll || []).forEach((t) => {
                                        try { browser.tabs.sendMessage(t.id, { type: 'UPDATE_SETTINGS', settings, persist: true }).catch(() => {}); } catch(_) {}
                                    });
                                }).catch(() => {});
                            } catch(_) {}
                            // If UI language changed, reload popup strings
                            try {
                                if (langSelect) {
                                    const preferred = settings.uiLanguage || '';
                                    localStorage.setItem('aid_ui_lang', preferred);
                                    // Load messages for selected override
                                    if (typeof preferred === 'string' && preferred) { loadOverride(preferred); }
                                    else { loadOverride(''); }
                                }
                            } catch(_) {}
                        });
                    }).catch(() => {
                        if (browser.runtime && browser.runtime.sendMessage) {
                            browser.runtime.sendMessage({ type: 'UPDATE_SETTINGS', settings, persist: true }).catch(() => {});
                        }
                    });
                } else if (browser.runtime && browser.runtime.sendMessage) {
                    browser.runtime.sendMessage({ type: 'UPDATE_SETTINGS', settings, persist: true }).catch(() => {});
                }
            } catch (_) {
                if (browser.runtime && browser.runtime.sendMessage) {
                    browser.runtime.sendMessage({ type: 'UPDATE_SETTINGS', settings, persist: true }).catch(() => {});
                }
            }
        }

        // Always bridge to parent page if embedded in iframe
        try {
            if (window && window.parent && window.parent !== window) {
                // Best-effort restrict target origin using referrer
                var target = '*';
                try {
                    var ref = document.referrer || '';
                    if (ref) { target = new URL(ref).origin; }
                } catch(_) {}
                window.parent.postMessage({ type: 'UPDATE_SETTINGS', settings }, target);
            }
        } catch (_) {}

        // Update accessibility contrast warnings
        try { assessContrast(); } catch(_) {}
    }
    
    // Add event listeners
    speechBoldToggle.addEventListener('change', saveSettings);
    function attachColorPickerTriggers(selectEl) {
        if (!selectEl) return;
        // Reopen picker when clicking the select while a custom color is already selected
        selectEl.addEventListener('mousedown', (ev) => {
            const selectedOpt = selectEl.options[selectEl.selectedIndex];
            const isCustomHex = !!(selectedOpt && selectedOpt.dataset && selectedOpt.dataset.customHex === 'true');
            if (selectEl.value === 'custom' || isCustomHex) {
                ev.preventDefault();
                normalizeCustomOption(selectEl);
            }
        });
        // Support Pointer Events as well
        selectEl.addEventListener('pointerdown', (ev) => {
            const selectedOpt = selectEl.options[selectEl.selectedIndex];
            const isCustomHex = !!(selectedOpt && selectedOpt.dataset && selectedOpt.dataset.customHex === 'true');
            if (selectEl.value === 'custom' || isCustomHex) {
                ev.preventDefault();
                normalizeCustomOption(selectEl);
            }
        });
        // Keyboard: Enter/Space while focused should reopen picker
        selectEl.addEventListener('keydown', (ev) => {
            if (ev.key !== 'Enter' && ev.key !== ' ') return;
            const selectedOpt = selectEl.options[selectEl.selectedIndex];
            const isCustomHex = !!(selectedOpt && selectedOpt.dataset && selectedOpt.dataset.customHex === 'true');
            if (selectEl.value === 'custom' || isCustomHex) {
                ev.preventDefault();
                normalizeCustomOption(selectEl);
            }
        });
        selectEl.addEventListener('change', () => {
            if (!isLoadingSettings) { normalizeCustomOption(selectEl); }
            saveSettings();
        });
        selectEl.addEventListener('click', () => {
            if (isLoadingSettings) return;
            const selectedOpt = selectEl.options[selectEl.selectedIndex];
            const isCustomHex = !!(selectedOpt && selectedOpt.dataset && selectedOpt.dataset.customHex === 'true');
            if (selectEl.value === 'custom' || isCustomHex) {
                normalizeCustomOption(selectEl);
            }
        });
    }
    attachColorPickerTriggers(speechColorSelect);
    attachColorPickerTriggers(sayColorSelect);
    attachColorPickerTriggers(doColorSelect);
    attachColorPickerTriggers(monologueColorSelect);
    attachColorPickerTriggers(mainColorSelect);
    monologueBoldToggle.addEventListener('change', saveSettings);
    if (sayBoldToggle) sayBoldToggle.addEventListener('change', saveSettings);
    if (doBoldToggle) doBoldToggle.addEventListener('change', saveSettings);
    if (mainBoldToggle) mainBoldToggle.addEventListener('change', saveSettings);
    if (capsEffectSelect) capsEffectSelect.addEventListener('change', saveSettings);
    if (fontFamilySelect) fontFamilySelect.addEventListener('change', saveSettings);
    if (fontSizeSlider) {
        fontSizeSlider.addEventListener('input', () => {
            if (fontSizeValue) fontSizeValue.textContent = `(${fontSizeSlider.value}px)`;
        });
        fontSizeSlider.addEventListener('change', saveSettings);
    }
    if (fontSizeReset) fontSizeReset.addEventListener('click', () => { fontSizeSlider.value = 16; if (fontSizeValue) fontSizeValue.textContent = '(16px)'; saveSettings(); });
    if (fontWeightSelect) fontWeightSelect.addEventListener('change', saveSettings);
    if (lineHeightSlider) {
        const applyLineHeight = () => {
            const val = parseFloat(lineHeightSlider.value);
            if (lineHeightValue) lineHeightValue.textContent = `(${val})`;
            saveSettings();
        };
        lineHeightSlider.addEventListener('input', applyLineHeight);
        lineHeightSlider.addEventListener('change', applyLineHeight);
    }
    if (letterSpacingSlider) {
        letterSpacingSlider.addEventListener('input', () => { if (letterSpacingValue) letterSpacingValue.textContent = `(${letterSpacingSlider.value}px)`; });
        letterSpacingSlider.addEventListener('change', saveSettings);
    }
    if (textAlignSelect) textAlignSelect.addEventListener('change', saveSettings);
    if (debugToggle) debugToggle.addEventListener('change', saveSettings);
    if (debugFormattingToggle) debugFormattingToggle.addEventListener('change', saveSettings);
    if (debugObserverToggle) debugObserverToggle.addEventListener('change', saveSettings);
    if (debugUIToggle) debugUIToggle.addEventListener('change', saveSettings);
    if (bgTypeSelect) bgTypeSelect.addEventListener('change', () => {
        try { didUserInteractBg = true; } catch(_) {}
        saveSettings();
        updateBackgroundVisibility();
    });
    if (bgColorInput) {
        const requestOpenEmbedded = () => {
            try {
                if (browser && browser.tabs && browser.tabs.query) {
                    const send = (tab) => { if (!tab) return; try { browser.tabs.sendMessage(tab.id, { type: 'OPEN_EMBEDDED_PANEL', open: 'bgColor' }).catch(() => {}); } catch(_) {} };
                    // Prefer matching AIDungeon URLs directly to avoid picking the popup window
                    browser.tabs.query({ url: ['*://*.aidungeon.io/*', '*://aidungeon.io/*', '*://*.aidungeon.com/*', '*://aidungeon.com/*'] }).then((tabsAll) => {
                        const activeMatch = (tabsAll || []).find(t => t.active) || (tabsAll || [])[0] || null;
                        if (activeMatch) {
                            send(activeMatch);
                        } else {
                            // Fallback to lastFocusedWindow, then currentWindow
                            browser.tabs.query({ active: true, lastFocusedWindow: true }).then((tabsLf) => {
                                const t = (tabsLf && tabsLf[0]) || null;
                                if (t) { send(t); }
                                else {
                                    browser.tabs.query({ active: true, currentWindow: true }).then((tabsCw) => send((tabsCw && tabsCw[0]) || null)).catch(() => {});
                                }
                            }).catch(() => {});
                        }
                    }).catch(() => {
                        // As a last resort try the active tab in currentWindow
                        browser.tabs.query({ active: true, currentWindow: true }).then((tabsCw) => send((tabsCw && tabsCw[0]) || null)).catch(() => {});
                    });
                }
            } catch(_) {}
        };
        // Debounced saver for color
        let bgColorDebounce;
        const onBgColorChange = () => {
            try {
                const val = String(bgColorInput.value || '').trim();
                if (val) {
                    if (bgTypeSelect && bgTypeSelect.value !== 'solid') bgTypeSelect.value = 'solid';
                }
            } catch(_) {}
            // Avoid reload thrash while user is picking a color
            try { isPickingColor = true; } catch(_) {}
            didUserInteractBg = true;
            clearTimeout(bgColorDebounce);
            bgColorDebounce = setTimeout(() => { saveSettings(); }, 120);
            // Release the picking lock shortly after save
            setTimeout(() => { try { isPickingColor = false; } catch(_) {} }, 300);
            updateBackgroundVisibility();
        };
        // Live updates like the embedded modal
        bgColorInput.addEventListener('input', onBgColorChange);
        bgColorInput.addEventListener('change', onBgColorChange);
        bgColorInput.addEventListener('keyup', onBgColorChange);
        bgColorInput.addEventListener('blur', onBgColorChange);
        // When the user interacts with the color input in the toolbar popup, intercept to avoid popup-closing native picker
        const intercept = (ev) => {
            try {
                if (!isEmbeddedPopup) {
                    ev.preventDefault();
                    requestOpenEmbedded();
                    // Close the toolbar popup after delegating to the in-page panel
                    setTimeout(() => { try { window.close(); } catch(_) {} }, 80);
                }
            } catch(_) {}
        };
        bgColorInput.addEventListener('mousedown', intercept, true);
        bgColorInput.addEventListener('pointerdown', intercept, true);
        bgColorInput.addEventListener('click', intercept, true);
        bgColorInput.addEventListener('focus', intercept, true);
        bgColorInput.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter' || ev.key === ' ') intercept(ev);
        }, true);
        // Mark as picking for the duration the native picker is open
        bgColorInput.addEventListener('focus', () => { try { isPickingColor = true; } catch(_) {} });
        bgColorInput.addEventListener('blur', () => { setTimeout(() => { try { isPickingColor = false; } catch(_) {} }, 100); });
    }
    if (bgGradInput) {
        // Debounced saver for gradient
        let bgGradDebounce;
        const onBgGradChange = () => {
            try {
                const val = String(bgGradInput.value || '').trim();
                if (val) {
                    if (bgTypeSelect && bgTypeSelect.value !== 'gradient') bgTypeSelect.value = 'gradient';
                } else {
                    // Empty gradient input: if currently gradient, fall back to Default
                    if (bgTypeSelect && bgTypeSelect.value === 'gradient') bgTypeSelect.value = 'inherit';
                }
            } catch(_) {}
            try { isPickingColor = true; } catch(_) {}
            didUserInteractBg = true;
            clearTimeout(bgGradDebounce);
            bgGradDebounce = setTimeout(() => { saveSettings(); }, 120);
            setTimeout(() => { try { isPickingColor = false; } catch(_) {} }, 300);
            updateBackgroundVisibility();
        };
        bgGradInput.addEventListener('input', onBgGradChange);
        bgGradInput.addEventListener('change', onBgGradChange);
        bgGradInput.addEventListener('keyup', onBgGradChange);
        bgGradInput.addEventListener('blur', onBgGradChange);
    }
    if (bgTypeReset) bgTypeReset.addEventListener('click', () => { if (bgTypeSelect) { bgTypeSelect.value = 'inherit'; saveSettings(); } });
    if (bgColorReset) bgColorReset.addEventListener('click', () => { if (bgColorInput) { bgColorInput.value = '#101010'; saveSettings(); } });
    if (bgGradReset) bgGradReset.addEventListener('click', () => { if (bgGradInput) { bgGradInput.value = ''; if (bgTypeSelect) bgTypeSelect.value = 'inherit'; saveSettings(); } });
    if (syncToggle) syncToggle.addEventListener('change', saveSettings);
    if (langSelect) langSelect.addEventListener('change', () => { try { localStorage.setItem('aid_ui_lang', String(langSelect.value || '')); } catch(_) {} saveSettings(); });

    // Contrast helper: assess text/background contrast for selected colors
    function parseHex(hex) {
        const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex||''));
        if (!m) return null;
        let h = m[1].toLowerCase();
        if (h.length === 3) h = h.split('').map(c => c + c).join('');
        const r = parseInt(h.slice(0,2), 16), g = parseInt(h.slice(2,4), 16), b = parseInt(h.slice(4,6), 16);
        return { r, g, b };
    }
    function relLuma(c) {
        const srgb = [c.r/255, c.g/255, c.b/255].map(v => (v <= 0.03928) ? (v/12.92) : Math.pow((v+0.055)/1.055, 2.4));
        return 0.2126*srgb[0] + 0.7152*srgb[1] + 0.0722*srgb[2];
    }
    function contrastRatio(hex1, hex2) {
        const c1 = parseHex(hex1), c2 = parseHex(hex2);
        if (!c1 || !c2) return null;
        const l1 = relLuma(c1) + 0.05, l2 = relLuma(c2) + 0.05;
        const ratio = (Math.max(l1,l2) / Math.min(l1,l2));
        return ratio;
    }
    function assessContrast() {
        const panel = document.getElementById('contrastWarnings');
        if (!panel) return;
        panel.innerHTML = '';
        // Determine background color
        const type = bgTypeSelect ? bgTypeSelect.value : 'inherit';
        let bgHex = null;
        if (type === 'solid' && bgColorInput && bgColorInput.value) {
            bgHex = String(bgColorInput.value);
        }
        if (!bgHex) {
            // Fallback baseline
            bgHex = '#101010';
        }
        const checks = [];
        function addCheck(label, val) {
            if (!val || val === 'inherit') return;
            if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(val)) return;
            const cr = contrastRatio(val, bgHex);
            if (cr !== null && cr < 4.5) {
                checks.push({ label, ratio: cr });
            }
        }
        addCheck('Speech', speechColorSelect && speechColorSelect.value);
        addCheck('Monologue', monologueColorSelect && monologueColorSelect.value);
        addCheck('Say', sayColorSelect && sayColorSelect.value);
        addCheck('Do', doColorSelect && doColorSelect.value);
        addCheck('Main', mainColorSelect && mainColorSelect.value);
        if (checks.length) {
            const ul = document.createElement('ul');
            ul.setAttribute('role','list');
            checks.forEach(({label, ratio}) => {
                const li = document.createElement('li');
                li.textContent = `${label}: low contrast (${ratio.toFixed(2)}:1)`;
                ul.appendChild(li);
            });
            const msg = document.createElement('div');
            msg.setAttribute('role','status');
            msg.setAttribute('aria-live','polite');
            msg.appendChild(ul);
            panel.appendChild(msg);
        }
    }
    // Initial contrast assessment after UI loads
    setTimeout(() => { try { assessContrast(); } catch(_) {} }, 300);

    // Keyword UI helpers
    function getKeywordsFromDOM() {
        const rows = Array.from((keywordsList || document.createElement('div')).querySelectorAll('[data-keyword-row]'));
        return rows.map(row => {
            const word = row.querySelector('[data-word]')?.textContent?.trim() || '';
            const eff = row.querySelector('select')?.value || 'none';
            const color = row.getAttribute('data-color') || undefined;
            const bold = !!row.querySelector('input[type="checkbox"][data-bold]')?.checked;
            return { word, effect: eff, color, bold };
        }).filter(x => x.word);
    }

    function renderKeywords(list) {
        if (!keywordsList) return;
        keywordsList.innerHTML = '';
        list.forEach(({ word, effect, color, bold }) => {
            const row = document.createElement('div');
            row.setAttribute('data-keyword-row', '1');
            row.className = 'setting-item setting-item--keyword';

            const label = document.createElement('label');
            label.setAttribute('data-word', '');
            label.textContent = String(word || '');

            const sel = document.createElement('select');
            ['none','flash','strobe','rainbow','wave','breathe','static'].forEach((val) => {
                const opt = document.createElement('option');
                opt.value = val;
                opt.textContent = (val === 'none') ? 'None' : (val === 'static' ? 'Static color…' : val.charAt(0).toUpperCase() + val.slice(1));
                sel.appendChild(opt);
            });
            sel.value = effect || 'none';

            const boldWrap = document.createElement('label');
            boldWrap.className = 'toggle-switch';
            boldWrap.title = 'Bold';
            const boldInput = document.createElement('input');
            boldInput.type = 'checkbox';
            boldInput.setAttribute('data-bold', '');
            if (bold) boldInput.checked = true;
            const boldSlider = document.createElement('span');
            boldSlider.className = 'slider';
            boldWrap.appendChild(boldInput);
            boldWrap.appendChild(boldSlider);

            const swatch = document.createElement('span');
            swatch.className = 'color-swatch';
            swatch.title = 'Color';
            swatch.setAttribute('data-swatch', '');
            if (effect === 'static' && color) {
                row.setAttribute('data-color', color);
                swatch.style.display = 'inline-block';
                swatch.style.backgroundColor = color;
            } else {
                swatch.style.display = 'none';
            }

            const removeBtn = document.createElement('button');
            removeBtn.className = 'reset-btn';
            removeBtn.title = 'Remove';
            removeBtn.setAttribute('data-remove', '');
            removeBtn.textContent = '✕';

            function setCustomLabel(hex) {
                const opt = Array.from(sel.options).find(o => o.value === 'static');
                if (opt) opt.textContent = `Custom - ${String(hex || '').toUpperCase()}`;
            }

            function pickColor() {
                const input = document.createElement('input');
                input.type = 'color';
                input.value = (row.getAttribute('data-color') || '#ffffff');
                input.style.position = 'fixed'; input.style.left = '-9999px';
                document.body.appendChild(input);
                isPickingColor = true;
                input.addEventListener('input', () => {
                    const hex = input.value;
                    row.setAttribute('data-color', hex);
                    swatch.style.display = 'inline-block';
                    swatch.style.backgroundColor = hex;
                    setCustomLabel(hex);
                    saveSettings();
                });
                input.addEventListener('change', () => {
                    const hex = input.value;
                    row.setAttribute('data-color', hex);
                    swatch.style.display = 'inline-block';
                    swatch.style.backgroundColor = hex;
                    setCustomLabel(hex);
                    saveSettings();
                    isPickingColor = false;
                    try { document.body.removeChild(input); } catch(_){ }
                });
                input.click();
            }

            sel.addEventListener('change', () => {
                if (sel.value === 'static') {
                    const current = row.getAttribute('data-color') || '#ffffff';
                    row.setAttribute('data-color', current);
                    swatch.style.display = 'inline-block';
                    swatch.style.backgroundColor = current;
                    setCustomLabel(current);
                    pickColor();
                } else {
                    swatch.style.display = 'none';
                    row.removeAttribute('data-color');
                    const opt = Array.from(sel.options).find(o => o.value === 'static');
                    if (opt) opt.textContent = 'Static color…';
                    saveSettings();
                }
            });
            swatch.addEventListener('click', (e) => { e.preventDefault(); pickColor(); });
            boldInput.addEventListener('change', saveSettings);
            removeBtn.addEventListener('click', () => { row.remove(); saveSettings(); });

            row.appendChild(label);
            row.appendChild(sel);
            row.appendChild(boldWrap);
            row.appendChild(swatch);
            row.appendChild(removeBtn);

            // Ensure custom label shown if loaded with static+color
            if (sel.value === 'static' && color) {
                setCustomLabel(color);
            }
            keywordsList.appendChild(row);
        });
    }

    addKeywordBtn?.addEventListener('click', () => {
        const word = (keywordInput?.value || '').trim();
        if (!word) return;
        const current = getKeywordsFromDOM();
        if (current.some(k => k.word.toLowerCase() === word.toLowerCase())) { keywordInput.value = ''; return; }
        current.push({ word, effect: 'none' });
        renderKeywords(current);
        keywordInput.value = '';
        saveSettings();
    });

    // Allow pressing Enter in the keyword input to add
    if (keywordInput) {
        keywordInput.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter' || ev.key === 'NumpadEnter') {
                ev.preventDefault();
                if (addKeywordBtn && typeof addKeywordBtn.click === 'function') {
                    addKeywordBtn.click();
                } else {
                    const word = (keywordInput.value || '').trim();
                    if (!word) return;
                    const current = getKeywordsFromDOM();
                    if (current.some(k => k.word.toLowerCase() === word.toLowerCase())) { keywordInput.value = ''; return; }
                    current.push({ word, effect: 'none' });
                    renderKeywords(current);
                    keywordInput.value = '';
                    saveSettings();
                }
            }
        });
    }

    // Per-section reset handlers
    if (resetActionsBtn) resetActionsBtn.addEventListener('click', () => {
        if (sayBoldToggle) sayBoldToggle.checked = false;
        if (sayColorSelect) sayColorSelect.value = 'inherit';
        if (doBoldToggle) doBoldToggle.checked = false;
        if (doColorSelect) doColorSelect.value = 'inherit';
        saveSettings();
    });
    if (resetTextFormattingBtn) resetTextFormattingBtn.addEventListener('click', () => {
        speechBoldToggle.checked = false;
        speechColorSelect.value = 'inherit';
        monologueBoldToggle.checked = false;
        monologueColorSelect.value = 'inherit';
        if (mainBoldToggle) mainBoldToggle.checked = false;
        if (mainColorSelect) mainColorSelect.value = 'inherit';
        capsEffectSelect.value = 'none';
        saveSettings();
    });
    if (resetFontBtn) resetFontBtn.addEventListener('click', () => {
        if (fontFamilySelect) fontFamilySelect.value = 'inherit';
        if (fontSizeSlider) { fontSizeSlider.value = 16; if (fontSizeValue) fontSizeValue.textContent = '(16px)'; }
        if (fontWeightSelect) fontWeightSelect.value = '';
        if (lineHeightSlider) { lineHeightSlider.value = 1.5; if (lineHeightValue) lineHeightValue.textContent = '(1.5)'; }
        if (letterSpacingSlider) { letterSpacingSlider.value = 0; if (letterSpacingValue) letterSpacingValue.textContent = '(0px)'; }
        if (textAlignSelect) textAlignSelect.value = 'inherit';
        saveSettings();
    });

    if (resetAllBtn) resetAllBtn.addEventListener('click', () => {
        try {
            if (!confirm('Reset all formatter settings to defaults?')) return;
        } catch(_) {}
        if (speechBoldToggle) speechBoldToggle.checked = false;
        if (speechColorSelect) speechColorSelect.value = 'inherit';
        if (monologueBoldToggle) monologueBoldToggle.checked = false;
        if (monologueColorSelect) monologueColorSelect.value = 'inherit';
        if (sayBoldToggle) sayBoldToggle.checked = false;
        if (sayColorSelect) sayColorSelect.value = 'inherit';
        if (doBoldToggle) doBoldToggle.checked = false;
        if (doColorSelect) doColorSelect.value = 'inherit';
        if (mainBoldToggle) mainBoldToggle.checked = false;
        if (mainColorSelect) mainColorSelect.value = 'inherit';
        if (capsEffectSelect) capsEffectSelect.value = 'none';
        if (fontFamilySelect) fontFamilySelect.value = 'inherit';
        if (fontSizeSlider) { fontSizeSlider.value = 16; if (fontSizeValue) fontSizeValue.textContent = '(16px)'; }
        if (fontWeightSelect) fontWeightSelect.value = '';
        if (lineHeightSlider) { lineHeightSlider.value = 1.5; if (lineHeightValue) lineHeightValue.textContent = '(1.5)'; }
        if (letterSpacingSlider) { letterSpacingSlider.value = 0; if (letterSpacingValue) letterSpacingValue.textContent = '(0px)'; }
        if (textAlignSelect) textAlignSelect.value = 'inherit';
        if (debugToggle) debugToggle.checked = false;
        if (debugFormattingToggle) debugFormattingToggle.checked = false;
        if (debugObserverToggle) debugObserverToggle.checked = false;
        if (debugUIToggle) debugUIToggle.checked = false;
        if (bgTypeSelect) bgTypeSelect.value = 'inherit';
        if (bgColorInput) bgColorInput.value = '#101010';
        if (bgGradInput) bgGradInput.value = '';
        if (syncToggle) syncToggle.checked = false;
        // Clear keywords list in UI
        if (keywordsList) keywordsList.innerHTML = '';
        // Persist wipe explicitly
        if (typeof browser !== 'undefined' && browser.storage) {
            const defaults = {
                speechBold: false,
                speechColor: 'inherit',
                monologueColor: 'inherit',
                monologueBold: false,
                sayBold: false,
                sayColor: 'inherit',
                doBold: false,
                doColor: 'inherit',
                mainBold: false,
                mainColor: 'inherit',
                capsEffect: 'none',
                keywordEffects: [],
                fontFamily: 'inherit',
                fontSize: 16,
                fontWeight: undefined,
                lineHeight: 1.5,
                letterSpacing: undefined,
                textAlign: 'inherit',
                debug: false,
                debugFormatting: false,
                debugObserver: false,
                debugUI: false,
                syncEnabled: false,
                bgType: 'inherit',
                bgColor: undefined,
                bgGrad: undefined
            };
            browser.storage.local.set(defaults).then(() => {
                try {
                    if (browser.storage.sync && typeof browser.storage.sync.set === 'function') {
                        return browser.storage.sync.set(defaults);
                    }
                } catch(_) {}
            }).then(() => saveSettings());
        } else {
            saveSettings();
        }
    });

    // Per-control resets
    if (btns.sayColorReset && sayColorSelect) btns.sayColorReset.addEventListener('click', () => { sayColorSelect.value = 'inherit'; saveSettings(); });
    if (btns.doColorReset && doColorSelect) btns.doColorReset.addEventListener('click', () => { doColorSelect.value = 'inherit'; saveSettings(); });
    if (btns.speechColorReset && speechColorSelect) btns.speechColorReset.addEventListener('click', () => { speechColorSelect.value = 'inherit'; saveSettings(); });
    if (btns.monologueColorReset && monologueColorSelect) btns.monologueColorReset.addEventListener('click', () => { monologueColorSelect.value = 'inherit'; saveSettings(); });
    if (btns.mainColorReset && mainColorSelect) btns.mainColorReset.addEventListener('click', () => { mainColorSelect.value = 'inherit'; saveSettings(); });
    if (btns.fontWeightReset && fontWeightSelect) btns.fontWeightReset.addEventListener('click', () => { fontWeightSelect.value = ''; saveSettings(); });
    if (btns.lineHeightReset && lineHeightSlider) btns.lineHeightReset.addEventListener('click', () => { lineHeightSlider.value = 1.5; if (lineHeightValue) lineHeightValue.textContent = '(1.5)'; saveSettings(); });
    if (btns.letterSpacingReset && letterSpacingSlider) btns.letterSpacingReset.addEventListener('click', () => { letterSpacingSlider.value = 0; if (letterSpacingValue) letterSpacingValue.textContent = '(0px)'; saveSettings(); });
    if (btns.textAlignReset && textAlignSelect) btns.textAlignReset.addEventListener('click', () => { textAlignSelect.value = 'inherit'; saveSettings(); });
    
    // Load settings when popup opens
    loadSettings();

    // Keep UI in sync if settings change elsewhere (e.g., content script quick toggles)
    try {
        if (typeof browser !== 'undefined' && browser.storage && browser.storage.onChanged) {
            browser.storage.onChanged.addListener((changes, area) => {
                // Refresh when either local or sync area changes
                if (area === 'local' || area === 'sync') {
                    if (isPickingColor) return;
                    loadSettings();
                }
            });
        }
    } catch (_) {}
});
