// AI Dungeon Tweaks - Content Script
// Formats asterisk-wrapped text (*like this*) to display as italicized content

(function() {
    'use strict';
    // Cross-browser shim: provide Promise-based browser.* API on Chrome
    (function(){
        try {
            if (typeof window !== 'undefined' && typeof window.browser === 'undefined' && typeof window.chrome !== 'undefined') {
                var c = window.chrome;
                var wrapGet = function(fn){ return function(keys){ return new Promise(function(resolve){ fn(keys, function(items){ resolve(items || {}); }); }); }; };
                var wrapSet = function(fn){ return function(items){ return new Promise(function(resolve){ fn(items, function(){ resolve(); }); }); }; };
                var shim = {
                    storage: c.storage ? {
                        local: {
                            get: wrapGet(c.storage.local.get.bind(c.storage.local)),
                            set: wrapSet(c.storage.local.set.bind(c.storage.local))
                        },
                        sync: c.storage.sync ? {
                            get: wrapGet(c.storage.sync.get.bind(c.storage.sync)),
                            set: wrapSet(c.storage.sync.set.bind(c.storage.sync))
                        } : undefined,
                        onChanged: c.storage.onChanged
                    } : undefined,
                    runtime: c.runtime ? {
                        sendMessage: function(msg){ return new Promise(function(resolve){ try { c.runtime.sendMessage(msg, function(resp){ resolve(resp); }); } catch(_) { resolve(undefined); } }); },
                        onMessage: c.runtime.onMessage
                    } : undefined
                };
                try { window.browser = shim; } catch(_){ }
            }
        } catch(_){ }
    })();
    let debugEnabled = false;
    let debugFormatting = false;
    let debugObserver = false;
    let debugUI = false;
    // Suppress this script's console logs in production
    (function() {
        try {
            const originalLog = console.log.bind(console);
            console.log = function(...args) {
                try {
                    if (args && args.length > 0 && typeof args[0] === 'string') {
                        // Normalize legacy prefix and suppress logs unless debug
                        if (args[0].startsWith('AIDungeon Formatter:')) {
                            args[0] = args[0].replace('AIDungeon Formatter:', 'AI Dungeon Tweaks:');
                            if (!debugEnabled) { return; }
                        } else if (args[0].startsWith('AI Dungeon Tweaks:')) {
                            if (!debugEnabled) { return; }
                        }
                    }
                } catch(_) {}
                originalLog(...args);
            };
        } catch (_) {}
    })();
    
    // Configuration
    const TARGET_SELECTOR = '#transition-opacity';
    
    // Extension settings with defaults
    let settings = {
        speechBold: false,
        speechColor: 'inherit',
        monologueColor: 'inherit',
        monologueBold: false,
        // Say (w_comment) icon/text styles
        sayBold: false,
        sayColor: 'inherit',
        // Do (w_run) icon/text styles
        doBold: false,
        doColor: 'inherit',
        // Main (non-action rows) text styles
        mainBold: false,
        mainColor: 'inherit',
        // Effects for ALL-CAPS text
        capsEffect: 'none',
        // Per-keyword effects (loaded from storage)
        keywordEffects: [],
        // Background customization
        bgType: 'inherit',
        bgColor: undefined,
        bgGrad: undefined,
        fontFamily: 'inherit',
        fontSize: 16,
        fontWeight: 400,
        lineHeight: null,
        letterSpacing: null,
        textAlign: 'inherit'
    };
    
    // Store original text for each element to prevent italic speech from being overwritten
    const originalTexts = new WeakMap();
    // Ensure we run one full reformat once after settings are loaded
    let didInitialReformat = false;
    
    // Temporary edit-state flag: suppress italic-speech processing once after an edit
    let suppressItalicDuringEdit = false;

    // Persist italic monologue contents across node re-renders (per-tab)
    function getMonologueSet() {
        try {
            const raw = sessionStorage.getItem('aid_italic_monologues');
            return new Set(raw ? JSON.parse(raw) : []);
        } catch (_) {
            return new Set();
        }
    }
    function saveMonologueSet(set) {
        try {
            sessionStorage.setItem('aid_italic_monologues', JSON.stringify(Array.from(set)));
        } catch (_) {}
    }
    function addMonologue(content) {
        const set = getMonologueSet();
        if (!set.has(content)) {
            set.add(content);
            saveMonologueSet(set);
        }
    }
    function isMonologue(content) {
        return getMonologueSet().has(content);
    }
    
    // Note: We no longer track processed italic speech to prevent reformatting
    // This allows users to edit their messages and have them reformatted
    
    // Helper to apply loaded settings and flags consistently
    function applySettingsFromResult(result) {
        if (!result) result = {};
        if (result && typeof result.debug === 'boolean') debugEnabled = result.debug;
        if (result && typeof result.debugFormatting === 'boolean') debugFormatting = result.debugFormatting;
        if (result && typeof result.debugObserver === 'boolean') debugObserver = result.debugObserver;
        if (result && typeof result.debugUI === 'boolean') debugUI = result.debugUI;
        if (result.speechBold !== undefined) settings.speechBold = result.speechBold;
        if (result.speechColor !== undefined) settings.speechColor = result.speechColor;
        if (result.monologueColor !== undefined) settings.monologueColor = result.monologueColor;
        if (result.monologueBold !== undefined) settings.monologueBold = result.monologueBold;
        if (result.sayBold !== undefined) settings.sayBold = result.sayBold;
        if (result.sayColor !== undefined) settings.sayColor = result.sayColor;
        if (result.doBold !== undefined) settings.doBold = result.doBold;
        if (result.doColor !== undefined) settings.doColor = result.doColor;
        if (result.mainBold !== undefined) settings.mainBold = result.mainBold;
        if (result.mainColor !== undefined) settings.mainColor = result.mainColor;
        if (result.capsEffect !== undefined) settings.capsEffect = result.capsEffect;
        if (result.keywordEffects !== undefined) settings.keywordEffects = result.keywordEffects;
        if (result.fontFamily !== undefined) settings.fontFamily = result.fontFamily;
        if (result.fontSize !== undefined) settings.fontSize = result.fontSize;
        if (result.fontWeight !== undefined) settings.fontWeight = result.fontWeight;
        if (result.lineHeight !== undefined) settings.lineHeight = result.lineHeight;
        if (result.letterSpacing !== undefined) settings.letterSpacing = result.letterSpacing;
        if (result.textAlign !== undefined) settings.textAlign = result.textAlign;
        if (result.bgType !== undefined) settings.bgType = result.bgType;
        if (result.bgColor !== undefined) settings.bgColor = result.bgColor;
        if (result.bgGrad !== undefined) settings.bgGrad = result.bgGrad;

        console.log('AI Dungeon Tweaks: Loaded settings:', settings);
        try { updateColorsOnly(); } catch (_) {}
        if (!didInitialReformat) {
            didInitialReformat = true;
            try { setTimeout(() => { try { forceReformat(); } catch (_) {} }, 50); } catch (_) {}
        }
    }

    // Load settings from storage
    function loadSettings() {
        if (typeof browser !== 'undefined' && browser.storage) {
            const KEYS = ['speechBold', 'speechColor', 'monologueColor', 'monologueBold', 'sayBold', 'sayColor', 'doBold', 'doColor', 'mainBold', 'mainColor', 'capsEffect', 'keywordEffects', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'textAlign', 'debug', 'debugFormatting', 'debugObserver', 'debugUI', 'bgType', 'bgColor', 'bgGrad'];
            try {
                if (browser.storage.sync && typeof browser.storage.sync.get === 'function') {
                    Promise.all([
                        browser.storage.sync.get([...KEYS, 'syncEnabled']),
                        browser.storage.local.get([...KEYS, 'syncEnabled'])
                    ]).then(([syncRes, localRes]) => {
                        const useSync = !!(syncRes && syncRes.syncEnabled);
                        const result = Object.assign({}, localRes || {}, useSync ? (syncRes || {}) : {});
                        applySettingsFromResult(result);
                    });
                } else {
                    browser.storage.local.get(KEYS).then((result) => {
                        applySettingsFromResult(result);
                    });
                }
            } catch (_) {
                browser.storage.local.get(KEYS).then((result) => {
                    applySettingsFromResult(result);
                });
            }
        }
    }
    
    // Save settings to storage
    function saveSettings() {
        if (typeof browser !== 'undefined' && browser.storage) {
            browser.storage.local.set(settings);
        }
    }
    
    // Text formatting patterns - Order matters! More specific patterns first
    const FORMATTING_PATTERNS = [
        { pattern: /\*\*([^*]+)\*\*/g, tag: 'strong', class: 'ai-bold' }, // **bold**
        { pattern: /__([^_]+)__/g, tag: 'strong', class: 'ai-bold' },     // __bold__
        { pattern: /_([^_]+)_/g, tag: 'em', class: 'ai-italic' },         // _italic_
        { pattern: /~~([^~]+)~~/g, tag: 'del', class: 'ai-strikethrough' }, // ~~strikethrough~~
        { pattern: /`([^`]+)`/g, tag: 'code', class: 'ai-inline-code' },   // `code`
        { pattern: /\^\^([^^]+)\^\^/g, tag: 'mark', class: 'ai-highlight' }, // ^^highlight^^
        { pattern: /==([^=]+)==/g, tag: 'mark', class: 'ai-highlight' },     // ==highlight==
        { pattern: /(?<!<em[^>]*>)\*([^*]+)\*/g, tag: 'em', class: 'ai-italic', callback: true },      // *italic* (but not already formatted italic speech)
        { pattern: /(?<=\s|^)"([^"<>]+)"(?=\s|$|\.|,|!|\?)/g, tag: 'strong', class: 'ai-speech', preserveQuotes: true, callback: true }  // "speech" (quotes without HTML inside)
    ];
    
    // Function to extract clean text content from an element
    function getCleanTextContent(element) {
        if (!element) return '';
        
        // If the element has HTML content, extract just the text
        if (element.innerHTML !== element.textContent) {
            // Create a temporary element to extract clean text
            const temp = document.createElement('div');
            temp.innerHTML = element.innerHTML;
            let cleanText = temp.textContent || temp.innerText || '';
            
            // Only remove malformed ai-* fragments, not properly formatted HTML
            // This preserves <em class="ai-italic-speech">text</em> but removes ai-italic">text
            cleanText = cleanText.replace(/ai-[^>"]*[>"]/g, '');
            cleanText = cleanText.replace(/ai-[^>"]*$/g, '');
            
            return cleanText;
        }
        
        return element.textContent || '';
    }
    
    // Function to clean text BEFORE formatting (preserves legitimate quotes)
    function cleanTextBeforeFormatting(text) {
        if (!text) return '';
        
        // Remove ONLY malformed ai-* fragments that are not part of proper HTML tags
        // This preserves <em class="ai-italic-speech">text</em> but removes ai-italic">text
        
        // Remove malformed fragments that start with ai-* and end with > or "
        text = text.replace(/ai-[^>"]*[>"]/g, '');
        text = text.replace(/ai-[^>"]*$/g, ''); // Catch ai-* at end of string
        
        // Remove orphaned > characters that might be left behind
        text = text.replace(/>\s*([a-zA-Z])/g, '$1'); // Remove > followed by whitespace and a letter
        text = text.replace(/>([a-zA-Z])/g, '$1'); // Remove > directly followed by a letter
        text = text.replace(/^>\s*/, ''); // Remove > at start of text
        text = text.replace(/\s*>$/, ''); // Remove > at end of text
        text = text.replace(/\s*>\s*/g, ' '); // Remove > surrounded by whitespace
        
        // Clean up repeated quotes that aren't actual speech
        text = text.replace(/"{3,}/g, '"');  // Replace 3+ quotes with single quote
        text = text.replace(/\.{3,}/g, '...');  // Replace 3+ dots with ...
        
        return text.trim();
    }
    
    // Function to validate speech content (filters out empty or repeated quotes)
    function isValidSpeech(content) {
        if (!content || content.length < 2) return false;
        
        // Filter out content that's just repeated characters
        const uniqueChars = new Set(content);
        if (uniqueChars.size < 3 && content.length > 5) return false;
        
        // Filter out content that's mostly punctuation
        const wordCount = content.split(/\s+/).filter(word => word.length > 0).length;
        if (wordCount === 0) return false;
        
        return true;
    }
    
    // Custom function to handle *"text" pattern more reliably
    function processItalicSpeech(text) {
        // Look for *"text" patterns and replace them with italic speech formatting
        // This avoids the negative lookahead issue
        
        if (debugFormatting) console.log('AI Dungeon Tweaks: processItalicSpeech called with:', text);
        
        // First, check if there's already italic speech HTML in the text
        // If so, preserve it and don't re-process
        if (text.includes('<em class="ai-italic-speech"')) {
            if (debugFormatting) console.log('AI Dungeon Tweaks: Text already contains italic speech HTML, preserving existing formatting');
            return text;
        }
        
        // Also check if the text contains the original italic speech pattern
        // This preserves formatting even when HTML is removed during editing
        if (text.includes('*"') && text.includes('"*')) {
            if (debugFormatting) console.log('AI Dungeon Tweaks: Text contains original italic speech pattern, preserving formatting');
            // Don't return here - we need to process the italic speech to convert it to HTML
        }
        
        // Handle both *"text" and *"text"* patterns as italic speech
        let result = text.replace(/\*"([^"]+)"\*/g, (fullMatch, content) => {
            // This is *"text"* - format as italic speech (remove the asterisks but PRESERVE surrounding quotes)
            const boldClass = settings.monologueBold ? ' ai-italic-speech-bold' : '';
            const style = settings.monologueColor !== 'inherit' ? ` style="color: ${settings.monologueColor};"` : '';
            if (debugFormatting) console.log('AI Dungeon Tweaks: Formatting *"text"* as italic speech:', fullMatch, '->', `"<em class="ai-italic-speech${boldClass}"${style}>${content}</em>"`);
            addMonologue(content);
            return `"<em class=\"ai-italic-speech${boldClass}\"${style}>${content}</em>"`;
        });
        
        // Then handle *"text" patterns (without trailing asterisk)
        result = result.replace(/\*"([^"]+)"/g, (fullMatch, content) => {
            // This is *"text" without trailing * - format as italic speech (remove the asterisk but PRESERVE quotes)
            const boldClass = settings.monologueBold ? ' ai-italic-speech-bold' : '';
            const style = settings.monologueColor !== 'inherit' ? ` style="color: ${settings.monologueColor};"` : '';
            if (debugFormatting) console.log('AI Dungeon Tweaks: Formatting as italic speech:', fullMatch, '->', `"<em class="ai-italic-speech${boldClass}"${style}>${content}</em>"`);
            addMonologue(content);
            return `"<em class=\"ai-italic-speech${boldClass}\"${style}>${content}</em>"`;
        });
        
        // Also handle incomplete patterns like *"text" (without closing quote)
        const result2 = result.replace(/\*"([^"]*)$/g, (fullMatch, content) => {
            if (debugFormatting) console.log('AI Dungeon Tweaks: Found incomplete pattern:', fullMatch);
            const boldClass = settings.monologueBold ? ' ai-italic-speech-bold' : '';
            const style = settings.monologueColor !== 'inherit' ? ` style="color: ${settings.monologueColor};"` : '';
            addMonologue(content);
            return `"<em class=\"ai-italic-speech${boldClass}\"${style}>${content}</em>`; // preserve opening quote
        });
        
        if (debugFormatting) console.log('AI Dungeon Tweaks: processItalicSpeech result:', result2);
        return result2;
    }

    // Handle unclosed simple italics started with a single * and no closing *
    function processUnclosedSimpleItalics(text) {
        try {
            if (!text || text.includes('<em class="ai-italic"')) return text;
            const totalStars = (text.match(/\*/g) || []).length;
            const pairCount = (text.match(/\*[^*]+\*/g) || []).length; // each is one pair
            const leftover = totalStars - pairCount * 2;
            if (leftover % 2 === 1) {
                const lastStar = text.lastIndexOf('*');
                if (lastStar >= 0 && text[lastStar + 1] !== '"') {
                    const before = text.slice(0, lastStar);
                    const after = text.slice(lastStar + 1);
                    return before + `<em class="ai-italic">` + after + `</em>`;
                }
            }
        } catch (_) {}
        return text;
    }
    
    // Function to format text with all patterns
    function formatText(element) {
        if (!element || !element.textContent) return;
        // Restrict formatting to action text container when present (preserve icon and row wrappers)
        const iconEl = element.querySelector && element.querySelector('#action-icon');
        const actionTextEl = element.querySelector && (element.querySelector('#action-text') || element.querySelector('span.font_gameplay, p.font_gameplay, div.font_gameplay'));
        const isActionRow = !!(iconEl && actionTextEl);
        const targetNode = isActionRow ? actionTextEl : element;
        
        // Check if this element already has our formatting to avoid double-processing
        // Preserve existing valid HTML; do NOT strip based on 'ai-' in innerHTML
        if (targetNode.querySelector && targetNode.querySelector('.ai-italic, .ai-bold, .ai-strikethrough, .ai-inline-code, .ai-highlight, .ai-speech')) {
            // Check if this element already has italic speech formatting
            if (targetNode.querySelector('.ai-italic-speech')) {
                if (debugFormatting) console.log('AI Dungeon Tweaks: Element already has italic speech formatting, allowing reformatting to preserve it');
                // Don't skip - we need to preserve the italic speech formatting
            }
            // Check if this element already has any speech formatting
            if (targetNode.querySelector('.ai-speech')) {
                if (debugFormatting) console.log('AI Dungeon Tweaks: Element already has speech formatting, allowing reformatting');
                // Don't skip - we need to preserve the speech formatting
            }
            // Don't return - allow reformatting to preserve existing formatting
        }
        
        // Check if this element already has proper formatting to avoid double-processing
        // But allow reformatting if the content has changed
        if (targetNode.querySelector && targetNode.querySelector('.ai-italic, .ai-bold, .ai-strikethrough, .ai-inline-code, .ai-highlight, .ai-speech')) {
            // Check if this element already has italic speech formatting
            if (targetNode.querySelector('.ai-italic-speech')) {
                if (debugFormatting) console.log('AI Dungeon Tweaks: Element already has italic speech formatting, preserving it during reformatting');
                
                // Don't clear the formatting - we want to preserve the italic speech
                // Just continue with the current text content
            } else {
                // Element has other formatting but not italic speech - allow reformatting without clearing HTML
                if (debugFormatting) console.log('AI Dungeon Tweaks: Element already has other formatting, allowing reformatting');
            }
        }
        
        // Prefer clean text; for action rows, operate only on the action text container
        const systemPrefix = isActionRow || (element.textContent || '').trim().startsWith('w_comment') || (element.textContent || '').trim().startsWith('w_run') || (element.textContent || '').includes('You say') || (element.textContent || '').includes('You do');
        let text = getCleanTextContent(targetNode);
        
        // Clean text before formatting to remove malformed fragments (only in text mode)
        if (!systemPrefix) {
            text = cleanTextBeforeFormatting(text);
        }
        
        // Store the original text content ONLY if we haven't seen this element before
        if (!originalTexts.has(targetNode)) {
            originalTexts.set(targetNode, text);
            console.log('AI Dungeon Tweaks: Storing original text for element:', text);
        }
        
        // Get the stored original text (the very first version with *"text"* patterns)
        const originalText = originalTexts.get(targetNode);
        if (debugFormatting) console.log('AI Dungeon Tweaks: Processing text for italic speech:', text);
        if (debugFormatting) console.log('AI Dungeon Tweaks: Looking for *"text" pattern...');
        if (debugFormatting) console.log('AI Dungeon Tweaks: Text contains *" pattern:', text.includes('*"'));
        if (debugFormatting) console.log('AI Dungeon Tweaks: Using stored original text for comparison:', originalText);
        
        // Check if this element already has italic speech formatting that we should preserve
        const existingItalicSpeech = targetNode.querySelector && targetNode.querySelector('.ai-italic-speech');
        let hasChanges = false;
        
        if (existingItalicSpeech) {
            // Element already has italic speech formatting, preserve it
            if (debugFormatting) console.log('AI Dungeon Tweaks: Element already has italic speech formatting, preserving existing formatting');
            
            // Get the existing italic speech HTML and preserve it in the text
            const italicSpeechHTML = existingItalicSpeech.outerHTML;
            const italicSpeechText = existingItalicSpeech.textContent;
            
            // Replace the italic speech text with the HTML in the current text
            if (text.includes(italicSpeechText)) {
                text = text.replace(italicSpeechText, italicSpeechHTML);
                hasChanges = true;
                if (debugFormatting) console.log('AI Dungeon Tweaks: Preserved existing italic speech HTML:', italicSpeechHTML);
            }
            
            // Don't set hasItalicSpeech to true when preserving existing formatting
            // This allows speech formatting to continue for the remaining text
        } else if (!systemPrefix && text.includes('*"')) {
            // Process new italic speech patterns unless temporarily suppressed during edit
            if (suppressItalicDuringEdit) {
                console.log('AI Dungeon Tweaks: Suppressing italic speech processing during edit');
            } else {
                text = processItalicSpeech(text);
                hasChanges = true;
                console.log('AI Dungeon Tweaks: Italic speech processed, result:', text);
            }
        } else {
            console.log('AI Dungeon Tweaks: No italic speech patterns found');
        }

        // Preserve existing normal italics (<em class="ai-italic">) that were already applied
        const existingNormalItalics = targetNode.querySelectorAll && targetNode.querySelectorAll('em.ai-italic');
        if (existingNormalItalics && existingNormalItalics.length > 0) {
            existingNormalItalics.forEach((el) => {
                const html = el.outerHTML;
                const txt = el.textContent || '';
                if (txt && text.includes(txt)) {
                    text = text.replace(txt, html);
                    hasChanges = true;
                }
            });
        }
        
        // If italic speech was processed or already exists, we need to preserve the HTML and not clean it again
        // But we only set hasItalicSpeech to true if we actually processed new italic speech patterns
        // This allows speech formatting to continue for the remaining text
        const hasItalicSpeech = false; // Always allow speech formatting to continue
        
        // Note: We no longer track processed italic speech to prevent reformatting
        // This allows users to edit their messages and have them reformatted
        

        
        // Before applying general patterns, auto-fix unclosed simple italics like "*text..." (no closing *)
        text = processUnclosedSimpleItalics(text);

        // Apply all formatting patterns (but skip speech if italic speech was already processed)
        for (const { pattern, tag, class: className, preserveQuotes, callback } of FORMATTING_PATTERNS) {
            if (pattern.test(text)) {
                console.log('AI Dungeon Tweaks: Pattern matched:', pattern, 'for class:', className);
                
                let replacement;
                
                // Special handling for speech quotes
                if (className === 'ai-speech') {
                    // Always format speech for structure and color; bold is handled by tag/class choice
                    
                    // Note: We no longer skip speech formatting when italic speech is present
                    // This allows speech formatting to continue for the remaining text
                    
                    // If we're preserving existing italic speech HTML, completely skip speech formatting
                    // to prevent corruption of the HTML structure
                    if (existingItalicSpeech) {
                        console.log('AI Dungeon Tweaks: Element contains italic speech HTML; proceeding with speech formatting for other quotes');
                        // Do NOT continue; allow speech quotes elsewhere in the element to be formatted
                    }
                    

                    
                    // Note: HTML tag checking is now handled by the CRITICAL check above
                    // This prevents any HTML corruption
                    
                    // Note: HTML-like content checking is now handled by the CRITICAL check above
                    // This prevents any HTML corruption
                    
                    // For speech patterns with callback, check if this quote is preceded by an asterisk
                    if (callback) {
                        const matches = text.match(pattern);
                        if (matches) {
                            const matchIndex = text.indexOf(matches[0]);
                            if (matchIndex > 0 && text[matchIndex - 1] === '*') {
                                console.log('AI Dungeon Tweaks: Skipping speech formatting - quote preceded by asterisk (italic speech)');
                                continue;
                            }
                            
                            // Check if this quote is inside HTML tags
                            const beforeQuote = text.substring(0, matchIndex);
                            const lastOpenTag = beforeQuote.lastIndexOf('<');
                            const lastCloseTag = beforeQuote.lastIndexOf('>');
                            
                            // If the last < is after the last >, we're inside a tag
                            if (lastOpenTag > lastCloseTag) {
                                console.log('AI Dungeon Tweaks: Skipping speech formatting - quote is inside HTML tag');
                                continue;
                            }
                        }
                    }
                    

                    
                    // Additional check: if this quote content matches any italic speech that was just processed, skip it
                    const speechMatches = text.match(pattern);
                    if (speechMatches && speechMatches[1]) {
                        const quoteContent = speechMatches[1];
                        // If this quote content is known monologue, skip converting to ai-speech
                        if (isMonologue(quoteContent)) {
                            console.log('AI Dungeon Tweaks: Skipping speech formatting - content is known italic monologue');
                            continue;
                        }
                        
                        // Skip formatting if this quote content is part of HTML attributes
                        // This prevents corruption of HTML structure
                        if (quoteContent.includes('=') || quoteContent.includes('style') || quoteContent.includes('class') || 
                            quoteContent.includes('ai-italic-speech') || quoteContent.includes('color:') || 
                            quoteContent.includes('feca57') || quoteContent.includes('45b7d1')) {
                            if (debugFormatting) console.log('AI Dungeon Tweaks: Skipping speech formatting - quote content appears to be HTML attribute or styling:', quoteContent);
                            continue;
                        }
                        // Check if this quote content was just formatted as italic speech
                        if (text.includes(`<em class="ai-italic-speech">${quoteContent}</em>`)) {
                            console.log('AI Dungeon Tweaks: Skipping speech formatting - quote content already formatted as italic speech');
                            continue;
                        }
                        
                        // Also check if this quote content is part of italic speech that was preserved
                        // We need to extract the actual text content from italic speech HTML to compare
                        const italicSpeechElements = text.match(/<em class="ai-italic-speech"[^>]*>([^<]+)<\/em>/g);
                        if (italicSpeechElements) {
                            for (const italicElement of italicSpeechElements) {
                                const italicText = italicElement.replace(/<em class="ai-italic-speech"[^>]*>([^<]+)<\/em>/, '$1');
                                if (italicText === quoteContent) {
                                    console.log('AI Dungeon Tweaks: Skipping speech formatting - quote content is part of preserved italic speech');
                                    continue;
                                }
                            }
                        }
                        
                        // Also check if this quote content was in the original text as *"text"* pattern
                        console.log('AI Dungeon Tweaks: Checking if quote content was originally italic speech:', quoteContent);
                        console.log('AI Dungeon Tweaks: Original text contains *"${quoteContent}"*:', originalText.includes(`*"${quoteContent}"*`));
                        console.log('AI Dungeon Tweaks: Original text contains *"${quoteContent}":', originalText.includes(`*"${quoteContent}"`));
                        console.log('AI Dungeon Tweaks: Original text for comparison:', originalText);
                        
                        // Also check if the element already contains italic speech formatting for this quote
                        const elementHTML = targetNode.innerHTML || '';
                        if (elementHTML.includes(`<em class="ai-italic-speech">${quoteContent}</em>`)) {
                            console.log('AI Dungeon Tweaks: Skipping speech formatting - quote content already formatted as italic speech');
                            continue;
                        }
                        
                        if (originalText.includes(`*"${quoteContent}"*`) || originalText.includes(`*"${quoteContent}"`)) {
                            console.log('AI Dungeon Tweaks: Skipping speech formatting - quote content was originally italic speech pattern');
                            continue;
                        }
                    }
                    
                    // Validate that this is actually speech content
                    const matches = text.match(pattern);
                    if (matches && matches[1]) {
                        if (!isValidSpeech(matches[1])) {
                            continue; // Skip invalid speech content
                        }
                    }
                    
                    // Build replacement dynamically per match so we can consult the monologue set
                    const style = settings.speechColor !== 'inherit' ? ` style="color: ${settings.speechColor};"` : '';
                    const monoStyle = settings.monologueColor !== 'inherit' ? ` style="color: ${settings.monologueColor};"` : '';
                    const replacer = (full, inner) => {
                        // If this quote content is a known monologue, restore italic monologue with preserved quotes (respect bold toggle)
                        if (isMonologue(inner)) {
                            console.log('AI Dungeon Tweaks: Restoring italic monologue from saved set:', inner);
                            const monoBoldClass = settings.monologueBold ? ' ai-italic-speech-bold' : '';
                            return `"<em class=\"ai-italic-speech${monoBoldClass}\"${monoStyle}>${inner}</em>"`;
                        }
                        // Choose tag/class for speech based on speechBold toggle; always preserve color
                        const tagName = settings.speechBold ? 'strong' : 'span';
                        const speechBoldClass = settings.speechBold ? ' ai-speech-bold' : '';
                        return preserveQuotes
                            ? `"<${tagName} class=\"${className}${speechBoldClass}\"${style}>${inner}</${tagName}>"`
                            : `<${tagName} class=\"${className}${speechBoldClass}\">${inner}</${tagName}>`;
                    };
                    replacement = replacer;
                } else {
                    // For action rows we now safely format within the action text container (targetNode),
                    // so do not skip non-speech formatting in that case
                    if (!isActionRow && systemPrefix) {
                        // Preserve structure for any non-action special rows
                        continue;
                    }
                    // Allow normal italics even if italic speech HTML exists; asterisk-quote cases are already excluded above
                    
                    // For italic patterns with callback, check if this is quoted text
                    if (className === 'ai-italic' && callback) {
                        const matches = text.match(pattern);
                        if (matches) {
                            const matchIndex = text.indexOf(matches[0]);
                            // Check if this asterisk is followed by a quote
                            if (matchIndex >= 0 && text[matchIndex + 1] === '"') {
                                console.log('AI Dungeon Tweaks: Skipping italic formatting - asterisk followed by quote (italic speech)');
                                continue;
                            }
                        }
                    }
                    
                    if (preserveQuotes) {
                        // Preserve quotes around the formatted text
                        replacement = `"<${tag} class="${className}">$1</${tag}>"`;
                    } else {
                        replacement = `<${tag} class="${className}">$1</${tag}>`;
                    }
                }
                
                console.log('AI Dungeon Tweaks: Applying replacement:', replacement);
                text = text.replace(pattern, replacement);
                hasChanges = true;
            }
        }
        
        // Helper to apply Say/Do styles to row icon
        function applyActionIconStyles(targetElement) {
            try {
                const icon = targetElement.querySelector && targetElement.querySelector('#action-icon');
                if (!icon) return;
                const iconText = (icon.textContent || '').trim();
                let useColor = 'inherit';
                let useBold = false;
                if (iconText === 'w_comment') {
                    useColor = settings.sayColor;
                    useBold = !!settings.sayBold;
                } else if (iconText === 'w_run') {
                    useColor = settings.doColor;
                    useBold = !!settings.doBold;
                }
                // Apply to icon (color only; do NOT set font-weight to avoid breaking the icon font mapping)
                if (useColor !== 'inherit') icon.style.color = useColor; else icon.style.removeProperty('color');

                // Apply to the row text spans (not overriding ai-speech/italic which have inline styles)
                const textSpans = targetElement.querySelectorAll('span.font_gameplay, p.font_gameplay, div.font_gameplay');
                textSpans.forEach(node => {
                    if (useColor !== 'inherit') node.style.color = useColor; else node.style.removeProperty('color');
                    if (useBold) node.style.fontWeight = 'bold'; else node.style.removeProperty('font-weight');
                });
            } catch (_) {}
        }

        // Compact excessive blank lines to reduce paragraph gaps
        // Preserve original blank lines to match site spacing exactly

        // Only update if the content actually changed
        if (hasChanges) {
            if (debugFormatting) console.log('AI Dungeon Tweaks: Final formatted text:', text);
            targetNode.innerHTML = text;
            // Apply Say/Do styles after update
            applyActionIconStyles(element);
        }
        // Ensure action styles applied even when no text change
        applyActionIconStyles(element);
    }
    
    // Function to find and format all target elements
    function formatAllTargetElements() {
        const elements = document.querySelectorAll(TARGET_SELECTOR);
        if (debugObserver) console.log('AI Dungeon Tweaks: Found', elements.length, 'target elements to process');
        
        if (elements.length > 0) {
            if (debugObserver) console.log('AI Dungeon Tweaks: Processing', elements.length, 'elements');
            elements.forEach((element, index) => {
                if (debugObserver) console.log('AI Dungeon Tweaks: Processing element', index + 1, 'with text:', element.textContent?.substring(0, 100) + '...');
                formatText(element);
            });
            // Ensure visual styles (main text, say/do) are reapplied after formatting
            try { updateColorsOnly(); } catch (_) {}
        } else {
            console.log('AI Dungeon Tweaks: No target elements found with selector:', TARGET_SELECTOR);
        }
    }
    
    // Function to clean up any existing malformed fragments in the DOM
    function cleanupExistingArtifacts() {
        const elements = document.querySelectorAll(TARGET_SELECTOR);
        elements.forEach(element => {
            // Only clean when visible text contains stray ai-* fragments (not valid HTML attributes)
            if (element.textContent && element.textContent.includes('ai-')) {
                const cleanText = cleanTextBeforeFormatting(element.textContent);
                if (cleanText !== element.textContent) {
                    element.innerHTML = '';
                    element.textContent = cleanText;
                }
            }
        });
        
        // Also check for any text nodes that might contain malformed fragments
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );
        
        let textNode;
        while (textNode = walker.nextNode()) {
            if (textNode.textContent && textNode.textContent.includes('ai-')) {
                const cleanText = cleanTextBeforeFormatting(textNode.textContent);
                if (cleanText !== textNode.textContent) {
                    textNode.textContent = cleanText;
                }
            }
        }
        
        // Additional aggressive cleanup: look for any remaining ai-* fragments lazily
        const runDeepCleanup = () => {
            const allText = document.body.innerText || document.body.textContent || '';
            if (!allText.includes('ai-')) return;
            const walker = document.createTreeWalker(
                document.body,
                NodeFilter.SHOW_TEXT,
                null,
                false
            );
            let node;
            while (node = walker.nextNode()) {
                if (node.textContent && node.textContent.includes('ai-')) {
                    const cleanText = cleanTextBeforeFormatting(node.textContent);
                    if (cleanText !== node.textContent) {
                        node.textContent = cleanText;
                    }
                }
            }
        };
        try {
            if (typeof requestIdleCallback === 'function') {
                requestIdleCallback(() => runDeepCleanup());
            } else {
                setTimeout(runDeepCleanup, 0);
            }
        } catch (_) { setTimeout(runDeepCleanup, 0); }
    }
    
    // Function to clean up any malformed fragments in the entire document (deferred)
    function cleanupDocumentArtifacts() {
        const run = () => {
            const allElements = document.querySelectorAll('*');
            allElements.forEach(element => {
                if (element.childNodes.length === 1 && element.childNodes[0].nodeType === Node.TEXT_NODE) {
                    const textContent = element.childNodes[0].textContent;
                    if (textContent && textContent.includes('ai-')) {
                        const cleanText = cleanTextBeforeFormatting(textContent);
                        if (cleanText !== textContent) {
                            element.childNodes[0].textContent = cleanText;
                        }
                    }
                }
            });
        };
        try {
            if (typeof requestIdleCallback === 'function') {
                requestIdleCallback(() => run());
            } else {
                setTimeout(run, 0);
            }
        } catch (_) { setTimeout(run, 0); }
    }
    
    // Function to observe DOM changes
    function setupObserver() {
        // Create a MutationObserver to watch for changes
        let pending = false;
        let wantFormat = false;
        let wantCleanup = false;
        const flush = () => {
            try {
                if (wantCleanup) {
                    setTimeout(cleanupExistingArtifacts, 50);
                }
                if (wantFormat) {
                    setTimeout(formatAllTargetElements, 100);
                }
            } finally {
                pending = false; wantFormat = false; wantCleanup = false;
            }
        };
        const observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                // Check if any of the target elements were added or modified
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach(function(node) {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if (node.matches && node.matches(TARGET_SELECTOR)) {
                                wantFormat = true;
                            } else if (node.querySelector && node.querySelector(TARGET_SELECTOR)) {
                                wantFormat = true;
                            }
                        } else if (node.nodeType === Node.TEXT_NODE && node.textContent && node.textContent.includes('ai-')) {
                            // Immediately clean up any text node containing ai-* fragments
                            wantCleanup = true;
                            const cleanText = cleanTextBeforeFormatting(node.textContent);
                            if (cleanText !== node.textContent) {
                                node.textContent = cleanText;
                            }
                        }
                    });
                } else if (mutation.type === 'characterData') {
                    // Check if the mutation is within a target element
                    let parent = mutation.target.parentNode;
                    while (parent && parent !== document) {
                        if (parent.matches && parent.matches(TARGET_SELECTOR)) {
                            wantFormat = true;
                            break;
                        }
                        parent = parent.parentNode;
                    }
                    
                    // Also check if the mutation itself contains ai-* fragments
                    if (mutation.target.textContent && mutation.target.textContent.includes('ai-')) {
                        wantCleanup = true;
                        const cleanText = cleanTextBeforeFormatting(mutation.target.textContent);
                        if (cleanText !== mutation.target.textContent) {
                            mutation.target.textContent = cleanText;
                        }
                    }
                }
            });
            if (!pending && (wantFormat || wantCleanup)) { pending = true; queueMicrotask(flush); }
        });
        
        // Start observing - prefer scoping to gameplay output if present
        const preferred = document.getElementById('gameplay-output');
        if (preferred) {
            observer.observe(preferred, { childList: true, subtree: true, characterData: true });
        } else {
            const targetElements = document.querySelectorAll(TARGET_SELECTOR);
            targetElements.forEach(element => {
                observer.observe(element, { childList: true, subtree: true, characterData: true });
            });
        }
        
        // Guardrails: disconnect on unload/navigation
        try {
            window.addEventListener('pagehide', () => { try { observer.disconnect(); } catch(_) {} }, { once: true });
            window.addEventListener('beforeunload', () => { try { observer.disconnect(); } catch(_) {} }, { once: true });
            document.addEventListener('visibilitychange', () => {
                try {
                    if (document.visibilityState === 'hidden') { observer.disconnect(); }
                } catch(_) {}
            });
        } catch(_) {}

        return observer;
    }
    
    // Function to set up button click listeners for AI Dungeon buttons
    function setupButtonListeners() {
        // Function to find and add listeners to AI Dungeon buttons
        function addButtonListeners() {
            const container = document.getElementById('gameplay-output') || document.body;
            if (container.getAttribute('data-ai-delegated')) return;
            container.setAttribute('data-ai-delegated','1');
            const handle = (label) => {
                if (!label) return false;
                if (label.includes('continue') || label.includes('retry') || label.includes('generate') || label.includes('submit') || label.includes('send') || label.includes('edit') || label.includes('erase')) {
                    if (debugObserver) console.log('AI Dungeon Tweaks: AI Dungeon button clicked, waiting for new content...');
                    if (label.includes('edit')) {
                        suppressItalicDuringEdit = true;
                        waitForEditCompletion();
                    } else if (label.includes('erase')) {
                        waitForEraseCompletion();
                    } else {
                        waitForNewContent();
                    }
                    return true;
                }
                return false;
            };
            container.addEventListener('click', (ev) => {
                const target = ev.target;
                if (!target) return;
                const el = target.closest('button, [role="button"], .btn, .button, div.is_Button, .is_Button');
                if (!el) return;
                const label = (el.getAttribute('aria-label') || el.textContent || '').toLowerCase();
                handle(label);
            }, true);
            // Some send buttons are inputs/forms; catch submit too
            container.addEventListener('submit', (ev) => {
                try {
                    const form = ev.target;
                    const btn = form.querySelector('button[type="submit"], input[type="submit"]');
                    const label = (btn?.getAttribute('aria-label') || btn?.value || btn?.textContent || '').toLowerCase() || 'submit';
                    if (handle(label)) {
                        // let it submit; formatting watcher will pick up content
                    }
                } catch (_) {}
            }, true);
        }
        
        // Also try to find the specific button paths mentioned by the user
        function findSpecificButtons() {
            // Array of specific button paths to watch
            const buttonPaths = [
                '/html/body/div[1]/div/div/span/span/div[2]/div[1]/div[2]/div/div/span/div/div/div/div/div[5]/div/div/div[2]/div/div/div/div/div/span[3]', // Continue button
                '/html/body/div[1]/div/div/span/span/div[2]/div[1]/div[3]/div/div[1]/span[2]/div', // Send button for manual messages
                '/html/body/div[3]/div/div[1]/span[1]/div', // Edit button
                // Additional path reported by user for Continue
                '/html/body/div[1]/div/div/span/span/div[2]/div[1]/div[2]/div/div/span/div/div/div/div/div[5]/div/div/div[2]/div/div/div/div/div/span[2]/div',
                // Additional path reported by user for Retry
                '/html/body/div[1]/div/div/span/span/div[2]/div[1]/div[2]/div/div/span/div/div/div/div/div[5]/div/div/div[2]/div/div/div/div/div/span[3]/div/div[1]',
                // Additional path reported by user for Erase
                '/html/body/div[1]/div/div/span/span/div[2]/div[1]/div[2]/div/div/span/div/div/div/div/div[5]/div/div/div[2]/div/div/div/div/div/span[4]/div'
            ];
            
            buttonPaths.forEach((buttonPath, index) => {
                try {
                    const pathParts = buttonPath.split('/').filter(part => part !== 'html' && part !== 'body' && part.trim() !== '');
                    
                    let currentElement = document.body;
                    for (const part of pathParts) {
                        if (part.includes('[') && part.includes(']')) {
                            // Handle indexed elements like div[1]
                            const tagName = part.split('[')[0];
                            const index = parseInt(part.split('[')[1].split(']')[0]) - 1;
                            const elements = currentElement.querySelectorAll(tagName);
                            if (elements[index]) {
                                currentElement = elements[index];
                            } else {
                                break;
                            }
                        } else {
                            // Handle regular tag names
                            const element = currentElement.querySelector(part);
                            if (element) {
                                currentElement = element;
                            } else {
                                break;
                            }
                        }
                    }
                    
                    // If we found the element and it's clickable, add a listener
                    if (currentElement && currentElement !== document.body) {
                        if (currentElement.hasAttribute('data-ai-formatter-listener')) {
                            return; // Already has listener
                        }
                        
                        currentElement.addEventListener('click', function() {
                            let buttonType;
                            if (index === 0 || index === 3) buttonType = 'Continue';
                            else if (index === 1) buttonType = 'Send';
                            else if (index === 4) buttonType = 'Retry';
                            else if (index === 5) buttonType = 'Erase';
                            else buttonType = 'Edit';
                            
                            console.log(`AI Dungeon Tweaks: ${buttonType} button clicked, waiting for new content...`);
                            
                            if (buttonType === 'Edit') {
                                // For edit button, wait for editing to finish and then reformat
                                suppressItalicDuringEdit = true;
                                waitForEditCompletion();
                            } else if (buttonType === 'Erase') {
                                // For erase, wait for a decrease in content and reformat quickly
                                waitForEraseCompletion();
                            } else {
                                // Wait for new content to appear instead of using a fixed timeout
                                waitForNewContent();
                            }
                        });
                        
                        currentElement.setAttribute('data-ai-formatter-listener', 'true');
                        const buttonType = (index === 0 || index === 3) ? 'Continue' : (index === 1 ? 'Send' : (index === 4 ? 'Retry' : (index === 5 ? 'Erase' : 'Edit')));
                        console.log(`AI Dungeon Tweaks: Added listener to ${buttonType} button path`);
                    }
                } catch (error) {
                    const buttonType = (index === 0 || index === 3) ? 'Continue' : (index === 1 ? 'Send' : (index === 4 ? 'Retry' : (index === 5 ? 'Erase' : 'Edit')));
                    console.log(`AI Dungeon Tweaks: Could not find ${buttonType} button path:`, error);
                }
            });
        }
        
        // Add listeners to existing buttons
        addButtonListeners();
        findSpecificButtons();
        
        // Delegation means we don't need to rescan on every mutation
    }
    
    // Function to wait for editing to complete and then reformat
    function waitForEditCompletion() {
        console.log('AI Dungeon Tweaks: Edit button clicked, waiting for editing to complete...');
        
        // Get current content state
        const currentElements = document.querySelectorAll(TARGET_SELECTOR);
        const currentTexts = Array.from(currentElements).map(el => el.textContent || '');
        
        // Track if formatting has already been run to prevent duplicate runs
        let formattingRun = false;
        let suppressUntilFirstReformat = false;
        
        // Function to check if editing is complete
        function checkEditCompletion() {
            const newElements = document.querySelectorAll(TARGET_SELECTOR);
            const newTexts = Array.from(newElements).map(el => el.textContent || '');
            
            // Check if any text has changed (indicating editing is complete)
            for (let i = 0; i < Math.min(currentTexts.length, newTexts.length); i++) {
                if (currentTexts[i] !== newTexts[i]) {
                    if (!formattingRun) {
                        console.log('AI Dungeon Tweaks: Edit completed, reformatting...');
                        formattingRun = true;
                        // Small delay to ensure content is fully updated
                        setTimeout(() => {
                            formatAllTargetElements();
                            immediateTargetCleanup();
                            // Clear suppression after this post-edit formatting pass
                            suppressItalicDuringEdit = false;
                        }, 200);
                    }
                    return true;
                }
            }
            
            return false;
        }
        
        // Check immediately first
        if (checkEditCompletion()) {
            return;
        }
        
        // Set up monitoring for edit completion
        let checkCount = 0;
        const maxChecks = 40; // Check up to 40 times (20 seconds)
        
        const checkInterval = setInterval(() => {
            checkCount++;
            
            if (checkEditCompletion()) {
                clearInterval(checkInterval);
                return;
            }
            
            if (checkCount >= maxChecks && !formattingRun) {
                console.log('AI Dungeon Tweaks: Edit timeout reached, reformatting anyway...');
                formattingRun = true;
                clearInterval(checkInterval);
                formatAllTargetElements();
                immediateTargetCleanup();
                // Clear suppression even on timeout-triggered reformat
                suppressItalicDuringEdit = false;
            }
        }, 500); // Check every 500ms
    }
    
    // Function to wait for new content to appear after button clicks
    function waitForNewContent() {
        console.log('AI Dungeon Tweaks: Starting to wait for new content...');
        
        // Get current content state
        const currentElements = document.querySelectorAll(TARGET_SELECTOR);
        const currentTexts = Array.from(currentElements).map(el => el.textContent || '');
        const currentCount = currentElements.length;
        
        console.log('AI Dungeon Tweaks: Current state -', currentCount, 'elements, total text length:', currentTexts.reduce((sum, text) => sum + text.length, 0));
        
        // Track if formatting has already been run to prevent duplicate runs
        let formattingRun = false;
        
        // Function to check if new content has appeared
        function checkForNewContent() {
            const newElements = document.querySelectorAll(TARGET_SELECTOR);
            const newTexts = Array.from(newElements).map(el => el.textContent || '');
            const newCount = newElements.length;
            const newTotalLength = newTexts.reduce((sum, text) => sum + text.length, 0);
            const oldTotalLength = currentTexts.reduce((sum, text) => sum + text.length, 0);
            
            console.log('AI Dungeon Tweaks: Checking for new content -', newCount, 'elements, total text length:', newTotalLength);
            
            // Check if we have more elements or significantly more text
            if (newCount > currentCount || newTotalLength > oldTotalLength + 100) {
                if (!formattingRun) {
                    console.log('AI Dungeon Tweaks: New content detected! Running formatting...');
                    formattingRun = true;
                    // Small delay to ensure content is fully rendered
                    setTimeout(() => {
                        // Clear any temporary edit suppression on first reformat
                        suppressItalicDuringEdit = false;
                        formatAllTargetElements();
                        immediateTargetCleanup();
                    }, 200);
                }
                return true;
            }
            
            return false;
        }
        
        // Check immediately first
        if (checkForNewContent()) {
            return;
        }
        
        // Set up a more aggressive check for the first few seconds
        let checkCount = 0;
        const maxChecks = 20; // Check up to 20 times (10 seconds)
        
        const checkInterval = setInterval(() => {
            checkCount++;
            
            if (checkForNewContent()) {
                clearInterval(checkInterval);
                return;
            }
            
            if (checkCount >= maxChecks && !formattingRun) {
                if (debugObserver) console.log('AI Dungeon Tweaks: Timeout reached, running formatting anyway...');
                formattingRun = true;
                clearInterval(checkInterval);
                formatAllTargetElements();
                immediateTargetCleanup();
            }
        }, 500); // Check every 500ms
    }

    // Function to wait for content removal (Erase) and then reformat quickly
    function waitForEraseCompletion() {
        if (debugObserver) console.log('AI Dungeon Tweaks: Waiting for erase to complete...');
        const currentElements = document.querySelectorAll(TARGET_SELECTOR);
        const currentTexts = Array.from(currentElements).map(el => el.textContent || '');
        const currentCount = currentElements.length;
        const currentLength = currentTexts.reduce((s, t) => s + t.length, 0);

        let formattingRun = false;

        function checkForErase() {
            const newElements = document.querySelectorAll(TARGET_SELECTOR);
            const newTexts = Array.from(newElements).map(el => el.textContent || '');
            const newCount = newElements.length;
            const newLength = newTexts.reduce((s, t) => s + t.length, 0);

            // Trigger when the count decreases or the total text length drops significantly
            if (newCount < currentCount || newLength < currentLength - 50) {
                if (!formattingRun) {
                    formattingRun = true;
                    setTimeout(() => {
                        formatAllTargetElements();
                        immediateTargetCleanup();
                    }, 50);
                }
                return true;
            }
            return false;
        }

        if (checkForErase()) return;

        let checks = 0;
        const maxChecks = 20;
        const interval = setInterval(() => {
            checks++;
            if (checkForErase()) {
                clearInterval(interval);
                return;
            }
            if (checks >= maxChecks && !formattingRun) {
                // Fallback: format anyway after a short delay
                formattingRun = true;
                clearInterval(interval);
                formatAllTargetElements();
                immediateTargetCleanup();
            }
        }, 100);
    }
    
    // Function to initialize the extension
    function init() {
        // Auto-apply bound profile by scope before initial load
        try {
            if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
                const scope = (function(){ try { return location.hostname + (location.pathname || '/'); } catch(_) { return ''; } })();
                if (scope) {
                    // Persist lastKnownScope so popup can read it even if messaging is blocked by window focus
                    try { browser.storage.local.set({ lastKnownScope: scope }).catch(() => {}); } catch(_) {}
                    browser.storage.local.get(['profiles','profileBindings','activeProfileId']).then((res) => {
                        try {
                            const profiles = res && res.profiles || {};
                            const bindings = res && res.profileBindings || {};
                            const boundId = bindings[scope] || res.activeProfileId || '';
                            const prof = boundId ? profiles[boundId] : null;
                            if (prof && prof.settings) {
                                updateSettings(prof.settings);
                            }
                        } catch(_) {}
                        // Then load settings to ensure storage overrides merged
                        loadSettings();
                    }).catch(() => loadSettings());
                } else {
                    loadSettings();
                }
            } else {
                loadSettings();
            }
        } catch(_) { loadSettings(); }
        
        // Clean up any existing malformed fragments first
        cleanupExistingArtifacts();
        
        // Additional cleanup: scan entire document for any remaining ai-* fragments
        cleanupDocumentArtifacts();
        
        // IMMEDIATE cleanup of target elements
        immediateTargetCleanup();
        
        // Format existing elements
        formatAllTargetElements();
        // Apply visual styles based on loaded settings
        updateColorsOnly();
        
        // Set up observer for future changes
        setupObserver();
        
        // Set up button click listeners for AI Dungeon buttons
        setupButtonListeners();

        // Integrate settings into AI Dungeon's pause/info overlay
        setupPauseMenuIntegration();
        // Removed unused Formatter tab integration
        
        // Retry initial formatting after a delay to catch any elements that weren't ready
        setTimeout(() => {
            console.log('AI Dungeon Tweaks: Retrying initial formatting...');
            formatAllTargetElements();
            updateColorsOnly();
        }, 1000);
        
        // Also retry after 3 seconds to catch any late-loading content
        setTimeout(() => {
            console.log('AI Dungeon Tweaks: Final retry of initial formatting...');
            formatAllTargetElements();
            updateColorsOnly();
        }, 3000);

        // Listen for storage changes so settings apply live (supports local and sync)
        try {
            if (typeof browser !== 'undefined' && browser.storage && browser.storage.onChanged) {
                browser.storage.onChanged.addListener((changes, area) => {
                    if (area === 'local' || area === 'sync') {
                        try {
                            const updated = {};
                            Object.keys(changes || {}).forEach((k) => { if (changes[k] && 'newValue' in changes[k]) updated[k] = changes[k].newValue; });
                            // If a key was removed (undefined), load fresh to restore defaults
                            const hadUndefined = Object.values(changes || {}).some(v => v && !('newValue' in v));
                            if (hadUndefined) { loadSettings(); return; }
                            updateSettings(updated);
                        } catch (_) {
                            loadSettings();
                        }
                    }
                });
            }
        } catch (_) {}
    }
    
    // Function to force re-formatting by clearing existing formatting first
    function forceReformat() {
        const elements = document.querySelectorAll(TARGET_SELECTOR);
        elements.forEach(element => {
            // For action rows, only reset the action text container (preserve icon and wrappers)
            const iconEl = element.querySelector && element.querySelector('#action-icon');
            const actionTextEl = element.querySelector && (element.querySelector('#action-text') || element.querySelector('span.font_gameplay, p.font_gameplay, div.font_gameplay'));
            if (iconEl && actionTextEl) {
                if (actionTextEl.querySelector('.ai-italic, .ai-bold, .ai-strikethrough, .ai-inline-code, .ai-highlight, .ai-speech')) {
                    const cleanText = getCleanTextContent(actionTextEl);
                    const fullyCleanText = cleanTextBeforeFormatting(cleanText);
                    actionTextEl.innerHTML = '';
                    actionTextEl.textContent = fullyCleanText;
                }
                return;
            }

            // Non-action rows: reset as before
            if (element.querySelector('.ai-italic, .ai-bold, .ai-strikethrough, .ai-inline-code, .ai-highlight, .ai-speech')) {
                const cleanText = getCleanTextContent(element);
                const fullyCleanText = cleanTextBeforeFormatting(cleanText);
                element.innerHTML = '';
                element.textContent = fullyCleanText;
            }
        });
        // Now apply new formatting
        formatAllTargetElements();
    }
    
    // Helper: apply background regardless of content availability
    function applyBackgroundFromSettings() {
        try {
            // Prefer the gameplay backdrop container if present
            const bgContainer = (function(){
                try {
                    return document.querySelector('#gameplay-saturate')
                        || document.querySelector('html.t_dark body div.app-root div#__next div.css-175oi2r.r-13awgt0 span span.t_sub_theme.t_core1._dsp_contents.is_Theme')
                        || document.querySelector('#__next');
                } catch(_) { return null; }
            })();

            if (bgContainer) {
                // The ambience image tends to sit above backgrounds; hide it for custom backgrounds
                const ambienceImg = bgContainer.querySelector('img[data-nimg="fill"], img');

                if (settings.bgType === 'solid' && settings.bgColor) {
                    bgContainer.style.backgroundImage = 'none';
                    bgContainer.style.backgroundColor = settings.bgColor;
                    bgContainer.style.backgroundSize = 'cover';
                    bgContainer.style.backgroundPosition = 'center center';
                    bgContainer.style.backgroundRepeat = 'no-repeat';
                    if (ambienceImg) { ambienceImg.style.opacity = '0'; ambienceImg.style.pointerEvents = 'none'; }
                } else if (settings.bgType === 'gradient' && settings.bgGrad) {
                    bgContainer.style.backgroundImage = settings.bgGrad;
                    bgContainer.style.backgroundColor = 'transparent';
                    bgContainer.style.backgroundSize = 'cover';
                    bgContainer.style.backgroundPosition = 'center center';
                    bgContainer.style.backgroundRepeat = 'no-repeat';
                    if (ambienceImg) { ambienceImg.style.opacity = '0'; ambienceImg.style.pointerEvents = 'none'; }
                } else {
                    // Default/inherit: restore page visuals
                    bgContainer.style.removeProperty('background-image');
                    bgContainer.style.removeProperty('background-color');
                    bgContainer.style.removeProperty('background-size');
                    bgContainer.style.removeProperty('background-position');
                    bgContainer.style.removeProperty('background-repeat');
                    if (ambienceImg) { ambienceImg.style.removeProperty('opacity'); ambienceImg.style.removeProperty('pointer-events'); }
                }
            }
        } catch(_) {}
    }

    // Function to update only colors without full reformatting
    function updateColorsOnly() {
        // Always apply page background once, even if no target elements exist yet
        applyBackgroundFromSettings();
        const elements = document.querySelectorAll(TARGET_SELECTOR);
        elements.forEach(element => {
            // Update speech color
            const speechElements = element.querySelectorAll('.ai-speech');
            speechElements.forEach(speechEl => {
                if (settings.speechColor !== 'inherit') {
                    speechEl.style.color = settings.speechColor;
                } else {
                    speechEl.style.removeProperty('color');
                }
                // Toggle bold class and ensure container bold doesn't leak
                if (settings.speechBold) {
                    speechEl.classList.add('ai-speech-bold');
                    speechEl.style.removeProperty('font-weight');
                } else {
                    speechEl.classList.remove('ai-speech-bold');
                    // Guard against inherited bold from mainBold
                    speechEl.style.fontWeight = 'normal';
                }
            });
            
            // Update monologue color and bold
            const monologueElements = element.querySelectorAll('.ai-italic-speech');
            monologueElements.forEach(monologueEl => {
                if (settings.monologueColor !== 'inherit') {
                    monologueEl.style.color = settings.monologueColor;
                } else {
                    monologueEl.style.removeProperty('color');
                }
                // Toggle bold via class on demand
                monologueEl.classList.toggle('ai-italic-speech-bold', !!settings.monologueBold);
                if (!settings.monologueBold) {
                    // Prevent inheritance from container bold
                    monologueEl.style.fontWeight = 'normal';
                } else {
                    monologueEl.style.removeProperty('font-weight');
                }
            });

            // Update Say/Do icon styles
            try {
                const icon = element.querySelector('#action-icon');
                if (icon) {
                    const iconText = (icon.textContent || '').trim();
                    let useColor = 'inherit';
                    let useBold = false;
                    if (iconText === 'w_comment') {
                        useColor = settings.sayColor;
                        useBold = !!settings.sayBold;
                    } else if (iconText === 'w_run') {
                        useColor = settings.doColor;
                        useBold = !!settings.doBold;
                    }
                    if (useColor !== 'inherit') {
                        icon.style.color = useColor;
                    } else {
                        icon.style.removeProperty('color');
                    }
                    // Never set font-weight on the icon to preserve glyph rendering
                    icon.style.removeProperty('font-weight');

                    // Apply to the row text spans (not overriding ai-speech/italic which have inline styles)
                    const row = icon.closest('#transition-opacity') || element;
                    const textSpans = row.querySelectorAll('span.font_gameplay, p.font_gameplay, div.font_gameplay');
                    textSpans.forEach(node => {
                        if (useColor !== 'inherit') node.style.color = useColor; else node.style.removeProperty('color');
                        if (useBold) node.style.fontWeight = 'bold'; else node.style.removeProperty('font-weight');
                    });
                }
            } catch (_) {}

            // Update main (non-action row) text styles
            try {
                const icon = element.querySelector('#action-icon');
                const isActionRow = !!icon;
                if (!isActionRow) {
                    // Load Google Fonts if requested, indicate brief loading state on container
                    if (settings.fontFamily && typeof settings.fontFamily === 'string' && settings.fontFamily.startsWith('g:')) {
                        const fam = settings.fontFamily.slice(2);
                        if (!document.querySelector('link[data-ai-gfont-preconnect]')) {
                            try {
                                const pc = document.createElement('link');
                                pc.rel = 'preconnect';
                                pc.href = 'https://fonts.gstatic.com';
                                pc.crossOrigin = 'anonymous';
                                pc.setAttribute('data-ai-gfont-preconnect','1');
                                document.head.appendChild(pc);
                            } catch(_) {}
                            try {
                                const pc2 = document.createElement('link');
                                pc2.rel = 'preconnect';
                                pc2.href = 'https://fonts.googleapis.com';
                                pc2.setAttribute('data-ai-gfont-preconnect','1');
                                document.head.appendChild(pc2);
                            } catch(_) {}
                        }
                        const cacheKey = 'ai_gfont_loaded_' + fam;
                        let alreadyLoaded = false;
                        try { alreadyLoaded = sessionStorage.getItem(cacheKey) === '1'; } catch(_) {}
                        if (!alreadyLoaded && !document.querySelector(`link[data-ai-gfont="${fam}"]`)) {
                            try { element.setAttribute('aria-busy', 'true'); } catch (_) {}
                            const link = document.createElement('link');
                            link.rel = 'stylesheet';
                            link.setAttribute('data-ai-gfont', fam);
                            link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fam)}:wght@400;500;700&display=swap`;
                            let attempt = 0;
                            const onDone = () => { try { element.removeAttribute('aria-busy'); } catch (_) {} try { sessionStorage.setItem(cacheKey, '1'); } catch(_) {} };
                            const onError = () => {
                                attempt += 1;
                                try { element.removeAttribute('aria-busy'); } catch (_) {}
                                if (attempt <= 3) {
                                    const delay = attempt === 1 ? 300 : attempt === 2 ? 1000 : 3000;
                                    setTimeout(() => { try { document.head.removeChild(link); } catch(_) {} document.head.appendChild(link); try { element.setAttribute('aria-busy','true'); } catch(_) {} }, delay);
                                }
                            };
                            link.addEventListener('load', onDone);
                            link.addEventListener('error', onError);
                            document.head.appendChild(link);
                        }
                    }
                    // Apply color at the container level so newly appended plain text inherits it
                    if (settings.mainColor !== 'inherit') element.style.color = settings.mainColor; else element.style.removeProperty('color');
                    // Apply bold/weight at the container level so appended text inherits, while quotes override below
                    if (settings.mainBold) {
                        element.style.fontWeight = 'bold';
                    } else if (settings.fontWeight) {
                        element.style.fontWeight = String(settings.fontWeight);
                    } else {
                        element.style.removeProperty('font-weight');
                    }
                    // Apply font family
                    if (settings.fontFamily && settings.fontFamily !== 'inherit') {
                        element.style.fontFamily = settings.fontFamily;
                    } else {
                        element.style.removeProperty('font-family');
                    }
                    // Apply font size
                    if (settings.fontSize) {
                        element.style.fontSize = settings.fontSize + 'px';
                    } else {
                        element.style.removeProperty('font-size');
                    }
                    // Apply line height (use numeric value directly, always apply so increases take effect)
                    if (settings.lineHeight !== undefined && settings.lineHeight !== null) {
                        try { element.style.setProperty('line-height', String(Number(settings.lineHeight)), 'important'); } catch (_) { element.style.lineHeight = String(Number(settings.lineHeight)); }
                    }
                    // Apply letter spacing only when user overrides
                    if (settings.letterSpacing !== undefined && settings.letterSpacing !== null) {
                        element.style.letterSpacing = settings.letterSpacing + 'px';
                    } else {
                        element.style.removeProperty('letter-spacing');
                    }
                    // Background customization (container above story text)
                    try {
                        const bgContainer = document.querySelector('html.t_dark body div.app-root div#__next div.css-175oi2r.r-13awgt0 span span.t_sub_theme.t_core1._dsp_contents.is_Theme') || document.querySelector('#__next');
                        if (bgContainer) {
                            if (settings.bgType === 'solid' && settings.bgColor) {
                                bgContainer.style.backgroundImage = 'none';
                                bgContainer.style.backgroundColor = settings.bgColor;
                            } else if (settings.bgType === 'gradient' && settings.bgGrad) {
                                bgContainer.style.backgroundImage = settings.bgGrad;
                                bgContainer.style.backgroundColor = 'transparent';
                            } else {
                                bgContainer.style.removeProperty('background-image');
                                bgContainer.style.removeProperty('background-color');
                            }
                        }
                    } catch(_) {}

                    // Apply ALL-CAPS effects for non-action rows
                    applyCapsEffect(element);
                }
                // Apply typography to story text nodes in both action and non-action rows
                const textNodes = element.querySelectorAll('span.font_heading, p.font_heading, div.font_heading, span.font_gameplay, p.font_gameplay, div.font_gameplay');
                textNodes.forEach(node => {
                    const containsSpeech = node.querySelector && node.querySelector('.ai-speech, .ai-italic-speech');
                    // Normalize paragraph margins to reduce extra gaps; use tighter spacing based on lineHeight
                    // Only override margins when user has set a custom line-height
                    if (settings.lineHeight !== undefined && settings.lineHeight !== null) {
                        const lh = Number(settings.lineHeight);
                        // Scale margins more noticeably as line-height increases
                        const tightMargin = Math.max(0, Math.round((lh - 1) * 14));
                        node.style.marginTop = tightMargin + 'px';
                        node.style.marginBottom = tightMargin + 'px';
                        // Also reflect margin on nearest block wrapper
                        try {
                            const blockWrapper = node.closest('p, div, section, article, li');
                            if (blockWrapper && blockWrapper !== element) {
                                blockWrapper.style.marginTop = tightMargin + 'px';
                                blockWrapper.style.marginBottom = tightMargin + 'px';
                            }
                        } catch (_) {}
                    } else {
                        node.style.removeProperty('margin-top');
                        node.style.removeProperty('margin-bottom');
                    }
                    // Font weight (respect Say/Do bold overrides for action rows)
                    try {
                        const iconInRow = element.querySelector && element.querySelector('#action-icon');
                        let overrideBold = null;
                        if (iconInRow) {
                            const iconText = (iconInRow.textContent || '').trim();
                            if (iconText === 'w_comment') overrideBold = !!settings.sayBold;
                            else if (iconText === 'w_run') overrideBold = !!settings.doBold;
                        }
                        if (overrideBold !== null) {
                            if (overrideBold) node.style.fontWeight = 'bold'; else node.style.removeProperty('font-weight');
                        } else if (settings.mainBold) {
                            node.style.fontWeight = 'bold';
                        } else if (settings.fontWeight !== undefined && settings.fontWeight !== null) {
                            node.style.fontWeight = String(settings.fontWeight);
                        } else {
                            node.style.removeProperty('font-weight');
                        }
                    } catch (_) {
                        if (settings.mainBold) {
                            node.style.fontWeight = 'bold';
                        } else if (settings.fontWeight !== undefined && settings.fontWeight !== null) {
                            node.style.fontWeight = String(settings.fontWeight);
                        } else {
                            node.style.removeProperty('font-weight');
                        }
                    }
                    // Family
                    if (settings.fontFamily && settings.fontFamily !== 'inherit') {
                        node.style.fontFamily = settings.fontFamily;
                    } else {
                        node.style.removeProperty('font-family');
                    }
                    // Size
                    if (settings.fontSize) {
                        node.style.fontSize = settings.fontSize + 'px';
                    } else {
                        node.style.removeProperty('font-size');
                    }
                    // Line height
                    if (settings.lineHeight !== undefined && settings.lineHeight !== null) {
                        const lhVal = String(Number(settings.lineHeight));
                        try { node.style.setProperty('line-height', lhVal, 'important'); } catch (_) { node.style.lineHeight = lhVal; }
                        // Also apply to nearest block wrapper to ensure inline spans affect paragraph spacing
                        try {
                            const blockWrapper = node.closest('p, div, section, article, li');
                            if (blockWrapper && blockWrapper !== element) {
                                try { blockWrapper.style.setProperty('line-height', lhVal, 'important'); } catch (_) { blockWrapper.style.lineHeight = lhVal; }
                            }
                        } catch (_) {}
                    }
                    // Letter spacing
                    if (settings.letterSpacing !== undefined && settings.letterSpacing !== null) {
                        node.style.letterSpacing = settings.letterSpacing + 'px';
                    } else {
                        node.style.removeProperty('letter-spacing');
                    }
                    // Text alignment
                    if (settings.textAlign && settings.textAlign !== 'inherit') {
                        node.style.textAlign = settings.textAlign;
                    } else {
                        node.style.removeProperty('text-align');
                    }
                    // If this node contains speech/monologue, ensure inner elements are not unintentionally upsized
                    if (containsSpeech) {
                        // Guard against inherited bold/size leaking into quotes when user disabled bold
                        node.querySelectorAll('.ai-speech').forEach(el => {
                            if (!settings.speechBold) { try { el.style.fontWeight = 'normal'; } catch (_) {} }
                        });
                        node.querySelectorAll('.ai-italic-speech').forEach(el => {
                            if (!settings.monologueBold) { try { el.style.fontWeight = 'normal'; } catch (_) {} }
                        });
                    }
                });

                // Adjust per-row spacing based on line height so the slider also controls gaps
                try {
                    const minimumRowSpacingPx = 0; // allow fully compact rows
                    const maximumRowSpacingPx = 18; // prevent excessive spacing
                    const baseRowSpacingPx = 6; // baseline spacing around default line-height
                    const lineHeightValue = (settings.lineHeight !== undefined && settings.lineHeight !== null) ? Number(settings.lineHeight) : null;
                    const computedRowSpacingPx = Math.max(
                        minimumRowSpacingPx,
                        Math.min(
                            maximumRowSpacingPx,
                            Math.round(
                                (lineHeightValue === null
                                    ? baseRowSpacingPx // default spacing when no user override
                                    : baseRowSpacingPx + (lineHeightValue - 1.2) * 14)
                            )
                        )
                    );
                    if (lineHeightValue === null) {
                        element.style.removeProperty('margin-top');
                        element.style.removeProperty('margin-bottom');
                        element.style.removeProperty('padding-top');
                        element.style.removeProperty('padding-bottom');
                    } else {
                        element.style.marginTop = computedRowSpacingPx + 'px';
                        element.style.marginBottom = computedRowSpacingPx + 'px';
                        element.style.paddingTop = '0px';
                        element.style.paddingBottom = '0px';
                    }
                    // Also reduce the parent container's row gap if present
                    const parentContainer = element.parentElement;
                    if (parentContainer) {
                        if (lineHeightValue === null) {
                            parentContainer.style.removeProperty('row-gap');
                            parentContainer.style.removeProperty('gap');
                        } else {
                            try { parentContainer.style.setProperty('row-gap', computedRowSpacingPx + 'px', 'important'); } catch (_) { parentContainer.style.rowGap = computedRowSpacingPx + 'px'; }
                            if (getComputedStyle(parentContainer).gap !== undefined) {
                                try { parentContainer.style.setProperty('gap', `${computedRowSpacingPx}px ${getComputedStyle(parentContainer).columnGap || '0px'}`, 'important'); } catch (_) { parentContainer.style.gap = `${computedRowSpacingPx}px ${getComputedStyle(parentContainer).columnGap || '0px'}`; }
                            }
                        }
                    }
                } catch (_) {}
            } catch (_) {}

            // Also apply keyword/ALL-CAPS effects for action rows to keep live updates consistent
            try { applyCapsEffect(element); } catch (_) {}
        });
    }

    // Apply visual effect to ALL-CAPS sequences based on settings.capsEffect
    function applyCapsEffect(container) {
        const effect = settings.capsEffect || 'none';
        // Clear previous marks
        container.querySelectorAll('span.ai-caps-effect').forEach(n => {
            const parent = n.parentNode;
            if (!parent) return;
            // unwrap
            parent.replaceChild(document.createTextNode(n.textContent || ''), n);
            parent.normalize();
        });
        // Keyword-specific highlighting: build maps
        const perWord = new Map();
        const perWordStatic = new Map();
        const perWordBold = new Set();
        try {
            const list = settings.keywordEffects || [];
            list.forEach(item => {
                if (item && typeof item.word === 'string' && item.word.trim()) {
                    const e = item.effect || 'none';
                    if (e === 'static' && item.color) {
                        perWordStatic.set(item.word.toLowerCase(), item.color);
                    } else if (e && e !== 'none') {
                        perWord.set(item.word.toLowerCase(), e);
                    }
                    if (item.bold) {
                        perWordBold.add(item.word.toLowerCase());
                    }
                }
            });
        } catch (_) {}

        if (effect === 'none' && perWord.size === 0 && perWordStatic.size === 0) return;
        // Walk text nodes and wrap ALL-CAPS words (>=2 letters, allowing punctuation)
        const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
        const nodes = [];
        let node;
        while (node = walker.nextNode()) {
            const text = node.nodeValue || '';
            if (!text.trim()) continue;
            // Allow inside formatted spans (speech/monologue) too; we'll wrap safely within
            if (/[A-Z]{2,}(?:[A-Z\d\s!'?,.:-]*)/.test(text) || perWord.size > 0 || perWordStatic.size > 0) nodes.push(node);
        }
        nodes.forEach(textNode => {
            const text = textNode.nodeValue || '';
            const frag = document.createDocumentFragment();
            let lastIndex = 0;
            const regex = /([A-Z]{2,}(?:[A-Z\d!'?,.:-]*))/g;
            let m;
            while ((m = regex.exec(text)) !== null) {
                if (m.index > lastIndex) frag.appendChild(document.createTextNode(text.slice(lastIndex, m.index)));
                const span = document.createElement('span');
                span.className = 'ai-caps-effect ai-caps-' + (effect === 'none' ? 'wave' : effect);
                span.textContent = m[1];
                frag.appendChild(span);
                lastIndex = m.index + m[1].length;
            }
            if (lastIndex < text.length) frag.appendChild(document.createTextNode(text.slice(lastIndex)));
            // Apply per-keyword effects by scanning child text nodes
            if (perWord.size > 0 || perWordStatic.size > 0) {
                const applyKeyword = (node) => {
                    if (node.nodeType !== Node.TEXT_NODE) return;
                    const val = node.nodeValue || '';
                    let cursor = 0;
                    const df = document.createDocumentFragment();
                    const words = Array.from(new Set([...perWord.keys(), ...perWordStatic.keys(), ...perWordBold.values()]));
                    const pattern = new RegExp('(' + words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'ig');
                    let mm;
                    while ((mm = pattern.exec(val)) !== null) {
                        if (mm.index > cursor) df.appendChild(document.createTextNode(val.slice(cursor, mm.index)));
                        const w = mm[0];
                        const key = w.toLowerCase();
                        const eff = perWord.get(key);
                        const s = document.createElement('span');
                        if (eff) {
                            s.className = 'ai-caps-effect ai-caps-' + (eff || 'wave');
                        } else {
                            s.className = 'ai-caps-effect';
                            const color = perWordStatic.get(key) || '#ffffff';
                            s.style.color = color;
                        }
                        if (perWordBold.has(key)) {
                            s.style.fontWeight = 'bold';
                        }
                        s.textContent = w;
                        df.appendChild(s);
                        cursor = mm.index + w.length;
                    }
                    if (cursor < val.length) df.appendChild(document.createTextNode(val.slice(cursor)));
                    if (df.childNodes.length > 0) node.parentNode.replaceChild(df, node);
                };
                const walker2 = document.createTreeWalker(frag, NodeFilter.SHOW_TEXT, null, false);
                const toProcess = [];
                let n2; while (n2 = walker2.nextNode()) toProcess.push(n2);
                toProcess.forEach(applyKeyword);
            }
            textNode.parentNode.replaceChild(frag, textNode);
        });
    }
    
    // Function to update settings and reapply formatting
    function updateSettings(newSettings) {
        const oldSettings = { ...settings };
        Object.assign(settings, newSettings);
        // Don't save settings here to avoid infinite loop
        // Settings are already saved by the popup
        
        // Decide if we can do a styles-only update (colors or monologue bold) without re-wrapping text
        // Treat any change that doesn't alter speech wrapping (speechBold) as visual-only
        // If speechBold (which changes wrapping) did not change, treat as visual-only
        const visualTweaksChanged = oldSettings.speechBold === newSettings.speechBold;

        if (visualTweaksChanged) {
            console.log('AI Dungeon Tweaks: Visual tweaks changed, updating styles without reformatting');
            updateColorsOnly();
        } else {
            console.log('AI Dungeon Tweaks: Formatting options changed, performing full reformatting');
            forceReformat();
        }
        // Always trigger a styles refresh shortly after changes to catch late nodes
        try { setTimeout(() => { try { updateColorsOnly(); } catch (_) {} }, 100); } catch (_) {}
    }
    
    // Open embedded settings panel (top-level helper used by message handlers and UI)
    function openEmbeddedPanel(openKey) {
        try { if (debugUI) console.log('AI Dungeon Tweaks: Opening embedded settings panel'); } catch(_) {}
        const existingOverlay = document.querySelector('[data-ai-settings-overlay]');
        if (existingOverlay) {
            try {
                if (openKey) {
                    const frame = existingOverlay.querySelector('iframe');
                    if (frame && frame.contentWindow) {
                        frame.contentWindow.postMessage({ type: 'OPEN_CONTROL', open: openKey }, '*');
                        return;
                    }
                }
            } catch(_) {}
            // If already open and no specific control requested, close
            if (!openKey) { existingOverlay.remove(); }
            return;
        }
        const overlay = document.createElement('div');
        overlay.setAttribute('data-ai-settings-overlay', 'true');
        overlay.className = 'aid-overlay';
        const panel = document.createElement('div');
        panel.setAttribute('data-ai-settings-panel', 'true');
        panel.className = 'aid-panel';
        let popupUrl = (typeof browser !== 'undefined' && browser.runtime) ? browser.runtime.getURL('popup.html?embedded=1') : null;
        try {
            if (popupUrl && openKey) {
                const u = new URL(popupUrl, location.href);
                u.searchParams.set('open', String(openKey));
                popupUrl = u.toString();
            }
        } catch(_) {}
        // Build panel DOM safely without innerHTML
        const header = document.createElement('div');
        header.className = 'aid-panel__header';
        const close = document.createElement('button');
        close.className = 'aid-panel__close';
        close.setAttribute('aria-label','Close');
        close.textContent = '✕';
        const body = document.createElement('div');
        body.className = 'aid-panel__body';
        if (popupUrl) {
            const iframe = document.createElement('iframe');
            iframe.className = 'aid-panel__iframe';
            iframe.setAttribute('allowtransparency','true');
            iframe.setAttribute('referrerpolicy','no-referrer');
            iframe.src = popupUrl;
            body.appendChild(iframe);
        } else {
            const empty = document.createElement('div');
            empty.className = 'aid-panel__empty';
            empty.textContent = 'Open the extension popup for full options.';
            body.appendChild(empty);
        }
        panel.appendChild(header);
        panel.appendChild(close);
        panel.appendChild(body);
        try {
            const iframe = panel.querySelector('iframe');
            if (iframe && iframe.src && !/embedded=1/.test(iframe.src)) {
                const u = new URL(iframe.src, location.href);
                u.searchParams.set('embedded','1');
                iframe.src = u.toString();
            }
        } catch (_) {}
        const closeBtn = panel.querySelector('button[aria-label="Close"]');
        if (closeBtn) closeBtn.addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', () => overlay.remove());
        panel.addEventListener('click', (e) => e.stopPropagation());
        overlay.appendChild(panel);
        document.body.appendChild(overlay);
        try {
            const iframe2 = panel.querySelector('iframe');
            if (iframe2) {
                const notify = () => { try { iframe2.contentWindow.postMessage({ type: 'OPEN_CONTROL', open: openKey || 'bgColor' }, '*'); } catch(_) {} };
                iframe2.addEventListener('load', () => {
                    // Give the embedded popup a moment to apply CSS before we request picker
                    setTimeout(notify, 120);
                }, { once: true });
            }
        } catch(_) {}
    }

    // Listen for messages from popup/options page
    function getProfileScope() {
        try {
            return String(location.hostname + (location.pathname || '/'));
        } catch(_) { return ''; }
    }

    if (typeof browser !== 'undefined' && browser.runtime) {
        const onMsg = (message, sender, sendResponse) => {
            try {
                if (!message || !message.type) return;
                if (message.type === 'UPDATE_SETTINGS') {
                    updateSettings(message.settings || {});
                    if (message.persist) {
                        try { saveSettings(); } catch(_) {}
                    }
                    return;
                }
                if (message.type === 'OPEN_EMBEDDED_PANEL') {
                    try { openEmbeddedPanel(message.open); } catch(_) {}
                    return;
                }
                if (message.type === 'REQUEST_SETTINGS') {
                    try { sendResponse && sendResponse({ settings, scope: getProfileScope() }); } catch(_) {}
                    return;
                }
            } catch(_) {}
        };
        try { browser.runtime.onMessage.addListener(onMsg); } catch (_) {}
        // Fallback for direct window postMessage from iframe with origin validation
        try {
            window.addEventListener('message', (e) => {
                try {
                    const extOrigin = (typeof browser !== 'undefined' && browser.runtime) ? new URL(browser.runtime.getURL('/')).origin : null;
                    if (extOrigin && e.origin !== extOrigin) return;
                } catch(_) {}
                onMsg(e.data);
            });
        } catch (_) {}
    }
    
    // Function to immediately clean and update target elements
    function immediateTargetCleanup() {
        const elements = document.querySelectorAll(TARGET_SELECTOR);
        elements.forEach(element => {
            if (element.textContent && element.textContent.includes('ai-')) {
                const cleanText = cleanTextBeforeFormatting(element.textContent);
                if (cleanText !== element.textContent) {
                    element.innerHTML = '';
                    element.textContent = cleanText;
                }
            }
        });
    }

    // Inject a small settings shortcut into the in-game menu (non-destructive)
    function setupPauseMenuIntegration() {
        try {
            const attach = () => {
                // Prefer placing right above the Exit game button
                const exitBtn = document.querySelector('div[role="button"][aria-label="Exit game"]');
                const listContainer = exitBtn && exitBtn.parentElement;
                if (listContainer && listContainer.querySelector('[data-ai-settings-button]')) return;
                // Build a button that visually matches Exit game by cloning its structure/styles
                // Build a new button that mirrors the Exit button classes/structure
                const holder = document.createElement('span');
                holder.className = 't_sub_theme t_core2 _dsp_contents is_Theme';
                holder.style.display = 'block';
                holder.setAttribute('data-ai-settings-button', 'true');

                let btn;
                if (exitBtn) {
                    // Use same classes as exit button
                    btn = document.createElement('div');
                    btn.className = exitBtn.className;
                    btn.setAttribute('role', 'button');
                    btn.setAttribute('aria-label', 'Formatter Settings');
                    btn.setAttribute('tabindex', '0');
                    // Replicate children: icon container + label span with same classes
                    const exitIconContainer = exitBtn.querySelector('div');
                    const exitTextSpan = exitBtn.querySelector('span.is_ButtonText');
                    const iconContainer = document.createElement('div');
                    iconContainer.className = exitIconContainer ? exitIconContainer.className : '_dsp-flex _ai-center _fd-column _fb-auto _bxs-border-box _pos-relative _mih-0px _miw-0px _fs-0 _jc-center';
                    // Ensure Material Symbols stylesheet is present
                    if (!document.getElementById('ai-material-symbols')) {
                        const link = document.createElement('link');
                        link.id = 'ai-material-symbols';
                        link.rel = 'stylesheet';
                        link.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0';
                        document.head.appendChild(link);
                    }
                    const iconSpan = document.createElement('span');
                    iconSpan.className = 'material-symbols-outlined';
                    iconSpan.textContent = 'settings';
                    iconSpan.setAttribute('aria-hidden', 'true');
                    iconSpan.style.fontSize = '16px';
                    iconSpan.style.lineHeight = '1';
                    iconSpan.style.color = 'inherit';
                    iconContainer.appendChild(iconSpan);
                    const textSpan = document.createElement('span');
                    textSpan.className = exitTextSpan ? exitTextSpan.className : 'is_ButtonText font_body';
                    textSpan.textContent = 'AI Dungeon Tweaks';
                    textSpan.setAttribute('aria-hidden', 'true');
                    btn.appendChild(iconContainer);
                    btn.appendChild(textSpan);
                } else {
                    // Fallback simple button
                    btn = document.createElement('div');
                    btn.textContent = 'Formatter Settings';
                    btn.style.padding = '10px 12px';
                    btn.style.borderRadius = '8px';
                    btn.style.border = '1px solid rgba(255,255,255,0.2)';
                    btn.style.background = 'transparent';
                }
                holder.appendChild(btn);
                // Ensure our handler opens the panel rather than exiting
                holder.addEventListener('click', (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    openEmbeddedPanel();
                });

                function openIframePanel(openKey) {
                    // Back-compat: delegate to top-level helper
                    return openEmbeddedPanel(openKey);
                }
                if (listContainer && exitBtn) {
                    // Remove any previous misplaced holder
                    document.querySelectorAll('[data-ai-settings-button]').forEach(n => {
                        if (n !== holder) n.remove();
                    });
                    listContainer.insertBefore(holder, exitBtn);
                } else {
                    // Fallback: try within Game Information group
                    const menuRoot = document.querySelector('div[role="group"][aria-label="Game Information"]');
                    if (menuRoot) menuRoot.appendChild(holder);
                }
            };
            // Attach now and when overlays change
            attach();
            const obs = new MutationObserver(() => attach());
            obs.observe(document.body, { childList: true, subtree: true });
        } catch (_) {}
    }
    
    //
    
    // Immediate cleanup function that runs as soon as possible
    if (document.readyState === 'loading') {
        // If still loading, run cleanup immediately and then on DOMContentLoaded
        immediateTargetCleanup();
        document.addEventListener('DOMContentLoaded', init);
    } else {
        // If DOM is already ready, run cleanup immediately and then init
        immediateTargetCleanup();
        init();
    }
    
    // Also handle navigation in single-page apps without polling
    (function setupSpaNavigationListeners() {
        try {
            const origPush = history.pushState;
            const origReplace = history.replaceState;
            const fire = () => { try { setTimeout(init, 500); } catch (_) {} };
            history.pushState = function() { const r = origPush.apply(this, arguments); fire(); return r; };
            history.replaceState = function() { const r = origReplace.apply(this, arguments); fire(); return r; };
            window.addEventListener('popstate', fire);
        } catch (_) {}
    })();
    
})();
