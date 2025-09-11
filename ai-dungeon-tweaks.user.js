// ==UserScript==
// @name         AI Dungeon Tweaks
// @namespace    kraken.aidt
// @version      1.4.9
// @author       Kraken
// @homepageURL  https://github.com/UnhealthyKraken/AIDungeonTweaks
// @supportURL   https://github.com/UnhealthyKraken/AIDungeonTweaks/issues
// @license      MIT
// @description  AI Dungeon Tweaks, including custom fonts, formatting, colors, and more.
// @match        https://*.aidungeon.com/*
// @run-at       document-idle
// @grant        none
// @noframes
// @downloadURL  https://raw.githubusercontent.com/UnhealthyKraken/AIDungeonTweaks/main/ai-dungeon-tweaks.user.js
// @updateURL    https://raw.githubusercontent.com/UnhealthyKraken/AIDungeonTweaks/main/ai-dungeon-tweaks.user.js
// ==/UserScript==

(function(){
  'use strict';

  // AIDT: Safely track and disconnect observers on navigation
  (function(){
    try{
      var OrigMO = window.MutationObserver;
      if (OrigMO && !window.__AIDT_MO_WRAPPED__){
        window.__AIDT_MO_WRAPPED__ = true;
        window.__AIDT_OBSERVERS = window.__AIDT_OBSERVERS || new Set();
        window.__AIDT_HAS_SAYDO__ = (typeof window.AIDT_applySayDo === 'function');
        Object.defineProperty(window, '__AIDT_HAS_SAYDO__', { configurable: true, writable: true });
        // Stop overriding global MutationObserver; track only our created observers
        window.MutationObserver = OrigMO;
        window.__AIDT_OBSERVERS_ADD__ = function(obs){ try{ window.__AIDT_OBSERVERS.add(obs); }catch(_){ } };
        function __aidt_disconnectAll(){
          try{ window.__AIDT_PAUSE__ = true; }catch(_){ }
          try{
            var set = window.__AIDT_OBSERVERS;
            if (set && set.forEach){
              set.forEach(function(o){ try{ o.disconnect(); }catch(_){ } });
              if (typeof set.clear === 'function') set.clear();
            }
          }catch(_){ }
          try{ __AIDT_TEXT_CACHE = null; __AIDT_PICK_CACHE = null; }catch(_){ }
          try{ var host=document.getElementById('aidt-panel-host'); if (host && host.parentNode){ host.parentNode.removeChild(host); } }catch(_){ }
          try{ var css=document.getElementById('aidt-inline-css'); if (css && css.parentNode){ css.parentNode.removeChild(css); } }catch(_){ }
          try{ var bg=document.getElementById('aidt-bg-style'); if (bg && bg.parentNode){ bg.parentNode.removeChild(bg); } }catch(_){ }
          try{ var amb=document.getElementById('aidt-ambience-hide'); if (amb && amb.parentNode){ amb.parentNode.removeChild(amb); } }catch(_){ }
        }
        function __aidt_disconnectObservers(){
          try{
            var set = window.__AIDT_OBSERVERS;
            if (set && set.forEach){
              set.forEach(function(o){ try{ o.disconnect(); }catch(_){ } });
              if (typeof set.clear === 'function') set.clear();
            }
          }catch(_){ }
        }
        window.addEventListener('pagehide', __aidt_disconnectAll, true);
        window.addEventListener('beforeunload', __aidt_disconnectAll, true);
        // Recompute availability on every microtask turn where needed
        setTimeout(function(){ try{ window.__AIDT_HAS_SAYDO__ = (typeof window.AIDT_applySayDo === 'function'); }catch(_){ } }, 0);

        // Pause observers in background tabs and resume on visibility (with token counter)
        try{
          window.__AIDT_PAUSE_COUNT__ = 0;
          window.AIDT_pause = function(){ try{ window.__AIDT_PAUSE_COUNT__++; }catch(_){ } };
          window.AIDT_resume = function(){ try{ window.__AIDT_PAUSE_COUNT__ = Math.max(0,(window.__AIDT_PAUSE_COUNT__||0)-1); }catch(_){ } };
          window.AIDT_isPaused = function(){ try{ return !!(window.__AIDT_PAUSE__ || (window.__AIDT_PAUSE_COUNT__>0)); }catch(_){ return false; } };
          document.addEventListener('visibilitychange', function(){
            try{
              if (document.visibilityState === 'hidden'){
                try{ window.__AIDT_PAUSE__ = true; }catch(_p){}
                try{ window.__AIDT_PAUSE_COUNT__ = 1; }catch(_c){}
                __aidt_disconnectObservers();
              } else {
                try{ window.__AIDT_PAUSE__ = false; }catch(_p2){}
                try{ window.__AIDT_PAUSE_COUNT__ = 0; }catch(_c2){}
                try{ setupFormatObserver(); }catch(_s1){}
                try{ setupOverlayObserver(); }catch(_s2){}
                try{ attachAmbienceObserver(); }catch(_s3){}
                try{ ensureLatestFormatted(); }catch(_s4){}
              }
            }catch(_v){}
          }, true);
        }catch(_l){}
      }
    }catch(_){ }
  })();

  // (Reverted) suppression helper removed due to interfering with latest formatting

  // ---------------- Profiles & Settings ----------------
  const LS_PROFILES = 'aidt:config:profiles';
  const LS_BINDINGS = 'aidt:config:bindings';
  const ACTIVE_PROFILE = 'aidt:config:activeProfile';
  const LS_LAST_PARAGRAPHS = 'aidt:config:lastParagraphs';
  const lastParKeyFor = (profile)=>('aidt:config:lastParagraphs:'+(profile||'Default'));

  const DEFAULTS = {
    enabled: true,

    // regex feature toggles
    rBold: true, rItalic: true, rSpeechWeight: true, rStrike: true, rCode: true, rHighlight: true, rColour: true,

    // Actions (used for "You say ..."/comment blocks; Do kept for later use)
    actions: { do: { bold: false, colour: '#ffffff' }, say: { bold: false, colour: '#ffffff' } },

    // Text Formatting (global)
    allCapsEffect: 'None',
    fontFamily: 'inherit',
    fontSize: 100,               // %
    fontWeight: 'default',       // default|regular|medium|bold
    lineHeight: 1.5,
    letterSpacing: 0,            // em
    textAlign: 'default',
    paragraphs: 'default', // default|basic|newline

    internalMonologue: { bold: false, colour: '#9ca3af' }, // *"..."*
    italics:           { bold: false, colour: '#facc15' }, // *text* (unquoted)
    speech:            { bold: false, colour: '#ffffff' }, // "..."

    textFormatting: { keywords: [], mainText: { bold: false, colour: '#ffffff' } },

    // Misc
    backgroundType: 'default',
    bgColour: '#111827',
    bgOpacity: 50,
    bgImageUrl: '',
    bgImageInFront: false,
    languageOverride: 'default',

    // Site integration (AI Model removed)
  };

  const clone = (o)=>{ try{ if (typeof structuredClone==='function') return structuredClone(o); }catch(_){ } try{ return JSON.parse(JSON.stringify(o)); }catch(_){ return o; } };
  const merge = (a, b) => {
    if (!b) return a;
    const out = clone(a);
    for (const k of Object.keys(b)) {
      if (b[k] && typeof b[k]==='object' && !Array.isArray(b[k])) out[k]=merge(a[k]||{}, b[k]);
      else out[k]=b[k];
    }
    return out;
  };

  // Small memo cache for theme presets → resolved settings
  const __AIDT_THEME_CACHE = Object.create(null);
  const getResolvedThemePreset = (name) => {
    try{
      if (__AIDT_THEME_CACHE[name]) return __AIDT_THEME_CACHE[name];
      const p = THEME_PRESETS[name]; if (!p) return null;
      // Create a resolved shallow copy so we don't mutate source presets
      const resolved = clone(p);
      __AIDT_THEME_CACHE[name] = resolved;
      return resolved;
    }catch(_){ return null; }
  };
  // --- Simple i18n for panel labels ---
  const __LOCALES_ALL = {
    'en-US': {
      'Actions':'Actions','Text Formatting':'Text Formatting','Miscellaneous':'Miscellaneous',
      'Do':'Do','Say':'Say','Bold':'Bold','Colour':'Color','Effect':'Effect',
      'Main Text':'Main Text','Speech':'Speech','Internal Monologue':'Internal Monologue','Italics':'Italics','Keywords':'Keywords','Add Keyword':'Add Keyword',
      'All Caps Effects':'All Caps Effects','Font':'Font','Font Family':'Font Family','Font Size':'Font Size','Font Weight':'Font Weight','Line Height':'Line Height','Letter Spacing':'Letter Spacing','Text Alignment':'Text Alignment','Reset Font':'Reset Font',
      'Reset Text Formatting':'Reset Text Formatting','Background':'Background','Background type':'Background type','Background colour':'Background color','Backdrop opacity':'Backdrop opacity',
      'Language':'Language','Language override':'Language override','Profiles':'Profiles','Profile':'Profile','Save as new':'Save as new','Save':'Save','Rename':'Rename','Duplicate':'Duplicate','Delete':'Delete','Bind to this story':'Bind to this story','Unbind':'Unbind',
      'Export':'Export','Import':'Import','Reset All':'Reset All','Default':'Default','Backdrop (behind overlays)':'Backdrop (behind overlays)','Solid (override overlays)':'Solid (override overlays)',
      'Reset':'Reset','Add':'Add','Enable':'Enable','Disable':'Disable',
      'Paragraphs':'Paragraphs','AI Model':'AI Model','Model':'Model','Refresh':'Refresh','Custom image URL':'Custom image URL','None found':'None found','Exclusions':'Exclusions',
      'Theme Presets':'Theme Presets','Theme':'Theme','Preset':'Preset','Apply':'Apply','Select…':'Select…','Gradient':'Gradient','Image Options':'Image Options','Custom Google Fonts URL':'Custom Google Fonts URL','Image URL':'Image URL','Export / Import':'Export / Import','Active':'Active','Custom Color…':'Custom Color…','Export active profile':'Export active profile','Import (Merge)':'Import (Merge)','Import (Replace)':'Import (Replace)','Size':'Size','Position':'Position','Repeat':'Repeat','Attachment':'Attachment'
    },
    'en-GB': {
      'Colour':'Colour',
      'Background colour':'Background colour',
      'Custom Color…':'Custom Colour…',
      'Select…':'Select…',
      'Theme Presets':'Theme Presets','Theme':'Theme','Preset':'Preset','Apply':'Apply','Gradient':'Gradient','Image Options':'Image Options','Custom Google Fonts URL':'Custom Google Fonts URL','Image URL':'Image URL','Export / Import':'Export / Import','Export active profile':'Export active profile','Import (Merge)':'Import (Merge)','Import (Replace)':'Import (Replace)','Size':'Size','Position':'Position','Repeat':'Repeat','Attachment':'Attachment'
    },
    'es': {
      'Actions':'Acciones','Text Formatting':'Formato de texto','Miscellaneous':'Varios',
      'Do':'Hacer','Say':'Decir','Bold':'Negrita','Colour':'Color','Effect':'Efecto',
      'Main Text':'Texto principal','Speech':'Dialogo','Internal Monologue':'Monólogo interno','Keywords':'Palabras clave','Add Keyword':'Añadir palabra clave',
      'All Caps Effects':'Efectos de MAYÚSCULAS','Font':'Fuente','Font Family':'Familia de fuente','Font Size':'Tamaño de fuente','Font Weight':'Grosor de fuente','Line Height':'Altura de línea','Letter Spacing':'Espaciado de letras','Text Alignment':'Alineación del texto','Reset Font':'Restablecer fuente',
      'Reset Text Formatting':'Restablecer formato de texto','Background':'Fondo','Background type':'Tipo de fondo','Background colour':'Color de fondo','Backdrop opacity':'Opacidad del fondo',
      'Language':'Idioma','Language override':'Idioma de la interfaz','Profiles':'Perfiles','Profile':'Perfil','Save as new':'Guardar como nuevo','Rename':'Renombrar','Duplicate':'Duplicar','Delete':'Eliminar','Bind to this story':'Vincular a esta historia','Unbind':'Desvincular',
      'Export':'Exportar','Import':'Importar','Reset All':'Restablecer todo','Default':'Predeterminado','Backdrop (behind overlays)':'Fondo (detrás de superposiciones)','Solid (override overlays)':'Sólido (anula superposiciones)',
      'Reset':'Restablecer','Add':'Añadir','Enable':'Activar','Disable':'Desactivar',
      'Paragraphs':'Párrafos','AI Model':'Modelo de IA','Model':'Modelo','Refresh':'Actualizar','Custom image URL':'URL de imagen personalizada','None found':'Ninguno encontrado','Exclusions':'Exclusiones',
      'Select…':'Seleccionar…'
    },
    'fr': {
      'Actions':'Actions','Text Formatting':'Mise en forme du texte','Miscellaneous':'Divers',
      'Do':'Faire','Say':'Dire','Bold':'Gras','Colour':'Couleur','Effect':'Effet',
      'Main Text':'Texte principal','Speech':'Dialogue','Internal Monologue':'Monologue interne','Keywords':'Mots-clés','Add Keyword':'Ajouter un mot-clé',
      'All Caps Effects':'Effets MAJUSCULES','Font':'Police','Font Family':'Famille de polices','Font Size':'Taille de police','Font Weight':'Graisse','Line Height':'Interligne','Letter Spacing':'Espacement des lettres','Text Alignment':'Alignement du texte','Reset Font':'Réinitialiser la police',
      'Reset Text Formatting':'Réinitialiser la mise en forme','Background':'Arrière-plan','Background type':'Type d\'arrière-plan','Background colour':'Couleur d\'arrière-plan','Backdrop opacity':'Opacité du fond',
      'Language':'Langue','Language override':'Langue de l\'interface','Profiles':'Profils','Profile':'Profil','Save as new':'Enregistrer comme nouveau','Rename':'Renommer','Duplicate':'Dupliquer','Delete':'Supprimer','Bind to this story':'Lier à cette histoire','Unbind':'Délier',
      'Export':'Exporter','Import':'Importer','Reset All':'Tout réinitialiser','Default':'Par défaut','Backdrop (behind overlays)':'Fond (derrière les superpositions)','Solid (override overlays)':'Solide (remplace les superpositions)',
      'Reset':'Réinitialiser','Add':'Ajouter','Enable':'Activer','Disable':'Désactiver',
      'Paragraphs':'Paragraphes','AI Model':'Modèle d\'IA','Model':'Modèle','Refresh':'Actualiser','Custom image URL':'URL d\'image personnalisée','None found':'Aucun trouvé','Exclusions':'Exclusions',
      'Select…':'Sélectionner…'
    },
    'de': {
      'Actions':'Aktionen','Text Formatting':'Textformatierung','Miscellaneous':'Sonstiges',
      'Do':'Tun','Say':'Sagen','Bold':'Fett','Colour':'Farbe','Effect':'Effekt',
      'Main Text':'Haupttext','Speech':'Gesprochener Text','Internal Monologue':'Innerer Monolog','Keywords':'Schlüsselwörter','Add Keyword':'Schlüsselwort hinzufügen',
      'All Caps Effects':'Versalien-Effekte','Font':'Schriftart','Font Family':'Schriftfamilie','Font Size':'Schriftgröße','Font Weight':'Schriftschnitt','Line Height':'Zeilenhöhe','Letter Spacing':'Buchstabenabstand','Text Alignment':'Textausrichtung','Reset Font':'Schrift zurücksetzen',
      'Reset Text Formatting':'Textformatierung zurücksetzen','Background':'Hintergrund','Background type':'Hintergrundtyp','Background colour':'Hintergrundfarbe','Backdrop opacity':'Hintergrund-Deckkraft',
      'Language':'Sprache','Language override':'UI-Sprache','Profiles':'Profile','Profile':'Profil','Save as new':'Als neu speichern','Rename':'Umbenennen','Duplicate':'Duplizieren','Delete':'Löschen','Bind to this story':'An diese Geschichte binden','Unbind':'Bindung lösen',
      'Export':'Exportieren','Import':'Importieren','Reset All':'Alles zurücksetzen','Default':'Standard','Backdrop (behind overlays)':'Hintergrund (hinter Overlays)','Solid (override overlays)':'Vollflächig (Overlays überschreiben)',
      'Reset':'Zurücksetzen','Add':'Hinzufügen','Enable':'Aktivieren','Disable':'Deaktivieren',
      'Paragraphs':'Absätze','AI Model':'KI-Modell','Model':'Modell','Refresh':'Aktualisieren','Custom image URL':'Benutzerdefinierte Bild-URL','None found':'Keine gefunden','Exclusions':'Ausschlüsse',
      'Select…':'Auswählen…'
    },
    'it': {
      'Actions':'Azioni','Text Formatting':'Formattazione testo','Miscellaneous':'Varie',
      'Do':'Fai','Say':'Dì','Bold':'Grassetto','Colour':'Colore','Effect':'Effetto',
      'Main Text':'Testo principale','Speech':'Dialogo','Internal Monologue':'Monologo interiore','Keywords':'Parole chiave','Add Keyword':'Aggiungi parola chiave',
      'All Caps Effects':'Effetti MAIUSCOLO','Font':'Carattere','Font Family':'Famiglia di caratteri','Font Size':'Dimensione carattere','Font Weight':'Spessore','Line Height':'Interlinea','Letter Spacing':'Spaziatura lettere','Text Alignment':'Allineamento testo','Reset Font':'Reimposta carattere',
      'Reset Text Formatting':'Reimposta formattazione testo','Background':'Sfondo','Background type':'Tipo di sfondo','Background colour':'Colore di sfondo','Backdrop opacity':'Opacità sfondo',
      'Language':'Lingua','Language override':'Lingua interfaccia','Profiles':'Profili','Profile':'Profilo','Save as new':'Salva come nuovo','Rename':'Rinomina','Duplicate':'Duplica','Delete':'Elimina','Bind to this story':'Collega a questa storia','Unbind':'Scollega',
      'Export':'Esporta','Import':'Importa','Reset All':'Reimposta tutto','Default':'Predefinito','Backdrop (behind overlays)':'Sfondo (dietro le sovrapposizioni)','Solid (override overlays)':'Solido (sovrascrive le sovrapposizioni)',
      'Reset':'Reimposta','Add':'Aggiungi','Enable':'Attiva','Disable':'Disattiva',
      'Paragraphs':'Paragrafi','AI Model':'Modello IA','Model':'Modello','Refresh':'Aggiorna','Custom image URL':'URL immagine personalizzata','None found':'Nessuno trovato','Exclusions':'Esclusioni',
      'Select…':'Seleziona…'
    },
    'ja': {
      'Actions':'アクション','Text Formatting':'テキストの書式','Miscellaneous':'その他',
      'Do':'行動','Say':'発言','Bold':'太字','Colour':'色','Effect':'効果',
      'Main Text':'本文','Speech':'セリフ','Internal Monologue':'心の声','Keywords':'キーワード','Add Keyword':'キーワードを追加',
      'All Caps Effects':'全大文字効果','Font':'フォント','Font Family':'フォントファミリ','Font Size':'フォントサイズ','Font Weight':'太さ','Line Height':'行間','Letter Spacing':'文字間隔','Text Alignment':'文字揃え','Reset Font':'フォントをリセット',
      'Reset Text Formatting':'書式をリセット','Background':'背景','Background type':'背景タイプ','Background colour':'背景色','Backdrop opacity':'背景の不透明度',
      'Language':'言語','Language override':'UI言語','Profiles':'プロファイル','Profile':'プロファイル','Save as new':'新規保存','Rename':'名前を変更','Duplicate':'複製','Delete':'削除','Bind to this story':'このストーリーに紐付け','Unbind':'解除',
      'Export':'エクスポート','Import':'インポート','Reset All':'すべてリセット','Default':'デフォルト','Backdrop (behind overlays)':'背景（オーバーレイの後ろ）','Solid (override overlays)':'単色（オーバーレイを上書き）',
      'Reset':'リセット','Add':'追加','Enable':'有効化','Disable':'無効化',
      'Paragraphs':'段落','AI Model':'AIモデル','Model':'モデル','Refresh':'更新','Custom image URL':'カスタム画像URL','None found':'見つかりません','Exclusions':'除外',
      'Select…':'選択…'
    },
    'ko': {
      'Actions':'작업','Text Formatting':'텍스트 서식','Miscellaneous':'기타',
      'Do':'행동','Say':'말하기','Bold':'굵게','Colour':'색상','Effect':'효과',
      'Main Text':'본문','Speech':'대사','Internal Monologue':'내면의 독백','Keywords':'키워드','Add Keyword':'키워드 추가',
      'All Caps Effects':'대문자 효과','Font':'글꼴','Font Family':'글꼴 패밀리','Font Size':'글꼴 크기','Font Weight':'두께','Line Height':'줄 간격','Letter Spacing':'자간','Text Alignment':'정렬','Reset Font':'글꼴 초기화',
      'Reset Text Formatting':'서식 초기화','Background':'배경','Background type':'배경 종류','Background colour':'배경 색상','Backdrop opacity':'배경 불투명도',
      'Language':'언어','Language override':'UI 언어','Profiles':'프로필','Profile':'프로필','Save as new':'새로 저장','Rename':'이름 바꾸기','Duplicate':'복제','Delete':'삭제','Bind to this story':'이 스토리에 연결','Unbind':'연결 해제',
      'Export':'내보내기','Import':'가져오기','Reset All':'전체 초기화','Default':'기본값','Backdrop (behind overlays)':'배경(오버레이 뒤)','Solid (override overlays)':'단색(오버레이 무시)',
      'Reset':'재설정','Add':'추가','Enable':'활성화','Disable':'비활성화',
      'Paragraphs':'단락','AI Model':'AI 모델','Model':'모델','Refresh':'새로고침','Custom image URL':'사용자 지정 이미지 URL','None found':'없음','Exclusions':'제외 항목',
      'Select…':'선택…'
    },
    'pt': {
      'Actions':'Ações','Text Formatting':'Formatação de texto','Miscellaneous':'Diversos',
      'Do':'Fazer','Say':'Dizer','Bold':'Negrito','Colour':'Cor','Effect':'Efeito',
      'Main Text':'Texto principal','Speech':'Fala','Internal Monologue':'Monólogo interno','Italics':'Itálico','Keywords':'Palavras‑chave','Add Keyword':'Adicionar palavra‑chave',
      'All Caps Effects':'Efeitos de MAIÚSCULAS','Font':'Tipo de letra','Font Family':'Família do tipo de letra','Font Size':'Tamanho do tipo de letra','Font Weight':'Espessura','Line Height':'Altura da linha','Letter Spacing':'Espaçamento entre letras','Text Alignment':'Alinhamento do texto','Reset Font':'Repor tipo de letra',
      'Reset Text Formatting':'Repor formatação do texto','Background':'Fundo','Background type':'Tipo de fundo','Background colour':'Cor de fundo','Backdrop opacity':'Opacidade do fundo',
      'Language':'Idioma','Language override':'Idioma da interface','Profiles':'Perfis','Profile':'Perfil','Save as new':'Guardar como novo','Rename':'Mudar nome','Duplicate':'Duplicar','Delete':'Eliminar','Bind to this story':'Vincular a esta história','Unbind':'Desvincular',
      'Export':'Exportar','Import':'Importar','Reset All':'Repor tudo','Default':'Padrão','Backdrop (behind overlays)':'Fundo (atrás das sobreposições)','Solid (override overlays)':'Sólido (substitui sobreposições)',
      'Reset':'Repor','Add':'Adicionar','Enable':'Ativar','Disable':'Desativar',
      'Paragraphs':'Parágrafos','AI Model':'Modelo de IA','Model':'Modelo','Refresh':'Atualizar','Custom image URL':'URL de imagem personalizada','None found':'Nenhum encontrado','Exclusions':'Exclusões',
      'Select…':'Selecionar…'
    },
    'tr': {
      'Actions':'Eylemler','Text Formatting':'Metin Biçimlendirme','Miscellaneous':'Çeşitli',
      'Do':'Yap','Say':'Söyle','Bold':'Kalın','Colour':'Renk','Effect':'Etki',
      'Main Text':'Ana Metin','Speech':'Konuşma','Internal Monologue':'İç Monolog','Keywords':'Anahtar kelimeler','Add Keyword':'Anahtar kelime ekle',
      'All Caps Effects':'BÜYÜK HARF efektleri','Font':'Yazı tipi','Font Family':'Yazı tipi ailesi','Font Size':'Yazı tipi boyutu','Font Weight':'Yazı kalınlığı','Line Height':'Satır yüksekliği','Letter Spacing':'Harf aralığı','Text Alignment':'Metin hizalama','Reset Font':'Yazı tipini sıfırla',
      'Reset Text Formatting':'Metin biçimlendirmeyi sıfırla','Background':'Arka plan','Background type':'Arka plan türü','Background colour':'Arka plan rengi','Backdrop opacity':'Arka plan opaklığı',
      'Language':'Dil','Language override':'Arayüz dili','Profiles':'Profiller','Profile':'Profil','Save as new':'Yeni olarak kaydet','Rename':'Yeniden adlandır','Duplicate':'Kopyala','Delete':'Sil','Bind to this story':'Bu hikayeye bağla','Unbind':'Bağlantıyı kes',
      'Export':'Dışa aktar','Import':'İçe aktar','Reset All':'Tümünü sıfırla','Default':'Varsayılan','Backdrop (behind overlays)':'Arka plan (katmanların arkasında)','Solid (override overlays)':'Katı (katmanları geçersiz kılar)',
      'Reset':'Sıfırla','Add':'Ekle','Enable':'Etkinleştir','Disable':'Devre dışı bırak',
      'Paragraphs':'Paragraflar','AI Model':'Yapay Zekâ Modeli','Model':'Model','Refresh':'Yenile','Custom image URL':'Özel görsel URL\'si','None found':'Hiçbiri bulunamadı','Exclusions':'Hariç tutmalar',
      'Select…':'Seçin…'
    },
    'pl': {
      'Actions':'Akcje','Text Formatting':'Formatowanie tekstu','Miscellaneous':'Różne',
      'Do':'Rób','Say':'Powiedz','Bold':'Pogrubienie','Colour':'Kolor','Effect':'Efekt',
      'Main Text':'Tekst główny','Speech':'Mowa','Internal Monologue':'Monolog wewnętrzny','Italics':'Kursywa','Keywords':'Słowa kluczowe','Add Keyword':'Dodaj słowo kluczowe',
      'All Caps Effects':'Efekty WIELKICH LITER','Font':'Czcionka','Font Family':'Rodzina czcionek','Font Size':'Rozmiar czcionki','Font Weight':'Grubość czcionki','Line Height':'Interlinia','Letter Spacing':'Odstęp między literami','Text Alignment':'Wyrównanie tekstu','Reset Font':'Resetuj czcionkę',
      'Reset Text Formatting':'Resetuj formatowanie tekstu','Background':'Tło','Background type':'Typ tła','Background colour':'Kolor tła','Backdrop opacity':'Nieprzezroczystość tła',
      'Language':'Język','Language override':'Język interfejsu','Profiles':'Profile','Profile':'Profil','Save as new':'Zapisz jako nowy','Rename':'Zmień nazwę','Duplicate':'Duplikuj','Delete':'Usuń','Bind to this story':'Powiąż z tą historią','Unbind':'Odwiąż',
      'Export':'Eksportuj','Import':'Importuj','Reset All':'Resetuj wszystko','Default':'Domyślny','Backdrop (behind overlays)':'Tło (za nakładkami)','Solid (override overlays)':'Jednolity (zastępuje nakładki)',
      'Reset':'Resetuj','Add':'Dodaj','Enable':'Włącz','Disable':'Wyłącz',
      'Paragraphs':'Akapity','AI Model':'Model AI','Model':'Model','Refresh':'Odśwież','Custom image URL':'Niestandardowy URL obrazu','None found':'Nie znaleziono','Exclusions':'Wykluczenia',
      'Select…':'Wybierz…'
    },
    'zh-CN': {
      'Actions':'操作','Text Formatting':'文本格式','Miscellaneous':'杂项',
      'Do':'执行','Say':'说话','Bold':'粗体','Colour':'颜色','Effect':'效果',
      'Main Text':'正文','Speech':'对话','Internal Monologue':'内心独白','Keywords':'关键词','Add Keyword':'添加关键词',
      'All Caps Effects':'全大写效果','Font':'字体','Font Family':'字体族','Font Size':'字号','Font Weight':'字重','Line Height':'行高','Letter Spacing':'字间距','Text Alignment':'文本对齐','Reset Font':'重置字体',
      'Reset Text Formatting':'重置文本格式','Background':'背景','Background type':'背景类型','Background colour':'背景颜色','Backdrop opacity':'背景不透明度',
      'Language':'语言','Language override':'界面语言','Profiles':'配置文件','Profile':'配置文件','Save as new':'另存为新','Rename':'重命名','Duplicate':'复制','Delete':'删除','Bind to this story':'绑定到此故事','Unbind':'取消绑定',
      'Export':'导出','Import':'导入','Reset All':'全部重置','Default':'默认','Backdrop (behind overlays)':'背景（覆盖层后面）','Solid (override overlays)':'纯色（覆盖层上方）',
      'Reset':'重置','Add':'添加','Enable':'启用','Disable':'禁用',
      'Paragraphs':'段落','AI Model':'AI 模型','Model':'模型','Refresh':'刷新','Custom image URL':'自定义图片 URL','None found':'未找到','Exclusions':'排除项',
      'Select…':'选择…'
    },
    'zh': {
      'Actions':'操作','Text Formatting':'文本格式','Miscellaneous':'杂项',
      'Do':'执行','Say':'说话','Bold':'粗体','Colour':'颜色','Effect':'效果',
      'Main Text':'正文','Speech':'对话','Internal Monologue':'内心独白','Italics':'斜体','Keywords':'关键词','Add Keyword':'添加关键词',
      'All Caps Effects':'全大写效果','Font':'字体','Font Family':'字体族','Font Size':'字号','Font Weight':'字重','Line Height':'行高','Letter Spacing':'字间距','Text Alignment':'文本对齐','Reset Font':'重置字体',
      'Reset Text Formatting':'重置文本格式','Background':'背景','Background type':'背景类型','Background colour':'背景颜色','Backdrop opacity':'背景不透明度',
      'Language':'语言','Language override':'界面语言','Profiles':'配置文件','Profile':'配置文件','Save as new':'另存为新','Rename':'重命名','Duplicate':'复制','Delete':'删除','Bind to this story':'绑定到此故事','Unbind':'取消绑定',
      'Export':'导出','Import':'导入','Reset All':'全部重置','Default':'默认','Backdrop (behind overlays)':'背景（覆盖层后面）','Solid (override overlays)':'纯色（覆盖层上方）',
      'Reset':'重置','Add':'添加','Enable':'启用','Disable':'禁用',
      'Paragraphs':'段落','AI Model':'AI 模型','Model':'模型','Refresh':'刷新','Custom image URL':'自定义图片 URL','None found':'未找到','Exclusions':'排除项',
      'Select…':'選擇…'
    },
    'ar': {
      'Actions':'الإجراءات','Text Formatting':'تنسيق النص','Miscellaneous':'متفرقات',
      'Do':'افعل','Say':'قل','Bold':'عريض','Colour':'اللون','Effect':'التأثير',
      'Main Text':'النص الرئيسي','Speech':'كلام','Internal Monologue':'الحوار الداخلي','Keywords':'كلمات مفتاحية','Add Keyword':'إضافة كلمة مفتاحية',
      'All Caps Effects':'تأثيرات الأحرف الكبيرة','Font':'الخط','Font Family':'عائلة الخط','Font Size':'حجم الخط','Font Weight':'سماكة الخط','Line Height':'ارتفاع السطر','Letter Spacing':'تباعد الحروف','Text Alignment':'محاذاة النص','Reset Font':'إعادة تعيين الخط',
      'Reset Text Formatting':'إعادة تعيين تنسيق النص','Background':'الخلفية','Background type':'نوع الخلفية','Background colour':'لون الخلفية','Backdrop opacity':'عتامة الخلفية',
      'Language':'اللغة','Language override':'لغة الواجهة','Profiles':'الملفات الشخصية','Profile':'ملف شخصي','Save as new':'حفظ كجديد','Rename':'إعادة تسمية','Duplicate':'تكرار','Delete':'حذف','Bind to this story':'ربط بهذه القصة','Unbind':'فك الربط',
      'Export':'تصدير','Import':'استيراد','Reset All':'إعادة تعيين الكل','Default':'افتراضي','Backdrop (behind overlays)':'خلفية (خلف الطبقات)','Solid (override overlays)':'صلب (يتجاوز الطبقات)',
      'Reset':'إعادة تعيين','Add':'إضافة','Enable':'تفعيل','Disable':'تعطيل',
      'Paragraphs':'الفقرات','AI Model':'نموذج الذكاء الاصطناعي','Model':'النموذج','Refresh':'تحديث','Custom image URL':'عنوان صورة مخصص','None found':'لا يوجد','Exclusions':'استثناءات',
      'Select…':'اختر…'
    },
    'hi': {
      'Actions':'कार्य','Text Formatting':'पाठ स्वरूपण','Miscellaneous':'विविध',
      'Do':'करें','Say':'कहें','Bold':'बोल्ड','Colour':'रंग','Effect':'प्रभाव',
      'Main Text':'मुख्य पाठ','Speech':'संवाद','Internal Monologue':'आंतरिक एकालाप','Keywords':'कीवर्ड','Add Keyword':'कीवर्ड जोड़ें',
      'All Caps Effects':'सभी बड़े अक्षर प्रभाव','Font':'फ़ॉन्ट','Font Family':'फ़ॉन्ट परिवार','Font Size':'फ़ॉन्ट आकार','Font Weight':'मोटाई','Line Height':'पंक्ति ऊँचाई','Letter Spacing':'अक्षर अंतराल','Text Alignment':'पाठ संरेखण','Reset Font':'फ़ॉन्ट रीसेट करें',
      'Reset Text Formatting':'पाठ स्वरूपण रीसेट करें','Background':'पृष्ठभूमि','Background type':'पृष्ठभूमि प्रकार','Background colour':'पृष्ठभूमि रंग','Backdrop opacity':'पृष्ठभूमि अपारदर्शिता',
      'Language':'भाषा','Language override':'UI भाषा','Profiles':'प्रोफाइल','Profile':'प्रोफाइल','Save as new':'नए रूप में सहेजें','Rename':'नाम बदलें','Duplicate':'डुप्लिकेट','Delete':'हटाएँ','Bind to this story':'इस कहानी से बाँधें','Unbind':'अनबाइंड',
      'Export':'निर्यात','Import':'आयात','Reset All':'सब रीसेट','Default':'डिफ़ॉल्ट','Backdrop (behind overlays)':'पृष्ठभूमि (ओवरले के पीछे)','Solid (override overlays)':'ठोस (ओवरले को ओवरराइड)',
      'Reset':'रीसेट','Add':'जोड़ें','Enable':'सक्षम करें','Disable':'अक्षम करें',
      'Paragraphs':'अनुच्छेद','AI Model':'AI मॉडल','Model':'मॉडल','Refresh':'ताज़ा करें','Custom image URL':'कस्टम छवि URL','None found':'कोई नहीं मिला','Exclusions':'बहिष्करण',
      'Select…':'चुनें…'
    },
    'id': {
      'Actions':'Aksi','Text Formatting':'Pemformatan Teks','Miscellaneous':'Lainnya',
      'Do':'Lakukan','Say':'Ucapkan','Bold':'Tebal','Colour':'Warna','Effect':'Efek',
      'Main Text':'Teks Utama','Speech':'Ucapan','Internal Monologue':'Monolog internal','Keywords':'Kata kunci','Add Keyword':'Tambah kata kunci',
      'All Caps Effects':'Efek HURUF BESAR','Font':'Font','Font Family':'Keluarga font','Font Size':'Ukuran font','Font Weight':'Ketebalan','Line Height':'Jarak baris','Letter Spacing':'Jarak huruf','Text Alignment':'Perataan teks','Reset Font':'Atur ulang font',
      'Reset Text Formatting':'Atur ulang pemformatan teks','Background':'Latar belakang','Background type':'Jenis latar belakang','Background colour':'Warna latar','Backdrop opacity':'Opasitas latar',
      'Language':'Bahasa','Language override':'Bahasa antarmuka','Profiles':'Profil','Profile':'Profil','Save as new':'Simpan sebagai baru','Rename':'Ganti nama','Duplicate':'Gandakan','Delete':'Hapus','Bind to this story':'Ikat ke cerita ini','Unbind':'Lepaskan',
      'Export':'Ekspor','Import':'Impor','Reset All':'Atur ulang semua','Default':'Default','Backdrop (behind overlays)':'Latar (di balik overlay)','Solid (override overlays)':'Solid (timpa overlay)',
      'Reset':'Atur ulang','Add':'Tambah','Enable':'Aktifkan','Disable':'Nonaktifkan',
      'Paragraphs':'Paragraf','AI Model':'Model AI','Model':'Model','Refresh':'Segarkan','Custom image URL':'URL gambar kustom','None found':'Tidak ditemukan','Exclusions':'Pengecualian',
      'Select…':'Pilih…'
    },
    'ru': {
      'Actions':'Действия','Text Formatting':'Форматирование текста','Miscellaneous':'Прочее',
      'Do':'Делать','Say':'Сказать','Bold':'Жирный','Colour':'Цвет','Effect':'Эффект',
      'Main Text':'Основной текст','Speech':'Речь','Internal Monologue':'Внутренний монолог','Keywords':'Ключевые слова','Add Keyword':'Добавить слово',
      'All Caps Effects':'Эффекты ЗАГЛАВНЫМИ','Font':'Шрифт','Font Family':'Семейство шрифтов','Font Size':'Размер шрифта','Font Weight':'Начертание','Line Height':'Межстрочный интервал','Letter Spacing':'Межбуквенный интервал','Text Alignment':'Выравнивание текста','Reset Font':'Сбросить шрифт',
      'Reset Text Formatting':'Сбросить форматирование текста','Background':'Фон','Background type':'Тип фона','Background colour':'Цвет фона','Backdrop opacity':'Непрозрачность фона',
      'Language':'Язык','Language override':'Язык интерфейса','Profiles':'Профили','Profile':'Профиль','Save as new':'Сохранить как новый','Rename':'Переименовать','Duplicate':'Дублировать','Delete':'Удалить','Bind to this story':'Привязать к истории','Unbind':'Отвязать',
      'Export':'Экспорт','Import':'Импорт','Reset All':'Сбросить всё','Default':'По умолчанию','Backdrop (behind overlays)':'Фон (за слоями)','Solid (override overlays)':'Сплошной (поверх слоёв)',
      'Reset':'Сброс','Add':'Добавить','Enable':'Включить','Disable':'Выключить',
      'Paragraphs':'Абзацы','AI Model':'Модель ИИ','Model':'Модель','Refresh':'Обновить','Custom image URL':'Пользовательский URL изображения','None found':'Ничего не найдено','Exclusions':'Исключения',
      'Select…':'Выбрать…'
    }
  };
  const getLocalePack = (langRaw)=>{
    try{
      const lang=(langRaw||'en-US').replace('_','-');
      const base=lang.split('-')[0];
      const en=__LOCALES_ALL['en-US'] || {};
      const active=__LOCALES_ALL[lang] || __LOCALES_ALL[base] || en;
      return { active, fallback: en };
    }catch(_){ return { active: (__LOCALES_ALL['en-US']||{}), fallback: {} }; }
  };
  const __AIDT_MISSING_I18N = new Set();
  const T=(k)=>{ try{ const raw=(settings.languageOverride&&settings.languageOverride!=='default')?settings.languageOverride:'en-US'; const {active,fallback}=getLocalePack(raw); const val = active[k] || fallback[k]; if (val) return val; if (__aidt_isDebugEnabled && __aidt_isDebugEnabled()){ if (!__AIDT_MISSING_I18N.has(k)){ __AIDT_MISSING_I18N.add(k); try{ console.warn('[AIDT] Missing i18n key:', k, 'for', raw); }catch(_c){} } } return k; }catch(_){ return k; } };
  // resilient storage helpers (fallback to in-memory if localStorage is blocked/quotaed)
  const __memStore = Object.create(null);
  const safeGet = (k)=>{ try{ return localStorage.getItem(k);}catch(_){ return __memStore[k] ?? null; } };
  const safeSet = (k,v)=>{ try{ localStorage.setItem(k,v); }catch(_){ __memStore[k]=v; } };
  const safeRemove = (k)=>{ try{ localStorage.removeItem(k);}catch(_){ delete __memStore[k]; } };
  const loadJSON = (k, fb) => { try{ const r=safeGet(k); return r?JSON.parse(r):clone(fb);}catch(_){ return clone(fb);} };
  const saveJSON = (k, v) => { try{ safeSet(k, JSON.stringify(v)); }catch(_){ } };
  const debounce  = (fn, ms)=>{ let t=null; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), ms); }; };

  // Pause-aware observer factory that auto-registers and de-dupes observe calls
  function createAidtObserver(callback){
    try{
      const mo = new MutationObserver(function(){
        try{
          if (window.AIDT_isPaused && window.AIDT_isPaused()) return;
          callback.apply(null, arguments);
        }catch(_){ }
      });
      try{ if (window.__AIDT_OBSERVERS_ADD__) window.__AIDT_OBSERVERS_ADD__(mo); }catch(_){ }
      return mo;
    }catch(_){ return new MutationObserver(callback); }
  }

  // Safe HTML replacement helper using DOM operations (avoids direct innerHTML where possible)
  function AIDT_replaceHTML(target, html){
    try{
      if (!target || html==null) return;
      if (window.AIDT_isPaused && window.AIDT_isPaused()) return;
      try{ window.AIDT_pause && window.AIDT_pause(); }catch(_){ }
      const tpl=document.createElement('template');
      try{ tpl.innerHTML=String(html); }catch(_ih){ try{ target.innerHTML=String(html); return; }catch(_fb){} }
      while (target.firstChild) { try{ target.removeChild(target.firstChild); }catch(_rm){ break; } }
      try{ target.appendChild(tpl.content.cloneNode(true)); }catch(_ap){ try{ target.innerHTML=String(html); }catch(_fb2){} }
    }finally{ try{ window.AIDT_resume && window.AIDT_resume(); }catch(_){ } }
  }

  // Debug helpers (off by default; enable with localStorage 'AIDT_DEBUG' = '1' or window.__AIDT_DEBUG__ = true)
  const __aidt_isDebugEnabled = ()=>{ try{ return window.__AIDT_DEBUG__ === true || safeGet('AIDT_DEBUG')==='1'; }catch(_){ return false; } };
  const dbg  = function(){ if (!__aidt_isDebugEnabled()) return; try{ console.debug.apply(console, ['[AIDT]'].concat(Array.from(arguments))); }catch(_){ } };
  const dbgw = function(){ if (!__aidt_isDebugEnabled()) return; try{ console.warn.apply(console, ['[AIDT]'].concat(Array.from(arguments))); }catch(_){ } };
  function __aidt_debugMarkLatest(node){ if (!__aidt_isDebugEnabled()) return; try{ if (node && node.setAttribute) node.setAttribute('data-aidt-latest','1'); }catch(_){ } }
  function __aidt_debugDumpLatest(){ if (!__aidt_isDebugEnabled()) return; try{ const n = document.querySelector('[data-aidt-latest="1"]'); console.debug('[AIDT] latest:', n); }catch(_){ } }

  // Ensure Default exists
  let profiles = loadJSON(LS_PROFILES, {profiles:{}});
  try{ profiles._meta = profiles._meta || { lastModifiedAt: {} }; }catch(_){ }
  if (!profiles.profiles.Default) profiles.profiles.Default = clone(DEFAULTS);
  saveJSON(LS_PROFILES, profiles);

  // Active profile
  const urlKey   = location.pathname || '';
  let bindings   = loadJSON(LS_BINDINGS, {});
  const bound    = bindings[urlKey];
  let activeName = bound || (safeGet(ACTIVE_PROFILE) || 'Default');
  if (!profiles.profiles[activeName]) { activeName='Default'; safeSet(ACTIVE_PROFILE,'Default'); }
  let settings   = merge(DEFAULTS, profiles.profiles[activeName] || {});

  // Apply last-known Paragraphs choice ASAP (before publish)
  try{
    const lastParEarly = safeGet(lastParKeyFor(activeName)) || safeGet(LS_LAST_PARAGRAPHS);
    if (lastParEarly && typeof lastParEarly === 'string' && lastParEarly.trim()){
      settings.paragraphs = lastParEarly;
      try{ profiles.profiles[activeName]=clone(settings); saveJSON(LS_PROFILES, profiles); }catch(_){ }
    }
  }catch(_){ }

  function publishSettings(){
    try{ window.__AIDT_SETTINGS__ = settings; }catch(e){}
  }
  publishSettings();
  try{ profiles.profiles[activeName]=clone(settings); saveJSON(LS_PROFILES, profiles); }catch(_){ }

  const persistSettings = ()=>{ profiles=loadJSON(LS_PROFILES,{profiles:{}}); profiles._meta = profiles._meta || { lastModifiedAt: {} }; profiles.profiles[activeName]=clone(settings); try{ profiles._meta.lastModifiedAt[activeName]=new Date().toISOString(); }catch(_){ } saveJSON(LS_PROFILES,profiles); };
  // Periodically prune old profile metadata (keep lastModifiedAt for existing profiles only)
  try{
    if (!window.__AIDT_PRUNE_TIMER__){
      window.__AIDT_PRUNE_TIMER__ = setInterval(function(){
        try{
          const cur = loadJSON(LS_PROFILES,{profiles:{}});
          if (!cur || !cur._meta || !cur._meta.lastModifiedAt) return;
          const existing = new Set(Object.keys(cur.profiles||{}));
          Object.keys(cur._meta.lastModifiedAt).forEach(function(name){ if (!existing.has(name)) delete cur._meta.lastModifiedAt[name]; });
          saveJSON(LS_PROFILES, cur);
        }catch(_){ }
      }, 10*60*1000);
    }
  }catch(_){ }
  const persistSettingsDebounced = debounce(()=>{ try{ persistSettings(); }catch(_){ } }, 250);
  // Script version (for UI title)
  const SCRIPT_VERSION = (function(){ try{ return (typeof GM_info!=='undefined' && GM_info && GM_info.script && GM_info.script.version) || ''; }catch(_){ return ''; } })();
  // Preset colors used by dropdowns
  const COLOR_PRESETS = [
    { name:'White',        value:'#ffffff' },
    { name:'Silver',       value:'#cbd5e1' },
    { name:'Gray',         value:'#9ca3af' },
    { name:'Slate',        value:'#64748b' },
    { name:'Gold',         value:'#facc15' },
    { name:'Yellow',       value:'#d2ed3f' },
    { name:'Amber',        value:'#f59e0b' },
    { name:'Orange',       value:'#fb923c' },
    { name:'Peach',        value:'#fed7aa' },
    { name:'Coral',        value:'#fb7185' },
    { name:'Red',          value:'#ef4444' },
    { name:'Rose',         value:'#f43f5e' },
    { name:'Pink',         value:'#ec4899' },
    { name:'Lavender',     value:'#a78bfa' },
    { name:'Purple',       value:'#8b5cf6' },
    { name:'Light Blue',   value:'#93c5fd' },
    { name:'Sky Blue',     value:'#38bdf8' },
    { name:'Blue',         value:'#60a5fa' },
    { name:'Aqua',         value:'#7dd3fc' },
    { name:'Cyan',         value:'#22d3ee' },
    { name:'Mint',         value:'#99f6e4' },
    { name:'Teal',         value:'#2dd4bf' },
    { name:'Lime',         value:'#84cc16' },
    { name:'Green',        value:'#10b981' }
  ];
  // Theme presets (opt-in): partial settings to apply
  const THEME_PRESETS = {
    'Default': {
      backgroundType: 'default',
      textFormatting: { mainText: { colour: '#ffffff' } },
      speech: { colour: '#ffffff' },
      internalMonologue: { colour: '#9ca3af' },
      italics: { colour: '#facc15' },
      fontFamily: 'inherit',
      fontSize: 100,
      fontWeight: 'default',
      lineHeight: 1.5,
      letterSpacing: 0,
      textAlign: 'default',
      allCapsEffect: 'None'
    },
    'Noir': {
      backgroundType: 'solid', bgColour: '#0b1220',
      textFormatting: { mainText: { colour: '#e5e7eb' } },
      speech: { colour: '#ffffff' },
      internalMonologue: { colour: '#9ca3af' },
      italics: { colour: '#facc15' },
      fontFamily: 'Inter', lineHeight: 1.5
    },
    'Paperback': {
      backgroundType: 'solid', bgColour: '#f8f5e7',
      textFormatting: { mainText: { colour: '#1f2937' } },
      speech: { colour: '#111827' },
      internalMonologue: { colour: '#6b7280' },
      italics: { colour: '#a16207' },
      fontFamily: 'Georgia', lineHeight: 1.6, letterSpacing: 0.01, textAlign: 'left'
    },
    'Neon': {
      backgroundType: 'gradient', bgGradient: 'linear-gradient(180deg,#0b1220,#0a1423)',
      textFormatting: { mainText: { colour: '#e5e7eb' } },
      speech: { colour: '#22d3ee' },
      internalMonologue: { colour: '#f43f5e' },
      italics: { colour: '#a78bfa' },
      fontFamily: 'Inter', lineHeight: 1.5
    },
    'Solarized Dark': {
      backgroundType: 'solid', bgColour: '#002b36',
      textFormatting: { mainText: { colour: '#eee8d5' } },
      speech: { colour: '#93a1a1' },
      internalMonologue: { colour: '#839496' },
      italics: { colour: '#b58900' },
      fontFamily: 'Inter', lineHeight: 1.55
    }
  };

  // ---------------- Containers (single source of truth) ----------------
  const KNOWN_CONTAINERS = [
    '#do-not-copy',
    '#transition-opacity',
    '#gameplay-output',
    '[data-testid="adventure-text"]',
    '[data-testid="story-container"]',
    '[data-testid="message-text"]',
    '[data-testid="playback-content"]',
    // AI Dungeon headings/body text wrappers
    'span.font_heading',
    'span.font_gameplay', 'p.font_gameplay', 'div.font_gameplay',
    // AI Dungeon specific wrappers for the newest paragraph
    '#gameplay-output #do-not-copy',
    '#gameplay-output #transition-opacity',
    '#gameplay-output span._blw-0hover-0px',
    'span._blw-0hover-0px',
    '.w_comment', '.w-comment',              // SAY/comment blocks
    'main [class*="prose"]',
    'article',
    'blockquote'                              // catch "You say ..." layouts
  ];
  const getRoots = ()=>{
    const set=new Set();
    for (const sel of KNOWN_CONTAINERS) {
      try{ document.querySelectorAll(sel).forEach(n=>set.add(n)); }catch{}
    }
    set.add(document.body); // always
    return Array.from(set);
  };

  // ---------------- DOM helpers ----------------
  const qsa  = (root,sel)=>{ try{ return Array.from((root||document).querySelectorAll(sel)); }catch{ return []; } };
  const qs   = (root,sel)=>{ try{ return (root||document).querySelector(sel); }catch{ return null; } };
  let __AIDT_TEXT_CACHE = new WeakMap();
  let __AIDT_PICK_CACHE = new WeakMap();
  const txt  = el=>{ try{ if (!el) return ''; if (__AIDT_TEXT_CACHE && __AIDT_TEXT_CACHE.has(el)) return __AIDT_TEXT_CACHE.get(el); const v=(typeof el.textContent==='string'?el.textContent:'')||''; if (__AIDT_TEXT_CACHE) __AIDT_TEXT_CACHE.set(el,v); return v; }catch{ return ''; } };
  const isEditable = el => { try{ return !!(el && el.closest && el.closest('input,textarea,[contenteditable="true"]')); }catch{ return false; } };
  const hasScript  = el => { try{ return !!(el.querySelector && el.querySelector('script,style,template,noscript')); }catch{ return true; } };
  const isVisible  = el => {
    try{
      if (!el) return false;
      if (el.closest && el.closest('[aria-hidden="true"], [hidden]')) return false;
      const cs = (window && window.getComputedStyle) ? getComputedStyle(el) : null;
      if (cs && (cs.display==='none' || cs.visibility==='hidden')) return false;
      const r = el.getClientRects ? el.getClientRects() : null;
      return !!(r && r.length && r[0].width>0 && r[0].height>0);
    }catch{ return true; }
  };
  const isWithinEditable = el => { try{ return !!(el && el.closest && el.closest('[contenteditable="true"]')); }catch{ return false; } };
  const isEditingActive = ()=>{ try{ const ed=document.querySelector('[contenteditable="true"]'); if(!ed||!ed.closest) return false; return !!(ed.closest('#gameplay-output')||ed.closest('#transition-opacity')||ed.closest('#do-not-copy')); }catch(_){ return false; } };
  const hasVisibleDesc = (root, selector)=>{
    try{
      const list = root && root.querySelectorAll ? root.querySelectorAll(selector) : [];
      for (let i=0;i<list.length;i++){ if (isVisible(list[i])) return true; }
      return false;
    }catch{ return false; }
  };
  const isDanger   = el => {
    try{
      if (!el) return true;
      const id=el.id||''; if (id==='__next'||id==='__NEXT_DATA__') return true;
      if (el.getAttribute && el.getAttribute('type')==='application/json') return true;
      const t=el.tagName; return ['HEAD','HTML','BODY','SCRIPT','TEMPLATE','STYLE'].includes(t);
    }catch{ return true; }
  };
  // ---------------- Regex rules ----------------
  // Constrain inline markers to a single line to avoid cross-paragraph captures
  const reBoldAsterisk   = /\*\*(?=\S)([^\n*]*?\S)\*\*/g;
  const reBoldUnderscore = /__(?=\S)([^\n_]*?\S)__/g;
  const reItalAsterisk   = /\*(?=\S)([^\n*]*?\S)\*/g;
  const reItalUnderscore = /_(?=\S)([^\n_]*?\S)_/g;

  // IM marked by *"..."* (straight quotes only to avoid interference with regular italics)
  // Only treat IM when the asterisk is directly adjacent to the opening quote (no trailing text before it)
  const reItalicSpeech = /(?:^|\s)\*"([^\n]*?)"\*(?=$|\s)/g;
  // Open-only/cut-off normalization helpers
  // Important: do not allow newline between * and opening quote, or before trailing *
  // Require leading boundary before * so a trailing * from italics doesn't pair with a following speech quote
  const reIMOpenOnlyClose      = /(?:^|[^\S\r\n])\*\s*"([^\n]*?)"(?![^\S\r\n]*\*)/g;      // *"..." → *"..."*
  const reItalOpenOnlyAsterisk = /\*(?=\S)([^*\n]+?)(?=$|\n)/g;                     // *text → *text*
  const reItalOpenOnlyUnders   = /_(?=\S)([^_\n]+?)(?=$|\n)/g;                       // _text → _text_
  // Line-level IM: asterisks that wrap a sentence on its own line (no quotes)
  // Line-level IM (no quotes): asterisks around a sentence on its own line. Avoid starting with a quote character.
  const reIMLineAsterisk = /(^|\n)\*\s*([^"“”][^\n]*?\S)\s*\*(?=$|\n)/g;
  // Make speech auto-close only when starting a new line, to avoid mid-sentence captures
  const reSpeechOpenOnlyStr    = /(^|[\r\n])\s*"([^"\r\n]+?)\s*$/g;               // "text → "text"
  // Curly-quote open-only matcher for a new line (smart quotes)
  const reSpeechOpenOnlyCurly  = /(^|[\r\n])\s*“([^”\r\n]+?)\s*$/g;

  // Speech: plain quotes but not IM (supports straight and curly quotes)
  let reSpeechStraight, reSpeechCurly;
  // Require at least 2 non-space chars inside and no leading/trailing space; also block numeric inch marks (e.g., 5'8" or 3").
  try { reSpeechStraight = new RegExp('(?<![\\*0-9\'])\"(?!\s)([^\"\\n]{2,}?)(?<!\s)\"(?!\\*)','g'); }
  catch { reSpeechStraight = /(^|[^*0-9'])\"(?!\s)([^\"\n]{2,}?)(?<!\s)\"(?=[^*]|$)/g; }
  // Curly quotes — same numeric guard, using smart quotes “ and ”
  try { reSpeechCurly = new RegExp('(?<![\\*0-9\'])”(?!\\s)([^”\\n]{2,}?)(?<!\\s)”(?!\\*)','g'); }
  catch { reSpeechCurly = /(^|[^*0-9'])”(?!\s)([^”\n]{2,}?)(?<!\s)”(?=[^*]|$)/g; }

  const reStrike  = /~~(?=\S)(.+?)(?<=\S)~~/g;
  const reCode    = /`([^`]+?)`/g;
  const reHi      = /\^\^(.+?)\^\^|==(.+?)==/g;
  const reColour  = /\[color=(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)\]([\s\S]+?)\[\/color\]/g;

  // Decode common HTML entities to avoid double-escaping when wrapping text extracted from HTML
  const decodeEntities = (text)=>{
    try{
      if (!window.__AIDT_TA__){ try{ window.__AIDT_TA__=document.createElement('textarea'); }catch(_){ } }
      const ta = window.__AIDT_TA__;
      if (ta){ ta.innerHTML=String(text==null?'':text); return ta.value; }
    }catch(_){ }
    try{
      return String(text==null?'':text)
        .replace(/&amp;/g,'&')
        .replace(/&lt;/g,'<')
        .replace(/&gt;/g,'>')
        .replace(/&quot;/g,'"')
        .replace(/&#39;/g,"'");
    }catch(__){ return String(text==null?'':text); }
  };

  const wrap = (text, cls, style)=>{
    const span=document.createElement('span'); span.className=cls?('aidt '+cls):'aidt';
    if (style) span.setAttribute('style', style);
    span.textContent=decodeEntities(text);
    return span.outerHTML;
  };

  // Only replace outside tags we injected/others injected
  const replaceOutsideTags = (html, regex, replacer)=>{
    if (!html || html.indexOf('<') === -1) return html.replace(regex, replacer);
    const parts = html.split(/(<[^>]+>)/g);
    for (let i=0;i<parts.length;i++){
      if (!parts[i] || parts[i].charCodeAt(0) === 60) continue;
      parts[i] = parts[i].replace(regex, replacer);
    }
    return parts.join('');
  };

  const buildKeywordRegex = ()=>{
    const list=(settings.textFormatting.keywords||[]).filter(Boolean);
    if (!list.length) return null;
    const esc=list.map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
    try{ return new RegExp('(' + esc.join('|') + ')','gi'); }catch{ return null; }
  };
  const buildCapsExcludeRegex = ()=>{
    const list=(settings.textFormatting.capsExclusions||[]).filter(Boolean);
    if (!list.length) return null;
    const esc=list.map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
    try{ return new RegExp('(^|[^A-Za-z])(' + esc.join('|') + ')(?=$|[^A-Za-z])','g'); }catch{ return null; }
  };
  // Remove existing ALL CAPS spans that now match an exclusion
  const unwrapExcludedAllCaps = ()=>{
    try{
      const re = buildCapsExcludeRegex();
      if (!re) return;
      // Use a fresh regex per test to avoid lastIndex effects of /g
      document.querySelectorAll('span.aidt-allcaps').forEach(el=>{
        try{
          const raw=(el.textContent||''); if(raw==='' ) return;
          const testRe=new RegExp(re.source, 'g');
          if (testRe.test(raw)){
            // Preserve original whitespace around the span content
            el.replaceWith(document.createTextNode(raw));
          }
        }catch(_){ }
      });
    }catch(_){ }
  };

  // Marker to decide whether a subtree likely needs parsing
  const MARKER_RE = /(\*\*|__|\*(?=\S)[^*]*\*|_(?=\S)[^_]*_|~~.*?~~|`[^`]+`|\^\^.*?\^\^|==.*?==|\[color=|".+?"|".+?")/;
  const CAPS_MARKER_RE = /\b[A-Z]{2,}\b/;

  // Frequently used tests precompiled
  const RE_QUOTED_SPEECH = /(["])([^"\n]+)(["])/; // "..." on a single line
  const RE_IM_STAR = /\*(?:"|["])([\s\S]*?)(?:"|["])*\*/; // *"..."*
  const RE_SPEECH_OR_IM = new RegExp('(' + RE_QUOTED_SPEECH.source + ')|' + RE_IM_STAR.source);
  // ---------------- Transform (IM protected via placeholders) ----------------
  const transformString = (s)=>{
    let out=s;

    // Fast path: if no formatting/speech markers and no keyword/ALL-CAPS features, skip work
    try{
      const kwEnabled = !!((settings.textFormatting && settings.textFormatting.keywords || []).length);
      const capsEnabled = !!(settings.allCapsEffect && settings.allCapsEffect !== 'None');
      if (!kwEnabled && !capsEnabled && !MARKER_RE.test(s)) return s;
    }catch(_){ }

    // Normalize cut-off/open-only markup before parsing (conservative)
    // 1) Close *"..." → *"..."*
    out = replaceOutsideTags(out, reIMOpenOnlyClose,      (_, inner)=>'*"' + inner + '"*');
    // 2) Per-line conservative auto-closing:
    try{
      // Only apply per-line auto-closing when handling multi-line content.
      // This avoids appending stray quotes to short per-word overlay tokens.
      if (/\n/.test(out)){
        const fixLine = (line)=>{
          const t = line.trimStart();
          // Close lone starting *text → *text*
          if (t.startsWith('*')){
            const rest = t.slice(1);
            if (rest.indexOf('*') === -1) return line + '*';
          }
          // Close lone starting _text → _text_
          if (t.startsWith('_')){
            const rest = t.slice(1);
            if (rest.indexOf('_') === -1) return line + '_';
          }
          // Close speech only if the line has odd number of straight quotes
          const straightCount = (line.match(/\"/g)||[]).length;
          if (/^\s*\"/.test(line) && (straightCount % 2 === 1)) return line + '"';
          // Close curly speech only if odd number of curly quotes (use real curly chars)
          const curlyCountL = (line.match(/[""]/g)||[]).length;
          const curlyCountR = (line.match(/[""]/g)||[]).length;
          if (/^[\s]*[""]/.test(line) && ((curlyCountL + curlyCountR) % 2 === 1)) return line + '"';
          return line;
        };
        out = out.split(/\n/).map(fixLine).join('\n');
      }
    }catch(_){ }

    // Placeholders for IM so Speech pass cannot catch them
    const IM_TOK='§IM§';
    const imBuf=[];
    out = replaceOutsideTags(out, reItalicSpeech, (_, inner)=>{ imBuf.push(inner); return IM_TOK + (imBuf.length-1) + IM_TOK; });

    // Line-level IM (no quotes) before generic italic handling
    try{
      const imStyleEarly = 'color:' + (settings.internalMonologue.colour || '#9ca3af') + ';' +
                           (settings.internalMonologue.bold ? 'font-weight:700;' : '');
      out = replaceOutsideTags(out, reIMLineAsterisk, (m, pre, inner)=>{
        return (pre||'') + wrap(inner, 'aidt-im aidt-italic', imStyleEarly);
      });
    }catch{}

    // Code / strike
    out = replaceOutsideTags(out, reCode,   (_, c)=>wrap(c,'aidt-code'));
    out = replaceOutsideTags(out, reStrike, (_, t)=>wrap(t,'aidt-strike'));

    // Bold / italic
    out = replaceOutsideTags(out, reBoldAsterisk,   (_, t)=>wrap(t,'aidt-bold'));
    out = replaceOutsideTags(out, reBoldUnderscore, (_, t)=>wrap(t,'aidt-bold'));
    out = replaceOutsideTags(out, reItalAsterisk,   (_, t)=>wrap(t,'aidt-italic'));
    out = replaceOutsideTags(out, reItalUnderscore, (_, t)=>wrap(t,'aidt-italic'));
    // Highlights / colour tags
    out = replaceOutsideTags(out, reHi,     (_, a,b)=>wrap((a||b),'aidt-hi'));
    out = replaceOutsideTags(out, reColour, (_, col, inner)=>wrap(inner,'aidt-color','color:' + col));
    // (IM open-only handled by normalization above)
    // Speech on remaining quotes (not IM)
    if (settings.rSpeechWeight){
      const spStyle = 'color:' + (settings.speech.colour || '#ffffff') + ';' +
                      (settings.speech.bold ? 'font-weight:700;' : '');
      const shouldWrapSpeech = (t)=>{
        try{
          const s=(t||'').trim();
          if (!s) return false;
          // Always allow if it ends with common sentence punctuation (inside quotes)
          if (/[.!?,;:…]$/.test(s)) return true;
          // Multi-word quotes are fine
          if (/\s/.test(s)) return true;
          // Otherwise require a bit of length to avoid inch marks/false positives
          return s.length >= 6;
        }catch(_){ return true; }
      };
      const straightHasPrefix = reSpeechStraight.source.indexOf('(^|[^*])') === 0;
      const curlyHasPrefix    = reSpeechCurly.source.indexOf('(^|[^*])') === 0;
      if (straightHasPrefix) out = replaceOutsideTags(out, reSpeechStraight, (m, pre, inner)=>(pre||'') + (shouldWrapSpeech(inner) ? wrap('"' + inner + '"','aidt-speech', spStyle) : m));
      else                   out = replaceOutsideTags(out, reSpeechStraight, (_, inner)=> (shouldWrapSpeech(inner) ? wrap('"' + inner + '"','aidt-speech', spStyle) : '"'+inner+'"'));
      if (curlyHasPrefix)    out = replaceOutsideTags(out, reSpeechCurly,    (m, pre, inner)=>(pre||'') + (shouldWrapSpeech(inner) ? wrap('"' + inner + '"','aidt-speech', spStyle) : m));
      else                   out = replaceOutsideTags(out, reSpeechCurly,    (_, inner)=> (shouldWrapSpeech(inner) ? wrap('"' + inner + '"','aidt-speech', spStyle) : '"'+inner+'"'));
    }

    // Keywords (phrases supported) with per-keyword effect/bold
    try{
      const rawList = (settings.textFormatting && settings.textFormatting.keywords) || [];
      const list = rawList.map(k=>{
        if (!k) return null;
        if (typeof k === 'string') return { text: k, effect: 'None', bold: false, whole: true, caseSensitive: false, regex: false };
        const t = (k.text||'').toString(); if (!t) return null;
        const eff = (k.effect||'None'); const b = !!k.bold;
        // Simplify UI model: Smart whole-word by default; caseSensitive toggled globally via settings.textFormatting.caseSensitive if present
        const whole = (k.whole!==false);
        const cs = !!(k.caseSensitive || (settings.textFormatting && settings.textFormatting.caseSensitive));
        const rx = false;
        const color = (k.color||'');
        return { text: t, effect: eff, bold: b, whole: whole, caseSensitive: cs, regex: rx, color: color };
      }).filter(Boolean);
      if (list.length){
        const applyKeywordsTo = (text)=>{
          let acc=text;
          for (let i=0;i<list.length;i++){
            const kw=list[i];
            let re;
            {
            const esc=kw.text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
              if (kw.whole){
                re = new RegExp('(^|[^\\\w])(' + esc + ')(?=$|[^\\\w])', kw.caseSensitive? 'g':'gi');
              } else {
                re = new RegExp('(' + esc + ')', kw.caseSensitive? 'g':'gi');
              }
            }
            const cls = 'aidt-keyword' + ((kw.effect && kw.effect!=='None')?(' aidt-eff-'+kw.effect):'');
            const colorStyle = (kw.color && typeof kw.color==='string' && kw.color!=='') ? ('color:'+kw.color+';') : '';
            const style = (kw.bold ? 'font-weight:700;' : '') + colorStyle;
            acc = acc.replace(re, (m, pre, hit)=>{
              const span=document.createElement('span');
              span.className='aidt '+cls; if(style) span.setAttribute('style', style);
              span.setAttribute('data-aidt-keyword', kw.text);
              // Support both forms: with captured prefix (whole-word) and without
              const matched = (typeof hit==='string' && hit.length) ? hit : (m||'');
              const content = (typeof hit==='string' && hit.length) ? hit : m;
              span.textContent=content;
              return (pre||'') + span.outerHTML;
            });
          }
          return acc;
        };
        if (!/<[^>]+>/.test(out)) out = applyKeywordsTo(out);
        else {
          const parts = out.split(/(<[^>]+>)/g);
          for (let i=0;i<parts.length;i++){
            if (!parts[i] || parts[i].charCodeAt(0)===60) continue;
            parts[i]=applyKeywordsTo(parts[i]);
          }
          out = parts.join('');
        }
      }
    }catch{}

    // Now restore IM placeholders as spans (quotes included)
    if (imBuf.length){
      const imStyle = 'color:' + (settings.internalMonologue.colour || '#9ca3af') + ';' +
                      (settings.internalMonologue.bold ? 'font-weight:700;' : '');
      out = out.replace(new RegExp(IM_TOK + '(\\d+)' + IM_TOK, 'g'), (_, i)=>{
        const inner = imBuf[Number(i)] || '';
        const plain = '"' + inner + '"';
        // Guard: if inner is empty/whitespace or just a newline, do not treat as IM
        if (!inner || !/\S/.test(inner) || inner.replace(/[\s\u200b]+/g,'').length===0) return plain;
        return wrap(plain, 'aidt-im aidt-italic', imStyle);
      });
    }
    // All Caps Effects: wrap contiguous ALL CAPS segments when enabled
    try{
      const eff=settings.allCapsEffect||'None';
      if (eff && eff!=='None'){
        const exRe = buildCapsExcludeRegex();
        const wrapCaps=(text)=>{
          const tokens=text.split(/(\s+)/);
          const outParts=[]; let buf=[]; let inCaps=false;
          const isCapsToken=(tok)=>{
            const letters=tok.replace(/[^A-Za-z]+/g,'');
            return letters.length>=2 && letters===letters.toUpperCase();
          };
          const isExcluded=(tok)=>{
            if (!exRe) return false; return !!tok.replace(/\s+/g,'').match(exRe);
          };
          for (let i=0;i<tokens.length;i++){
            const tok=tokens[i];
            if (i%2===1){ // whitespace
              if (inCaps) buf.push(tok); else outParts.push(tok);
              continue;
            }
            if (!tok){ continue; }
            if (isCapsToken(tok) && !isExcluded(tok)){
              inCaps=true; buf.push(tok);
            } else {
              if (inCaps){ outParts.push(wrap(buf.join(''),'aidt-allcaps aidt-eff-'+eff)); buf=[]; inCaps=false; }
              outParts.push(tok);
            }
          }
          if (inCaps){ outParts.push(wrap(buf.join(''),'aidt-allcaps aidt-eff-'+eff)); }
          return outParts.join('');
        };
        if (!/<[^>]+>/.test(out)) out=wrapCaps(out);
        else {
          const parts=out.split(/(<[^>]+>)/g);
          for (let i=0;i<parts.length;i++){
            if (!parts[i] || parts[i].charCodeAt(0)===60) continue;
            parts[i]=wrapCaps(parts[i]);
          }
          out=parts.join('');
        }
      }
    }catch{}

    return out;
  };

  // ---------------- Parser (deep text walker) ----------------
  const parseRootsDeep = ()=>{
    const perfOn = __aidt_isDebugEnabled && __aidt_isDebugEnabled();
    try{ if (perfOn && performance && performance.mark) performance.mark('aidt:parse:start'); }catch(_){ }
    if (!settings.enabled) return;

    try{ __AIDT_TEXT_CACHE = new WeakMap(); __AIDT_PICK_CACHE = new WeakMap(); }catch(_){ __AIDT_TEXT_CACHE=null; __AIDT_PICK_CACHE=null; }

    const roots=getRoots();
    const kwEnabled=(settings.textFormatting.keywords||[]).length>0;
    const capsEnabled=!!(settings.allCapsEffect && settings.allCapsEffect!=='None');

    for (const root of roots){
      if (!root || isDanger(root)) continue;
      root.classList.add('aidt-scope');

      const subtree = txt(root);
      if (!kwEnabled && !(MARKER_RE.test(subtree) || (capsEnabled && CAPS_MARKER_RE.test(subtree)))) continue;

      const walker=document.createTreeWalker(
        root, NodeFilter.SHOW_TEXT,
        { acceptNode(node){
            try{
              const p=node.parentNode; if(!p) return NodeFilter.FILTER_REJECT;
              if (p.closest('input,textarea,script,style,template,code,pre')) return NodeFilter.FILTER_REJECT;
              if (p.closest('.aidt')) return NodeFilter.FILTER_REJECT;
              if (hasScript(p)) return NodeFilter.FILTER_REJECT;
              // Allow formatting even when nodes are contenteditable; we still exclude inputs/textarea above
              const t=node.nodeValue||''; if(!/\S/.test(t)) return NodeFilter.FILTER_REJECT;
              if (t.length>4000) return NodeFilter.FILTER_REJECT;
              if (!kwEnabled && !(MARKER_RE.test(t) || (capsEnabled && CAPS_MARKER_RE.test(t)))) return NodeFilter.FILTER_REJECT;
              return NodeFilter.FILTER_ACCEPT;
            }catch{ return NodeFilter.FILTER_REJECT; }
        }}, false);

      const targets=[];
      for (let n=walker.nextNode(); n; n=walker.nextNode()) targets.push(n);

      for (const tn of targets){
        const raw=String(tn.nodeValue||'');
        const html=transformString(raw);
        if (html!==raw){
          const span=document.createElement('span'); span.innerHTML=html;
          tn.replaceWith(span);
        }
      }
    }
    try{ if (perfOn && performance && performance.mark) { performance.mark('aidt:parse:end'); performance.measure('aidt:parse', 'aidt:parse:start', 'aidt:parse:end'); } }catch(_){ }
  };

  const reparse    = debounce(()=>parseRootsDeep(), 50);
  const reparseNow = ()=>parseRootsDeep();

  // Parse only the latest output container (fast path for newest paragraph)
  const LATEST_SELECTORS = '#gameplay-output #do-not-copy, #do-not-copy, #gameplay-output #transition-opacity, #gameplay-output span._blw-0hover-0px, span._blw-0hover-0px, #transition-opacity, [data-testid="adventure-text"], [data-testid="message-text"], [data-testid="playback-content"], [data-testid="story-container"], span.font_heading, span.font_gameplay, p.font_gameplay, div.font_gameplay, .w_comment, .w-comment, .w_run, .w-run';
  const OVERLAY_SELECTOR = '#gameplay-output #transition-opacity, #transition-opacity';
  const isPageReady = ()=>{
    try{
      const root=document.getElementById('gameplay-output') || document.querySelector('[data-testid="story-container"], [data-testid="adventure-text"], [data-testid="message-text"], [data-testid="playback-content"]');
      return !!root;
    }catch(_){ return false; }
  };
  // Helper: return the LAST match for a selector within an optional root
  function ql(sel, root){
    try{
      const r = root || document;
      const nodes = r.querySelectorAll(sel);
      return (nodes && nodes.length) ? nodes[nodes.length-1] : null;
    }catch(_){ return null; }
  }
  function syncOverlayFromCopy(){
    try{
      // Skip only when the OUTPUT paragraph itself is being edited, not when the input box is present
      try{
        var isEditingOutput = (function(){
          try{
            var ed = document.querySelector('[contenteditable="true"]');
            if (!ed || !ed.closest) return false;
            return !!ed.closest('#gameplay-output');
          }catch(_){ return false; }
        })();
        if (isEditingOutput) return;
      }catch(_){ }
      const overlays = Array.prototype.slice.call(document.querySelectorAll(OVERLAY_SELECTOR));
      if (!overlays || !overlays.length) return;
      overlays.forEach(function(overlay){
        try{
          if (!overlay || (overlay.querySelector && overlay.querySelector('#action-icon'))) return;
          const localCopy = overlay && overlay.parentNode ? ql('#do-not-copy', overlay.parentNode) : null;
          const copy = localCopy || ql('#gameplay-output #do-not-copy, #do-not-copy');
          const source = (function(){ try{ const el=copy? (pickTextElement(copy)||copy):overlay; return el; }catch(_){ return overlay; } })();
          const text = getBaselineTextFor(source, txt(source) || '');
          if (!text) return;
          let html = transformString(applyParagraphsToText(text)) || '';
          try{ html = applyParagraphsToHTML(html); }catch(_){ }
          if (html && overlay.innerHTML !== html){
            AIDT_replaceHTML(overlay, html);
            try{ applyInlineSpanStyles(); }catch(_){ }
            try{ if (window.__AIDT_HAS_SAYDO__){ AIDT_applySayDo(document);} }catch(_){ }
          }
        }catch(_each){ }
      });
    }catch(_){ }
  }

  // If only a tiny part of quotes is detected as speech (due to split-word spans),
  // rebuild the entire paragraph HTML from textContent using our transformer.
  function retransformFromTextContent(el){
    try{
      if (!el) return;
      const text = getBaselineTextFor(el, txt(el) || '');
      if (!text) return;
      const textP = applyParagraphsToText(text);
      const html = transformString(textP);
      if (html && html !== text){
        AIDT_replaceHTML(el, html);
        try{ applyInlineSpanStyles(); }catch(_){ }
        dbg('retransformFromTextContent: replaced innerHTML from textContent');
      }
    }catch(_){ }
  }
  // Rebuild the split-word overlay row (transition-opacity / game-backdrop-saturate)
  // directly from its own text so the newest paragraph shows AIDT spans immediately.
  const OVERLAY_WRAP_SAFE = true; // Only disable wrapping/reparenting; allow full overlay rebuild
  const OVERLAY_MUTATION_SAFE = true; // Disable innerHTML mutations in Next-managed overlay to avoid removeChild errors
  function rebuildOverlayFromOwnText(container){
    try{
      if (OVERLAY_MUTATION_SAFE) return;
      if (!container) return;
      const isOverlayRow = (container.id && container.id==='transition-opacity') ||
                           (container.querySelector && container.querySelector('#game-backdrop-saturate'));
      if (!isOverlayRow) return;
      // Do NOT rebuild action rows (they contain an #action-icon and special markup)
      try{ if (container.querySelector && container.querySelector('#action-icon')) return; }catch(_){ }
      const raw = getBaselineTextFor(container, txt(container) || '');
      if (!raw) return;
      let html = transformString(applyParagraphsToText(raw)) || '';
      try{ html = applyParagraphsToHTML(html); }catch(_){ }
      if (html && container.innerHTML !== html){
        AIDT_replaceHTML(container, html);
        try{ applyInlineSpanStyles(); }catch(_){ }
        try{ if (window.__AIDT_HAS_SAYDO__){ AIDT_applySayDo(document);} }catch(_){ }
        dbg('rebuildOverlayFromOwnText: overlay rebuilt from its own text');
      }
    }catch(_){ }
  }
  // Overlay speech wrapper: scan per-word '#game-backdrop-saturate' spans and wrap
  // ranges between quote characters into a parent '.aidt-speech' span so coloring
  // applies without changing the tokenization.
  function overlayWrapSpeech(container){
    try{
      if (OVERLAY_WRAP_SAFE) return; // avoid moving tokens inside React tree
      if (!container) return;
      const hasOverlay = (container.id && container.id==='transition-opacity') ||
                         (container.querySelector && container.querySelector('#game-backdrop-saturate'));
      if (!hasOverlay) return;
      // Avoid duplicating wrappers on repeated passes
      try{ container.querySelectorAll('.aidt-speech').forEach(n=>{ try{
        // If the wrapper only contains overlay tokens, unwrap it first
        const tokens = n.querySelectorAll('#game-backdrop-saturate');
        if (tokens && tokens.length){ while(n.firstChild) n.parentNode.insertBefore(n.firstChild, n); n.remove(); }
      }catch(_){ } }); }catch(_){ }

      const tokens = Array.from(container.querySelectorAll('#game-backdrop-saturate'));
      if (!tokens.length) return;
      // Build a map of quote positions across tokens
      const quotePositions = [];
      let prevLastChar = '';
      for (let i=0;i<tokens.length;i++){
        const t = tokens[i].textContent || '';
        for (let c=0;c<t.length;c++){
          const ch = t[c];
          if (ch === '"'){
            const prevChar = (c>0) ? t[c-1] : prevLastChar;
            // Ignore numeric inch quotes like 5'8" or 3" screws
            if (prevChar && /[0-9]/.test(prevChar)) { continue; }
            quotePositions.push({token:i, offset:c});
          }
        }
        prevLastChar = t ? t[t.length-1] : '';
      }
      if (quotePositions.length < 2) return;
      // Pair quotes in order: (0,1), (2,3), ...
      for (let p=0; p+1<quotePositions.length; p+=2){
        const a = quotePositions[p].token;
        const b = quotePositions[p+1].token;
        // Always wrap the inclusive range [a..b] — short utterances like "No." are valid speech
        // Wrap inclusive range [a..b]
        try{
          const wrapper = document.createElement('span');
          wrapper.className = 'aidt aidt-speech';
          // Insert before first token
          const first = tokens[a];
          if (!first || !first.parentNode) continue;
          first.parentNode.insertBefore(wrapper, first);
          for (let k=a;k<=b;k++){
            if (!tokens[k]) continue;
            wrapper.appendChild(tokens[k]);
          }
        }catch(_){ }
      }
      try{ applyInlineSpanStyles(); }catch(_){ }
    }catch(_){ }
  }
  // Debounced, re-entrancy guarded overlay normalizer/wrapper to avoid observer loops
  function ensureOverlayWrappedOnce(root){
    try{
      if (window.__AIDT_OVERLAY_WRAP_SCHEDULED__) return;
      window.__AIDT_OVERLAY_WRAP_SCHEDULED__ = true;
      setTimeout(function(){
        try{
          window.__AIDT_OVERLAY_WRAP_SCHEDULED__ = false;
          var ol = ql('#gameplay-output #transition-opacity, #transition-opacity', root) || ql('#transition-opacity');
          if (!ol) return;
          // Skip action rows; only apply speech wrapping + styles on them
          try{
            if (ol.querySelector && ol.querySelector('#action-icon')){
              try{ overlayWrapSpeech(ol); }catch(_ow1){}
              try{ applyInlineSpanStyles(); }catch(_as1){}
              return;
            }
          }catch(_sk){}
          if (window.__AIDT_OVERLAY_LOCK__) return; // prevent re-entry
          window.__AIDT_OVERLAY_LOCK__ = true;
          try{ normalizeOverlay(); }catch(_no){}
          try{ overlayWrapSpeech(ol); }catch(_ow){}
          try{ applyInlineSpanStyles(); }catch(_as){}
        }catch(_){
        }finally{
          try{ window.__AIDT_OVERLAY_LOCK__ = false; }catch(_f){}
        }
      }, 50);
    }catch(_){ }
  }

  // Rebuild visible paragraphs from plain text so caps/keyword rules re-evaluate instantly
  function rebuildVisibleParagraphs(){
    try{
      const preferred=document.getElementById('gameplay-output');
      const nodes = preferred ? preferred.querySelectorAll(LATEST_SELECTORS) : document.querySelectorAll(LATEST_SELECTORS);
      if (!nodes || !nodes.length) return;
      nodes.forEach(n=>{
        try{
          const isOverlayRow = (n && ((n.id && n.id==='transition-opacity') || (n.querySelector && n.querySelector('#game-backdrop-saturate'))));
          if (isOverlayRow){
            try{ rebuildOverlayFromOwnText(n); }catch(_ro){}
            try{ overlayWrapSpeech(n); }catch(_ow){}
            try{ applyInlineSpanStyles(); }catch(_as){}
            return;
          }
          const t=pickTextElement(n); if(!t) return; const raw=txt(t)||''; if(!raw) return; const textP=applyParagraphsToText(getBaselineTextFor(t, raw)); const html=transformString(textP); if (html && html!==raw){ AIDT_replaceHTML(t, html); applyInlineSpanStyles(); }
        }catch(_){ }
      });
    }catch(_){ }
  }
  // Stronger overlay normalizer: rebuild overlay from the plain text of the copy container
  function normalizeOverlay(){
    try{
      try{ if (window.__AIDT_PAUSE__) return; }catch(_){ }
      if (OVERLAY_MUTATION_SAFE) return;
      // Skip only while editing the output paragraph itself
      try{
        var isEditingOutput = (function(){
          try{
            var ed = document.querySelector('[contenteditable="true"]');
            if (!ed || !ed.closest) return false;
            // Skip normalization if the active editor is within gameplay output or overlay containers
            return !!(ed.closest('#gameplay-output') || ed.closest('#transition-opacity'));
          }catch(_){ return false; }
        })();
        if (isEditingOutput) return;
      }catch(_){ }
      const overlays = Array.prototype.slice.call(document.querySelectorAll(OVERLAY_SELECTOR));
      if (!overlays || !overlays.length) return;
      overlays.forEach(function(overlay){
        try{
          if (!overlay || (overlay.querySelector && overlay.querySelector('#action-icon'))) return;
          const localCopy = overlay && overlay.parentNode ? ql('#do-not-copy', overlay.parentNode) : null;
          const copy = localCopy || ql('#gameplay-output #do-not-copy, #do-not-copy');
          const source = (function(){ try{ const el=copy? (pickTextElement(copy)||copy):overlay; return el; }catch(_){ return overlay; } })();
          const text = getBaselineTextFor(source, txt(source) || '');
          if (!text) return;
          let html = transformString(applyParagraphsToText(text)) || '';
          try{ html = applyParagraphsToHTML(html); }catch(_){ }
          if (html && overlay.innerHTML !== html){
            AIDT_replaceHTML(overlay, html);
            try{ applyInlineSpanStyles(); }catch(_){ }
            try{ if (window.__AIDT_HAS_SAYDO__){ AIDT_applySayDo(document);} }catch(_){ }
          }
        }catch(_each){ }
      });
    }catch(_){ }
  }

  function setupOverlayObserver(){
    try{
      const root = document.getElementById('gameplay-output') || document.body;
      if (!root) return;
      const rebalance = debounce(()=>{ try{ if (window.AIDT_isPaused && window.AIDT_isPaused()) return; if (window.__AIDT_PAUSE__) return; bulkNormalizeOverlays(); }catch(_){ } }, 120);
      if (window.__AIDT_OVERLAY_OBSERVER__) return;
      const mo = createAidtObserver(function(muts){
        try{
          for (var i=0;i<muts.length;i++){
            var m=muts[i];
            if (m.type==='childList' || m.type==='characterData'){ rebalance(); break; }
          }
        }catch(_){ }
      });
      mo.observe(root, {childList:true, subtree:true, characterData:true});
      try{ if (window.__AIDT_OBSERVERS_ADD__) window.__AIDT_OBSERVERS_ADD__(mo); }catch(_){ }
      try{ window.__AIDT_OVERLAY_OBSERVER__ = mo; }catch(_){ }
    }catch(_){ }
  }
  // Normalize all overlay rows at once (play.aidungeon multiple paragraphs)
  function bulkNormalizeOverlays(){
    try{
      try{ if ((window.AIDT_isPaused && window.AIDT_isPaused()) || window.__AIDT_PAUSE__) return; }catch(_){ }
      try{ window.AIDT_pause && window.AIDT_pause(); window.__AIDT_PAUSE__ = true; }catch(_){ }
      // Temporarily disconnect observer to avoid loops
      try{ if (window.__AIDT_OVERLAY_OBSERVER__) window.__AIDT_OVERLAY_OBSERVER__.disconnect(); }catch(_){ }
      const list = document.querySelectorAll(OVERLAY_SELECTOR);
      const nearestCopyFor = (overlay)=>{
        try{
          let n = overlay.previousElementSibling;
          while(n){ if (n.id==='do-not-copy') return n; n=n.previousElementSibling; }
          n = overlay.nextElementSibling;
          while(n){ if (n.id==='do-not-copy') return n; n=n.nextElementSibling; }
          const scope = (overlay.parentNode && overlay.parentNode.querySelector) ? overlay.parentNode : document;
          const local = scope.querySelector('#do-not-copy'); if (local) return local;
        }catch(_){ }
        return document.querySelector('#gameplay-output #do-not-copy, #do-not-copy');
      };
      for (let i=0;i<list.length;i++){
        const overlay = list[i];
        try{
          if (!overlay || (overlay.querySelector && overlay.querySelector('#action-icon'))) continue;
          const localCopy = nearestCopyFor(overlay);
          const source = (function(){ try{ const el=localCopy? (pickTextElement(localCopy)||localCopy):overlay; return el; }catch(_){ return overlay; } })();
          let text = getBaselineTextFor(source, txt(source)||'');
          if (!text){ text = getBaselineTextFor(overlay, txt(overlay)||''); }
          if (!text) continue;
          let html = transformString(applyParagraphsToText(text)) || '';
          try{ html = applyParagraphsToHTML(html); }catch(_){ }
          if (html && overlay.innerHTML !== html){
            overlay.innerHTML = html;
            try{ applyInlineSpanStyles(); }catch(_){ }
            try{ if (window.__AIDT_HAS_SAYDO__){ AIDT_applySayDo(document);} }catch(_){ }
          }
        }catch(_){ }
      }
      // Re-attach observer after batch
      try{ setupOverlayObserver(); }catch(_){ }
      try{ setTimeout(()=>{ try{ window.__AIDT_PAUSE__ = false; window.AIDT_resume && window.AIDT_resume(); }catch(_){ } }, 20); }catch(_){ try{ window.__AIDT_PAUSE__ = false; window.AIDT_resume && window.AIDT_resume(); }catch(__){} }
    }catch(_){ }
  }
  const parseWithinRoot = (root, force)=>{
    if (!settings.enabled || !root || isDanger(root)) return;
    try{ if (!force && ((window.AIDT_isPaused && window.AIDT_isPaused()) || window.__AIDT_PAUSE__)) return; }catch(_){ }
    // Do not parse inside a live contenteditable to preserve editing interactions
    try{ if (!force && isWithinEditable(root)) return; }catch(_){ }
    const kwEnabled=(settings.textFormatting.keywords||[]).length>0;
    const capsEnabled=!!(settings.allCapsEffect && settings.allCapsEffect!=='None');
    const subtree = txt(root);
    if (!force && !kwEnabled && !(MARKER_RE.test(subtree) || (capsEnabled && CAPS_MARKER_RE.test(subtree)))) return;
    const walker=document.createTreeWalker(
      root, NodeFilter.SHOW_TEXT,
      { acceptNode(node){
          try{
            const p=node.parentNode; if(!p) return NodeFilter.FILTER_REJECT;
            if (p.closest('input,textarea,script,style,template,code,pre')) return NodeFilter.FILTER_REJECT;
            if (p.closest('[contenteditable="true"]')) return NodeFilter.FILTER_REJECT;
            if (p.closest('.aidt')) return NodeFilter.FILTER_REJECT;
            if (hasScript(p)) return NodeFilter.FILTER_REJECT;
            // Allow formatting even when nodes are contenteditable; we still exclude inputs/textarea above
            const t=node.nodeValue||''; if(!/\S/.test(t)) return NodeFilter.FILTER_REJECT;
            if (t.length>4000) return NodeFilter.FILTER_REJECT;
            if (!force && !kwEnabled && !(MARKER_RE.test(t) || (capsEnabled && CAPS_MARKER_RE.test(t)))) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
          }catch{ return NodeFilter.FILTER_REJECT; }
      }}, false);
    const targets=[]; for (let n=walker.nextNode(); n; n=walker.nextNode()) targets.push(n);
    for (const tn of targets){
      const raw=String(tn.nodeValue||'');
      const html=transformString(raw);
      if (html!==raw){ const span=document.createElement('span'); span.innerHTML=html; tn.replaceWith(span); }
    }
  };
  // Prefer visible gameplay text elements, not inside copy-overlay containers
  function pickTextElement(container){
    try{
      if (__AIDT_PICK_CACHE && __AIDT_PICK_CACHE.has(container)) return __AIDT_PICK_CACHE.get(container);
      // If the given container is the highlight/saturate overlay (split into per-word spans),
      // prefer the hidden copy container which holds full paragraph HTML.
      try{
        if (container && (
          (container.id && container.id==='transition-opacity') ||
          (container.querySelector && container.querySelector('#game-backdrop-saturate'))
        )){
          let alt=null;
          try{
            const scope = (container.parentNode && container.parentNode.querySelector) ? container.parentNode : document;
            const localCopy = scope.querySelector('#do-not-copy');
            if (localCopy){ alt = localCopy.querySelector('span.font_gameplay, p.font_gameplay, div.font_gameplay'); }
          }catch(_){ }
          if (!alt){ alt = document.querySelector('#gameplay-output #do-not-copy span.font_gameplay, #do-not-copy span.font_gameplay, #do-not-copy p.font_gameplay, #do-not-copy div.font_gameplay'); }
          if (alt){ if (__AIDT_PICK_CACHE) __AIDT_PICK_CACHE.set(container, alt); return alt; }
          // Fallback: use the copy container itself if a specific child wasn't found
          const copy = (container.parentNode && container.parentNode.querySelector) ? (container.parentNode.querySelector('#do-not-copy') || document.querySelector('#gameplay-output #do-not-copy, #do-not-copy')) : document.querySelector('#gameplay-output #do-not-copy, #do-not-copy');
          // If copy container is currently being edited, return it directly (avoid replacing HTML while typing)
          try{ if (copy && copy.querySelector && copy.querySelector('[contenteditable="true"]')) return copy; }catch(_){ }
          if (copy){ if (__AIDT_PICK_CACHE) __AIDT_PICK_CACHE.set(container, copy); return copy; }
        }
      }catch(_){ }
      const candidates = container.querySelectorAll('span.font_gameplay, p.font_gameplay, div.font_gameplay, span.font_heading, [data-testid="adventure-text"], [data-testid="message-text"], [data-testid="playback-content"]');
      for (let i=0;i<candidates.length;i++){
        const el=candidates[i];
        // Skip split-word overlay nodes
        if (el.querySelector && el.querySelector('#game-backdrop-saturate')) continue;
        // Prefer non-editable nodes for formatting; if editable, skip
        try{ if (el.closest && el.closest('[contenteditable="true"]')) continue; }catch(_){ }
        if (el.closest && !el.hasAttribute('aria-hidden')){ if (__AIDT_PICK_CACHE) __AIDT_PICK_CACHE.set(container, el); return el; }
      }
      const out=candidates[0] || container; if (__AIDT_PICK_CACHE) __AIDT_PICK_CACHE.set(container, out); return out;
    }catch(_){ return container; }
  }
  // Fallback finder: last visible gameplay text element anywhere
  function findLatestTextEl(){
    try{
      const nodes = document.querySelectorAll('#gameplay-output #do-not-copy span.font_gameplay, #do-not-copy span.font_gameplay, #do-not-copy p.font_gameplay, #do-not-copy div.font_gameplay, span.font_gameplay, p.font_gameplay, div.font_gameplay, span.font_heading, [data-testid="adventure-text"], [data-testid="message-text"], [data-testid="playback-content"]');
      if (!nodes || !nodes.length) return null;
      // choose the last node that is not aria-hidden and not inside copy overlay
      for (let i=nodes.length-1;i>=0;i--){
        const el = nodes[i];
        if (el && (!el.hasAttribute('aria-hidden'))) return el;
      }
      return nodes[nodes.length-1];
    }catch(_){ return null; }
  }
  // Prevent repeated heavy inline finalization on the same node
  const AIDT_FINALIZED = new WeakSet();
  function finalizeLatestOnce(textEl){
    try{
      if (!textEl || AIDT_FINALIZED.has(textEl)) return;
      const t = getBaselineTextFor(textEl, txt(textEl));
      if (!t || t.length < 2) return;
      dbg('finalizeLatestOnce: running on node, len=', t.length);
      // Prefer transforming existing HTML so split nodes are handled
      try{
        const rawHTML = String(textEl.innerHTML || '');
        if (rawHTML){
          const outHTML = transformString(rawHTML);
          if (outHTML && outHTML !== rawHTML){ AIDT_replaceHTML(textEl, outHTML); applyInlineSpanStyles(); }
        } else {
          const html = transformString(t);
          if (html && html !== t){ AIDT_replaceHTML(textEl, html); applyInlineSpanStyles(); }
        }
      }catch(_){
        const html = transformString(t);
        if (html && html !== t){ AIDT_replaceHTML(textEl, html); applyInlineSpanStyles(); }
      }
      // Convert existing italic HTML quotes to IM spans if site already removed asterisks
      try{
        const italics = textEl.querySelectorAll('em, i');
        for (let i=0;i<italics.length;i++){
          const em = italics[i];
          const v = (em.textContent||'').trim();
          if (!v) continue;
          if (/^("|")[\s\S]+("|")$/.test(v)){
            const span=document.createElement('span');
            span.className='aidt aidt-im aidt-italic';
            span.textContent=v;
            em.replaceWith(span);
          }
        }
        // Heuristic: if no IM spans yet, tolerate spaces around asterisks
        if (!textEl.querySelector('.aidt-im')){
          const raw = textEl.textContent || '';
          const loose = /\*\s*([""][^\n]*?[""])\s*\*/g;
          if (loose.test(raw)){
            const html2 = transformString(raw.replace(loose, '*$1*'));
            if (html2 && html2 !== raw){ AIDT_replaceHTML(textEl, html2); applyInlineSpanStyles(); }
          }
        }
      }catch(_){ }
      applyBaseTextToElement(textEl);
      AIDT_FINALIZED.add(textEl);
      setTimeout(()=>{ try{ AIDT_FINALIZED.delete(textEl); }catch(_){} }, 1000);
    }catch(_){ }
  }
  const parseLatestOutput = ()=>{
    try{
      if (!isPageReady()) return;
      try{ if ((window.AIDT_isPaused && window.AIDT_isPaused()) || window.__AIDT_PAUSE__) return; }catch(_){ }
      // If user is actively editing, avoid re-rendering the newest paragraph to preserve caret/clicks
      try{ if (isEditingActive()) return; }catch(_){ }
      // Prefer the LAST overlay row on the page, as beta renders multiple '#transition-opacity' entries
      let preferred = (function(){ try{ const list=document.querySelectorAll('#gameplay-output #transition-opacity, #transition-opacity'); return (list&&list.length)? list[list.length-1] : null; }catch(_){ return null; } })() ||
                      document.querySelector('#gameplay-output #do-not-copy') || document.querySelector('#do-not-copy') ||
                      document.querySelector('[data-testid="story-container"]') || document.querySelector('[data-testid="adventure-text"]') || document.querySelector('[data-testid="message-text"]') || document.querySelector('[data-testid="playback-content"]');
      dbg('parseLatestOutput: preferred=', !!preferred);
      if (preferred){
        // First, run the normal node-by-node transform
        dbg('parseLatestOutput: running parseWithinRoot on preferred');
        parseWithinRoot(preferred, true);
        try{ rebuildOverlayFromOwnText(preferred); overlayWrapSpeech(preferred); }catch(_){ }
        // Ensure styles apply immediately on the newest paragraph
        try{ applyFontsAndEffects(); applyBaseText(); applyInlineSpanStyles(); dbg('parseLatestOutput: applied fonts/base/inline'); }catch(_e){}
        try{ if (window.__AIDT_HAS_SAYDO__) { AIDT_applySayDo(document); dbg('parseLatestOutput: applied Say/Do'); } }catch(_e){}
        // Fallback: When quotes are split across multiple nodes, speech/IM may be missed.
        // Transform only the text-bearing child to avoid changing row structure/icons.
        try{
          const textEl = pickTextElement(preferred);
          dbg('parseLatestOutput: textEl chosen=', !!textEl, 'len=', (txt(textEl)||'').length);
          applyBaseTextToElement(textEl);
          const hasIMSpan = !!textEl.querySelector('.aidt-im');
          const hasSpeechSpan = !!textEl.querySelector('.aidt-speech');
          const text = getBaselineTextFor(textEl, txt(textEl));
          const hasIMPattern = /\*(?:"|["])[\s\S]*?(?:"|["])\*/.test(text);
          const hasSpeechPattern = /(["][^"\n]+["])/.test(text);
          dbg('parseLatestOutput: spans(im,speech)=', hasIMSpan, hasSpeechSpan, 'patterns(im,speech)=', hasIMPattern, hasSpeechPattern);
          dbg('parseLatestOutput: child visibility=', {im: hasVisibleDesc(textEl,'.aidt-im'), speech: hasVisibleDesc(textEl,'.aidt-speech')});
          if ((!hasIMSpan && hasIMPattern) || (!hasSpeechSpan && hasSpeechPattern)){
            let html = transformString(applyParagraphsToText(text));
            try{ html = applyParagraphsToHTML(html); }catch(_){ }
            if (html && html !== text){ AIDT_replaceHTML(textEl, html); applyInlineSpanStyles(); }
          } else if (!hasVisibleDesc(textEl,'.aidt-im')) {
            finalizeLatestOnce(textEl);
          }
        }catch(_e){}
        // If spans exist but are not visible (overlay split), rebuild from text
        try{
          const speechHidden = !hasVisibleDesc(textEl,'.aidt-speech') && !!textEl.querySelector('.aidt-speech');
          const imHidden = !hasVisibleDesc(textEl,'.aidt-im') && !!textEl.querySelector('.aidt-im');
          if (speechHidden || imHidden) retransformFromTextContent(textEl);
        }catch(_){ }
        try{ syncOverlayFromCopy(); ensureOverlayWrappedOnce(preferred); }catch(_){ }
        return;
      }
      const els=document.querySelectorAll(LATEST_SELECTORS);
      dbg('parseLatestOutput: found els count=', (els&&els.length)||0);
      if (!els || !els.length){
        const fallbackEl = findLatestTextEl();
        if (!fallbackEl) return;
        try{ if (!isEditingActive()) parseWithinRoot(fallbackEl, true); }catch(_){ }
        try{ applyFontsAndEffects(); applyBaseText(); applyInlineSpanStyles(); dbg('parseLatestOutput: applied fonts/base/inline (fallback)'); }catch(_e){}
        try{ if (window.__AIDT_HAS_SAYDO__) { AIDT_applySayDo(document); dbg('parseLatestOutput: applied Say/Do (fallback)'); } }catch(_e){}
        try{
          const textEl = fallbackEl;
          const hasSpeechSpans = !!(textEl && textEl.querySelector && textEl.querySelector('.aidt-speech, .aidt-im'));
          const text = getBaselineTextFor(textEl, txt(textEl));
          dbg('parseLatestOutput: hasSpeechSpans=', hasSpeechSpans, 'markers=', /(["][^"\n]+["])|\*(?:"|["])[\s\S]*?(?:"|["])\*/.test(text));
          if (!hasSpeechSpans && /(["][^"\n]+["])|\*(?:"|["])[\s\S]*?(?:"|["])\*/.test(text)){
            let html = transformString(applyParagraphsToText(text));
            try{ html = applyParagraphsToHTML(html); }catch(_){ }
            dbg('parseLatestOutput: transformed=', html!==text);
            if (html && html !== text){ AIDT_replaceHTML(textEl, html); applyInlineSpanStyles(); }
          }
        }catch(_e){}
        return;
      }
      const latest=els[els.length-1];
      dbg('parseLatestOutput: running parseWithinRoot on latest');
      try{ if (!isEditingActive()) parseWithinRoot(latest, true); }catch(_){ }
      try{ rebuildOverlayFromOwnText(latest); overlayWrapSpeech(latest); ensureOverlayWrappedOnce(latest); }catch(_){ }
      try{ applyFontsAndEffects(); applyBaseText(); applyInlineSpanStyles(); dbg('parseLatestOutput: applied fonts/base/inline (no preferred)'); }catch(_e){}
      try{ if (window.__AIDT_HAS_SAYDO__) { AIDT_applySayDo(document); dbg('parseLatestOutput: applied Say/Do (no preferred)'); } }catch(_e){}
      try{
        const textEl = (latest && latest.querySelector) ? pickTextElement(latest) : latest;
        dbg('parseLatestOutput: fallback textEl chosen=', !!textEl, 'len=', (txt(textEl)||'').length);
        applyBaseTextToElement(textEl);
        const hasIMSpan = !!(textEl && textEl.querySelector && textEl.querySelector('.aidt-im'));
        const hasSpeechSpan = !!(textEl && textEl.querySelector && textEl.querySelector('.aidt-speech'));
        const text = getBaselineTextFor(textEl, txt(textEl));
        const hasIMPattern = /\*(?:"|["])[\s\S]*?(?:"|["])\*/.test(text);
        const hasSpeechPattern = /(["][^"\n]+["])/.test(text);
        if ((!hasIMSpan && hasIMPattern) || (!hasSpeechSpan && hasSpeechPattern)){
          let html = transformString(applyParagraphsToText(text));
          try{ html = applyParagraphsToHTML(html); }catch(_){ }
          if (html && html !== text){ AIDT_replaceHTML(textEl, html); applyInlineSpanStyles(); }
        } else if (!hasVisibleDesc(textEl,'.aidt-im')) {
          finalizeLatestOnce(textEl);
        }
        dbg('parseLatestOutput: spans(im,speech)=', hasIMSpan, hasSpeechSpan, 'patterns(im,speech)=', hasIMPattern, hasSpeechPattern);
      }catch(_e){}
      try{
        const speechHidden = !hasVisibleDesc(textEl,'.aidt-speech') && !!(textEl && textEl.querySelector && textEl.querySelector('.aidt-speech'));
        const imHidden = !hasVisibleDesc(textEl,'.aidt-im') && !!(textEl && textEl.querySelector && textEl.querySelector('.aidt-im'));
        if (speechHidden || imHidden){ retransformFromTextContent(textEl); try{ ensureOverlayWrappedOnce(); }catch(_){ } }
      }catch(_){ }
      try{ syncOverlayFromCopy(); normalizeOverlay(); }catch(_){ }
    }catch{}
  };
  // Strong finalizer for newest paragraph: combines parsing + inline transform
  function ensureLatestFormatted(){
    try{
      if (!isPageReady()) return;
      try{ if (window.__AIDT_PAUSE__) return; }catch(_){ }
      try{ if (isEditingActive()) return; }catch(_){ }
      // Prefer the LAST overlay row on the page
      let preferred = (function(){ try{ const list=document.querySelectorAll('#gameplay-output #transition-opacity, #transition-opacity'); return (list&&list.length)? list[list.length-1] : null; }catch(_){ return null; } })() ||
                      document.querySelector('#gameplay-output #do-not-copy') || document.querySelector('#do-not-copy') ||
                      document.querySelector('[data-testid="story-container"]') || document.querySelector('[data-testid="adventure-text"]') || document.querySelector('[data-testid="message-text"]') || document.querySelector('[data-testid="playback-content"]');
      const container = preferred || null;
      // If container is the overlay, rebuild it from its own text first, then pick a text element
      if (container && ((container.id && container.id==='transition-opacity') || (container.querySelector && container.querySelector('#game-backdrop-saturate')))){
        try{ rebuildOverlayFromOwnText(container); overlayWrapSpeech(container); }catch(_){ }
      }
      const textEl = container ? pickTextElement(container) : (findLatestTextEl() || null);
      dbg('ensureLatestFormatted: preferred=', !!preferred, preferred ? preferred.id||preferred.tagName : null, 'textEl=', !!textEl);
      __aidt_debugDumpLatest(container || textEl, textEl);
      if (!textEl) return;
      try{ parseWithinRoot(container || textEl, true); dbg('ensureLatestFormatted: parseWithinRoot ok'); }catch(_e0){ dbgw('ensureLatestFormatted: parseWithinRoot error', _e0); }
      // Guarantee inline spans exist on the newest element immediately
      try{
        const rawNow = txt(textEl)||'';
        if (rawNow && !(textEl.innerHTML||'').match(/class=\"aidt/)){
          let htmlNow = transformString(applyParagraphsToText(rawNow)) || '';
          try{ htmlNow = applyParagraphsToHTML(htmlNow); }catch(_){ }
          if (htmlNow && htmlNow !== rawNow){ AIDT_replaceHTML(textEl, htmlNow); }
        }
      }catch(_){ }
      try{ applyFontsAndEffects(); applyBaseText(); applyInlineSpanStyles(); dbg('ensureLatestFormatted: styles applied'); if (window.__AIDT_HAS_SAYDO__){ AIDT_applySayDo(document); dbg('ensureLatestFormatted: Say/Do applied'); } }catch(_e1){ dbgw('ensureLatestFormatted: style error', _e1); }
      try{
        const hasSpans = !!(textEl.querySelector && textEl.querySelector('.aidt-speech, .aidt-im'));
        const t = getBaselineTextFor(textEl, txt(textEl));
        dbg('ensureLatestFormatted: hasSpans=', hasSpans, 'len=', (t||'').length, 'markers=', /(["][^"\n]+["])|\*(?:"|["])[\s\S]*?(?:"|["])\*/.test(t));
        if (!hasSpans && /(["][^"\n]+["])|\*(?:"|["])[\s\S]*?(?:"|["])\*/.test(t)){
          let html = transformString(applyParagraphsToText(t)) || '';
          try{ html = applyParagraphsToHTML(html); }catch(_){ }
          dbg('ensureLatestFormatted: transformed=', html!==t);
          if (html && html !== t){ AIDT_replaceHTML(textEl, html); applyInlineSpanStyles(); dbg('ensureLatestFormatted: injected html'); }
        }
        __aidt_debugMarkLatest(container || textEl, textEl);
        syncOverlayFromCopy();
        try{
          const speechHidden = !hasVisibleDesc(textEl,'.aidt-speech') && !!(textEl && textEl.querySelector && textEl.querySelector('.aidt-speech'));
          const imHidden = !hasVisibleDesc(textEl,'.aidt-im') && !!(textEl && textEl.querySelector && textEl.querySelector('.aidt-im'));
          if (speechHidden || imHidden) retransformFromTextContent(textEl);
        }catch(_){ }
      }catch(_e2){}
    }catch(_){ }
  }

  // Format all target elements (full sweep like content.js)
  const formatAllTargetElements = ()=>{
    try{
      if (!isPageReady()) return;
      try{ if ((window.AIDT_isPaused && window.AIDT_isPaused()) || window.__AIDT_PAUSE__) return; }catch(_){ }
      try{ window.AIDT_pause && window.AIDT_pause(); window.__AIDT_PAUSE__ = true; }catch(_){ }
      const preferred = document.getElementById('gameplay-output');
      if (preferred){
        const nodes = preferred.querySelectorAll(LATEST_SELECTORS);
        nodes.forEach(n=>{
          try{
            const isOverlayRow = (n && ((n.id && n.id==='transition-opacity') || (n.querySelector && n.querySelector('#game-backdrop-saturate'))));
            if (isOverlayRow){ try{ rebuildOverlayFromOwnText(n); }catch(_){ } try{ overlayWrapSpeech(n); }catch(_){ } return; }
            const t=pickTextElement(n); if (!t) return; if (t.id==='transition-opacity' || (t.closest && t.closest('#transition-opacity'))) return; const raw=txt(t)||''; if (!raw) return; const textP=applyParagraphsToText(getBaselineTextFor(t, raw)); const html=transformString(textP); if (html && html!==raw){ AIDT_replaceHTML(t, html); }
          }catch(_){ }
        });
        try{ applyFontsAndEffects(); applyBaseText(); applyInlineSpanStyles(); }catch(_e){}
        try{ if (window.__AIDT_HAS_SAYDO__) { AIDT_applySayDo(document); } }catch(_e){}
      } else {
        const nodes = document.querySelectorAll(LATEST_SELECTORS);
        nodes.forEach(n=>{
          try{
            const isOverlayRow = (n && ((n.id && n.id==='transition-opacity') || (n.querySelector && n.querySelector('#game-backdrop-saturate'))));
            if (isOverlayRow){ try{ rebuildOverlayFromOwnText(n); }catch(_){ } try{ overlayWrapSpeech(n); }catch(_){ } return; }
            const t=pickTextElement(n); if (!t) return; if (t.id==='transition-opacity' || (t.closest && t.closest('#transition-opacity'))) return; const raw=txt(t)||''; if (!raw) return; const textP=applyParagraphsToText(getBaselineTextFor(t, raw)); const html=transformString(textP); if (html && html!==raw){ AIDT_replaceHTML(t, html); }
          }catch(_){ }
        });
        try{ applyFontsAndEffects(); applyBaseText(); applyInlineSpanStyles(); }catch(_e){}
        try{ if (window.__AIDT_HAS_SAYDO__) { AIDT_applySayDo(document); } }catch(_e){}
      }
      try{ bulkNormalizeOverlays(); }catch(_){ }
      try{ setTimeout(()=>{ try{ window.__AIDT_PAUSE__ = false; window.AIDT_resume && window.AIDT_resume(); }catch(_){ } }, 20); }catch(_){ try{ window.__AIDT_PAUSE__ = false; window.AIDT_resume && window.AIDT_resume(); }catch(__){} }
    }catch{}
  };
  // Dedicated observer: mirrors content.js flush-on-change behavior
  function setupFormatObserver(){
    let pending=false;
    let wantFormat=false;
    let latestMo=null; let latestTarget=null;
    const attachLatestObserver=()=>{
      try{
        // Prefer the LAST overlay row on the page
        let preferred = (function(){ try{ const list=document.querySelectorAll(OVERLAY_SELECTOR); return (list&&list.length)? list[list.length-1] : null; }catch(_){ return null; } })() ||
                        document.querySelector('#gameplay-output #do-not-copy') || document.querySelector('#do-not-copy') ||
                        document.querySelector('[data-testid="story-container"]') || document.querySelector('[data-testid="adventure-text"]') || document.querySelector('[data-testid="message-text"]') || document.querySelector('[data-testid="playback-content"]');
        const candidate = preferred || (!isPageReady()? null : (document.querySelectorAll(LATEST_SELECTORS)||[])[(document.querySelectorAll(LATEST_SELECTORS)||[]).length-1]);
        if (!candidate || candidate===latestTarget) return;
        if (latestMo) { try{ latestMo.disconnect(); }catch(_){}; latestMo=null; }
        latestTarget=candidate;
        latestMo=createAidtObserver(()=>{ try{ wantFormat=true; if (!pending){ pending=true; queueMicrotask(flush); } }catch(_e){} });
        try{ window.__AIDT_OBS_SET__ = window.__AIDT_OBS_SET__ || new WeakSet(); if (!window.__AIDT_OBS_SET__.has(latestTarget)) window.__AIDT_OBS_SET__.add(latestTarget); }catch(_){ }
        latestMo.observe(latestTarget,{childList:true,subtree:true,characterData:true});
        try{ if (window.__AIDT_OBSERVERS_ADD__) window.__AIDT_OBSERVERS_ADD__(latestMo); }catch(_){ }
        // Immediate pass on attach
        try{ const t=pickTextElement(latestTarget); parseWithinRoot(t, true); applyFontsAndEffects(); applyBaseText(); applyInlineSpanStyles(); if (window.__AIDT_HAS_SAYDO__){ AIDT_applySayDo(document);} try{ const has=t && t.querySelector && t.querySelector('.aidt-speech, .aidt-im'); const tx=txt(t); if (!has && RE_SPEECH_OR_IM.test(tx)){ let h = transformString(applyParagraphsToText(tx)) || ''; try{ h = applyParagraphsToHTML(h); }catch(_){ } if(h&&h!==tx){ t.innerHTML=h; applyInlineSpanStyles(); } } }catch(_e2){} }catch(_e){}
      }catch(_){ }
    };
    const flush=()=>{
      try{
        try{
          if (document && document.visibilityState === 'hidden'){
            pending=false;
            const onVis=()=>{ try{ document.removeEventListener('visibilitychange', onVis); queueMicrotask(flush); }catch(_){ } };
            try{ document.addEventListener('visibilitychange', onVis, { once:true }); }catch(_){ }
            return;
          }
        }catch(_){ }
        __AIDT_TEXT_CACHE = new WeakMap();
        __AIDT_PICK_CACHE = new WeakMap();
        if (wantFormat){
          // Fast path newest + full sweep, then reapply spans
          parseLatestOutput();
          formatAllTargetElements();
          applyFontsAndEffects();
          applyBaseText();
          applyInlineSpanStyles();
          attachLatestObserver();
        }
      }finally{ pending=false; wantFormat=false; }
    };
    if (window.__AIDT_FORMAT_ROOT_OBSERVER__) try{ window.__AIDT_FORMAT_ROOT_OBSERVER__.disconnect(); }catch(_d){}
    const mo=createAidtObserver(muts=>{
      try{
        for (let i=0;i<muts.length;i++){
          const m=muts[i];
          if (m.type==='childList'){
            if (!isPageReady()) continue;
            if ((m.addedNodes && m.addedNodes.length>0)) wantFormat=true;
          } else if (m.type==='characterData'){
            // Character data inside our targets triggers formatting
            let p=m.target && m.target.parentNode;
            while (p && p!==document){
              if (p.matches && p.matches(LATEST_SELECTORS)){ wantFormat=true; break; }
              p=p.parentNode;
            }
          }
          if (wantFormat) break;
        }
        if (!pending && wantFormat){ pending=true; queueMicrotask(flush); }
      }catch{}
    });
    try{
      window.__AIDT_OBS_SET__ = window.__AIDT_OBS_SET__ || new WeakSet();
      const markObserved=(el)=>{ try{ if (el) window.__AIDT_OBS_SET__.add(el); }catch(_){ } };
      const isObserved=(el)=>{ try{ return el && window.__AIDT_OBS_SET__.has(el); }catch(_){ return false; } };
      const preferred=document.getElementById('gameplay-output');
      if (preferred) {
        mo.observe(preferred,{childList:true,subtree:true,characterData:true});
        try{ if (window.__AIDT_OBSERVERS_ADD__) window.__AIDT_OBSERVERS_ADD__(mo); }catch(_){ }
        const priors = preferred.querySelectorAll(LATEST_SELECTORS);
        priors.forEach(el=>{ try{ if (!isObserved(el)){ markObserved(el); mo.observe(el,{childList:true,subtree:true,characterData:true}); } }catch(_){} });
      } else {
        const targets=document.querySelectorAll(LATEST_SELECTORS);
        if (targets && targets.length){ targets.forEach(el=>{ try{ if (!isObserved(el)){ markObserved(el); mo.observe(el,{childList:true,subtree:true,characterData:true}); } }catch(_){} }); }
        else { mo.observe(document.body,{childList:true,subtree:true,characterData:true}); }
        try{ if (window.__AIDT_OBSERVERS_ADD__) window.__AIDT_OBSERVERS_ADD__(mo); }catch(_){ }
      }
      window.__AIDT_FORMAT_ROOT_OBSERVER__ = mo;
    }catch{}
    // Initial attach
    try{ attachLatestObserver(); }catch(_e){}
    return mo;
  }
  // ---------------- Styles (UI + spans) ----------------
  (function css(){
    try{
      const cssText =
        '.aidt-bold{font-weight:700}' +
        '.aidt-italic{font-style:italic}' +
        '.aidt-speech{}' +
        '.aidt-im{}' +
        // Note: do not hide aria-hidden gameplay nodes; some flows temporarily set aria-hidden on the latest paragraph
        '.aidt-strike{text-decoration:line-through;opacity:.9}' +
        '.aidt-code{font-family:ui-monospace,Menlo,Consolas,monospace;background:rgba(0,0,0,.12);padding:0 .25em;border-radius:3px}' +
        '.aidt-hi{background:rgba(255,255,0,.28);padding:0 .1em;border-radius:2px}' +
        '.aidt-color{padding:0 .08em;border-radius:2px}' +
        '.aidt-keyword{background:transparent;padding:0;border-radius:0;font-weight:var(--aidt-kw-weight,inherit);color:var(--aidt-kw-color, inherit)!important}' +
        '.aidt-scope{color:var(--aidt-base-color,inherit)!important;font-weight:var(--aidt-base-weight,inherit)!important}' +
        // CSS variables for dynamic colors/weights (reduces per-element inline writes)
        ':root{--aidt-speech-color:#ffffff;--aidt-speech-weight:400;--aidt-say-color:var(--aidt-speech-color,#ffffff);--aidt-say-weight:var(--aidt-speech-weight,400);--aidt-im-color:#9ca3af;--aidt-im-weight:400;--aidt-it-color:#facc15;--aidt-it-weight:400}' +
        '.aidt-speech{color:var(--aidt-speech-color,#ffffff)!important;font-weight:var(--aidt-speech-weight,400)!important}' +
        '.w_comment .aidt-speech, .w-comment .aidt-speech{color:var(--aidt-say-color,var(--aidt-speech-color,#ffffff))!important;font-weight:var(--aidt-say-weight,var(--aidt-speech-weight,400))!important}' +
        '.aidt-im, .ai-italic-speech, em.ai-italic-speech{color:var(--aidt-im-color,#9ca3af)!important;font-weight:var(--aidt-im-weight,400)!important}' +
        '.aidt-italic:not(.aidt-im){color:var(--aidt-it-color,#facc15)!important;font-weight:var(--aidt-it-weight,400)!important}' +
        '@media (prefers-reduced-motion: no-preference){' +
        '.aidt-allcaps.aidt-eff-Flash, .aidt-keyword.aidt-eff-Flash{animation:aidt-flash 1.2s linear infinite; display:inline-block}' +
        '.aidt-allcaps.aidt-eff-Strobe, .aidt-keyword.aidt-eff-Strobe{animation:aidt-strobe .25s steps(2,end) infinite; display:inline-block}' +
        '.aidt-allcaps.aidt-eff-Rainbow, .aidt-keyword.aidt-eff-Rainbow{animation:aidt-rainbow 2.2s linear infinite; display:inline-block; will-change:filter}' +
        '.aidt-allcaps.aidt-eff-Wave, .aidt-keyword.aidt-eff-Wave{animation:aidt-wave 2.5s ease-in-out infinite; display:inline-block}' +
        '.aidt-allcaps.aidt-eff-Breathe, .aidt-keyword.aidt-eff-Breathe{animation:aidt-breathe 3s ease-in-out infinite; display:inline-block}' +
        '}' +
        '@keyframes aidt-flash{0%,100%{opacity:1}50%{opacity:.45}}' +
        '@keyframes aidt-strobe{0%{opacity:1}50%{opacity:.2}100%{opacity:1}}' +
        '@keyframes aidt-rainbow{0%{filter:hue-rotate(0deg)}100%{filter:hue-rotate(360deg)}}' +
        '@keyframes aidt-wave{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}' +
        '@keyframes aidt-breathe{0%,100%{letter-spacing:inherit}50%{letter-spacing:.02em}}';
      if (document.adoptedStyleSheets && typeof CSSStyleSheet !== 'undefined' && 'replaceSync' in CSSStyleSheet.prototype){
        try{
          if (!window.__AIDT_SHEET__) window.__AIDT_SHEET__ = new CSSStyleSheet();
          window.__AIDT_SHEET__.replaceSync(cssText);
          const sheets = document.adoptedStyleSheets || [];
          if (sheets.indexOf(window.__AIDT_SHEET__) === -1){ document.adoptedStyleSheets = sheets.concat(window.__AIDT_SHEET__); }
        }catch(_){ }
      } else {
        let s=document.getElementById('aidt-inline-css');
        if (!s){ s=document.createElement('style'); s.id='aidt-inline-css'; document.head.appendChild(s); }
        s.textContent = cssText;
      }
    }catch(_){
      try{ let s=document.getElementById('aidt-inline-css'); if (!s){ s=document.createElement('style'); s.id='aidt-inline-css'; document.head.appendChild(s);} }catch(__){}
    }
  })();

  // ---------------- Apply global + instant restyle ----------------
  const BG_CONTAINERS=['#gameplay-saturate','#__next','body','#transition-opacity'];
  let BG_APPLIED_ONCE=false;

  function ensureAmbienceSuppressed(){
    try{
      const imgs = Array.prototype.slice.call(document.querySelectorAll('#gameplay-saturate img, #__next img[alt="Ambience"]'));
      imgs.forEach(function(img){
        try{
          if (!img) return;
          // If we've already hidden this image, skip to avoid attribute observer loops
          if (img.getAttribute && img.getAttribute('data-aidt-ambience-disabled') === '1') return;
          img.setAttribute('data-aidt-ambience-disabled','1');
          try{ if (!img.getAttribute('data-aidt-ambience-orig-src') && img.src){ img.setAttribute('data-aidt-ambience-orig-src', img.src); } }catch(_save){}
          try{ img.style.setProperty('display','none','important'); }catch(_d){}
          try{ img.style.setProperty('opacity','0','important'); }catch(_o){}
          try{ img.style.setProperty('visibility','hidden','important'); }catch(_v){}
        }catch(_each){}
      });
    }catch(_){ }
  }

  function ensureAmbienceVisible(){
    try{
      const imgs = Array.prototype.slice.call(document.querySelectorAll('#gameplay-saturate img, #__next img[alt="Ambience"]'));
      imgs.forEach(function(img){
        try{
          try{ img.style.removeProperty('display'); }catch(_rd){}
          try{ img.style.removeProperty('opacity'); }catch(_ro){}
          try{ img.style.removeProperty('visibility'); }catch(_rv){}
          try{ img.removeAttribute('data-aidt-ambience-disabled'); }catch(_ra){}
          try{ const orig=img.getAttribute('data-aidt-ambience-orig-src'); if(orig){ img.src=orig; img.removeAttribute('data-aidt-ambience-orig-src'); } }catch(_rs){}
        }catch(_each){}
      });
    }catch(_){ }
  }

  // Visible-only formatting using IntersectionObserver (lazy format offscreen)
  function setupVisibleFormatObserver(){
    try{
      if (window.__AIDT_VISIBLE_IO__) return window.__AIDT_VISIBLE_IO__;
      if (typeof IntersectionObserver !== 'function') return null;
      window.__AIDT_IO_SEEN__ = window.__AIDT_IO_SEEN__ || new WeakSet();
      const io = new IntersectionObserver((entries)=>{
        try{
          if (!settings || !settings.enabled) return;
          if (document.visibilityState === 'hidden') return;
          for (let i=0;i<entries.length;i++){
            const e = entries[i];
            if (!e || !e.isIntersecting) continue;
            const el = e.target;
            try{ window.__AIDT_IO_SEEN__ && window.__AIDT_IO_SEEN__.add(el); }catch(_s){}
            // Format intersecting target immediately
            try{ parseWithinRoot(el, true); }catch(_p){}
            try{ applyFontsAndEffects(); applyBaseText(); applyInlineSpanStyles(); }catch(_a){}
            try{ if (window.__AIDT_HAS_SAYDO__){ AIDT_applySayDo(document); } }catch(_sd){}
          }
        }catch(_cb){}
      }, { root:null, rootMargin:'200px 0px', threshold:0 });
      window.__AIDT_VISIBLE_IO__ = io;
      try{ if (window.__AIDT_OBSERVERS_ADD__) window.__AIDT_OBSERVERS_ADD__(io); }catch(_){ }
      return io;
    }catch(_){ return null; }
  }
  function attachVisibleObserver(){
    try{
      const io = setupVisibleFormatObserver(); if (!io) return;
      const seen = (window.__AIDT_IO_SEEN__) || new WeakSet();
      const preferred = document.getElementById('gameplay-output');
      const nodes = preferred ? preferred.querySelectorAll(LATEST_SELECTORS) : document.querySelectorAll(LATEST_SELECTORS);
      if (!nodes || !nodes.length) return;
      nodes.forEach(n=>{ try{ if (!seen.has(n)) { seen.add(n); io.observe(n); } }catch(_e){} });
    }catch(_){ }
  }

  function attachAmbienceObserver(){
    try{
      if (window.__AIDT_AMBIENCE_OBSERVER__) return;
      const root = document.body;
      if (!root) return;
      const mo = new MutationObserver(function(){
        try{ ensureAmbienceSuppressed(); }catch(_){ }
      });
      // Avoid watching 'style' to prevent loops from our own style writes
      mo.observe(root, { childList:true, subtree:true, attributes:true, attributeFilter:['src','srcset','class'] });
      window.__AIDT_AMBIENCE_OBSERVER__ = mo;
      try{ if (window.__AIDT_OBSERVERS_ADD__) window.__AIDT_OBSERVERS_ADD__(mo); }catch(_){ }
    }catch(_){ }
  }

  function updateAmbienceCss(shouldHide){
    try{
      let tag=document.getElementById('aidt-ambience-hide');
      if (!shouldHide){ if (tag) tag.remove(); return; }
      if (!tag){ tag=document.createElement('style'); tag.id='aidt-ambience-hide'; document.head.appendChild(tag); }
      tag.textContent = ''+
        ' #gameplay-saturate img{display:none!important;visibility:hidden!important;opacity:0!important}' +
        ' #__next img[alt="Ambience"]{display:none!important;visibility:hidden!important;opacity:0!important}';
    }catch(_){ }
  }

  function detachAmbienceObserver(){
    try{
      if (window.__AIDT_AMBIENCE_OBSERVER__){
        try{ window.__AIDT_AMBIENCE_OBSERVER__.disconnect(); }catch(_d){}
        try{ delete window.__AIDT_AMBIENCE_OBSERVER__; }catch(_del){}
      }
    }catch(_){ }
  }
  let __AIDT_BG_SCHED__ = false;
  const applyBackground = ()=>{
    const type=settings.backgroundType||'default';
    const colour=settings.bgColour||'#111827';
    const opacityPct = (typeof settings.bgOpacity==='number'?settings.bgOpacity:50);
    const imgUrl=(settings.bgImageUrl||'').trim();
    const gradient=(settings.bgGradient||'').trim();
    const imgSize=(settings.bgImageSize||'cover');
    const imgPos=(settings.bgImagePos||'center center');
    const imgRepeat=(settings.bgImageRepeat||'no-repeat');
    const imgAttach=(settings.bgImageAttach||'scroll');
    const clamp=(n)=> Math.max(0, Math.min(100, isNaN(n)?100:n));
    const o= clamp(opacityPct)/100;
    const rgbHexToRgba=(hex,alpha)=>{
      const h=hex.replace('#','');
      const bigint=parseInt(h.length===3 ? h.split('').map(c=>c+c).join('') : h,16);
      const r=(bigint>>16)&255, g=(bigint>>8)&255, b=bigint&255;
      return 'rgba('+r+','+g+','+b+','+alpha+')';
    };
    const solidVal = colour;
    const backdropVal = rgbHexToRgba(colour,o);
    // Apply-time sanitization
    const safeUrl = (s)=>{ try{ const u=new URL(s, location.href); return (u.protocol==='http:'||u.protocol==='https:') ? u.href : ''; }catch(_){ return ''; } };
    const safeGrad=(g)=>{ try{ const t=String(g||'').trim(); if (!t) return ''; if (!/^(linear-gradient|radial-gradient|conic-gradient)\(/i.test(t)) return ''; if (/url\s*\(/i.test(t)) return ''; if (/var\s*\(/i.test(t)) return ''; return t; }catch(_){ return ''; } };
    const gradSafe = safeGrad(gradient);
    const urlSafe  = safeUrl(imgUrl);
    const val= (type==='solid') ? solidVal : (type==='backdrop'?backdropVal:(type==='gradient'?gradSafe:(type==='image'?(urlSafe?('url("'+urlSafe+'")[cover]'):'') : '')));
    const writeBatch=()=>{
      BG_CONTAINERS.forEach(sel=>{
        const el=qs(document,sel); if(!el) return;
        if(type==='default'){
          el.style.removeProperty('background'); el.style.removeProperty('background-color'); el.style.removeProperty('background-image');
          return;
        }
        if (type==='image' && !!settings.bgImageInFront){
          // Global CSS will handle overlay clearing; apply image on the topmost overlay containers for front display
          if (sel==='#transition-opacity' || sel==='#gameplay-saturate'){
            try{ el.style.setProperty('background-image', 'url("'+imgUrl+'")', 'important'); el.style.setProperty('background-size','cover','important'); el.style.setProperty('background-position','center center','important'); el.style.setProperty('background-repeat','no-repeat','important'); }catch(_){ }
          } else {
            el.style.removeProperty('background'); el.style.removeProperty('background-color'); el.style.removeProperty('background-image');
          }
          return;
        }
        if((type==='backdrop') || (type==='image' && !settings.bgImageInFront)){
          // For backdrop and image-behind modes, overlays should be transparent; clear any previous solid styles
          if (sel==='#gameplay-saturate' || sel==='#transition-opacity'){
            try{ el.style.removeProperty('background'); }catch(_rb){}
            try{ el.style.removeProperty('background-color'); }catch(_rbc){}
            try{ el.style.removeProperty('background-image'); }catch(_rbi){}
            return;
          }
        }
        if(type==='gradient'){
          try{ if (gradSafe){ el.style.setProperty('background', gradSafe, 'important'); el.style.setProperty('background-color','transparent','important'); } }catch(_){ }
        } else if(type==='image'){
          try{ el.style.removeProperty('background'); }catch(_rmB){}
          try{ el.style.setProperty('background-color','transparent','important'); }catch(_bc){}
          try{ if (urlSafe){ el.style.setProperty('background-image', 'url("'+urlSafe+'")', 'important'); el.style.setProperty('background-size',imgSize,'important'); el.style.setProperty('background-position',imgPos,'important'); el.style.setProperty('background-repeat',imgRepeat,'important'); el.style.setProperty('background-attachment',imgAttach,'important'); } }catch(_){ }
        } else {
          el.style.setProperty('background', val, 'important');
          el.style.setProperty('background-color', val, 'important');
          if(type==='solid') el.style.setProperty('background-image', 'none', 'important');
          else el.style.removeProperty('background-image');
        }
      });
    };
    try{ (window.requestAnimationFrame||setTimeout)(()=>writeBatch(), 16); }catch(_){ writeBatch(); }
    // After applying backgrounds, suppress ambience image when needed
    try{ if (type==='solid' || (type==='image' && !!settings.bgImageInFront)){ ensureAmbienceSuppressed(); attachAmbienceObserver(); } }catch(_){ }
    try{
      if (type==='default'){
        document.documentElement.style.removeProperty('background');
        document.documentElement.style.removeProperty('background-color');
        document.documentElement.style.removeProperty('background-image');
      } else {
        if (type==='gradient'){
          try{
            if (gradSafe){ document.documentElement.style.setProperty('background', gradSafe, 'important'); }
            document.documentElement.style.removeProperty('background-image');
          }catch(_){ }
        } else if (type==='image'){
          try{
            document.documentElement.style.removeProperty('background');
            document.documentElement.style.removeProperty('background-color');
            if (urlSafe){ document.documentElement.style.setProperty('background-image','url("'+urlSafe+'")','important'); }
            document.documentElement.style.setProperty('background-size',imgSize,'important');
            document.documentElement.style.setProperty('background-position',imgPos,'important');
            document.documentElement.style.setProperty('background-repeat',imgRepeat,'important');
            document.documentElement.style.setProperty('background-attachment',imgAttach,'important');
          }catch(_){ }
        } else {
          document.documentElement.style.setProperty('background', val, 'important');
          document.documentElement.style.setProperty('background-color', val, 'important');
          if(type==='solid') document.documentElement.style.setProperty('background-image', 'none', 'important');
          else document.documentElement.style.removeProperty('background-image');
        }
      }
    }catch(_){ }
    try{
      let tag=document.getElementById('aidt-bg-style');
      if (type==='solid' || (type==='image' && !!settings.bgImageInFront)){
        if (!tag){ tag=document.createElement('style'); tag.id='aidt-bg-style'; document.head.appendChild(tag); }
        if (type==='solid'){
          tag.textContent = ''+
            ':root{--aidt-bg:'+colour+'}' +
            ' html,body,#__next,#gameplay-saturate,#transition-opacity{background:var(--aidt-bg)!important;background-color:var(--aidt-bg)!important;background-image:none!important}' +
            ' html::before,html::after,body::before,body::after,#__next::before,#__next::after,#gameplay-saturate::before,#gameplay-saturate::after,#transition-opacity::before,#transition-opacity::after{background:var(--aidt-bg)!important;background-image:none!important}' +
            ' #gameplay-saturate{filter:none!important}' +
            ' #transition-opacity{filter:none!important}' +
            ' #transition-opacity, #transition-opacity *{background:transparent!important;background-image:none!important}' +
            ' #gameplay-saturate, #gameplay-saturate *{background:transparent!important;background-image:none!important}' +
            ' #__next .t_sub_theme.is_Theme, #__next .is_LinearGradient, #__next [data-disable-theme="true"]{background:var(--aidt-bg)!important;background-image:none!important;opacity:1!important;filter:none!important}' +
            ' #__next .t_sub_theme.is_Theme::before, #__next .t_sub_theme.is_Theme::after, #__next .is_LinearGradient::before, #__next .is_LinearGradient::after, #__next [data-disable-theme="true"]::before, #__next [data-disable-theme="true"]::after{background:var(--aidt-bg)!important;background-image:none!important}' +
            ' #__next .t_sub_theme.is_Theme *, #__next .is_LinearGradient *, #__next [data-disable-theme="true"] *{background:transparent!important;background-image:none!important}' +
            ' #gameplay-saturate img, #__next img[alt="Ambience"]{display:none!important}';
        } else { // image in front of overlays
          tag.textContent = ''+
            ' html, body, #__next, #gameplay-saturate, #transition-opacity{background:transparent!important;background-image:none!important}' +
            ' #gameplay-saturate{filter:none!important}' +
            ' #transition-opacity{filter:none!important}' +
            ' #transition-opacity *{background:transparent!important;background-image:none!important;background-color:transparent!important}' +
            ' #gameplay-saturate *{background:transparent!important;background-image:none!important;background-color:transparent!important}' +
            ' #__next .t_sub_theme.is_Theme, #__next .is_LinearGradient, #__next [data-disable-theme="true"]{background:transparent!important;background-image:none!important;background-color:transparent!important;opacity:1!important;filter:none!important}' +
            ' #__next .t_sub_theme.is_Theme::before, #__next .t_sub_theme.is_Theme::after, #__next .is_LinearGradient::before, #__next .is_LinearGradient::after, #__next [data-disable-theme="true"]::before, #__next [data-disable-theme="true"]::after{background:transparent!important;background-image:none!important;background-color:transparent!important}' +
            ' #__next .t_sub_theme.is_Theme *, #__next .is_LinearGradient *, #__next [data-disable-theme="true"] *{background:transparent!important;background-image:none!important;background-color:transparent!important}' +
            ' #__next .css-175oi2r{background:transparent!important;background-image:none!important;background-color:transparent!important}' +
            ' #__next ._h-100--337{background:transparent!important;background-image:none!important;background-color:transparent!important}' +
            ' #gameplay-saturate img, #__next img[alt="Ambience"]{display:none!important}';
        }
      } else { if (tag) tag.remove(); }
    }catch(_){ }
    BG_APPLIED_ONCE=true;
  };

  function scheduleBackgroundApply(){
    try{
      // Keyed scheduler to dedupe retries to one per frame with fallback backoff
      window.__AIDT_SCHED__ = window.__AIDT_SCHED__ || Object.create(null);
      const key='bg-apply';
      if (window.__AIDT_SCHED__[key]) return;
      const run=()=>{
        try{
          window.__AIDT_SCHED__[key]=null; delete window.__AIDT_SCHED__[key];
          if (BG_APPLIED_ONCE) return;
          const type=(settings.backgroundType||'default');
          if (type==='default') return;
          if (type==='image' && !(settings.bgImageUrl||'').trim()) return;
          const uiReady=document.readyState==='complete';
          const hasTargets=!!document.querySelector('#gameplay-output, #do-not-copy, #transition-opacity, [data-testid="story-container"], [data-testid="adventure-text"], [data-testid="message-text"], [data-testid="playback-content"]');
          if (uiReady && hasTargets){ applyBackground(); return; }
          // Retry with increasing delay up to 1s
          window.__AIDT_SCHED_BACKOFF__ = window.__AIDT_SCHED_BACKOFF__ || Object.create(null);
          const cur = Math.min( (window.__AIDT_SCHED_BACKOFF__[key]||120) * 1.5, 1000 );
          window.__AIDT_SCHED_BACKOFF__[key] = cur;
          setTimeout(scheduleBackgroundApply, cur|0);
        }catch(_){ setTimeout(scheduleBackgroundApply, 200); }
      };
      window.__AIDT_SCHED__[key] = true;
      const raf=(typeof requestAnimationFrame==='function')?requestAnimationFrame:null;
      if (raf) raf(()=>run()); else setTimeout(run, 16);
    }catch(_){ }
  }
  const applyFontsAndEffects = ()=>{
    const roots=getRoots();
    const eff=settings.allCapsEffect||'None';
    // Ensure webfonts are injected once when a matching family is selected
    try{
      const fam=(settings.fontFamily||'').trim();
      const wanted=[
        {key:'Inter', url:'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&display=swap', css:'Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif'},
        {key:'Roboto', url:'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap', css:'Roboto, system-ui, -apple-system, Segoe UI, Helvetica, Arial, sans-serif'},
        {key:'Open Sans', url:'https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap', css:'Open Sans, system-ui, -apple-system, Segoe UI, Helvetica, Arial, sans-serif'},
        {key:'Nunito', url:'https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700&display=swap', css:'Nunito, system-ui, -apple-system, Segoe UI, Helvetica, Arial, sans-serif'},
        {key:'Merriweather', url:'https://fonts.googleapis.com/css2?family=Merriweather:wght@400;700&display=swap', css:'Merriweather, Georgia, serif'},
        {key:'Lora', url:'https://fonts.googleapis.com/css2?family=Lora:wght@400;700&display=swap', css:'Lora, Georgia, serif'},
        {key:'JetBrains Mono', url:'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap', css:'JetBrains Mono, ui-monospace, Menlo, Consolas, monospace'},
        {key:'Fira Code', url:'https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;600;700&display=swap', css:'Fira Code, ui-monospace, Menlo, Consolas, monospace'},
        {key:'Source Code Pro', url:'https://fonts.googleapis.com/css2?family=Source+Code+Pro:wght@400;600;700&display=swap', css:'Source Code Pro, ui-monospace, Menlo, Consolas, monospace'}
      ];
      const hit=wanted.find(w=>fam===w.key);
      if (hit && !document.querySelector('link[data-aidt-font="'+hit.key+'"]')){
        try{ if (!document.querySelector('link[rel="preconnect"][href^="https://fonts.gstatic.com"]')){ const p=document.createElement('link'); p.rel='preconnect'; p.href='https://fonts.gstatic.com'; p.crossOrigin='anonymous'; document.head.appendChild(p); } }catch(_){ }
        const l=document.createElement('link'); l.rel='stylesheet'; l.href=hit.url; l.setAttribute('data-aidt-font', hit.key); document.head.appendChild(l);
      }
    }catch(_){ }
    roots.forEach(el=>{
      try{
        if (el===document.body || el===document.documentElement) return;
        // Only set inline styles when deviating from defaults; otherwise clear to let site CSS win
        const fs=parseInt(settings.fontSize,10)||100;
        el.style.fontSize = (fs!==DEFAULTS.fontSize) ? (fs+'%') : '';
        // Map select values to actual font-family stacks
        let ff=settings.fontFamily||'inherit';
        const map={
          'system-sans':'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
          'system-mono':'ui-monospace, Menlo, Consolas, monospace',
          'Georgia':'Georgia, serif',
          'Times New Roman':'"Times New Roman", Times, serif',
          'Inter':'Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
          'Roboto':'Roboto, system-ui, -apple-system, Segoe UI, Helvetica, Arial, sans-serif',
          'Open Sans':'"Open Sans", system-ui, -apple-system, Segoe UI, Helvetica, Arial, sans-serif',
          'Nunito':'Nunito, system-ui, -apple-system, Segoe UI, Helvetica, Arial, sans-serif',
          'Merriweather':'Merriweather, Georgia, serif',
          'Lora':'Lora, Georgia, serif',
          'JetBrains Mono':'"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace',
          'Fira Code':'"Fira Code", ui-monospace, Menlo, Consolas, monospace',
          'Source Code Pro':'"Source Code Pro", ui-monospace, Menlo, Consolas, monospace',
          'Courier New':'"Courier New", Courier, monospace'
        };
        if (map[ff]) ff=map[ff];
        el.style.fontFamily=(ff && ff!=='inherit')?ff:'';
        const lh=(settings.lineHeight||1.5);
        el.style.lineHeight = (lh!==DEFAULTS.lineHeight) ? String(lh) : '';
        const ls=(settings.letterSpacing||0);
        el.style.letterSpacing = (ls!==DEFAULTS.letterSpacing)?(ls+'em'):'';
        el.style.textAlign=(settings.textAlign==='default'?'':settings.textAlign);
        el.classList.add('aidt-scope');
        // Remove any legacy root-level effect classes; effects are now applied only to ALL CAPS spans
        el.classList.remove('aidt-eff-Flash','aidt-eff-Strobe','aidt-eff-Rainbow','aidt-eff-Wave','aidt-eff-Breathe');
      }catch{}
    });
  };
  const applyBaseText = ()=>{
    const roots=getRoots();
    const mt=(settings.textFormatting && settings.textFormatting.mainText)||{bold:false, colour:'#ffffff'};
    const baseWeight =
      mt.bold ? '700' :
      (settings.fontWeight==='bold')   ? '700' :
      (settings.fontWeight==='medium') ? '500' :
      (settings.fontWeight==='regular')? '400' : '';
    roots.forEach(el=>{ try{
      if (el===document.body || el===document.documentElement) return;
      // Prefer CSS variables to reduce style churn
      if (mt.colour && mt.colour!==DEFAULTS.textFormatting.mainText.colour){
        try{ el.style.removeProperty('color'); }catch(_){ }
        el.style.setProperty('--aidt-base-color', mt.colour, 'important');
      } else {
        try{ el.style.removeProperty('--aidt-base-color'); }catch(_){ }
      }
      if (baseWeight){
        try{ el.style.removeProperty('font-weight'); }catch(_){ }
        el.style.setProperty('--aidt-base-weight', baseWeight, 'important');
      } else {
        try{ el.style.removeProperty('--aidt-base-weight'); }catch(_){ }
      }
    }catch{} });
  };

  // Apply main text color/weight directly to a specific element (used for latest paragraph)
  function applyBaseTextToElement(target){
    try{
      if (!target) return;
      const mt=(settings.textFormatting && settings.textFormatting.mainText)||{bold:false, colour:'#ffffff'};
      const baseWeight = mt.bold ? '700' :
        (settings.fontWeight==='bold')   ? '700' :
        (settings.fontWeight==='medium') ? '500' :
        (settings.fontWeight==='regular')? '400' : '';
      if (mt.colour && mt.colour!==DEFAULTS.textFormatting.mainText.colour){
        try{ target.style.removeProperty('color'); }catch(_){ }
        target.style.setProperty('--aidt-base-color', mt.colour, 'important');
      }
      if (baseWeight){ try{ target.style.removeProperty('font-weight'); }catch(_){ } target.style.setProperty('--aidt-base-weight', baseWeight, 'important'); }
      dbg('applyBaseTextToElement: applied to node');
    }catch(_){ }
  }

  // Update existing inline spans (Speech/IM) and apply SAY overrides inside w_comment
  let __AIDT_INLINE_SCHED__ = false;
  const applyInlineSpanStyles = ()=>{
    if (__AIDT_INLINE_SCHED__) return;
    __AIDT_INLINE_SCHED__ = true;
    const _sched = (typeof requestAnimationFrame==='function') ? requestAnimationFrame : (cb)=>setTimeout(cb,16);
    _sched(()=>{ try{ applyInlineSpanStylesNow(); } finally { __AIDT_INLINE_SCHED__ = false; } });
  };
  function applyInlineSpanStylesNow(){
    const perfOn = __aidt_isDebugEnabled && __aidt_isDebugEnabled();
    try{ if (perfOn && performance && performance.mark) performance.mark('aidt:inline:start'); }catch(_){ }
    if (!settings.enabled) return;
    // Per-frame memoized setter to avoid redundant inline style writes
    const setIfChanged = (el, prop, value)=>{
      try{
        const cur = el.style.getPropertyValue(prop);
        if (cur === value) return;
        el.style.setProperty(prop, value, 'important');
      }catch(_){ }
    };
    const spCol = settings.speech.colour || '#ffffff';
    const spW   = settings.speech.bold ? '700' : '';
    const sayCol= settings.actions.say.colour || spCol;
    const sayW  = settings.actions.say.bold ? '700' : spW;

    try{
      const root=document.documentElement;
      setIfChanged(root, '--aidt-speech-color', spCol);
      setIfChanged(root, '--aidt-speech-weight', (spW||'400'));
      // Defaults for say vars equal speech; containers will override
      setIfChanged(root, '--aidt-say-color', spCol);
      setIfChanged(root, '--aidt-say-weight', (spW||'400'));
    }catch(_){ }
    try{ document.querySelectorAll('.w_comment, .w-comment').forEach(c=>{ try{ c.style.setProperty('--aidt-say-color', sayCol, 'important'); c.style.setProperty('--aidt-say-weight', (sayW||'400'), 'important'); }catch(_c){} }); }catch(_){ }

    const imCol = settings.internalMonologue.colour || '#9ca3af';
    const imW   = settings.internalMonologue.bold ? '700' : '';
    try{ const root=document.documentElement; setIfChanged(root, '--aidt-im-color', imCol); setIfChanged(root, '--aidt-im-weight', (imW||'400')); }catch(_){ }

    // Italics (unquoted) color/weight
    try{
      const itCol = settings.italics.colour || '#facc15';
      const itW   = settings.italics.bold ? '700' : '';
      try{ const root=document.documentElement; setIfChanged(root, '--aidt-it-color', itCol); setIfChanged(root, '--aidt-it-weight', (itW||'400')); }catch(_){ }
    }catch(_){ }

    // Heuristic: treat full-line italic blocks as IM and tint them
    try{
      const looksLikeSentence=(t)=>{
        const s=(t||'').trim();
        if (s.length<8) return false;
        const words=s.split(/\s+/).length;
        return words>=3 || /[\.\!\?]$/.test(s);
      };
      (getRoots()).forEach(root=>{ qsa(root,'.aidt-italic:not(.aidt-im)').forEach(el=>{
        try{
          if (el.closest('.aidt-speech')) return; // do not tint italics inside speech
          const t=(el.textContent||'').trim(); if(!looksLikeSentence(t)) return;
          const parent=el.parentElement; if(!parent) return;
          const ptxt=(parent.textContent||'').trim();
          if (ptxt===t){ // italic is the sole content of the block
            el.classList.add('ai-italic-speech');
            // rely on CSS variables via class
          }
        }catch(_){ }
      }); });
    }catch(_){ }

    // Update ALL CAPS effect classes instantly
    try{
      const eff=settings.allCapsEffect||'None';
      (getRoots()).forEach(root=>{ qsa(root,'.aidt-allcaps, .aidt-keyword').forEach(el=>{
        try{
          el.classList.remove('aidt-eff-Flash','aidt-eff-Strobe','aidt-eff-Rainbow','aidt-eff-Wave','aidt-eff-Breathe');
          if (eff && eff!=='None') el.classList.add('aidt-eff-'+eff);
        }catch(_){ }
      }); });
    }catch(_){ }

    // Update keyword spans instantly based on stored data
    try{
      const list=(settings.textFormatting && settings.textFormatting.keywords)||[];
      const map=new Map();
      list.forEach(k=>{
        if (!k) return;
        if (typeof k==='string') map.set(k.toLowerCase(), {effect:'None', bold:false, color:null});
        else map.set((k.text||'').toLowerCase(), {effect:(k.effect||'None'), bold:!!k.bold, color:(k.color||null)});
      });
      // Ensure older keyword spans get data attribute
      (getRoots()).forEach(root=>{ qsa(root,'span.aidt-keyword:not([data-aidt-keyword])').forEach(el=>{
        try{ el.setAttribute('data-aidt-keyword', (el.textContent||'').trim()); }catch(_){ }
      }); });
      const allKeywordSpans = (function(){ const acc=[]; (getRoots()).forEach(root=>{ acc.push(...qsa(root,'span.aidt-keyword[data-aidt-keyword]')); }); return acc; })();
      allKeywordSpans.forEach(el=>{
        try{
          const key=(el.getAttribute('data-aidt-keyword')||'').toLowerCase();
          const cfg=map.get(key);
          // Reset previous effect/bold so switching works instantly
          el.classList.remove('aidt-eff-Flash','aidt-eff-Strobe','aidt-eff-Rainbow','aidt-eff-Wave','aidt-eff-Breathe');
          el.style.fontWeight='';
          el.style.removeProperty('animation');
          el.style.removeProperty('filter');
          el.style.removeProperty('transform');
          el.style.removeProperty('color');
          if (cfg){
            if (cfg.effect && cfg.effect!=='None') el.classList.add('aidt-eff-'+cfg.effect);
            if (cfg.bold) el.style.setProperty('--aidt-kw-weight','700','important');
            if (cfg.color && typeof cfg.color==='string'){ el.style.setProperty('--aidt-kw-color', cfg.color, 'important'); }
            // Ensure Rainbow is visible on near-white text by giving a vivid base color
            try{
              if (cfg.effect==='Rainbow'){
                const cs = (window && window.getComputedStyle) ? getComputedStyle(el) : null;
                const col = cs ? cs.color : '';
                const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(col);
                if (m){
                  const r=Number(m[1]), g=Number(m[2]), b=Number(m[3]);
                  const max=Math.max(r,g,b), min=Math.min(r,g,b);
                  const diff=max-min; // low diff => grayscale
                  if (diff < 8 && max > 220){
                    // Set a saturated base so hue-rotate animation is visible. No !important to allow parent overrides.
                    el.style.color='hsl(0,100%,50%)';
                  }
                }
              }
            }catch(_){ }
          }
        }catch(_){ }
      });
    }catch(_){ }
  }
  // Paragraph formatting
  function applyParagraphsToHTML(html){
    try{
      const mode=(settings.paragraphs||'default');
      if (!html) return html;
      if (mode==='default') return html;
      // Work on text segments only, preserve tags
      const parts=String(html).split(/(<[^>]+>)/g);
      for (let i=0;i<parts.length;i++){
        const seg=parts[i]; if (!seg || seg.charCodeAt(0)===60) continue;
        const text=seg;
        if (mode==='basic'){
          // Ensure a blank line between paragraphs: collapse to single newlines then make double between blocks
          // Normalize CRLF first
          let t=text.replace(/\r\n/g,'\n');
          // Ensure at least one blank line between blocks separated by a single newline if sentence end
          t = t.replace(/([.!?]")?\s*\n(\s*)(?!\n)/g, function(m, endQuote){
            // If the preceding char ends a sentence or quote, insert an extra newline
            return (endQuote?endQuote:'')+"\n\n";
          });
          parts[i]=t;
        } else if (mode==='newline'){
          // Newline rules focused on quotes and asterisks:
          // - Insert a blank line before each quote or IM block
          // - Put the quote/IM itself on its own line
          // - Only a single newline after a quote/IM before following narration
          // - Do NOT split narration into per-sentence lines
          let t=text.replace(/\r\n/g,'\n');
          const imQuotedBuf=[]; // stores *"..."*
          const imPlainBuf=[];  // stores *text*
          // Protect IM markers so we can treat them like quotes
          t = t.replace(/\*"([\s\S]*?)"\*/g, function(m){ imQuotedBuf.push(m); return '§IMQ§'+(imQuotedBuf.length-1)+'§'; });
          t = t.replace(/\*(?=\S)([^*\n]+?)\*/g, function(m){ imPlainBuf.push(m); return '§IMP§'+(imPlainBuf.length-1)+'§'; });
          // Match double-quoted strings without consuming following narration/spaces
          const quoteRe=/"(?:[^"\n]|\\")*"/g;
          const tokens=[]; let idx=0; let m;
          const pushNarrationParts=(chunk)=>{
            if (!chunk) return;
            // Split narration chunk further to isolate IM placeholders as standalone tokens
            const parts=chunk.split(/(§IMQ§\d+§|§IMP§\d+§)/g);
            for (let p of parts){
              if (!p) continue;
              if (/^§IMQ§\d+§$/.test(p)) tokens.push({type:'imq', text:p});
              else if (/^§IMP§\d+§$/.test(p)) tokens.push({type:'imp', text:p});
              else tokens.push({type:'text', text:p});
            }
          };
          quoteRe.lastIndex=0;
          while((m=quoteRe.exec(t))){
            const pre=t.slice(idx, m.index);
            if (pre) pushNarrationParts(pre);
            tokens.push({type:'quote', text:m[0]});
            idx=m.index + m[0].length;
          }
          const tail=t.slice(idx); if (tail) pushNarrationParts(tail);
          // Build output with spacing rules
          let outSeg='';
          const appendBlankLineBefore=()=>{
            if (outSeg==='' || outSeg.endsWith('\n\n')) return;
            if (outSeg.endsWith('\n')) { outSeg += '\n'; return; }
            outSeg += '\n\n';
          };
          for (let iTok=0;iTok<tokens.length;iTok++){
            const tok=tokens[iTok];
            if (tok.type==='text'){
              outSeg += tok.text; // preserve spaces in narration
            } else if (tok.type==='quote' || tok.type==='imq' || tok.type==='imp'){
              appendBlankLineBefore();
              const q = tok.text.replace(/^[ \t]+|[ \t]+$/g,'');
              outSeg += q + '\n';
              const next=tokens[iTok+1];
              if (next && next.type==='text' && next.text){
                next.text = next.text.replace(/^(?:[ \t]*\n+[ \t]*|[ \t]+)/,'');
              }
            }
          }
          // Restore IM placeholders
          outSeg = outSeg
            .replace(/§IMQ§(\d+)§/g, (_,k)=> imQuotedBuf[Number(k)] || '')
            .replace(/§IMP§(\d+)§/g, (_,k)=> imPlainBuf[Number(k)] || '');
          // Collapse excessive blank lines (including those with ASCII spaces)
          outSeg = outSeg.replace(/\n{3,}/g,'\n\n');
          outSeg = outSeg.replace(/\n(?:[ \t]*\n){2,}/g,'\n\n');
          parts[i]=outSeg;
        }
      }
      const out = parts.join('');
      return out.indexOf('\n')>=0 ? out.replace(/\n/g,'<br/>') : out;
    }catch(_){ return html; }
  }
  function applyParagraphsToText(text){
    try{
      const mode=(settings.paragraphs||'default');
      if (!text || mode==='default') return text;
      let s=String(text).replace(/\r\n/g,'\n');
      if (mode==='basic'){
        // Collapse 3+ newlines to single, then convert single to double
        s = s.replace(/\n{3,}/g,'\n');
        // Convert any single newline between non-empty lines into double
        // First, collapse multiple newlines to two
        s = s.replace(/\n{2,}/g,'\n\n');
        // Then ensure any remaining single newline becomes double
        s = s.replace(/([^\n])\n(?!\n)/g, '$1\n\n');
        return s;
      }
      if (mode==='newline'){
        // Quote/IM-focused line breaking; preserve narration spacing
        const imQuotedBuf=[];  // stores *"..."*
        const imPlainBuf=[];   // stores *text*
        s = s.replace(/\*"([\s\S]*?)"\*/g, function(m){ imQuotedBuf.push(m); return '§IMQ§'+(imQuotedBuf.length-1)+'§'; });
        s = s.replace(/\*(?=\S)([^*\n]+?)\*/g, function(m){ imPlainBuf.push(m); return '§IMP§'+(imPlainBuf.length-1)+'§'; });
        // Match double-quoted strings without consuming following narration/spaces
        const quoteRe=/"(?:[^"\n]|\\")*"/g;
        const tokens=[]; let idx=0; let m;
        const pushNarrationParts=(chunk)=>{
          if (!chunk) return;
          const parts=chunk.split(/(§IMQ§\d+§|§IMP§\d+§)/g);
          for (let p of parts){
            if (!p) continue;
            if (/^§IMQ§\d+§$/.test(p)) tokens.push({type:'imq', text:p});
            else if (/^§IMP§\d+§$/.test(p)) tokens.push({type:'imp', text:p});
            else tokens.push({type:'text', text:p});
          }
        };
        quoteRe.lastIndex=0;
        while((m=quoteRe.exec(s))){
          const pre=s.slice(idx, m.index);
          if (pre) pushNarrationParts(pre);
          tokens.push({type:'quote', text:m[0]});
          idx=m.index + m[0].length;
        }
        const tail=s.slice(idx); if (tail) pushNarrationParts(tail);
        let out='';
        const isAtParagraphBoundary=()=> out==='' || /\n\n$/.test(out);
        const appendBlankLineBefore=()=>{
          if (out==='' || out.endsWith('\n\n')) return;
          if (out.endsWith('\n')) { out += '\n'; return; }
          out += '\n\n';
        };
        for (let iTok=0;iTok<tokens.length;iTok++){
          const tok=tokens[iTok];
          if (tok.type==='text'){
            out += tok.text; // keep original narration spacing
          } else if (tok.type==='quote' || tok.type==='imq' || tok.type==='imp'){
            appendBlankLineBefore();
            const q = tok.text.replace(/^[ \t]+|[ \t]+$/g,'');
            out += q + '\n';
            const next=tokens[iTok+1];
            if (next && next.type==='text' && next.text){
              next.text = next.text.replace(/^(?:[ \t]*\n+[ \t]*|[ \t]+)/,'');
            }
          }
        }
        out = out
          .replace(/§IMQ§(\d+)§/g, (_,k)=> imQuotedBuf[Number(k)] || '')
          .replace(/§IMP§(\d+)§/g, (_,k)=> imPlainBuf[Number(k)] || '')
          .replace(/\n{3,}/g,'\n\n')
          .replace(/\n(?:[ \t]*\n){2,}/g,'\n\n');
        return out;
      }
      return text;
    }catch(_){ return text; }
  }

  // Retrofit pass: apply full transform to existing content (older paragraphs)
  const retrofitAllCapsAndKeywords = ()=>{
    try{
      const roots=getRoots();
      for (let r=0;r<roots.length;r++){
        const root=roots[r]; if (!root || isDanger(root)) continue;
        const walker=document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode(node){
          try{
            const p=node.parentNode; if (!p) return NodeFilter.FILTER_REJECT;
            if (p.closest('script,style,template,code,pre')) return NodeFilter.FILTER_REJECT;
            // Allow formatting even when nodes are contenteditable; exclude already-processed AIDT spans
            if (p.closest('.aidt')) return NodeFilter.FILTER_REJECT;
            const t=node.nodeValue||''; if (!/\S/.test(t)) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
          }catch{ return NodeFilter.FILTER_REJECT; }
        }}, false);
        const targets=[]; for (let n=walker.nextNode(); n; n=walker.nextNode()) targets.push(n);
        for (let i=0;i<targets.length;i++){
          const tn=targets[i]; const raw=String(tn.nodeValue||'');
          let html=transformString(raw);
          if (html!==raw){ const span=document.createElement('span'); span.innerHTML=html; tn.replaceWith(span); }
        }
      }

    }catch(_){ }
    try{ if (perfOn && performance && performance.mark) { performance.mark('aidt:inline:end'); performance.measure('aidt:inline', 'aidt:inline:start', 'aidt:inline:end'); } }catch(_){ }
  };

  function disableTweaks(){
    try{
      try{ BG_CONTAINERS.forEach(sel=>{ const el=qs(document,sel); if(el){ el.style.removeProperty('background'); el.style.removeProperty('background-color'); el.style.removeProperty('background-image'); } }); document.documentElement.style.removeProperty('background'); document.documentElement.style.removeProperty('background-color'); document.documentElement.style.removeProperty('background-image'); const tag=document.getElementById('aidt-bg-style'); if(tag) tag.remove(); }catch(_){ }
      const roots=getRoots();
      roots.forEach(el=>{ try{ if (el===document.body || el===document.documentElement) return; el.style.removeProperty('font-size'); el.style.removeProperty('font-family'); el.style.removeProperty('line-height'); el.style.removeProperty('letter-spacing'); el.style.removeProperty('text-align'); el.style.removeProperty('color'); el.style.removeProperty('font-weight'); el.classList.remove('aidt-eff-Flash','aidt-eff-Strobe','aidt-eff-Rainbow','aidt-eff-Wave','aidt-eff-Breathe'); }catch(_){ } });
      try{ document.querySelectorAll('.aidt-speech, .aidt-im, .aidt-keyword, .aidt-allcaps').forEach(el=>{ try{ el.classList.remove('aidt-eff-Flash','aidt-eff-Strobe','aidt-eff-Rainbow','aidt-eff-Wave','aidt-eff-Breathe'); el.style.removeProperty('color'); el.style.removeProperty('font-weight'); el.style.removeProperty('animation'); el.style.removeProperty('filter'); el.style.removeProperty('transform'); }catch(_){ } }); }catch(_){ }
    }catch(_){ }
  }
  const applyGlobal = ()=>{
    try{ window.__AIDT_PAUSE__ = !settings.enabled; }catch(_){ }
    if(!settings.enabled){ disableTweaks(); return; }
    applyFontsAndEffects();
    applyBaseText();
    applyInlineSpanStyles();
    const type=(settings.backgroundType||'default');
    const hideAmbience = (type==='solid') || (type==='image');
    updateAmbienceCss(hideAmbience);
    applyBackground();
    if (hideAmbience){ ensureAmbienceSuppressed(); attachAmbienceObserver(); }
    else { ensureAmbienceVisible(); detachAmbienceObserver(); }
  };
  const applyGlobalNoBG = ()=>{ applyFontsAndEffects(); applyBaseText(); applyInlineSpanStyles(); };
  const reapply     = debounce(applyGlobal, 50);

  // ---------------- UI (tabs, single column, instant apply) ----------------
  let panelAPI=null;
  function buildPanel(){
    if (panelAPI) return panelAPI;

    // Ensure a single panel host (guard against double-injection on SPA re-inits)
    try{ const old=document.getElementById('aidt-panel-host'); if (old && old.parentNode){ old.parentNode.removeChild(old); } }catch(_){ }
    const host=document.createElement('div'); host.id='aidt-panel-host';
    host.style.all='initial'; host.style.position='fixed'; host.style.right='18px'; host.style.bottom='18px'; host.style.zIndex='2147483647'; host.style.pointerEvents='none';
    document.documentElement.appendChild(host);
    const root=host.attachShadow({mode:'open'});

    const style=document.createElement('style');
    style.textContent =
      ':host{all:initial;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;pointer-events:none}' +
      '.btn{all:initial;display:inline-flex;align-items:center;gap:.5rem;cursor:pointer;padding:10px 12px;border-radius:999px;border:1px solid rgba(148,163,184,.35);background:#1e2430;color:#e5e7eb;font:500 13px system-ui;pointer-events:auto}' +
      '.btn:hover{background:#1b2230}' +
      '.btn,.ghost,.reset,.tab{transition:transform .12s ease, filter .12s ease; outline: none}' +
      '.btn:active,.ghost:active,.reset:active,.tab:active{transform:translateY(1px) scale(.98);filter:brightness(.92)}' +
      '.panel{all:initial;position:fixed;right:0;bottom:46px;width:520px;max-width:95vw;max-height:78vh;border-radius:14px;border:1px solid rgba(148,163,184,.35);background:#252b36;color:#e5e7eb;backdrop-filter:blur(6px);box-shadow:0 10px 30px rgba(0,0,0,.45);display:none;overflow:hidden;font:13px system-ui}' +
      '@media (max-width: 640px){ .btn{ position: fixed; right: 12px; bottom: 92px; z-index: 2147483647; } }' +
      '.panel.open{display:block}' +
      '.header{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid rgba(51,65,85,.6);position:relative}' +
      '.header-actions{display:flex;align-items:center;gap:10px}' +
      '.left-actions{display:flex;align-items:center;gap:10px}' +
      '.title{font-size:14px;font-weight:700;position:absolute;left:50%;transform:translateX(-50%)}' +
      '.ghost{all:initial;font:13px system-ui;color:#e5e7eb;border:1px solid rgba(148,163,184,.35);border-radius:8px;background:#1b2230;padding:6px 10px;cursor:pointer; outline: none}' +
      '.ghost:hover{background:#1a212e}' +
      '.tabs{position:sticky;top:0;z-index:1;display:flex;gap:10px;padding:10px 10px 0;justify-content:center;align-items:center;background:linear-gradient(180deg,rgba(37,43,54,1),rgba(37,43,54,.85))}' +
      '.tab{all:initial;cursor:pointer;padding:8px 12px;border-radius:10px;border:1px solid transparent;color:#cbd5e1;transition:background-color .15s,color .15s,border-color .15s;outline:none;font:600 13px system-ui;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:optimizeLegibility}' +
      '.tab:active{transform:translateY(1px) scale(.98)}' +
      '.tab:hover{background:#0b1220;color:#e5e7eb;border-color:rgba(148,163,184,.35)}' +
      '.tab:focus-visible{box-shadow:0 0 0 2px rgba(59,130,246,.45)}' +
      '.tab[aria-selected="true"]{color:#e5e7eb;background:linear-gradient(180deg,#0b1220,#0a1423);border-color:rgba(148,163,184,.45);box-shadow:inset 0 0 0 1px rgba(148,163,184,.22);font-weight:700}' +
      '.sections{padding:10px;overflow:auto;max-height:60vh}' +
      '.section{display:none}.section.active{display:block}' +
      '.group{border:1px solid rgba(148,163,184,.25);border-radius:10px;padding:10px;margin-bottom:10px;background:#161c27}' +
      '.group h4{margin:0 0 8px 0;font-size:12px;letter-spacing:.02em;color:#cbd5e1;text-transform:uppercase}' +
      '.row{display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center;padding:6px 4px}' +
      '.row.is-disabled{opacity:.5;filter:grayscale(25%)}' +
      '.row.is-disabled .btn,.row.is-disabled .ghost,.row.is-disabled .reset,.row.is-disabled .tab,' +
      '.row.is-disabled select,.row.is-disabled input[type="color"],.row.is-disabled input[type="range"],.row.is-disabled input[type="text"],' +
      '.row.is-disabled .switch{pointer-events:none;filter:none;transform:none}' +
      '.row+.row{border-top:1px dashed rgba(51,65,85,.5)}' +
      'select,input[type="color"],input[type="range"],input[type="text"]{all:initial;font:13px system-ui;color:#e5e7eb;border:1px solid rgba(148,163,184,.35);border-radius:8px;background:#0f1622;padding:6px 8px;min-width:140px; outline: none}' +
      'input[type="range"]{width:180px} input[type="text"]{width:200px}' +
      '.switch{all:initial;display:inline-flex;width:42px;height:24px;border-radius:999px;background:#334155;position:relative;border:1px solid rgba(148,163,184,.35);cursor:pointer}' +
      '.switch[data-on="true"]{background:#16a34a}.knob{position:absolute;top:1px;left:1px;width:20px;height:20px;border-radius:50%;background:#e5e7eb;transition:left .15s}' +
      '.switch:active .knob{transform:scale(.95)}' +
      '.switch[data-on="true"] .knob{left:21px}' +
      '.reset{all:initial;cursor:pointer;border:1px solid rgba(148,163,184,.35);background:#0b1220;border-radius:8px;padding:4px 8px;color:#e5e7eb; outline: none}' +
      // Keyboard-only focus indicators using :focus-visible
      '.btn:focus-visible,.ghost:focus-visible,.reset:focus-visible{box-shadow:0 0 0 2px rgba(59,130,246,.45)}' +
      'select:focus-visible,input[type="color"]:focus-visible,input[type="range"]:focus-visible,input[type="text"]:focus-visible{box-shadow:0 0 0 2px rgba(59,130,246,.45)}' +
      '.actions{display:flex;gap:8px;justify-content:flex-end;padding-top:8px;flex-wrap:wrap}' +
      '.actions.equal button{flex:1 1 140px}' +
      '.actions.act-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;justify-content:stretch}' +
      '.actions.act-grid-2{display:grid;grid-template-columns:repeat(2,minmax(160px,1fr));gap:8px;justify-content:stretch}' +
      '.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}' +
      '.chip{display:inline-flex;align-items:center;gap:6px;background:#0f1622;border:1px solid rgba(148,163,184,.35);border-radius:999px;padding:4px 8px}' +
      '.chip button{all:initial;cursor:pointer;border:1px solid rgba(148,163,184,.35);border-radius:8px;padding:2px 6px;color:#e5e7eb;background:#0f1622}' +
      '.chip .lbl{display:inline-flex;align-items:center;gap:6px}' +
      '#row-bg-image-opts{grid-template-columns:1fr auto}' +
      '.imgopt-grid{display:grid;grid-template-columns:1fr;gap:10px;align-items:start;justify-items:start}' +
      '.imgopt-grid .cell{display:flex;flex-direction:column;gap:4px}' +
      '.imgopt-grid .cell .lbl{font-size:12px;color:#cbd5e1}' +
      '.imgopt-grid select{text-align:left}' +
      '#row-bg-image-opts .imgopt-grid{grid-column:2 / 3;justify-self:end}' +
      '#row-bg-image-opts .imgopt-grid select{width:auto;min-width:160px;box-sizing:border-box;align-self:flex-start}' +
      '@media (max-width: 800px){ #row-bg-image-opts .imgopt-grid{grid-template-columns:1fr} }' +
      '@media (max-width: 480px){ #row-bg-image-opts .imgopt-grid{grid-template-columns:1fr} }' +
      '.sr-only{position:absolute!important;left:-9999px!important;width:1px!important;height:1px!important;overflow:hidden!important;white-space:nowrap!important}' +
      // Mobile ergonomics: ensure 44px+ touch targets on coarse pointers
      '@media (pointer: coarse){' +
        ' .btn,.ghost,.reset,.tab,select,input[type="color"],input[type="range"],input[type="text"]{min-height:44px}' +
        ' .tab{padding:12px 14px}' +
        ' .ghost,.reset{padding:10px 12px}' +
        ' .switch{width:50px;height:28px}' +
        ' .switch .knob{width:24px;height:24px;top:1px;left:1px}' +
        ' .switch[data-on="true"] .knob{left:25px}' +
        ' .header{padding:12px}' +
        ' .tabs{gap:12px}' +
        ' .row{gap:10px}' +
      '}' +
      '@media (prefers-reduced-motion: reduce){ .btn,.ghost,.reset,.tab{transition:none!important} .switch .knob{transition:none!important} }';
    root.appendChild(style);

    const btn=document.createElement('button'); btn.className='btn'; btn.textContent='AIDT ⚙️'; btn.style.pointerEvents='auto'; root.appendChild(btn);
    // Nudge button when overlapping input action row on mobile
    try{ if (window.matchMedia && window.matchMedia('(max-width: 640px)').matches){ btn.style.position='fixed'; btn.style.right='12px'; btn.style.bottom='92px'; btn.style.zIndex='2147483647'; } }catch(_){ }

    const panel=document.createElement('div'); panel.className='panel';
    try{
      const raw=(settings.languageOverride&&settings.languageOverride!=='default')?settings.languageOverride:'en-US';
      const base=(raw||'').split('-')[0].toLowerCase();
      const rtlLangs=new Set(['ar','he','fa','ur']);
      panel.setAttribute('dir', rtlLangs.has(base)?'rtl':'ltr');
    }catch(_){ }
    // Header (safe DOM)
    const header=document.createElement('div'); header.className='header';
    const left=document.createElement('div'); left.className='left-actions';
    const btnClose=document.createElement('button'); btnClose.id='close'; btnClose.className='ghost'; btnClose.textContent='✕'; btnClose.setAttribute('aria-label','Close'); left.appendChild(btnClose);
    const title=document.createElement('div'); title.className='title'; title.textContent='AI Dungeon Tweaks'+(SCRIPT_VERSION?(' - v'+SCRIPT_VERSION):'');
    const hact=document.createElement('div'); hact.className='header-actions';
    const swEn=document.createElement('div'); swEn.id='sw-enabled'; swEn.className='switch'; swEn.title=T('Enable'); swEn.innerHTML='<div class="knob"></div>';
    hact.appendChild(swEn);
    header.appendChild(left); header.appendChild(title); header.appendChild(hact);
    panel.appendChild(header);
    // Tabs (safe DOM)
    const tabsEl=document.createElement('div'); tabsEl.className='tabs'; tabsEl.setAttribute('role','tablist');
    const mkTab=(key,label)=>{ const b=document.createElement('button'); b.className='tab'; b.setAttribute('role','tab'); b.setAttribute('aria-selected','false'); b.setAttribute('data-tab',key); b.setAttribute('aria-controls','aidt-section-'+key); b.id='aidt-tab-'+key; b.textContent=label; b.title=label; return b; };
    tabsEl.appendChild(mkTab('actions', T('Actions')));
    tabsEl.appendChild(mkTab('format', T('Text Formatting')));
    tabsEl.appendChild(mkTab('misc',   T('Miscellaneous')));
    panel.appendChild(tabsEl);
    // Sections (existing HTML string kept for now)
    const sectionsEl=document.createElement('div'); sectionsEl.className='sections';
    const live=document.createElement('div'); live.className='sr-only'; live.setAttribute('aria-live','polite'); live.id='aidt-live'; sectionsEl.appendChild(live);
    const desc=document.createElement('p'); desc.className='sr-only'; desc.id='aidt-desc'; desc.textContent='Settings dialog. Press Tab to navigate. Press Escape to close.'; sectionsEl.appendChild(desc);
    sectionsEl.innerHTML=
      '<section id="aidt-section-actions" class="section" data-section="actions" role="tabpanel" aria-labelledby="aidt-tab-actions">'+
        '<div class="group"><h4>'+T('Do')+'</h4><div class="row"><span>'+T('Bold')+'</span><div id="sw-do-bold" class="switch"><div class="knob"></div></div><span></span></div><div class="row"><span>'+T('Colour')+'</span><select id="dd-do-presets" class="presets"></select></div><div class="row"><span></span><input id="sel-do-colour" type="color" value="#ffffff"/><button id="rst-do-colour" class="reset" title="'+T('Reset')+'">↺</button></div><div class="actions"><button id="rst-do-group" class="ghost">'+T('Restore Defaults')+'</button></div></div>'+
        '<div class="group"><h4>'+T('Say')+'</h4><div class="row"><span>'+T('Bold')+'</span><div id="sw-say-bold" class="switch"><div class="knob"></div></div><span></span></div><div class="row"><span>'+T('Colour')+'</span><select id="dd-say-presets" class="presets"></select></div><div class="row"><span></span><input id="sel-say-colour" type="color" value="#ffffff"/><button id="rst-say-colour" class="reset" title="'+T('Reset')+'">↺</button></div><div class="actions"><button id="rst-say-group" class="ghost">'+T('Restore Defaults')+'</button></div></div>'+
      '</section>'+
      '<section id="aidt-section-format" class="section" data-section="format" role="tabpanel" aria-labelledby="aidt-tab-format">'+
        '<div class="group"><h4>'+T('Main Text')+'</h4><div class="row"><span>'+T('Bold')+'</span><div id="sw-main-bold" class="switch"><div class="knob"></div></div><span></span></div><div class="row"><span>'+T('Colour')+'</span><select id="dd-main-presets" class="presets"></select></div><div class="row"><span></span><input id="sel-main-colour" type="color" value="#ffffff"/><button id="rst-main-colour" class="reset" title="'+T('Reset')+'">↺</button></div><div class="actions"><button id="rst-main-group" class="ghost">'+T('Restore Defaults')+'</button></div></div>'+
        '<div class="group"><h4>'+T('Speech')+'</h4><div class="row"><span>'+T('Bold')+'</span><div id="sw-sp-bold" class="switch"><div class="knob"></div></div><span></span></div><div class="row"><span>'+T('Colour')+'</span><select id="dd-sp-presets" class="presets"></select></div><div class="row"><span></span><input id="sel-sp-colour" type="color"/><button id="rst-sp-colour" class="reset" title="'+T('Reset')+'">↺</button></div><div class="actions"><button id="rst-sp-group" class="ghost">'+T('Restore Defaults')+'</button></div></div>'+
        '<div class="group"><h4>'+T('Internal Monologue')+'</h4><div class="row"><span>'+T('Bold')+'</span><div id="sw-im-bold" class="switch"><div class="knob"></div></div><span></span></div><div class="row"><span>'+T('Colour')+'</span><select id="dd-im-presets" class="presets"></select></div><div class="row"><span></span><input id="sel-im-colour" type="color"/><button id="rst-im-colour" class="reset" title="'+T('Reset')+'">↺</button></div><div class="actions"><button id="rst-im-group" class="ghost">'+T('Restore Defaults')+'</button></div></div>'+
        '<div class="group"><h4>'+T('Italics')+'</h4><div class="row"><span>'+T('Bold')+'</span><div id="sw-it-bold" class="switch"><div class="knob"></div></div><span></span></div><div class="row"><span>'+T('Colour')+'</span><select id="dd-it-presets" class="presets"></select></div><div class="row"><span></span><input id="sel-it-colour" type="color"/><button id="rst-it-colour" class="reset" title="'+T('Reset')+'">↺</button></div><div class="actions"><button id="rst-it-group" class="ghost">'+T('Restore Defaults')+'</button></div></div>'+
        '<div class="group"><h4>'+T('Keywords')+'</h4><div class="row"><span>'+T('Add Keyword')+'</span><input id="tf-keyword-input" type="text" placeholder="Type a keyword or phrase…"/><button id="tf-keyword-add" class="reset" title="'+T('Add')+'">＋</button></div><div id="tf-keyword-chips" class="chips"></div><div class="actions"><button id="rst-kw-group" class="ghost">'+T('Restore Defaults')+'</button></div></div>'+
        '<div class="group"><h4>'+T('All Caps Effects')+'</h4><div class="row"><span>'+T('Effect')+'</span><select id="dd-effects"><option>None</option><option>Flash</option><option>Strobe</option><option>Rainbow</option><option>Wave</option><option>Breathe</option></select><span></span></div><div class="row"><span>'+T('Exclusions')+'</span><input id="tf-caps-ex-input" type="text" placeholder="HQ, CEO, NASA…"/><button id="tf-caps-ex-add" class="reset" title="'+T('Add')+'">＋</button></div><div id="tf-caps-ex-chips" class="chips"></div><div class="actions"><button id="rst-caps-group" class="ghost">'+T('Restore Defaults')+'</button></div></div>'+
        '<div class="group"><h4>'+T('Font')+'</h4><div class="row"><span>'+T('Font Family')+'</span><select id="dd-font-family"><option value="inherit">Default (inherit)</option><option value="system-sans">System Sans</option><option value="system-mono">Monospace (System)</option><option value="Georgia">Georgia</option><option value="Times New Roman">Times New Roman</option><option value="Inter">Inter</option><option value="Roboto">Roboto</option><option value="Open Sans">Open Sans</option><option value="Nunito">Nunito</option><option value="Merriweather">Merriweather</option><option value="Lora">Lora</option><option value="JetBrains Mono">JetBrains Mono</option><option value="Fira Code">Fira Code</option><option value="Source Code Pro">Source Code Pro</option><option value="Courier New">Courier New</option><option value="custom">Custom (Google Fonts URL)</option></select><button id="rst-font-family" class="reset" title="Reset">↺</button></div><div class="row" id="row-font-url" style="display:none"><span>'+T('Custom Google Fonts URL')+'</span><input id="tf-font-url" type="text" placeholder="https://fonts.googleapis.com/css2?family=...&display=swap"/><button id="btn-font-apply" class="ghost" title="'+T('Apply')+'">'+T('Apply')+'</button></div><div class="row"><span>'+T('Font Size')+'</span><input id="rng-font-size" type="range" min="80" max="160" step="1"/><button id="rst-font-size" class="reset" title="'+T('Reset')+'">↺</button></div><div class="row"><span>'+T('Font Weight')+'</span><select id="dd-font-weight"><option value="default">Default</option><option value="regular">Regular (400)</option><option value="medium">Medium (500)</option><option value="bold">Bold (700)</option></select><button id="rst-font-weight" class="reset" title="'+T('Reset')+'">↺</button></div><div class="row"><span>'+T('Line Height')+'</span><input id="rng-line-height" type="range" min="1.1" max="2.0" step="0.05"/><button id="rst-line-height" class="reset" title="'+T('Reset')+'">↺</button></div><div class="row"><span>'+T('Letter Spacing')+'</span><input id="rng-letter-spacing" type="range" min="-0.05" max="0.2" step="0.005"/><button id="rst-letter-spacing" class="reset" title="'+T('Reset')+'">↺</button></div><div class="row"><span>'+T('Text Alignment')+'</span><select id="dd-text-align"><option value="default">Default</option><option value="left">Left</option><option value="justify">Justify</option></select><button id="rst-text-align" class="reset" title="'+T('Reset')+'">↺</button></div><div class="row"><span>'+T('Paragraphs')+'</span><select id="dd-paragraphs"><option value="default">Default</option><option value="basic">Basic</option><option value="newline">New Line</option></select><button id="rst-paragraphs" class="reset" title="'+T('Reset')+'">↺</button></div><div class="actions"><button id="rst-font-block" class="ghost">'+T('Reset Font')+'</button></div></div>'+
        '<div class="actions"><button id="rst-formatting" class="ghost">Reset Text Formatting</button></div>'+
      '</section>'+
      '<section id="aidt-section-misc" class="section" data-section="misc" role="tabpanel" aria-labelledby="aidt-tab-misc">'+
        '<div class="group"><h4>'+T('Background')+'</h4><div class="row"><span>'+T('Background type')+'</span><select id="dd-bg-type"><option value="default">'+T('Default')+'</option><option value="backdrop">'+T('Backdrop (behind overlays)')+'</option><option value="solid">'+T('Solid (override overlays)')+'</option><option value="gradient">Gradient</option><option value="image">'+T('Custom image URL')+'</option></select><button id="rst-bg-type" class="reset" title="'+T('Reset')+'">↺</button></div><div class="row"><span>'+T('Background colour')+'</span><input id="sel-bg-colour" type="color"/><button id="rst-bg-colour" class="reset" title="'+T('Reset')+'">↺</button></div><div class="row"><span>'+T('Backdrop opacity')+'</span><input id="rng-bg-opacity" type="range" min="0" max="100" step="1"/><button id="rst-bg-opacity" class="reset" title="'+T('Reset')+'">↺</button></div><div class="row" id="row-bg-gradient" style="display:none"><span>'+T('Gradient')+'</span><input id="tf-bg-gradient" type="text" placeholder="linear-gradient(180deg,#0b1220,#0a1423)"/><span></span></div><div class="row" id="row-bg-image" style="display:none"><span>'+T('Image URL')+'</span><input id="tf-bg-image" type="text" placeholder="https://..."/><span></span></div><div class="row" id="row-bg-image-opts" style="display:none"><span>'+T('Image Options')+'</span><div class="imgopt-grid"><div class="cell"><span class="lbl">'+T('Size')+'</span><select id="dd-bg-size"><option value="cover">cover</option><option value="contain">contain</option><option value="auto">auto</option></select></div><div class="cell"><span class="lbl">'+T('Position')+'</span><select id="dd-bg-pos"><option value="center center">center</option><option value="top center">top</option><option value="bottom center">bottom</option></select></div><div class="cell"><span class="lbl">'+T('Repeat')+'</span><select id="dd-bg-repeat"><option value="no-repeat">no-repeat</option><option value="repeat">repeat</option><option value="repeat-x">repeat-x</option><option value="repeat-y">repeat-y</option></select></div><div class="cell"><span class="lbl">'+T('Attachment')+'</span><select id="dd-bg-attach"><option value="scroll">scroll</option><option value="fixed">fixed</option></select></div></div></div><div class="actions"><button id="rst-bg-group" class="ghost">'+T('Restore Defaults')+'</button></div></div>'+
        '<div class="group"><h4>'+T('Theme Presets')+'</h4><div class="row"><span>'+T('Preset')+'</span><select id="dd-theme"><option value="">'+T('Select…')+'</option><option>Default</option><option>Noir</option><option>Paperback</option><option>Neon</option><option>Solarized Dark</option></select><button id="btn-apply-theme" class="ghost" title="'+T('Apply')+'">'+T('Apply')+'</button></div></div>'+
        ''+
        '<div class="group"><h4>'+T('Language')+'</h4><div class="row"><span>'+T('Language override')+'</span><select id="dd-lang"><option value="default">'+T('Default')+'</option><option value="en-GB">English (UK)</option><option value="en-US">English (US)</option><option value="fr">Français</option><option value="de">Deutsch</option><option value="es">Español</option><option value="it">Italiano</option><option value="pt-BR">Português (Brasil)</option><option value="pt">Português</option><option value="tr">Türkçe</option><option value="pl">Polski</option><option value="ru">Русский</option><option value="ja">日本語</option><option value="ko">한국어</option><option value="zh-CN">简体中文</option><option value="zh">中文</option><option value="ar">العربية</option><option value="hi">हिन्दी</option><option value="id">Bahasa Indonesia</option></select><span></span></div></div>'+
        '<div class="group"><h4>'+T('Profiles')+'</h4><div class="row"><span>'+T('Profile')+'</span><select id="dd-profile"></select><span></span></div><div class="actions act-grid-2"><button id="pf-save-as" class="ghost">'+T('Save')+'</button><button id="pf-delete" class="ghost">'+T('Delete')+'</button></div><div class="actions act-grid-2"><button id="pf-rename" class="ghost">'+T('Rename')+'</button><button id="pf-duplicate" class="ghost">'+T('Duplicate')+'</button></div><div class="actions act-grid-2"><button id="pf-bind" class="ghost">'+T('Bind to this story')+'</button><button id="pf-unbind" class="ghost">'+T('Unbind')+'</button></div></div>'+
        '<div class="group"><h4>'+T('Export / Import')+'</h4><div class="actions act-grid-2"><button id="btn-export" class="ghost">'+T('Export')+'</button><button id="btn-export-active" class="ghost">'+T('Export active profile')+'</button><button id="btn-import-merge" class="ghost">'+T('Import (Merge)')+'</button><button id="btn-import-replace" class="ghost">'+T('Import (Replace)')+'</button><input id="file-import" type="file" accept="application/json" style="display:none"/></div></div>'+ 
        '<div class="actions"><button id="reset-all" class="ghost">'+T('Reset All')+'</button></div>'+
      '</section>';
    // Rebuild Format section using safe DOM construction
    try{
      const oldFormat = sectionsEl.querySelector('#aidt-section-format');
      if (oldFormat){
        const sec = document.createElement('section');
        sec.id = 'aidt-section-format'; sec.className='section';
        sec.setAttribute('data-section','format'); sec.setAttribute('role','tabpanel'); sec.setAttribute('aria-labelledby','aidt-tab-format');

        const buildSwitchGroup = (labelPrefix, ids)=>{
          const grp = document.createElement('div'); grp.className='group';
          const h4=document.createElement('h4'); h4.textContent=T(labelPrefix); grp.appendChild(h4);
          // Row 1
          const r1=document.createElement('div'); r1.className='row';
          const sp1=document.createElement('span'); sp1.textContent=T('Bold'); r1.appendChild(sp1);
          const sw=document.createElement('div'); sw.id=ids.swBold; sw.className='switch'; sw.innerHTML='<div class="knob"></div>';
          r1.appendChild(sw); r1.appendChild(document.createElement('span')); grp.appendChild(r1);
          // Row 2
          const r2=document.createElement('div'); r2.className='row';
          const sp2=document.createElement('span'); sp2.textContent=T('Colour'); r2.appendChild(sp2);
          const dd=document.createElement('select'); dd.id=ids.ddPresets; dd.className='presets'; r2.appendChild(dd); grp.appendChild(r2);
          // Row 3
          const r3=document.createElement('div'); r3.className='row'; r3.appendChild(document.createElement('span'));
          const inp=document.createElement('input'); inp.id=ids.inputColour; inp.type='color'; r3.appendChild(inp);
          const rst=document.createElement('button'); rst.id=ids.btnResetColour; rst.className='reset'; rst.title=T('Reset'); rst.textContent='↺'; r3.appendChild(rst); grp.appendChild(r3);
          // Actions
          const acts=document.createElement('div'); acts.className='actions'; const btn=document.createElement('button'); btn.id=ids.btnRestore; btn.className='ghost'; btn.textContent=T('Restore Defaults'); acts.appendChild(btn); grp.appendChild(acts);
          return grp;
        };

        // Main Text, Speech, Internal Monologue, Italics
        sec.appendChild(buildSwitchGroup('Main Text', { swBold:'sw-main-bold', ddPresets:'dd-main-presets', inputColour:'sel-main-colour', btnResetColour:'rst-main-colour', btnRestore:'rst-main-group' }));
        sec.appendChild(buildSwitchGroup('Speech',    { swBold:'sw-sp-bold',   ddPresets:'dd-sp-presets',   inputColour:'sel-sp-colour',  btnResetColour:'rst-sp-colour',  btnRestore:'rst-sp-group' }));
        sec.appendChild(buildSwitchGroup('Internal Monologue', { swBold:'sw-im-bold', ddPresets:'dd-im-presets', inputColour:'sel-im-colour', btnResetColour:'rst-im-colour', btnRestore:'rst-im-group' }));
        sec.appendChild(buildSwitchGroup('Italics',   { swBold:'sw-it-bold',   ddPresets:'dd-it-presets',   inputColour:'sel-it-colour',  btnResetColour:'rst-it-colour',  btnRestore:'rst-it-group' }));

        // Keywords group
        const kw=document.createElement('div'); kw.className='group';
        let h=document.createElement('h4'); h.textContent=T('Keywords'); kw.appendChild(h);
        const rkw=document.createElement('div'); rkw.className='row';
        const spkw=document.createElement('span'); spkw.textContent=T('Add Keyword'); rkw.appendChild(spkw);
        const inkw=document.createElement('input'); inkw.id='tf-keyword-input'; inkw.type='text'; inkw.placeholder='Type a keyword or phrase…'; rkw.appendChild(inkw);
        const bkw=document.createElement('button'); bkw.id='tf-keyword-add'; bkw.className='reset'; bkw.title=T('Add'); bkw.textContent='＋'; rkw.appendChild(bkw);
        kw.appendChild(rkw);
        const chips=document.createElement('div'); chips.id='tf-keyword-chips'; chips.className='chips'; kw.appendChild(chips);
        const actsKw=document.createElement('div'); actsKw.className='actions'; const br=document.createElement('button'); br.id='rst-kw-group'; br.className='ghost'; br.textContent=T('Restore Defaults'); actsKw.appendChild(br); kw.appendChild(actsKw);
        sec.appendChild(kw);

        // All Caps Effects group
        const caps=document.createElement('div'); caps.className='group'; h=document.createElement('h4'); h.textContent=T('All Caps Effects'); caps.appendChild(h);
        const rce1=document.createElement('div'); rce1.className='row'; let sp=document.createElement('span'); sp.textContent=T('Effect'); rce1.appendChild(sp);
        const ddEff=document.createElement('select'); ddEff.id='dd-effects'; ['None','Flash','Strobe','Rainbow','Wave','Breathe'].forEach(v=>{ const o=document.createElement('option'); o.textContent=v; ddEff.appendChild(o); }); rce1.appendChild(ddEff); rce1.appendChild(document.createElement('span')); caps.appendChild(rce1);
        const rce2=document.createElement('div'); rce2.className='row'; sp=document.createElement('span'); sp.textContent=T('Exclusions'); rce2.appendChild(sp);
        const ex=document.createElement('input'); ex.id='tf-caps-ex-input'; ex.type='text'; ex.placeholder='HQ, CEO, NASA…'; rce2.appendChild(ex);
        const addEx=document.createElement('button'); addEx.id='tf-caps-ex-add'; addEx.className='reset'; addEx.title=T('Add'); addEx.textContent='＋'; rce2.appendChild(addEx); caps.appendChild(rce2);
        const chipsEx=document.createElement('div'); chipsEx.id='tf-caps-ex-chips'; chipsEx.className='chips'; caps.appendChild(chipsEx);
        const actsCaps=document.createElement('div'); actsCaps.className='actions'; const brc=document.createElement('button'); brc.id='rst-caps-group'; brc.className='ghost'; brc.textContent=T('Restore Defaults'); actsCaps.appendChild(brc); caps.appendChild(actsCaps);
        sec.appendChild(caps);

        // Font group
        const fg=document.createElement('div'); fg.className='group'; h=document.createElement('h4'); h.textContent=T('Font'); fg.appendChild(h);
        const mkRow=(label, node)=>{ const r=document.createElement('div'); r.className='row'; const s=document.createElement('span'); s.textContent=label; r.appendChild(s); r.appendChild(node); const pad=document.createElement('button'); pad.id=''; pad.style.display='none'; r.appendChild(document.createElement('button')); return r; };
        const rFam=document.createElement('div'); rFam.className='row'; let sFam=document.createElement('span'); sFam.textContent=T('Font Family'); rFam.appendChild(sFam);
        const ddFam=document.createElement('select'); ddFam.id='dd-font-family'; ['inherit','system-sans','system-mono','Georgia','Times New Roman','Inter','Roboto','Open Sans','Nunito','Merriweather','Lora','JetBrains Mono','Fira Code','Source Code Pro','Courier New','custom'].forEach(v=>{ const o=document.createElement('option'); o.value=v; o.textContent=(v==='inherit'?'Default (inherit)': (v==='system-sans'?'System Sans': v==='system-mono'?'Monospace (System)': v==='custom'?'Custom (Google Fonts URL)': v)); ddFam.appendChild(o); }); rFam.appendChild(ddFam);
        const rstFam=document.createElement('button'); rstFam.id='rst-font-family'; rstFam.className='reset'; rstFam.title=T('Reset'); rstFam.textContent='↺'; rFam.appendChild(rstFam); fg.appendChild(rFam);
        const rUrl=document.createElement('div'); rUrl.className='row'; rUrl.id='row-font-url'; rUrl.style.display='none'; const sUrl=document.createElement('span'); sUrl.textContent=T('Custom Google Fonts URL'); rUrl.appendChild(sUrl); const tf=document.createElement('input'); tf.id='tf-font-url'; tf.type='text'; tf.placeholder='https://fonts.googleapis.com/css2?family=...&display=swap'; rUrl.appendChild(tf); const ap=document.createElement('button'); ap.id='btn-font-apply'; ap.className='ghost'; ap.title=T('Apply'); ap.textContent=T('Apply'); rUrl.appendChild(ap); fg.appendChild(rUrl);
        const rSize=document.createElement('div'); rSize.className='row'; const sSize=document.createElement('span'); sSize.textContent=T('Font Size'); rSize.appendChild(sSize); const rngSize=document.createElement('input'); rngSize.id='rng-font-size'; rngSize.type='range'; rngSize.min='80'; rngSize.max='160'; rngSize.step='1'; rSize.appendChild(rngSize); const rstSize=document.createElement('button'); rstSize.id='rst-font-size'; rstSize.className='reset'; rstSize.title=T('Reset'); rstSize.textContent='↺'; rSize.appendChild(rstSize); fg.appendChild(rSize);
        const rWeight=document.createElement('div'); rWeight.className='row'; const sWeight=document.createElement('span'); sWeight.textContent=T('Font Weight'); rWeight.appendChild(sWeight); const ddW=document.createElement('select'); ddW.id='dd-font-weight'; [['default','Default'],['regular','Regular (400)'],['medium','Medium (500)'],['bold','Bold (700)']].forEach(([v,l])=>{ const o=document.createElement('option'); o.value=v; o.textContent=l; ddW.appendChild(o); }); rWeight.appendChild(ddW); const rstW=document.createElement('button'); rstW.id='rst-font-weight'; rstW.className='reset'; rstW.title=T('Reset'); rstW.textContent='↺'; rWeight.appendChild(rstW); fg.appendChild(rWeight);
        const rLH=document.createElement('div'); rLH.className='row'; const sLH=document.createElement('span'); sLH.textContent=T('Line Height'); rLH.appendChild(sLH); const rngLH=document.createElement('input'); rngLH.id='rng-line-height'; rngLH.type='range'; rngLH.min='1.1'; rngLH.max='2.0'; rngLH.step='0.05'; rLH.appendChild(rngLH); const rstLH=document.createElement('button'); rstLH.id='rst-line-height'; rstLH.className='reset'; rstLH.title=T('Reset'); rstLH.textContent='↺'; rLH.appendChild(rstLH); fg.appendChild(rLH);
        const rLS=document.createElement('div'); rLS.className='row'; const sLS=document.createElement('span'); sLS.textContent=T('Letter Spacing'); rLS.appendChild(sLS); const rngLS=document.createElement('input'); rngLS.id='rng-letter-spacing'; rngLS.type='range'; rngLS.min='-0.05'; rngLS.max='0.2'; rngLS.step='0.005'; rLS.appendChild(rngLS); const rstLS=document.createElement('button'); rstLS.id='rst-letter-spacing'; rstLS.className='reset'; rstLS.title=T('Reset'); rstLS.textContent='↺'; rLS.appendChild(rstLS); fg.appendChild(rLS);
        const rTA=document.createElement('div'); rTA.className='row'; const sTA=document.createElement('span'); sTA.textContent=T('Text Alignment'); rTA.appendChild(sTA); const ddTA=document.createElement('select'); ddTA.id='dd-text-align'; [['default','Default'],['left','Left'],['justify','Justify']].forEach(([v,l])=>{ const o=document.createElement('option'); o.value=v; o.textContent=l; ddTA.appendChild(o); }); rTA.appendChild(ddTA); const rstTA=document.createElement('button'); rstTA.id='rst-text-align'; rstTA.className='reset'; rstTA.title=T('Reset'); rstTA.textContent='↺'; rTA.appendChild(rstTA); fg.appendChild(rTA);
        const rPar=document.createElement('div'); rPar.className='row'; const sPar=document.createElement('span'); sPar.textContent=T('Paragraphs'); rPar.appendChild(sPar); const ddPar=document.createElement('select'); ddPar.id='dd-paragraphs'; [['default','Default'],['basic','Basic'],['newline','New Line']].forEach(([v,l])=>{ const o=document.createElement('option'); o.value=v; o.textContent=l; ddPar.appendChild(o); }); rPar.appendChild(ddPar); const rstPar=document.createElement('button'); rstPar.id='rst-paragraphs'; rstPar.className='reset'; rstPar.title=T('Reset'); rstPar.textContent='↺'; rPar.appendChild(rstPar); fg.appendChild(rPar);
        const actsFont=document.createElement('div'); actsFont.className='actions'; const btnFont=document.createElement('button'); btnFont.id='rst-font-block'; btnFont.className='ghost'; btnFont.textContent=T('Reset Font'); actsFont.appendChild(btnFont); fg.appendChild(actsFont);
        sec.appendChild(fg);

        const actsAll=document.createElement('div'); actsAll.className='actions'; const btnAll=document.createElement('button'); btnAll.id='rst-formatting'; btnAll.className='ghost'; btnAll.textContent='Reset Text Formatting'; actsAll.appendChild(btnAll); sec.appendChild(actsAll);

        oldFormat.replaceWith(sec);
      }
    }catch(_){ }
    // Rebuild Actions section using safe DOM construction
    try{
      const oldActions = sectionsEl.querySelector('#aidt-section-actions');
      if (oldActions){
        const sec = document.createElement('section');
        sec.id = 'aidt-section-actions';
        sec.className = 'section';
        sec.setAttribute('data-section','actions');
        sec.setAttribute('role','tabpanel');
        sec.setAttribute('aria-labelledby','aidt-tab-actions');

        const buildGroup = (labelPrefix, ids)=>{
          const grp = document.createElement('div'); grp.className='group';
          const h4 = document.createElement('h4'); h4.textContent = T(labelPrefix); grp.appendChild(h4);
          // Row 1: Bold + switch
          const r1 = document.createElement('div'); r1.className='row';
          const r1s = document.createElement('span'); r1s.textContent=T('Bold'); r1.appendChild(r1s);
          const sw = document.createElement('div'); sw.id=ids.swBold; sw.className='switch'; sw.innerHTML='<div class="knob"></div>';
          r1.appendChild(sw);
          r1.appendChild(document.createElement('span'));
          grp.appendChild(r1);
          // Row 2: Colour + select
          const r2 = document.createElement('div'); r2.className='row';
          const r2s = document.createElement('span'); r2s.textContent=T('Colour'); r2.appendChild(r2s);
          const sel = document.createElement('select'); sel.id=ids.ddPresets; sel.className='presets'; r2.appendChild(sel);
          grp.appendChild(r2);
          // Row 3: color input + reset
          const r3 = document.createElement('div'); r3.className='row';
          r3.appendChild(document.createElement('span'));
          const inp = document.createElement('input'); inp.id=ids.inputColour; inp.type='color'; inp.value='#ffffff'; r3.appendChild(inp);
          const rst = document.createElement('button'); rst.id=ids.btnResetColour; rst.className='reset'; rst.title=T('Reset'); rst.textContent='↺'; r3.appendChild(rst);
          grp.appendChild(r3);
          // Actions: Restore Defaults
          const acts = document.createElement('div'); acts.className='actions';
          const btn = document.createElement('button'); btn.id=ids.btnRestore; btn.className='ghost'; btn.textContent=T('Restore Defaults'); acts.appendChild(btn);
          grp.appendChild(acts);
          return grp;
        };

        // Do group
        sec.appendChild(buildGroup('Do', {
          swBold:'sw-do-bold', ddPresets:'dd-do-presets', inputColour:'sel-do-colour', btnResetColour:'rst-do-colour', btnRestore:'rst-do-group'
        }));
        // Say group
        sec.appendChild(buildGroup('Say', {
          swBold:'sw-say-bold', ddPresets:'dd-say-presets', inputColour:'sel-say-colour', btnResetColour:'rst-say-colour', btnRestore:'rst-say-group'
        }));

        oldActions.replaceWith(sec);
      }
    }catch(_){ }
    panel.appendChild(sectionsEl);
    root.appendChild(panel);

    // A11y: dialog semantics, focus management
    try{
      panel.setAttribute('role','dialog');
      panel.setAttribute('aria-modal','true');
      const titleNode = panel.querySelector('.title');
      if (titleNode){ titleNode.id = 'aidt-title'; panel.setAttribute('aria-labelledby','aidt-title'); }
      panel.setAttribute('aria-describedby','aidt-desc');
    }catch(_){ }

    let __aidt_prevFocus = null;
    function __aidt_focusables(){
      try{ return Array.prototype.slice.call(panel.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')); }catch(_){ return []; }
    }
    function __aidt_announce(msg){ try{ const n=panel.querySelector('#aidt-live'); if(n){ n.textContent=''; setTimeout(()=>{ try{ n.textContent=msg; }catch(_){ } }, 0);} }catch(_){ } }
    function openPanel(){ try{ if (panel.classList.contains('open')) return; panel.classList.add('open'); try{ const last=(safeGet('aidt:lastTab')||'') || (settings && settings.uiLastTab) || ''; if (last){ const tabs=panel.querySelectorAll('.tab'); const sections=panel.querySelectorAll('.section'); sections.forEach(sec=>sec.classList.toggle('active', sec.getAttribute('data-section')===last)); tabs.forEach(t=>t.setAttribute('aria-selected', String(t.getAttribute('data-tab')===last))); setTimeout(()=>{ try{ sections.forEach(sec=>sec.classList.toggle('active', sec.getAttribute('data-section')===last)); tabs.forEach(t=>t.setAttribute('aria-selected', String(t.getAttribute('data-tab')===last))); }catch(__){} }, 50); } }catch(__){} __aidt_prevFocus = (document.activeElement||null); setTimeout(()=>{ try{ (panel.querySelector('#close') || __aidt_focusables()[0]).focus(); }catch(__){} }, 0); __aidt_announce('Dialog opened. Press Escape to close.'); }catch(_){} }
    function closePanel(){ try{ if (!panel.classList.contains('open')) return; panel.classList.remove('open'); __aidt_announce('Dialog closed.'); setTimeout(()=>{ try{ __aidt_prevFocus && __aidt_prevFocus.focus && __aidt_prevFocus.focus(); }catch(__){} }, 0); }catch(_){} }
    function togglePanel(){ try{ if (panel.classList.contains('open')) closePanel(); else openPanel(); }catch(_){} }
    try{
      root.addEventListener('keydown', function(e){
        try{
          if (!panel.classList.contains('open')) return;
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePanel(); return; }
          if (e.key === 'Tab'){
            const f = __aidt_focusables(); if (!f.length) return;
            const first=f[0], last=f[f.length-1];
            const active = panel.shadowRoot ? panel.shadowRoot.activeElement : document.activeElement;
            if (e.shiftKey){ if (active === first){ e.preventDefault(); last.focus(); } }
            else { if (active === last){ e.preventDefault(); first.focus(); } }
          }
        }catch(__){}
      }, true);
    }catch(_){ }

    // Try to mount a second AIDT button in the site navbar (next to #game-blur-button)
    (function(){
      function mountNavBtn(){
        try{
          if (document.getElementById('aidt-nav-button')) return; // already mounted
          // On play.aidungeon there are multiple #game-blur-button (Undo/Redo/Settings/Menu). Prefer Settings/Menu.
          let blur = (function(){
            try{
              return document.querySelector('#game-blur-button[aria-label*="settings" i]')
                  || document.querySelector('#game-blur-button[aria-label*="menu" i]')
                  || document.querySelector('#game-blur-button');
            }catch(_){ return document.querySelector('#game-blur-button'); }
          })();
          if (!blur || !blur.parentElement) return;
          const navBtn = document.createElement('button');
          navBtn.id = 'aidt-nav-button';
          // Borrow styling from the blur button so it matches the navbar
          try{
            const tokens = (blur.className||'').split(/\s+/).filter(Boolean).filter(c=>!/^_pe-/.test(c));
            navBtn.className = tokens.join(' ');
          }catch(_){ }
          // Minimal fallback styles if class copy fails
          navBtn.style.cursor='pointer'; navBtn.style.display='flex'; navBtn.style.alignItems='center'; navBtn.style.justifyContent='center';
          navBtn.style.pointerEvents='auto';
          navBtn.type='button';
          navBtn.setAttribute('title','AI Dungeon Tweaks');
          navBtn.setAttribute('aria-label','AI Dungeon Tweaks');
          navBtn.setAttribute('role','button');
          navBtn.setAttribute('tabindex','0');
          // Icon-only label to match other navbar buttons
          try{
            navBtn.textContent='';
            const ic=document.createElement('span');
            // Use a distinct icon to avoid confusion with the site's gear
            ic.textContent='🧩';
            ic.style.fontSize='18px';
            ic.style.lineHeight='1';
            ic.style.display='inline-flex';
            ic.style.alignItems='center';
            ic.style.justifyContent='center';
            ic.setAttribute('aria-hidden','true');
            navBtn.appendChild(ic);
          }catch(_){ }
          // Toggle panel on click/keyboard (Chrome may need capture + higher z-index)
          let _lastToggleTs = 0;
          function _toggle(ev){
            try{
              ev.preventDefault(); ev.stopPropagation(); if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
              const now = Date.now();
              if (now - _lastToggleTs < 250) return; // debounce to avoid double toggles from multiple events
              _lastToggleTs = now;
              togglePanel();
            }catch(_e){}
          }
          const ua=(navigator.userAgent||'').toLowerCase();
          const isFirefox=/firefox/.test(ua);
          const isChrome=/chrome/.test(ua) && !/edg|opr/.test(ua);
          const host=(location && location.hostname || '').toLowerCase();
          const isPlay=/\bplay\.aidungeon\.com$/.test(host);
          if (isChrome){
            try{ navBtn.style.position='relative'; navBtn.style.zIndex='2147483647'; navBtn.style.pointerEvents='auto'; }catch(_){ }
            if (isPlay){
              // On play.aidungeon Chrome, some parents use pointer-events:none; bind both pointerdown and click in capture phase
              try{ navBtn.addEventListener('pointerdown', _toggle, {capture:true, passive:true}); }catch(_){ }
              try{ navBtn.addEventListener('click', _toggle, true); }catch(_){ }
            } else {
              // beta: pointerdown capture suffices
              try{ navBtn.addEventListener('pointerdown', _toggle, {capture:true, passive:true}); }catch(_){ }
            }
          } else {
            navBtn.addEventListener('click', _toggle, false);
          }
          navBtn.addEventListener('keydown', function(ev){ try{ if (ev.key==='Enter' || ev.key===' '){ _toggle(ev); } }catch(_e){} });
          // Place as the last item (far right in the flex row)
          try{ navBtn.style.order = '9999'; navBtn.style.pointerEvents='auto'; blur.removeAttribute('aria-disabled'); blur.parentElement.style.pointerEvents='auto'; blur.parentElement.appendChild(navBtn); }catch(_i){}
          // If navbar button exists, hide the floating FAB entirely to avoid duplicates
          try{ btn.style.display='none'; }catch(_){ }
        }catch(_){ }
      }
      // Attempt mounts a few times as the navbar renders
      mountNavBtn();
      setTimeout(mountNavBtn, 200);
      setTimeout(mountNavBtn, 800);
      setTimeout(mountNavBtn, 2000);
      // Also watch for SPA nav changes
      try{
        if (!window.__AIDT_NAV_OBSERVER__){
          const mo = createAidtObserver(()=>mountNavBtn());
          mo.observe(document.body, {childList:true, subtree:true});
          window.__AIDT_NAV_OBSERVER__ = mo;
          try{ if (window.__AIDT_OBSERVERS_ADD__) window.__AIDT_OBSERVERS_ADD__(mo); }catch(_){ }
        }
      }catch(_){ }
    })();
    const $ = sel=>panel.querySelector(sel);
    const setSwitch=(el,on)=>{ if(el){ el.setAttribute('data-on', on?'true':'false'); el.setAttribute('role','switch'); el.setAttribute('aria-checked', on?'true':'false'); el.setAttribute('tabindex','0'); el.setAttribute('title', on?T('Disable'):T('Enable')); } };
    const getSwitch= el=>!!(el && el.getAttribute('data-on')==='true');

    // --- Keywords UI
    const renderKeywordChips=()=>{
      const wrap=$('#tf-keyword-chips'); if(!wrap) return;
      wrap.innerHTML='';
      const list=(settings.textFormatting.keywords||[]).map(k=>{
        if (typeof k==='string') return { text:k, effect:'None', bold:false };
        return { text:(k.text||''), effect:(k.effect||'None'), bold:!!k.bold, color:k.color };
      });
      settings.textFormatting.keywords=list;
      const frag=document.createDocumentFragment();
      list.forEach((kw,idx)=>{
        const chip=document.createElement('span'); chip.className='chip'; chip.setAttribute('data-idx', String(idx));
        const textSpan=document.createElement('span'); textSpan.textContent=kw.text;
        const select=document.createElement('select'); select.setAttribute('data-role','effect');
        ;['None','Flash','Strobe','Rainbow','Wave','Breathe'].forEach(v=>{ const o=document.createElement('option'); o.textContent=v; o.value=v; select.appendChild(o); });
        const optCustom=document.createElement('option'); optCustom.value='__custom__'; optCustom.textContent='Custom Color…'; select.appendChild(optCustom); select.value=kw.effect||'None';
        const color=document.createElement('input'); color.type='color'; color.setAttribute('data-role','color'); color.value = (kw.color||'#ffffff'); color.style.display='none'; color.style.verticalAlign='middle'; color.style.width='22px'; color.style.height='22px'; color.style.padding='0'; color.style.border='none'; color.style.background='transparent';
        const lbl=document.createElement('span'); lbl.className='lbl'; lbl.appendChild(document.createTextNode('Bold '));
        const sw=document.createElement('span'); sw.className='switch'; sw.setAttribute('data-role','bold'); const knob=document.createElement('div'); knob.className='knob'; sw.appendChild(knob); setSwitch(sw, !!kw.bold);
        const del=document.createElement('button'); del.textContent='×'; del.setAttribute('data-role','del'); del.title=T('Delete'); del.setAttribute('aria-label', T('Delete'));
        chip.appendChild(textSpan); chip.appendChild(document.createTextNode(' ')); chip.appendChild(select); chip.appendChild(document.createTextNode(' ')); chip.appendChild(color); chip.appendChild(document.createTextNode(' ')); chip.appendChild(lbl); lbl.appendChild(sw); chip.appendChild(document.createTextNode(' ')); chip.appendChild(del);
        frag.appendChild(chip);
      });
      wrap.appendChild(frag);
      if (!wrap.__aidtDelegated){
        wrap.__aidtDelegated = true;
        wrap.addEventListener('click', (ev)=>{
          try{
            const t=ev.target;
            const chip=t && t.closest ? t.closest('.chip') : null; if(!chip) return;
            const idx=parseInt(chip.getAttribute('data-idx')||'-1',10); if(isNaN(idx)) return;
            const roleDel = t.closest && t.closest('button[data-role="del"]');
            const roleBold = t.closest && t.closest('.switch[data-role="bold"]');
            if (roleDel){ settings.textFormatting.keywords.splice(idx,1); persistSettings(); renderKeywordChips(); applyGlobal(); reparseNow(); return; }
            if (roleBold){ const kw=settings.textFormatting.keywords[idx]; if(!kw) return; kw.bold=!kw.bold; setSwitch(roleBold, !!kw.bold); persistSettings(); applyGlobal(); reparseNow(); return; }
          }catch(_){ }
        });
        wrap.addEventListener('change', (ev)=>{
          try{
            const t=ev.target; const chip=t && t.closest ? t.closest('.chip') : null; if(!chip) return; const idx=parseInt(chip.getAttribute('data-idx')||'-1',10); if(isNaN(idx)) return; const kw=settings.textFormatting.keywords[idx]; if(!kw) return;
            if (t.matches && t.matches('select[data-role="effect"]')){ const sel=t; if (sel.value==='__custom__'){ const col=chip.querySelector('input[data-role="color"]'); if(col){ col.style.display='inline-block'; col.focus(); col.click(); } return; } kw.effect=sel.value||'None'; persistSettings(); applyGlobal(); reparseNow(); }
            if (t.matches && t.matches('input[type="color"][data-role="color"]')){ kw.color=t.value; persistSettings(); applyGlobal(); reparseNow(); }
          }catch(_){ }
        });
        wrap.addEventListener('input', (ev)=>{
          try{ const t=ev.target; if(!(t && t.matches && t.matches('input[type="color"][data-role="color"]'))) return; const chip=t.closest('.chip'); if(!chip) return; const idx=parseInt(chip.getAttribute('data-idx')||'-1',10); if(isNaN(idx)) return; const kw=settings.textFormatting.keywords[idx]; if(!kw) return; kw.color=t.value; persistSettingsDebounced(); applyGlobal(); reparseNow(); }catch(_){ }
        });
      }
    };

    const rebuildProfileDropdown=()=>{
      const dd=$('#dd-profile'); dd.innerHTML='';
      profiles=loadJSON(LS_PROFILES,{profiles:{}});
      const meta=(profiles && profiles._meta && profiles._meta.lastModifiedAt) || {};
      Object.keys(profiles.profiles).sort().forEach(name=>{
        const o=document.createElement('option'); o.value=name; const when=meta[name]; o.textContent= when ? (name+' — '+new Date(when).toLocaleString()) : name; dd.appendChild(o);
      });
    };
    // --- AI Model discovery and application ---
    const normalizeModelName = (s)=>{ try{ return String(s||'').trim().replace(/\s+/g,' '); }catch(_){ return ''; } };
    const discoverAiModels = ()=>{
      try{
        const results = new Set();

        const collectFromBox = (box)=>{
          try{
            const nodes = box.querySelectorAll('[role="option"], [aria-selected], [data-value], [data-id], li, button, div, span, a');
            for (let i=0;i<nodes.length;i++){
              const n = nodes[i];
              const txt = normalizeModelName(n && (n.getAttribute('data-value') || n.getAttribute('data-id') || n.textContent) || '');
              if (!txt) continue;
              if (txt.length > 80) continue;
              if (!/[A-Za-z0-9]/.test(txt)) continue;
              results.add(txt);
            }
          }catch(_){ }
        };

        // 0) Direct known id (provided by user/XPath)
        try{ const ex=document.getElementById(':r6vt:'); if (ex) collectFromBox(ex); }catch(_e0){}

        // 0b) Any similar ephemeral id that looks like ":r...:" and has the viewport class
        try{
          const maybe = document.querySelectorAll('[id^=":r"][id$=":"].is_SelectViewport');
          for (let i=0;i<maybe.length;i++) collectFromBox(maybe[i]);
        }catch(_e0b){}

        // 1) Class used by the site's select viewport
        document.querySelectorAll('.is_SelectViewport').forEach(collectFromBox);

        // 2) Any floating listbox/popover that looks like a dropdown
        document.querySelectorAll('[role="listbox"]').forEach(function(lb){
          try{
            lb.querySelectorAll('[role="option"]').forEach(function(n){
              const txt = normalizeModelName(n.textContent||'');
              if (txt) results.add(txt);
            });
          }catch(_l){}
        });

        const arr = Array.from(results);
        // Heuristic: prefer items that resemble model names if the list is large
        const modelHint = /gpt|claude|llama|llm|mixtral|gemini|nai|novel|dragon|griffin|phoenix|hydra|turbo|flash|sonnet|opus/i;
        const hinted = arr.filter(x=>modelHint.test(x));
        return (hinted.length>=2 ? hinted : arr).slice(0, 200);
      }catch(_){ return []; }
    };
    const openModelMenuIfNeeded = ()=>{
      try{
        // Try clicking a trigger that controls a listbox/select
        const triggers = document.querySelectorAll('[aria-haspopup="listbox"], [role="combobox"], [data-testid*="model" i], button, [role="button"]');
        for (let i=0;i<triggers.length;i++){
          const el = triggers[i];
          const t  = (el.textContent||'').toLowerCase();
          if (/model|gpt|claude|llama|mixtral|gemini|novel/i.test(t)) { try{ el.click(); return true; }catch(_c){} }
        }
      }catch(_){ }
      return false;
    };
    const applyAiModelSelection = (name)=>{
      try{
        const target = normalizeModelName(name||''); if (!target) return false;
        const tryClickOption = ()=>{
          // Prefer explicit id if present, then other containers
          const containers = [];
          try{ const ex=document.getElementById(':r6vt:'); if (ex) containers.push(ex); }catch(_){ }
          containers.push.apply(containers, Array.from(document.querySelectorAll('.is_SelectViewport, [role="listbox"]')));
          for (let c=0;c<containers.length;c++){
            const box = containers[c];
            const opts = box.querySelectorAll('[role="option"], button, div, span, a');
            for (let j=0;j<opts.length;j++){
              const o = opts[j];
              const txt = normalizeModelName(o.textContent||'');
              if (txt===target){ try{ o.click(); return true; }catch(_cl){} }
            }
          }
          return false;
        };
        if (tryClickOption()) return true;
        if (openModelMenuIfNeeded()){
          setTimeout(tryClickOption, 50);
          setTimeout(tryClickOption, 200);
          setTimeout(tryClickOption, 500);
        }
      }catch(_){ }
      return false;
    };

    function updateBgUiVisibility(){
      try{
        const type = ($('#dd-bg-type') && $('#dd-bg-type').value) || 'default';
        const colorRow   = ($('#sel-bg-colour') && $('#sel-bg-colour').closest) ? $('#sel-bg-colour').closest('.row') : null;
        const opacityRow = ($('#rng-bg-opacity') && $('#rng-bg-opacity').closest) ? $('#rng-bg-opacity').closest('.row') : null;
        const imageRow   = $('#row-bg-image') || null;
        const imageOpts  = $('#row-bg-image-opts') || null;
        const gradRow    = $('#row-bg-gradient') || null;

        // Default: hide color, hide opacity, hide image URL
        // Backdrop: show color, show+enable opacity, hide image URL
        // Solid: show color, hide opacity, hide image URL
        // Image: hide color, hide opacity, show image URL
        if (colorRow){ colorRow.style.display = (type==='backdrop' || type==='solid') ? '' : 'none'; }
        if (opacityRow){
          const showOpacity = (type==='backdrop');
          opacityRow.style.display = showOpacity ? '' : 'none';
          if (showOpacity){ opacityRow.classList.remove('is-disabled'); } else { opacityRow.classList.add('is-disabled'); }
        }
        if (gradRow){ gradRow.style.display = (type==='gradient') ? '' : 'none'; }
        if (imageRow){ imageRow.style.display = (type==='image') ? '' : 'none'; }
        if (imageOpts){ imageOpts.style.display = (type==='image') ? '' : 'none'; }
      }catch(_){ }
    }
    const refreshUI=()=>{
      setSwitch($('#sw-enabled'), !!settings.enabled);
      setSwitch($('#sw-do-bold'), !!settings.actions.do.bold);
      $('#sel-do-colour').value = settings.actions.do.colour || '#ffffff';
      const ddDo=$('#dd-do-presets'); if (ddDo){
        while (ddDo.firstChild) ddDo.removeChild(ddDo.firstChild);
        const opt=document.createElement('option'); opt.value='__custom__'; opt.textContent='Custom'; ddDo.appendChild(opt);
        COLOR_PRESETS.forEach(p=>{ const o=document.createElement('option'); o.value=p.value; o.textContent=p.name; ddDo.appendChild(o); });
        const cur=settings.actions.do.colour||'#ffffff'; const hit=COLOR_PRESETS.find(p=>p.value.toLowerCase()===(cur||'').toLowerCase());
        ddDo.value = hit? hit.value : '__custom__';
      }
      setSwitch($('#sw-say-bold'), !!settings.actions.say.bold);
      $('#sel-say-colour').value = settings.actions.say.colour || '#ffffff';
      const ddSay=$('#dd-say-presets'); if (ddSay){
        while (ddSay.firstChild) ddSay.removeChild(ddSay.firstChild);
        const opt=document.createElement('option'); opt.value='__custom__'; opt.textContent='Custom'; ddSay.appendChild(opt);
        COLOR_PRESETS.forEach(p=>{ const o=document.createElement('option'); o.value=p.value; o.textContent=p.name; ddSay.appendChild(o); });
        const cur=settings.actions.say.colour||'#ffffff'; const hit=COLOR_PRESETS.find(p=>p.value.toLowerCase()===(cur||'').toLowerCase());
        ddSay.value = hit? hit.value : '__custom__';
      }

      $('#dd-effects').value   = settings.allCapsEffect || 'None';
      $('#dd-font-family').value = settings.fontFamily || 'inherit';
      $('#rng-font-size').value   = parseInt(settings.fontSize,10) || 100;
      $('#dd-font-weight').value  = settings.fontWeight || 'default';
      $('#rng-line-height').value = settings.lineHeight || 1.5;
      $('#rng-letter-spacing').value = settings.letterSpacing || 0;
      $('#dd-text-align').value = settings.textAlign || 'default';
      const ddPar=$('#dd-paragraphs'); if (ddPar) { ddPar.value = settings.paragraphs || 'default'; }

      renderKeywordChips();

      // Caps exclusion chips
      const renderCapsEx=()=>{
        const wrap=$('#tf-caps-ex-chips'); if(!wrap) return;
        while (wrap.firstChild) wrap.removeChild(wrap.firstChild);
        while (wrap.firstChild) wrap.removeChild(wrap.firstChild);
        const list=(settings.textFormatting.capsExclusions||[]);
        list.forEach((word, idx)=>{
          const chip=document.createElement('span'); chip.className='chip';
          chip.innerHTML='<span>'+word+'</span><button id="del-ce-'+idx+'" class="reset" title="Remove">×</button>';
          wrap.appendChild(chip);
          const del=chip.querySelector('#del-ce-'+idx+'"'); if(del){ del.addEventListener('click',()=>{ settings.textFormatting.capsExclusions.splice(idx,1); persistSettings(); renderCapsEx(); rebuildVisibleParagraphs(); applyGlobal(); reparseNow(); }); }
        });
      };
      renderCapsEx();

      setSwitch($('#sw-main-bold'), !!settings.textFormatting.mainText.bold);
      $('#sel-main-colour').value = settings.textFormatting.mainText.colour || '#ffffff';
      const ddMain=$('#dd-main-presets'); if (ddMain){
        while (ddMain.firstChild) ddMain.removeChild(ddMain.firstChild);
        const opt=document.createElement('option'); opt.value='__custom__'; opt.textContent='Custom'; ddMain.appendChild(opt);
        COLOR_PRESETS.forEach(p=>{ const o=document.createElement('option'); o.value=p.value; o.textContent=p.name; ddMain.appendChild(o); });
        const cur=settings.textFormatting.mainText.colour||'#ffffff'; const hit=COLOR_PRESETS.find(p=>p.value.toLowerCase()===(cur||'').toLowerCase());
        ddMain.value = hit? hit.value : '__custom__';
      }

      setSwitch($('#sw-im-bold'), !!settings.internalMonologue.bold);
      $('#sel-im-colour').value = settings.internalMonologue.colour || '#9ca3af';
      const ddIm=$('#dd-im-presets'); if (ddIm){
        while (ddIm.firstChild) ddIm.removeChild(ddIm.firstChild);
        const opt=document.createElement('option'); opt.value='__custom__'; opt.textContent='Custom'; ddIm.appendChild(opt);
        COLOR_PRESETS.forEach(p=>{ const o=document.createElement('option'); o.value=p.value; o.textContent=p.name; ddIm.appendChild(o); });
        const cur=settings.internalMonologue.colour||'#9ca3af'; const hit=COLOR_PRESETS.find(p=>p.value.toLowerCase()===(cur||'').toLowerCase());
        ddIm.value = hit? hit.value : '__custom__';
      }

      setSwitch($('#sw-it-bold'), !!settings.italics.bold);
      $('#sel-it-colour').value = settings.italics.colour || '#facc15';
      const ddIt=$('#dd-it-presets'); if (ddIt){
        while (ddIt.firstChild) ddIt.removeChild(ddIt.firstChild);
        const opt=document.createElement('option'); opt.value='__custom__'; opt.textContent='Custom'; ddIt.appendChild(opt);
        COLOR_PRESETS.forEach(p=>{ const o=document.createElement('option'); o.value=p.value; o.textContent=p.name; ddIt.appendChild(o); });
        const cur=settings.italics.colour||'#facc15'; const hit=COLOR_PRESETS.find(p=>p.value.toLowerCase()===(cur||'').toLowerCase());
        ddIt.value = hit? hit.value : '__custom__';
      }
      setSwitch($('#sw-sp-bold'), !!settings.speech.bold);
      $('#sel-sp-colour').value  = settings.speech.colour || '#ffffff';
      const ddSp=$('#dd-sp-presets'); if (ddSp){
        while (ddSp.firstChild) ddSp.removeChild(ddSp.firstChild);
        const opt=document.createElement('option'); opt.value='__custom__'; opt.textContent='Custom'; ddSp.appendChild(opt);
        COLOR_PRESETS.forEach(p=>{ const o=document.createElement('option'); o.value=p.value; o.textContent=p.name; ddSp.appendChild(o); });
        const cur=settings.speech.colour||'#ffffff'; const hit=COLOR_PRESETS.find(p=>p.value.toLowerCase()===(cur||'').toLowerCase());
        ddSp.value = hit? hit.value : '__custom__';
      }
      $('#dd-bg-type').value = settings.backgroundType || 'default';
      $('#sel-bg-colour').value = settings.bgColour || '#111827';
      $('#rng-bg-opacity').value = (typeof settings.bgOpacity==='number'?settings.bgOpacity:100);
      updateBgUiVisibility();
      try{ const tfImg = $('#tf-bg-image'); if (tfImg){ tfImg.value = settings.bgImageUrl || ''; } }catch(_){ }
      
      $('#dd-lang').value = settings.languageOverride || 'default';
      // (AI Model section removed)

      rebuildProfileDropdown(); $('#dd-profile').value = activeName;
    };

    const translatePanel=()=>{
      const p=panel; if(!p) return;
      const setText=(sel,key)=>{ try{ const n=p.querySelector(sel); if(n) n.textContent=T(key); }catch(_){ } };
      const setTitle=(sel,key)=>{ try{ const n=p.querySelector(sel); if(n) n.setAttribute('title', T(key)); }catch(_){ } };
      const setLabelFor=(inputSelector, key)=>{ try{ const el=p.querySelector(inputSelector); if(!el) return; const row=el.closest('.row'); if(!row) return; const lbl=row.querySelector('span:first-child'); if(lbl) lbl.textContent=T(key); }catch(_){ } };
      // Tabs
      setText('.tab[data-tab="actions"]','Actions'); try{ const n=p.querySelector('.tab[data-tab="actions"]'); if(n) n.title=T('Actions'); }catch(_){ }
      setText('.tab[data-tab="format"]','Text Formatting'); try{ const n=p.querySelector('.tab[data-tab="format"]'); if(n) n.title=T('Text Formatting'); }catch(_){ }
      setText('.tab[data-tab="misc"]','Miscellaneous'); try{ const n=p.querySelector('.tab[data-tab="misc"]'); if(n) n.title=T('Miscellaneous'); }catch(_){ }
      // Actions section
      setText('section[data-section="actions"] .group:nth-of-type(1) h4','Do');
      setText('section[data-section="actions"] .group:nth-of-type(1) .row:nth-of-type(1) span:first-child','Bold');
      setText('section[data-section="actions"] .group:nth-of-type(1) .row:nth-of-type(2) span:first-child','Colour');
      setTitle('#rst-do-colour','Reset');
      setText('section[data-section="actions"] .group:nth-of-type(2) h4','Say');
      setText('section[data-section="actions"] .group:nth-of-type(2) .row:nth-of-type(1) span:first-child','Bold');
      setText('section[data-section="actions"] .group:nth-of-type(2) .row:nth-of-type(2) span:first-child','Colour');
      setTitle('#rst-say-colour','Reset');
      // Formatting section groups order
      setText('section[data-section="format"] .group:nth-of-type(1) h4','Main Text');
      setText('section[data-section="format"] .group:nth-of-type(1) .row:nth-of-type(1) span:first-child','Bold');
      setText('section[data-section="format"] .group:nth-of-type(1) .row:nth-of-type(2) span:first-child','Colour');
      setTitle('#rst-main-colour','Reset');
      setText('section[data-section="format"] .group:nth-of-type(2) h4','Speech');
      setText('section[data-section="format"] .group:nth-of-type(2) .row:nth-of-type(1) span:first-child','Bold');
      setText('section[data-section="format"] .group:nth-of-type(2) .row:nth-of-type(2) span:first-child','Colour');
      setTitle('#rst-sp-colour','Reset');
      setText('section[data-section="format"] .group:nth-of-type(3) h4','Internal Monologue');
      setText('section[data-section="format"] .group:nth-of-type(3) .row:nth-of-type(1) span:first-child','Bold');
      setText('section[data-section="format"] .group:nth-of-type(3) .row:nth-of-type(2) span:first-child','Colour');
      setTitle('#rst-im-colour','Reset');
      setText('section[data-section="format"] .group:nth-of-type(4) h4','Italics');
      setText('section[data-section="format"] .group:nth-of-type(4) .row:nth-of-type(1) span:first-child','Bold');
      setText('section[data-section="format"] .group:nth-of-type(4) .row:nth-of-type(2) span:first-child','Colour');
      setTitle('#rst-it-colour','Reset');
      setText('section[data-section="format"] .group:nth-of-type(5) h4','Keywords');
      setText('section[data-section="format"] .group:nth-of-type(5) .row:nth-of-type(1) span:first-child','Add Keyword');
      setTitle('#tf-keyword-add','Add');
      setText('section[data-section="format"] .group:nth-of-type(6) h4','All Caps Effects');
      setText('section[data-section="format"] .group:nth-of-type(6) .row:nth-of-type(1) span:first-child','Effect');
      setText('section[data-section="format"] .group:nth-of-type(6) .row:nth-of-type(2) span:first-child','Exclusions');
      setText('section[data-section="format"] .group:nth-of-type(7) h4','Font');
      setLabelFor('#dd-font-family','Font Family');
      try{ const lbl=p.querySelector('#row-font-url > span:first-child'); if(lbl) lbl.textContent='Custom Google Fonts URL'; }catch(_){ }
      setLabelFor('#rng-font-size','Font Size');
      setLabelFor('#dd-font-weight','Font Weight');
      setLabelFor('#rng-line-height','Line Height');
      setLabelFor('#rng-letter-spacing','Letter Spacing');
      setLabelFor('#dd-text-align','Text Alignment');
      setLabelFor('#dd-paragraphs','Paragraphs');
      setText('section[data-section="format"] .group:nth-of-type(7) .actions button#rst-font-block','Reset Font');
      p.querySelectorAll('.reset').forEach(b=>{ try{ b.setAttribute('title', T('Reset')); }catch(_){ } });
      // Helpful titles
      try{ const t=p.querySelector('#dd-bg-type'); if(t){ t.title=T('Background type'); } }catch(_){ }
      try{ const t=p.querySelector('#tf-bg-image'); if(t){ t.title=T('Image URL'); } }catch(_){ }
      try{ const t=p.querySelector('#tf-bg-gradient'); if(t){ t.title=T('Gradient'); } }catch(_){ }
      // Misc → Background
      setText('section[data-section="misc"] .group:nth-of-type(1) h4','Background');
      setText('section[data-section="misc"] .group:nth-of-type(1) .row:nth-of-type(1) span:first-child','Background type');
      setText('section[data-section="misc"] .group:nth-of-type(1) .row:nth-of-type(2) span:first-child','Background colour');
      setText('section[data-section="misc"] .group:nth-of-type(1) .row:nth-of-type(3) span:first-child','Backdrop opacity');
      // Background image row (shown when type=image)
      setText('#row-bg-image span:first-child','Image URL');
      
      // Misc → AI Model
      setText('section[data-section="misc"] .group:nth-of-type(2) h4','Theme Presets');
      setText('section[data-section="misc"] .group:nth-of-type(2) .row:nth-of-type(1) span:first-child','Theme');
      // Misc → Language (shifted to 3 after AI Model)
      setText('section[data-section="misc"] .group:nth-of-type(3) h4','Language');
      setText('section[data-section="misc"] .group:nth-of-type(3) .row:nth-of-type(1) span:first-child','Language override');
      // Misc → Profiles
      setText('section[data-section"misc"] .group:nth-of-type(4) h4','Profiles');
      setText('section[data-section="misc"] .group:nth-of-type(4) .row:nth-of-type(1) span:first-child','Profile');
      setText('section[data-section="misc"] .group:nth-of-type(4) .actions button#pf-save-as','Save');
      setText('section[data-section="misc"] .group:nth-of-type(4) .actions button#pf-rename','Rename');
      setText('section[data-section="misc"] .group:nth-of-type(4) .actions button#pf-duplicate','Duplicate');
      setText('section[data-section="misc"] .group:nth-of-type(4) .actions button#pf-delete','Delete');
      setText('section[data-section="misc"] .group:nth-of-type(4) .actions button#pf-bind','Bind to this story');
      setText('section[data-section="misc"] .group:nth-of-type(4) .actions button#pf-unbind','Unbind');
      // Export/Import buttons
      setText('section[data-section="misc"] .group:nth-of-type(5) .actions button#btn-export','Export');
      setText('section[data-section="misc"] .group:nth-of-type(5) .actions button#btn-import','Import');
      // Reset All
      setText('section[data-section="misc"] > .actions button#reset-all','Reset All');
      // Update switch titles
      ['#sw-enabled','#sw-do-bold','#sw-say-bold','#sw-im-bold','#sw-it-bold','#sw-sp-bold','#sw-main-bold'].forEach(sel=>{ const el=$(sel); if(el){ setSwitch(el, getSwitch(el)); } });
    };
    const harvest=()=>{
      // Master toggle controls runtime pause as well
      try{ window.__AIDT_PAUSE__ = !getSwitch($('#sw-enabled')) ? true : false; }catch(_){ }
      settings.enabled = getSwitch($('#sw-enabled'));

      settings.actions.do.bold   = getSwitch($('#sw-do-bold'));
      settings.actions.do.colour = ($('#dd-do-presets').value || $('#sel-do-colour').value || '#ffffff');
      settings.actions.say.bold  = getSwitch($('#sw-say-bold'));
      settings.actions.say.colour= ($('#dd-say-presets').value || $('#sel-say-colour').value || '#ffffff');

      settings.allCapsEffect = $('#dd-effects').value || 'None';
      settings.fontFamily    = $('#dd-font-family').value || 'inherit';
      const clampNum=(n,min,max,fb)=>{ n=Number(n); if(isNaN(n)) return fb; return Math.max(min, Math.min(max, n)); };
      settings.fontSize      = clampNum(parseInt($('#rng-font-size').value,10), 80, 160, 100);
      settings.fontWeight    = $('#dd-font-weight').value || 'default';
      settings.lineHeight    = clampNum(parseFloat($('#rng-line-height').value), 1.1, 2.0, 1.5);
      settings.letterSpacing = clampNum(parseFloat($('#rng-letter-spacing').value), -0.05, 0.2, 0);
      settings.textAlign     = $('#dd-text-align').value || 'default';
      settings.paragraphs    = ($('#dd-paragraphs') && $('#dd-paragraphs').value) || 'default';

      settings.textFormatting.mainText.bold   = getSwitch($('#sw-main-bold'));
      settings.textFormatting.mainText.colour = ($('#dd-main-presets').value || $('#sel-main-colour').value || '#ffffff');

      settings.internalMonologue.bold   = getSwitch($('#sw-im-bold'));
      settings.internalMonologue.colour = ($('#dd-im-presets').value || $('#sel-im-colour').value || '#9ca3af');
      settings.italics.bold   = getSwitch($('#sw-it-bold'));
      settings.italics.colour = ($('#dd-it-presets').value || $('#sel-it-colour').value || '#facc15');
      settings.speech.bold              = getSwitch($('#sw-sp-bold'));
      settings.speech.colour            = ($('#dd-sp-presets').value || $('#sel-sp-colour').value || '#ffffff');

      settings.backgroundType = $('#dd-bg-type').value || 'default';
      settings.bgColour       = $('#sel-bg-colour').value || '#111827';
      settings.bgOpacity      = clampNum(parseInt($('#rng-bg-opacity').value,10), 0, 100, 100);
      // Sanitize gradient and image url
      const rawGrad = ($('#tf-bg-gradient') && $('#tf-bg-gradient').value) || settings.bgGradient || '';
      const rawImg  = ($('#tf-bg-image') && $('#tf-bg-image').value) || settings.bgImageUrl || '';
      const safeUrl = (s)=>{ try{ const u=new URL(s, location.href); return u.protocol==='http:'||u.protocol==='https:' ? u.href : ''; }catch(_){ return ''; } };
      const safeGrad=(g)=>{ try{ const t=String(g||'').trim(); if (!t) return ''; if (/^linear-gradient\(|^radial-gradient\(|^conic-gradient\(/i.test(t)) return t; return ''; }catch(_){ return ''; } };
      settings.bgGradient     = safeGrad(rawGrad);
      settings.bgImageUrl     = safeUrl(rawImg);
      settings.bgImageSize    = ($('#dd-bg-size') && $('#dd-bg-size').value) || settings.bgImageSize || 'cover';
      settings.bgImagePos     = ($('#dd-bg-pos') && $('#dd-bg-pos').value) || settings.bgImagePos || 'center center';
      settings.bgImageRepeat  = ($('#dd-bg-repeat') && $('#dd-bg-repeat').value) || settings.bgImageRepeat || 'no-repeat';
      settings.bgImageAttach  = ($('#dd-bg-attach') && $('#dd-bg-attach').value) || settings.bgImageAttach || 'scroll';
      settings.languageOverride = $('#dd-lang').value || 'default';
      // Persist selected AI model (does not force selection on page here)
      // (AI Model setting removed)
    };

    const bindReset=(id,fn)=>{ const el=$('#'+id); if(!el) return; el.addEventListener('click',()=>{ fn(); refreshUI(); persistSettings(); applyGlobal(); retrofitAllCapsAndKeywords(); reparseNow(); }); };
    bindReset('rst-do-colour',   ()=>{ settings.actions.do.colour=DEFAULTS.actions.do.colour; });
    bindReset('rst-say-colour',  ()=>{ settings.actions.say.colour=DEFAULTS.actions.say.colour; });
    bindReset('rst-font-family', ()=>{ settings.fontFamily=DEFAULTS.fontFamily; });
    bindReset('rst-font-size',   ()=>{ settings.fontSize=DEFAULTS.fontSize; });
    bindReset('rst-font-weight', ()=>{ settings.fontWeight=DEFAULTS.fontWeight; });
    bindReset('rst-line-height', ()=>{ settings.lineHeight=DEFAULTS.lineHeight; });
    bindReset('rst-letter-spacing', ()=>{ settings.letterSpacing=DEFAULTS.letterSpacing; });
    bindReset('rst-text-align',  ()=>{ settings.textAlign=DEFAULTS.textAlign; });
    bindReset('rst-paragraphs',  ()=>{ settings.paragraphs=DEFAULTS.paragraphs; });
    bindReset('rst-main-colour', ()=>{ settings.textFormatting.mainText.colour=DEFAULTS.textFormatting.mainText.colour; });
    bindReset('rst-im-colour',   ()=>{ settings.internalMonologue.colour=DEFAULTS.internalMonologue.colour; applyInlineSpanStyles(); });
    bindReset('rst-it-colour',   ()=>{ settings.italics.colour=DEFAULTS.italics.colour; applyInlineSpanStyles(); });
    bindReset('rst-sp-colour',   ()=>{ settings.speech.colour=DEFAULTS.speech.colour; });
    bindReset('rst-bg-type',     ()=>{ settings.backgroundType=DEFAULTS.backgroundType; settings.bgImageUrl=''; });
    bindReset('rst-bg-colour',   ()=>{ settings.bgColour=DEFAULTS.bgColour; });
    bindReset('rst-bg-opacity',  ()=>{ settings.bgOpacity=DEFAULTS.bgOpacity; });

    $('#rst-font-block').addEventListener('click', ()=>{
      settings.fontFamily=DEFAULTS.fontFamily; settings.fontSize=DEFAULTS.fontSize; settings.fontWeight=DEFAULTS.fontWeight;
      settings.lineHeight=DEFAULTS.lineHeight; settings.letterSpacing=DEFAULTS.letterSpacing; settings.textAlign=DEFAULTS.textAlign;
      settings.paragraphs=DEFAULTS.paragraphs;
      refreshUI(); translatePanel(); persistSettings(); applyGlobal(); retrofitAllCapsAndKeywords(); reparseNow();
    });
    // Per-section restores
    const confirmRestore = (name)=> confirm('Restore defaults for '+name+'?');
    const announce=(msg)=>{ try{ const n=panel.querySelector('#aidt-live'); if(n){ n.textContent=''; setTimeout(()=>{ try{ n.textContent=msg; }catch(_){ } }, 0);} }catch(_){ } };
    const safeApply = (msg)=>{ refreshUI(); persistSettings(); applyGlobal(); retrofitAllCapsAndKeywords(); reparseNow(); if(msg) announce(msg); };
    const btns=[
      ['rst-do-group', ()=>{ if(!confirmRestore('Do')) return; settings.actions.do=clone(DEFAULTS.actions.do); }],
      ['rst-say-group',()=>{ if(!confirmRestore('Say')) return; settings.actions.say=clone(DEFAULTS.actions.say); }],
      ['rst-main-group',()=>{ if(!confirmRestore('Main Text')) return; settings.textFormatting.mainText=clone(DEFAULTS.textFormatting.mainText); }],
      ['rst-sp-group',  ()=>{ if(!confirmRestore('Speech')) return; settings.speech=clone(DEFAULTS.speech); }],
      ['rst-im-group',  ()=>{ if(!confirmRestore('Internal Monologue')) return; settings.internalMonologue=clone(DEFAULTS.internalMonologue); }],
      ['rst-it-group',  ()=>{ if(!confirmRestore('Italics')) return; settings.italics=clone(DEFAULTS.italics); }],
      ['rst-kw-group',  ()=>{ if(!confirmRestore('Keywords')) return; settings.textFormatting.keywords=[]; }],
      ['rst-caps-group',()=>{ if(!confirmRestore('All Caps Effects')) return; settings.allCapsEffect=DEFAULTS.allCapsEffect; settings.textFormatting.capsExclusions=[]; }],
      ['rst-bg-group',  ()=>{ if(!confirmRestore('Background')) return; settings.backgroundType=DEFAULTS.backgroundType; settings.bgColour=DEFAULTS.bgColour; settings.bgOpacity=DEFAULTS.bgOpacity; settings.bgGradient=''; settings.bgImageUrl=''; settings.bgImageSize='cover'; settings.bgImagePos='center center'; settings.bgImageRepeat='no-repeat'; settings.bgImageAttach='scroll'; }],
    ];
    btns.forEach(([id,fn])=>{ const b=$('#'+id); if (b) b.addEventListener('click', ()=>{ fn(); safeApply('Restored '+id.replace('rst-','').replace('-group','')); }); });

    const applyLive=()=>{ harvest(); persistSettingsDebounced(); translatePanel(); applyGlobal(); retrofitAllCapsAndKeywords(); reparseNow(); };

    // switches → instant
    ['sw-enabled','sw-do-bold','sw-say-bold','sw-im-bold','sw-sp-bold','sw-main-bold'].forEach(id=>{
      const sw=$('#'+id); if(!sw) return;
      sw.addEventListener('click', ()=>{ const curr=getSwitch(sw); setSwitch(sw,!curr); applyLive(); });
      sw.addEventListener('keydown', e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); const curr=getSwitch(sw); setSwitch(sw,!curr); applyLive(); } });
    });
    // selects/inputs → instant
    ['dd-do-presets','dd-say-presets','dd-main-presets','dd-sp-presets','dd-im-presets','dd-it-presets','sel-do-colour','sel-say-colour','dd-effects','dd-font-family','rng-font-size','dd-font-weight','rng-line-height','rng-letter-spacing','dd-text-align','dd-paragraphs','sel-main-colour','sel-im-colour','sel-it-colour','sel-sp-colour','dd-bg-type','sel-bg-colour','rng-bg-opacity','tf-bg-image','dd-lang','dd-profile'].forEach(id=>{
      const el=$('#'+id); if(!el) return;
      el.addEventListener('input',  applyLive);
      el.addEventListener('change', applyLive);
      if (id==='dd-paragraphs'){
        el.addEventListener('change', ()=>{
          try{
            const v=$('#dd-paragraphs').value||'default';
            safeSet(LS_LAST_PARAGRAPHS, v);
            safeSet(lastParKeyFor(activeName), v);
            rebuildVisibleParagraphs();
            ensureLatestFormatted();
            bulkNormalizeOverlays();

            const jumpBottom=()=>{
              try{
                const s=document.scrollingElement||document.documentElement||document.body;
                s.scrollTop=s.scrollHeight;
              }catch(_){ try{ window.scrollTo(0,(document.body&&document.body.scrollHeight)||0); }catch(__){} }
            };
            setTimeout(jumpBottom,0);
            setTimeout(jumpBottom,50);
            setTimeout(jumpBottom,200);
          }catch(_){ }
        });
      }
    });

    // Show custom font URL row only when Custom selected
    try{
      const ddFam=$('#dd-font-family'); const rowUrl=$('#row-font-url');
      const updateFontUrlVis=()=>{ try{ rowUrl.style.display = (ddFam && ddFam.value==='custom') ? '' : 'none'; }catch(_){ } };
      if (ddFam && rowUrl){ ddFam.addEventListener('change', updateFontUrlVis); updateFontUrlVis(); }
    }catch(_){ }

    // Link color pickers to preset dropdowns so custom colors set dropdown to Custom and live apply
    try{
      const connect=(pickerId, presetId, assign)=>{
        const pc=$('#'+pickerId); const dd=$('#'+presetId);
        if (!pc) return;
        const onInput=()=>{ const v=pc.value; try{ assign(v); }catch(_){ } if (dd){ dd.value='__custom__'; } persistSettingsDebounced(); applyGlobal(); retrofitAllCapsAndKeywords(); reparseNow(); };
        const onChange=()=>{ const v=pc.value; try{ assign(v); }catch(_){ } if (dd){ dd.value='__custom__'; } persistSettings(); applyGlobal(); retrofitAllCapsAndKeywords(); reparseNow(); };
        pc.addEventListener('input', onInput);
        pc.addEventListener('change', onChange);
        if (dd){ dd.addEventListener('change', ()=>{ const v=dd.value==='__custom__'? pc.value : dd.value; try{ assign(v); }catch(_){ } if (dd.value!=='__custom__'){ pc.value=dd.value; } persistSettings(); applyGlobal(); retrofitAllCapsAndKeywords(); reparseNow(); }); }
      };
      connect('sel-do-colour','dd-do-presets', v=>{ settings.actions.do.colour=v; });
      connect('sel-say-colour','dd-say-presets', v=>{ settings.actions.say.colour=v; });
      connect('sel-main-colour','dd-main-presets', v=>{ settings.textFormatting.mainText.colour=v; });
      connect('sel-im-colour','dd-im-presets', v=>{ settings.internalMonologue.colour=v; });
      connect('sel-it-colour','dd-it-presets', v=>{ settings.italics.colour=v; });
      connect('sel-sp-colour','dd-sp-presets', v=>{ settings.speech.colour=v; });
    }catch(_){ }

    // Custom Google Fonts apply
    // Sanitize user-supplied Google Fonts URL to whitelist host, path, and params
    function sanitizeGoogleFontsUrl(raw){
      try{
        const u = new URL(String(raw), location.href);
        if (u.origin !== 'https://fonts.googleapis.com') return '';
        if (!(u.pathname === '/css' || u.pathname === '/css2')) return '';
        const params = new URLSearchParams();
        if (u.searchParams.has('family')){
          const fam = u.searchParams.get('family') || '';
          // Allow common family syntax including ital,wght@ and weights list
          const cleaned = fam.replace(/[^A-Za-z0-9 \+:,@;()\-]/g, '');
          if (cleaned.trim()) params.set('family', cleaned.trim());
        }
        // Clamp display to known values, default to swap
        const allowedDisplay = ['swap','block','fallback','optional','auto'];
        const display = (u.searchParams.get('display')||'swap').toLowerCase();
        params.set('display', allowedDisplay.includes(display) ? display : 'swap');
        if (!params.has('family')) return '';
        return u.origin + u.pathname + '?' + params.toString();
      }catch(_){ return ''; }
    }
    try{
      const applyCustomFont=()=>{
        try{
          const url = ($('#tf-font-url') && $('#tf-font-url').value || '').trim();
          if (!url) return;
          const safeUrl = sanitizeGoogleFontsUrl(url);
          if (!safeUrl) return;
          if (!document.querySelector('link[rel="preconnect"][href^="https://fonts.gstatic.com"]')){
            const p=document.createElement('link'); p.rel='preconnect'; p.href='https://fonts.gstatic.com'; p.crossOrigin='anonymous'; document.head.appendChild(p);
          }
          const id='aidt-font-custom'; let link=document.getElementById(id);
          if (!link){ link=document.createElement('link'); link.id=id; link.rel='stylesheet'; document.head.appendChild(link); }
          link.href=safeUrl;
        }catch(_){ }
      };
      const btn=$('#btn-font-apply'); if (btn){ btn.addEventListener('click', applyCustomFont); }
    }catch(_){ }
    // Apply theme preset (opt-in)
    try{
      const applyTheme=(name)=>{
        try{
          const p = getResolvedThemePreset(name); if (!p) return;
          // Apply shallow keys
          Object.keys(p).forEach(k=>{
            const v=p[k];
            if (v && typeof v==='object' && !Array.isArray(v)){
              settings[k] = merge(settings[k]||{}, v);
            } else {
              settings[k] = v;
            }
          });
          refreshUI(); translatePanel(); persistSettings(); applyGlobal(); retrofitAllCapsAndKeywords(); reparseNow(); scheduleBackgroundApply();
        }catch(_){ }
      };
      const ddTheme=$('#dd-theme'); const btnApply=$('#btn-apply-theme');
      if (ddTheme && btnApply){ btnApply.addEventListener('click', ()=>{ const sel=ddTheme.value||''; if (sel) applyTheme(sel); }); }
    }catch(_){ }

    // Keep background controls visibility in sync with selection
    try{ const ddBg=$('#dd-bg-type'); if (ddBg){ ddBg.addEventListener('change', ()=>{ updateBgUiVisibility(); }); } }catch(_){ }
    try{ const tfGrad=$('#tf-bg-gradient'); if (tfGrad){ tfGrad.addEventListener('input', applyLive); tfGrad.addEventListener('change', applyLive); } }catch(_){ }
    try{ ['dd-bg-size','dd-bg-pos','dd-bg-repeat','dd-bg-attach'].forEach(id=>{ const el=$('#'+id); if(el){ el.addEventListener('input', applyLive); el.addEventListener('change', applyLive); } }); }catch(_){ }
    // AI Model specific hooks
    // (AI Model hooks removed)

    // Keyword add: button and Enter key
    const kwInput=$('#tf-keyword-input');
    const addKeyword=()=>{
      if (!kwInput) return;
      const v=(kwInput.value||'').trim(); if (!v) return;
      settings.textFormatting.keywords=settings.textFormatting.keywords||[];
      settings.textFormatting.keywords.push({ text:v, effect:'None', bold:false, whole:true, caseSensitive:false, regex:false });
      if (settings.textFormatting.keywords.length>200){ settings.textFormatting.keywords = settings.textFormatting.keywords.slice(-200); }
      kwInput.value='';
      persistSettings(); renderKeywordChips(); reparseNow();
    };
    const addBtn=$('#tf-keyword-add'); if(addBtn) addBtn.addEventListener('click', ()=>{ addKeyword(); applyGlobal(); reparseNow(); });
    if (kwInput){ kwInput.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); addKeyword(); applyGlobal(); reparseNow(); } }); }
    // Caps exclusions add/remove
    const exInput=$('#tf-caps-ex-input');
    const addExcl=()=>{
      if (!exInput) return;
      const v=(exInput.value||'').trim(); if(!v) return;
      settings.textFormatting.capsExclusions=settings.textFormatting.capsExclusions||[];
      settings.textFormatting.capsExclusions.push(v);
      exInput.value=''; persistSettings(); refreshUI(); unwrapExcludedAllCaps(); applyGlobal(); reparseNow();
    };
    const exBtn=$('#tf-caps-ex-add'); if (exBtn) exBtn.addEventListener('click', ()=>{ addExcl(); });
    if (exInput){ exInput.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); addExcl(); } }); }

    // Export / Import
    const SCHEMA_VERSION = 1;
    const MAX_IMPORT_BYTES = 512 * 1024; // 512 KB guardrail
    function isPlainObject(o){ return !!o && Object.prototype.toString.call(o)==='[object Object]'; }
    function validateImportShape(obj){
      try{
        if (!isPlainObject(obj)) return 'Invalid file: root is not an object.';
        if (obj.version !== undefined && typeof obj.version !== 'number') return 'Invalid file: version must be a number.';
        if (obj.bindings !== undefined && !isPlainObject(obj.bindings)) return 'Invalid file: bindings must be an object.';
        if (!obj.profiles || !isPlainObject(obj.profiles) || !isPlainObject(obj.profiles.profiles)) return 'Invalid file: profiles.profiles missing.';
        const names=Object.keys(obj.profiles.profiles);
        if (names.length > 200) return 'Too many profiles in file.';
        for (const name of names){
          if (typeof name !== 'string' || name.length<1 || name.length>64) return 'Invalid profile name encountered.';
          const cfg=obj.profiles.profiles[name];
          if (!isPlainObject(cfg)) return 'Profile "'+name+'" is not an object.';
          // rough per-profile size guard
          const size = JSON.stringify(cfg).length;
          if (size > 120*1024) return 'Profile "'+name+'" is too large.';
        }
        return '';
      }catch(_){ return 'Invalid file structure.'; }
    }
    const migrateProfiles = (inObj)=>{
      try{
        if (!inObj || !inObj.profiles) return inObj;
        // Example migrations can go here in future
        return inObj;
      }catch(_){ return inObj; }
    };
    $('#btn-export').addEventListener('click', ()=>{
      const blob={ version: SCHEMA_VERSION, profiles: loadJSON(LS_PROFILES,{profiles:{}}), bindings: loadJSON(LS_BINDINGS,{}), activeProfile: activeName, exportedAt: new Date().toISOString() };
      const s=JSON.stringify(blob,null,2); const a=document.createElement('a');
      const pad=n=>String(n).padStart(2,'0'); const d=new Date(); const ts=d.getFullYear()+pad(d.getMonth()+1)+pad(d.getDate())+'-'+pad(d.getHours())+pad(d.getMinutes())+pad(d.getSeconds());
      const nameSafe=(activeName||'default').replace(/\W+/g,'_');
      a.href=URL.createObjectURL(new Blob([s],{type:'application/json'})); a.download='aidt-config-'+nameSafe+'-'+ts+'.json'; a.click();
    });
    $('#btn-export-active').addEventListener('click', ()=>{
      try{
        const all=loadJSON(LS_PROFILES,{profiles:{}}); const one={profiles:{}}; one.profiles[activeName]=all.profiles[activeName];
        const blob={ version: SCHEMA_VERSION, profiles: one, bindings: {}, activeProfile: activeName, exportedAt: new Date().toISOString() };
        const s=JSON.stringify(blob,null,2); const a=document.createElement('a');
        const pad=n=>String(n).padStart(2,'0'); const d=new Date(); const ts=d.getFullYear()+pad(d.getMonth()+1)+pad(d.getDate())+'-'+pad(d.getHours())+pad(d.getMinutes())+pad(d.getSeconds());
        a.href=URL.createObjectURL(new Blob([s],{type:'application/json'})); a.download='aidt-profile-'+activeName.replace(/\W+/g,'_')+'-'+ts+'.json'; a.click();
      }catch(_){ }
    });
    const runImport=(mode)=>{ const input=$('#file-import'); input.setAttribute('data-mode', mode||'merge'); input.click(); };
    $('#btn-import-merge').addEventListener('click', ()=>runImport('merge'));
    $('#btn-import-replace').addEventListener('click', ()=>{ if (confirm('Import (Replace) will overwrite existing profiles that have the same names. Continue?')) runImport('replace'); });
    $('#file-import').addEventListener('change', ev=>{
      const f=ev.target.files&&ev.target.files[0]; if(!f) return;
      const mode = ev.target.getAttribute('data-mode') || 'merge';
      try{ if (f.size > MAX_IMPORT_BYTES){ alert('Import failed: file is larger than '+(MAX_IMPORT_BYTES/1024)+' KB.'); ev.target.value=''; return; } }catch(_){ }
      const r=new FileReader();
      r.onload=()=>{
        try{
          const data=JSON.parse(String(r.result||'{}'));
          const ver = (typeof data.version==='number') ? data.version : 0;
          const err = validateImportShape(data);
          if (err){ alert(err); ev.target.value=''; return; }
          let prof = data && data.profiles ? data.profiles : null;
          if (prof){
            prof = migrateProfiles(prof);
            if (mode==='replace'){
              saveJSON(LS_PROFILES, prof);
            } else {
              // merge: do not overwrite existing profiles; add/merge new keys
              const cur=loadJSON(LS_PROFILES,{profiles:{}});
              const merged={profiles:{}};
              Object.assign(merged.profiles, cur.profiles);
              for (const name of Object.keys(prof.profiles||{})){
                if (!merged.profiles[name]) merged.profiles[name]=prof.profiles[name];
              }
              saveJSON(LS_PROFILES, merged);
            }
          }
          if (data && data.bindings) saveJSON(LS_BINDINGS,data.bindings);
          if (data && data.activeProfile && loadJSON(LS_PROFILES,{profiles:{}}).profiles[data.activeProfile]) {
            activeName=data.activeProfile; safeSet(ACTIVE_PROFILE,activeName);
            settings=merge(DEFAULTS, loadJSON(LS_PROFILES,{profiles:{}}).profiles[activeName]);
            publishSettings();
          }
          profiles=loadJSON(LS_PROFILES,{profiles:{}}); bindings=loadJSON(LS_BINDINGS,{});
          refreshUI(); persistSettings(); applyGlobal(); retrofitAllCapsAndKeywords(); reparseNow(); ev.target.value='';
        }catch(e){ alert('Import failed: '+(e&&e.message||'invalid JSON')); ev.target.value=''; }
      };
      r.readAsText(f);
    });

    // Profiles
    const promptName=(m,d)=>{ const n=prompt(m,d||'New Profile'); if(!n) return null; return n.trim().slice(0,64)||null; };
    $('#dd-profile').addEventListener('change', function(){ const name=this.value; switchProfile(name); });
    function switchProfile(name){
      profiles=loadJSON(LS_PROFILES,{profiles:{}});
      if(!profiles.profiles[name]) return;
      activeName=name; safeSet(ACTIVE_PROFILE,name);
      settings=merge(DEFAULTS, profiles.profiles[name]);
      publishSettings();
      refreshUI(); applyGlobal(); retrofitAllCapsAndKeywords(); reparseNow();
    }
    $('#pf-save-as').addEventListener('click', ()=>{
      harvest(); const name=promptName('Save current settings as profile:','Custom'); if(!name) return;
      profiles=loadJSON(LS_PROFILES,{profiles:{}});
      profiles._meta = profiles._meta || { lastModifiedAt: {} };
      profiles.profiles[name]=clone(settings); try{ profiles._meta.lastModifiedAt[name]=new Date().toISOString(); }catch(_){ }
      saveJSON(LS_PROFILES,profiles);
      activeName=name; safeSet(ACTIVE_PROFILE,name);
      rebuildProfileDropdown(); $('#dd-profile').value=name;
    });
    $('#pf-rename').addEventListener('click', ()=>{
      const name=promptName('Rename profile:',activeName); if(!name||name===activeName) return;
      profiles=loadJSON(LS_PROFILES,{profiles:{}});
      if (profiles.profiles[name]) { alert('A profile with that name already exists.'); return; }
      profiles._meta = profiles._meta || { lastModifiedAt: {} };
      profiles.profiles[name]=profiles.profiles[activeName]; delete profiles.profiles[activeName];
      try{ profiles._meta.lastModifiedAt[name]=new Date().toISOString(); delete profiles._meta.lastModifiedAt[activeName]; }catch(_){ }
      const b=loadJSON(LS_BINDINGS,{}); Object.keys(b).forEach(k=>{ if(b[k]===activeName) b[k]=name; });
      saveJSON(LS_BINDINGS,b); saveJSON(LS_PROFILES,profiles);
      activeName=name; safeSet(ACTIVE_PROFILE,name);
      rebuildProfileDropdown(); $('#dd-profile').value=name;
    });
    $('#pf-duplicate').addEventListener('click', ()=>{
      const name=promptName('Duplicate profile as:',activeName+' Copy'); if(!name) return;
      profiles=loadJSON(LS_PROFILES,{profiles:{}});
      profiles._meta = profiles._meta || { lastModifiedAt: {} };
      profiles.profiles[name]=clone(profiles.profiles[activeName]); try{ profiles._meta.lastModifiedAt[name]=new Date().toISOString(); }catch(_){ }
      saveJSON(LS_PROFILES,profiles);
      rebuildProfileDropdown(); $('#dd-profile').value=activeName;
    });
    $('#pf-delete').addEventListener('click', ()=>{
      if (activeName==='Default') { alert('Cannot delete Default profile.'); return; }
      if (!confirm('Delete profile "'+activeName+'"?')) return;
      profiles=loadJSON(LS_PROFILES,{profiles:{}});
      profiles._meta = profiles._meta || { lastModifiedAt: {} };
      delete profiles.profiles[activeName]; try{ delete profiles._meta.lastModifiedAt[activeName]; }catch(_){ }
      saveJSON(LS_PROFILES,profiles);
      const b=loadJSON(LS_BINDINGS,{}); Object.keys(b).forEach(k=>{ if(b[k]===activeName) delete b[k]; });
      // prune orphaned bindings pointing to missing profiles
      try{
        const cur=loadJSON(LS_PROFILES,{profiles:{}});
        Object.keys(b).forEach(k=>{ if(!cur.profiles[b[k]]) delete b[k]; });
      }catch(_){ }
      saveJSON(LS_BINDINGS,b);
      activeName='Default'; safeSet(ACTIVE_PROFILE,'Default');
      settings=merge(DEFAULTS, loadJSON(LS_PROFILES,{profiles:{}}).profiles[activeName]);
      publishSettings();
      rebuildProfileDropdown(); $('#dd-profile').value=activeName;
      refreshUI(); applyGlobal(); reparseNow();
    });
    $('#pf-bind').addEventListener('click', ()=>{ const b=loadJSON(LS_BINDINGS,{}); b[urlKey]=activeName; saveJSON(LS_BINDINGS,b); alert('Bound "'+activeName+'" to this story.'); });
    $('#pf-unbind').addEventListener('click', ()=>{ const b=loadJSON(LS_BINDINGS,{}); if(b[urlKey]){ delete b[urlKey]; saveJSON(LS_BINDINGS,b); alert('Unbound.'); } });

    // Reset Text Formatting: font block + main text + IM + Speech + keywords
    $('#rst-formatting').addEventListener('click', ()=>{
      settings.fontFamily=DEFAULTS.fontFamily; settings.fontSize=DEFAULTS.fontSize; settings.fontWeight=DEFAULTS.fontWeight;
      settings.lineHeight=DEFAULTS.lineHeight; settings.letterSpacing=DEFAULTS.letterSpacing; settings.textAlign=DEFAULTS.textAlign;
      settings.paragraphs=DEFAULTS.paragraphs;
      settings.allCapsEffect=DEFAULTS.allCapsEffect;
      settings.textFormatting=clone(DEFAULTS.textFormatting);
      settings.internalMonologue=clone(DEFAULTS.internalMonologue);
      settings.speech=clone(DEFAULTS.speech);
      refreshUI(); persistSettings(); applyGlobal(); retrofitAllCapsAndKeywords(); reparseNow();
    });

    // Quick actions
    $('#reset-all').addEventListener('click', ()=>{ if(!confirm('Reset all AIDT settings to defaults?')) return; settings=clone(DEFAULTS); settings.enabled=false; refreshUI(); persistSettings(); applyGlobal(); retrofitAllCapsAndKeywords(); reparseNow(); });
    // Tabs
    const tabs = panel.querySelectorAll('.tab'), sections = panel.querySelectorAll('.section');
    const showTab=key=>{
      sections.forEach(sec=>sec.classList.toggle('active', sec.getAttribute('data-section')===key));
      tabs.forEach(t=>t.setAttribute('aria-selected', String(t.getAttribute('data-tab')===key)));
      try{ safeSet('aidt:lastTab', key); }catch(_){ }
      try{ settings.uiLastTab = key; persistSettingsDebounced(); }catch(_){ }
    };
    tabs.forEach(t=>{
      t.addEventListener('click', ()=>showTab(t.getAttribute('data-tab')));
      t.addEventListener('keydown', e=>{
        if(e.key==='ArrowRight'||e.key==='ArrowLeft'){
          const arr=[...tabs], idx=arr.indexOf(t);
          const next=(e.key==='ArrowRight')? (idx+1)%arr.length : (idx-1+arr.length)%arr.length;
          arr[next].focus(); showTab(arr[next].getAttribute('data-tab'));
        }
      });
    });

    btn.addEventListener('click', ()=>{ togglePanel(); try{ const last=safeGet('aidt:lastTab'); if (last) showTab(last); }catch(_){ } });
    $('#close').addEventListener('click', ()=>closePanel());

    try{ const last=(safeGet('aidt:lastTab')||'') || (settings && settings.uiLastTab) || ''; if (last){ showTab(last); setTimeout(()=>showTab(last), 30); } else { showTab('actions'); } }catch(_){ showTab('actions'); }
    refreshUI();
    // Ensure dropdown reflects restored settings (even when panel starts hidden)
    try{ const dd=panel.querySelector('#dd-paragraphs'); if (dd && dd.value !== (settings.paragraphs||'default')) dd.value = (settings.paragraphs||'default'); }catch(_){ }
    panelAPI={ panel, showTab };
    return panelAPI;
  }

  // ---------------- Boot & observers ----------------
  
  // ---- Minimal parser/apply shims ----
  var __AIDT_RETRY_BUDGET__ = 20;
  function __aidt_liveEditablePresent(){
    try{
      return !!document.querySelector('[contenteditable="true"], [role="textbox"], textarea');
    }catch(e){ return false; }
  }
  function __aidt_reparse2(){
    // Left intentionally light; your rich parser can slot here.
    // We still gate for live edit DOM to avoid styling too early.
    try{
      // Always try to format just the newest paragraph immediately
      parseLatestOutput();
      // Also run a broader pass when safe
      reparse();
    }catch(e){}
  }
  function __aidt_reapply2(){
    try{
      __AIDT_RETRY_BUDGET__ = 20;
      // Ensure font/spacing + base text styles are applied to newly added roots
      try{ applyFontsAndEffects(); applyBaseText(); retrofitAllCapsAndKeywords(); applyInlineSpanStyles(); }catch(_e){}
      AIDT_applySayDo(document);
      // Ensure the newest overlay row has our span classes after settings changes
      try{
        var ol = document.querySelector('#gameplay-output #transition-opacity, #transition-opacity');
        if (ol){ try{ normalizeOverlay(); }catch(_no){} try{ overlayWrapSpeech(ol); }catch(_ow){} }
      }catch(_ens){}
      try{
        var ifr = document.querySelectorAll('iframe');
        for (var i=0;i<ifr.length;i++){
          try{ var d = ifr[i].contentDocument; if (d) { try{ applyFontsAndEffects(); applyBaseText(); retrofitAllCapsAndKeywords(); applyInlineSpanStyles(); }catch(_e2){} AIDT_applySayDo(d); } }catch(_e){}
        }
      }catch(_e){}
    }catch(e){}
  }

  // Cross-tab settings sync: apply changes from other tabs via storage events
  function setupCrossTabSync(){
    try{
      if (window.__AIDT_SYNC_INSTALLED__) return; window.__AIDT_SYNC_INSTALLED__=true;
      window.addEventListener('storage', function(ev){
        try{
          if (!ev || (ev.storageArea && ev.storageArea !== localStorage)) return;
          const key = String(ev.key||''); if (!key) return;
          const isRelevant = (
            key===LS_PROFILES || key===LS_BINDINGS || key===ACTIVE_PROFILE ||
            key===LS_LAST_PARAGRAPHS || key.indexOf('aidt:config:lastParagraphs:')===0
          );
          if (!isRelevant) return;
          // Reload profiles/bindings and compute active profile
          profiles = loadJSON(LS_PROFILES,{profiles:{}});
          bindings = loadJSON(LS_BINDINGS,{});
          const bound2 = bindings[urlKey];
          let nextActive = bound2 || (safeGet(ACTIVE_PROFILE) || 'Default');
          if (!profiles.profiles[nextActive]) nextActive='Default';
          activeName = nextActive;
          settings = merge(DEFAULTS, profiles.profiles[activeName] || {});
          publishSettings();
          try{ refreshUI(); }catch(_){ }
          try{ applyGlobal(); retrofitAllCapsAndKeywords(); }catch(_){ }
          try{ reparseNow(); ensureLatestFormatted(); }catch(_){ }
          try{ scheduleBackgroundApply(); }catch(_){ }
        }catch(_){ }
      }, false);
    }catch(_){ }
  }

  // Unified keyed retry helper for follow-up ensures
  function scheduleEnsures(key, fn){
    try{
      window.__AIDT_SCHED__ = window.__AIDT_SCHED__ || Object.create(null);
      if (window.__AIDT_SCHED__[key]) return;
      window.__AIDT_SCHED__[key] = true;
      const steps = [120,300,600,1000,1600,2500];
      steps.forEach(ms=> setTimeout(()=>{ try{ fn(); }catch(_){ } }, ms));
      setTimeout(()=>{ try{ delete window.__AIDT_SCHED__[key]; }catch(_){ } }, steps[steps.length-1] + 50);
    }catch(_){ }
  }

  const observer=createAidtObserver(muts=>{
    for (const m of muts){
      if ((m.type==='childList' && m.addedNodes && m.addedNodes.length) || m.type==='characterData'){
        __aidt_reparse2();  // parse any new/changed nodes
        __aidt_reapply2();  // refresh styles including SAY/IM
        break;
      }
    }
  });

  function start(){
    try{
      const api=buildPanel();
      // On load, avoid early background flash: style text first, then background later
      applyGlobalNoBG();
      // Apply paragraph mode immediately on startup (panel may be hidden)
      try{ rebuildVisibleParagraphs(); ensureLatestFormatted(); bulkNormalizeOverlays(); }catch(_){ }
      // Apply base text immediately on load
      try{ applyBaseText(); applyInlineSpanStyles(); }catch(_e){}
      // Force an initial latest parse-and-style sweep after first paint, add tiny jitter to avoid hydration collisions
      try{ const jitter = 60 + Math.floor(Math.random()*20)+5; setTimeout(()=>{ try{ parseLatestOutput(); formatAllTargetElements(); bulkNormalizeOverlays(); applyFontsAndEffects(); applyBaseText(); applyInlineSpanStyles(); if (window.__AIDT_HAS_SAYDO__){ AIDT_applySayDo(document);} ensureOverlayWrappedOnce(); scheduleBackgroundApply(); }catch(_e2){} }, jitter); }catch(_e1){}
      // Also trigger a background apply a bit later in case UI finished mounting after our first attempt
      try{ setTimeout(()=>{ try{ scheduleBackgroundApply(); }catch(_s2){} }, 450); }catch(_s1){}
      observer.observe(document.body, { childList:true, subtree:true, characterData:true });
      // Attach visible-only observer after initial mount
      try{ attachVisibleObserver(); }catch(_){ }
      // Begin watching the overlay to normalize split-word spans continuously
      try{ setupOverlayObserver(); /* normalizeOverlay intentionally deferred to avoid wiping newest before spans */ }catch(_){ }
      // Toggle debug: Ctrl+Alt+D
      try{
        window.addEventListener('keydown', function(e){
          try{
            if (e.ctrlKey && e.altKey && (e.key==='d' || e.key==='D')){
              const cur = (safeGet('AIDT_DEBUG')==='1');
              safeSet('AIDT_DEBUG', cur?'0':'1');
              if (!window.__AIDT_DEBUG__ && !cur) window.__AIDT_DEBUG__ = true; // allow temporary session toggle
              dbg('Debug toggled. Now:', !cur);
              setTimeout(()=>{ try{ ensureLatestFormatted(); }catch(_){ } }, 0);
            }
          }catch(_){ }
        }, true);
      }catch(_){ }
      setupFormatObserver();
      setupCrossTabSync();
      try{
        const clear = ()=>{ try{ if (window.__AIDT_PRUNE_TIMER__){ clearInterval(window.__AIDT_PRUNE_TIMER__); window.__AIDT_PRUNE_TIMER__=null; } }catch(_){ } };
        window.addEventListener('pagehide', clear, { once:true });
        window.addEventListener('beforeunload', clear, { once:true });
      }catch(_){ }
      [0,150,350,700,1200,2000,3500].forEach(ms=>setTimeout(()=>{ if (document.visibilityState==='hidden') return; __aidt_reparse2(); __aidt_reapply2(); ensureLatestFormatted(); }, ms));
      if (api && api.showTab) api.showTab('actions');
      // Robust post-click retries for newest paragraph becoming non-editable
      document.addEventListener('click', function(e){
        try{
          var el = e.target && e.target.closest ? e.target.closest('button,[role="button"],a') : null;
          if (!el) return;
          var t = (el.textContent || '').toLowerCase();
          if (/continue|take a turn|retry|erase|send|submit|undo|redo|edit/.test(t)){
            scheduleEnsures('post-click-ensure', function(){ if (document.visibilityState==='hidden') return; __aidt_reparse2(); __aidt_reapply2(); ensureLatestFormatted(); });
          }
        }catch(err){}
      }, true);

      // Suppress formatting while the user is attempting to click/context‑click within the output
      (function(){
        let pauseTimer=null;
        const doPause=(ms)=>{
          try{
            window.__AIDT_PAUSE__ = true;
            if (pauseTimer) clearTimeout(pauseTimer);
            pauseTimer = setTimeout(function(){ try{ window.__AIDT_PAUSE__ = false; ensureLatestFormatted(); }catch(_){ } }, ms||700);
          }catch(_){ }
        };
        const shouldPause=(target)=>{
          try{
            if (!target || !target.closest) return false;
            return !!(target.closest('#gameplay-output') || target.closest('#transition-opacity') || target.closest('#do-not-copy') || target.closest('[data-testid="adventure-text"]'));
          }catch(_){ return false; }
        };
        document.addEventListener('pointerdown', function(ev){ try{ if (shouldPause(ev.target)) doPause(900); }catch(_){ } }, {capture:true, passive:true});
        document.addEventListener('contextmenu', function(ev){ try{ if (shouldPause(ev.target)) doPause(1200); }catch(_){ } }, true);
        document.addEventListener('focusin', function(ev){ try{ if (ev.target && ev.target.closest && ev.target.closest('[contenteditable="true"]')) doPause(900); }catch(_){ } }, true);
      })();

    }catch{}
  }

  document.addEventListener('keydown', e=>{ try{ if (e.ctrlKey && e.altKey && (e.key==='p'||e.key==='P')){ __aidt_reparse2(); __aidt_reapply2(); } }catch{} }, true);
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', start, {once:true});
  else start();
})();
/* ==== AIDT SAY/DO PATCH (ES5-safe, isolated) ==== */
(function(){
  if (window.__AIDT_SAYDO_PATCH__) return;
  window.__AIDT_SAYDO_PATCH__ = true;

  function AIDT_firstDefined(){
    for (var i=0;i<arguments.length;i++){ if (arguments[i] !== undefined && arguments[i] !== null) return arguments[i]; }
    return undefined;
  }
  function AIDT_effectiveColours(){
    try{
      var s = (window && window.__AIDT_SETTINGS__) || ((typeof settings!=='undefined') ? settings : {});
      var SAY_COL = AIDT_firstDefined(
        s && s.actions && s.actions.say && s.actions.say.colour,
        s && s.sayColor,
        s && s.speech && s.speech.colour,
        '#ffffff'
      );
      var SAY_B   = !!AIDT_firstDefined(
        s && s.actions && s.actions.say && s.actions.say.bold,
        s && s.sayBold,
        s && s.speech && s.speech.bold,
        false
      );
      var DO_COL  = AIDT_firstDefined(
        s && s.actions && s.actions.do && s.actions.do.colour,
        s && s.doColor,
        '#ffffff'
      );
      var DO_B    = !!AIDT_firstDefined(
        s && s.actions && s.actions.do && s.actions.do.bold,
        s && s.doBold,
        false
      );
      return { SAY_COL:SAY_COL, SAY_W:(SAY_B?'700':''), DO_COL:DO_COL, DO_W:(DO_B?'700':'') };
    } catch(e){ return { SAY_COL:'#ffffff', SAY_W:'', DO_COL:'#ffffff', DO_W:'' }; }
  }

  
  // ---- CSS + XPath helpers ----
  function AIDT_xpathAll(root, expr){
    try{
      var arr = [];
      var doc = root && root.ownerDocument ? root.ownerDocument : document;
      var xres = doc.evaluate(expr, root||doc, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      for (var i=0;i<xres.snapshotLength;i++){ arr.push(xres.snapshotItem(i)); }
      return arr;
    }catch(e){ return []; }
  }
  function AIDT_mergeUnique(a, b){
    var seen = new Set();
    var out = [];
    function addAll(list){
      for (var i=0;i<list.length;i++){
        var n = list[i];
        if (!n) continue;
        if (!seen.has(n)){ seen.add(n); out.push(n); }
      }
    }
    addAll(a); addAll(b);
    return out;
  }

function AIDT_applySayDo(root){
    try{
      root = root || document;
      // Respect master toggle; if disabled, clear any inline styles we may have applied and exit
      try{
        var st = (window && window.__AIDT_SETTINGS__) || ((typeof settings!== 'undefined') ? settings : {});
        var enabled = (st && typeof st.enabled !== 'undefined') ? !!st.enabled : true;
        if (!enabled){
          try{
            var clearTargets = root.querySelectorAll('.w_comment, .w-comment, .w_run, .w-run, #transition-opacity');
            for (var ci=0; ci<clearTargets.length; ci++){
              var n = clearTargets[ci];
              try{
                n.style.removeProperty('color');
                n.style.removeProperty('font-weight');
                var spans = n.querySelectorAll('span.font_gameplay, p.font_gameplay, div.font_gameplay');
                for (var si=0; si<spans.length; si++){ spans[si].style.removeProperty('color'); spans[si].style.removeProperty('font-weight'); }
                var svgs = n.querySelectorAll('svg, svg *');
                for (var svi=0; svi<svgs.length; svi++){ svgs[svi].style.removeProperty('stroke'); svgs[svi].style.removeProperty('fill'); }
                var links = n.querySelectorAll('a');
                for (var li=0; li<links.length; li++){ links[li].style.removeProperty('color'); links[li].style.removeProperty('font-weight'); }
              }catch(_c){}
            }
          }catch(_c2){}
          return;
        }
      }catch(_s){}
      var eff = AIDT_effectiveColours();
      function styleNode(el, col, wt){
if (!el) return;
        try{
          el.style.setProperty('color', col, 'important');
el.style.setProperty('font-weight', (wt ? wt : '400'), 'important');
var svgs = el.querySelectorAll('svg, svg *');
          for (var i=0;i<svgs.length;i++){
            svgs[i].style.setProperty('stroke','currentColor','important');
            svgs[i].style.setProperty('fill','currentColor','important');
          }
          var links = el.querySelectorAll('a');
for (var j=0;j<links.length;j++){
  links[j].style.setProperty('color','inherit','important');
  links[j].style.setProperty('font-weight','inherit','important');
}
}catch(e){}
      }
      function upchain(start, depth, col, wt){
        var p = start;
        for (var k=0;k<depth && p && p!==document.body;k++){
          styleNode(p, col, wt);
          var prev = p.previousElementSibling;
          if (prev) styleNode(prev, col, wt);
          p = p.parentElement;
        }
      }
      var sayBlocks = root.querySelectorAll('.w_comment, .w-comment');
      var sayXPath = AIDT_xpathAll(root, ".//*[contains(concat(' ', normalize-space(@class),' '), ' w_comment ') or contains(concat(' ', normalize-space(@class),' '), ' w-comment ')]");
      sayBlocks = AIDT_mergeUnique(Array.from(sayBlocks), sayXPath);
for (var a=0;a<sayBlocks.length;a++){
        styleNode(sayBlocks[a], eff.SAY_COL, eff.SAY_W);
        upchain(sayBlocks[a], 5, eff.SAY_COL, eff.SAY_W);
      }
      var doBlocks = root.querySelectorAll('.w_run, .w-run');
      var doXPath = AIDT_xpathAll(root, ".//*[contains(concat(' ', normalize-space(@class),' '), ' w_run ') or contains(concat(' ', normalize-space(@class),' '), ' w-run ')]");
      doBlocks = AIDT_mergeUnique(Array.from(doBlocks), doXPath);
for (var b=0;b<doBlocks.length;b++){
        styleNode(doBlocks[b], eff.DO_COL, eff.DO_W);
        upchain(doBlocks[b], 5, eff.DO_COL, eff.DO_W);
      }
      // Extension-style nodes (if present)
      var rows = root.querySelectorAll('#transition-opacity');
      for (var r=0;r<rows.length;r++){
        try{
          var iconNode = rows[r].querySelector('#action-icon');
          var textNode = rows[r].querySelector('span.font_gameplay, p.font_gameplay, div.font_gameplay');
          if (!iconNode || !textNode) continue;
          var t = (iconNode.textContent || '').trim();
          var isSay = (t === 'w_comment');
          var isDo  = (t === 'w_run');
          var col = isSay ? eff.SAY_COL : isDo ? eff.DO_COL : null;
          var wt  = isSay ? eff.SAY_W   : isDo ? eff.DO_W   : '';
          if (col){ iconNode.style.setProperty('color', col, 'important'); textNode.style.setProperty('color', col, 'important'); }
          textNode.style.setProperty('font-weight', (wt ? wt : '400'), 'important');
        }catch(e){}
      }
    }catch(e){}
  }

  try{
    var mo = createAidtObserver(function(){ try{ AIDT_applySayDo(document); }catch(e){} });
    mo.observe(document.documentElement, {subtree:true, childList:true, characterData:true, attributes:true});
    try{ if (window.__AIDT_OBSERVERS_ADD__) window.__AIDT_OBSERVERS_ADD__(mo); }catch(_){ }
    document.addEventListener('click', function(e){
      try{
        var el = e.target && e.target.closest ? e.target.closest('button,[role=\"button\"],a') : null;
        if (!el) return;
        var t = (el.textContent || '').toLowerCase();
        if (/continue|take a turn|retry|erase|send|submit|undo|redo|edit|select/.test(t)){
          setTimeout(function(){ AIDT_applySayDo(document); }, 60);
        }
      }catch(e){}
    }, true);
  }catch(e){}
  try{ AIDT_applySayDo(document); }catch(e){}
})();
/* ==== end patch ==== */

// AIDT: safe namespace aliases to avoid global collisions
(function(){try{
  window.__AIDT_CORE__ = window.__AIDT_CORE__ || {};
  if (typeof window.__AIDT_CORE__.reparse !== 'function' && typeof __aidt_reparse2 === 'function') {
    window.__AIDT_CORE__.reparse = __aidt_reparse2;
  }
  if (typeof window.__AIDT_CORE__.reapply !== 'function' && typeof __aidt_reapply2 === 'function') {
    window.__AIDT_CORE__.reapply = __aidt_reapply2;
  }
  if (typeof window.__AIDT_CORE__.ensure !== 'function' && typeof ensureLatestFormatted === 'function') {
    window.__AIDT_CORE__.ensure = ensureLatestFormatted;
  }
}catch(e){}})();
/* ==== AIDT: Robust last-paragraph handling (attributes + action waiters) ==== */
(function(){
  try{
    function _aidt_call(name){
      try{
        if (window.__AIDT_CORE__ && typeof window.__AIDT_CORE__[name] === 'function'){
          window.__AIDT_CORE__[name]();
        }
      }catch(_){}
    }
    // Attribute observer: watch for contenteditable/class/aria-busy flips anywhere
    var attrObserver = createAidtObserver(function(muts){
      for (var i=0;i<muts.length;i++){
        var m = muts[i];
        if (m.type === 'attributes' && (m.attributeName === 'contenteditable' || m.attributeName === 'class' || m.attributeName === 'aria-busy')){
          _aidt_call('reparse');
          _aidt_call('reapply');
          break;
        }
      }
    });
    try{
      attrObserver.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['contenteditable','class','aria-busy']
      });
    }catch(_){}

    // Helpers to detect when new output has actually landed
    function _aidt_countOutputs(){
      try{
        return document.querySelectorAll(
          '#transition-opacity, [data-testid="adventure-text"], [data-testid="message-text"], [data-testid="playback-content"], .w_comment, .w-comment, .w_run, .w-run'
        ).length;
      }catch(_){ return 0; }
    }
    function _aidt_totalText(){
      try{
        var n = 0;
        var nodes = document.querySelectorAll(
          '#transition-opacity, [data-testid="adventure-text"], [data-testid="message-text"], [data-testid="playback-content"], .w_comment, .w-comment, .w_run, .w-run'
        );
        for (var i=0;i<nodes.length;i++){ n += (nodes[i].textContent || '').length; }
        return n;
      }catch(_){ return 0; }
    }

    // Action buttons: Continue/Retry/Erase/Send/Submit/Generate/Edit/Undo/Redo
    document.addEventListener('click', function(ev){
      try{
        var el = ev.target && ev.target.closest ? ev.target.closest('button,[role="button"],a,.is_Button,.btn') : null;
        if (!el) return;
        var label = (el.getAttribute('aria-label') || el.textContent || '').toLowerCase();
        var isRetryNumber = false;
        try{
          var row = el.closest && el.closest('div.is_Row');
          if (row && row.querySelector && row.querySelector('div.is_Button')) isRetryNumber = true;
        }catch(_){ }
        if (!/continue|take a turn|retry|erase|send|submit|generate|edit|undo|redo|select/.test(label) && !isRetryNumber) return;

        var c0 = _aidt_countOutputs();
        var t0 = _aidt_totalText();
        var ran = false;
        try{ window.__AIDT_PAUSE__ = true; }catch(_){ }
        function _try(){
          var c = _aidt_countOutputs();
          var t = _aidt_totalText();
          // Trigger when output count changes OR total text changes in any direction
          if (c !== c0 || t !== t0){
            if (!ran){
              ran = true;
              try{ window.__AIDT_PAUSE__ = false; }catch(_){ }
              _aidt_call('reparse');
              _aidt_call('reapply');
              try{ if (window.__AIDT_CORE__ && typeof window.__AIDT_CORE__.ensure==='function') window.__AIDT_CORE__.ensure(); }catch(_){}
              try{ [120,300,600,1000,1600,2500].forEach(function(ms){ setTimeout(function(){ if (window.__AIDT_CORE__ && typeof window.__AIDT_CORE__.ensure==='function') window.__AIDT_CORE__.ensure(); }, ms); }); }catch(_){}
            }
          }
        }
        [80,160,300,600,1000,1600,2500].forEach(function(ms){
          setTimeout(_try, ms);
        });
        setTimeout(function(){
          if (!ran){
            try{ window.__AIDT_PAUSE__ = false; }catch(_){ }
            _aidt_call('reparse');
            _aidt_call('reapply');
            try{ if (window.__AIDT_CORE__ && typeof window.__AIDT_CORE__.ensure==='function') window.__AIDT_CORE__.ensure(); }catch(_){}
            try{ [120,300,600,1000,1600,2500].forEach(function(ms){ setTimeout(function(){ if (window.__AIDT_CORE__ && typeof window.__AIDT_CORE__.ensure==='function') window.__AIDT_CORE__.ensure(); }, ms); }); }catch(_){}
          }
        }, 8000);
        setTimeout(function(){ try{ window.__AIDT_PAUSE__ = false; }catch(_){ } }, 2000);
      }catch(_){}
    }, true);

    // When leaving an editor or pressing Enter inside it, re-run
    document.addEventListener('focusout', function(e){
      try{
        if (e.target && e.target.closest && e.target.closest('[contenteditable="true"], textarea, input')){
          setTimeout(function(){ _aidt_call('reparse'); _aidt_call('reapply'); }, 60);
        }
      }catch(_){}
    }, true);
    document.addEventListener('keydown', function(e){
      try{
        if ((e.key === 'Enter' || e.keyCode === 13) && e.target && e.target.closest && e.target.closest('[contenteditable="true"], textarea')){
          setTimeout(function(){ _aidt_call('reparse'); _aidt_call('reapply'); }, 60);
        }
      }catch(_){}
    }, true);
  }catch(_){}
})();
/* ==== end AIDT robust handling ==== */

// Baseline text storage for reversible paragraph formatting
function getBaselineTextFor(el, current){
  try{
    if (!el) return current||'';
    const attr = el.getAttribute && el.getAttribute('data-aidt-base-text');
    if (attr != null) return String(attr);
    const text = String(current||'');
    try{ if (el.setAttribute) el.setAttribute('data-aidt-base-text', text); }catch(_){ }
    return text;
  }catch(_){ return String(current||''); }
}