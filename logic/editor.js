/* =========================================
   Editor – CodeMirror multi-tab manager
   ========================================= */

var Editor = (function() {
  var cm = null;
  var tabs = [];
  var activeId = null;
  var autoPreviewTimer = null;
  var settings = {
    fontSize: 14, lineNumbers: true, wordWrap: false,
    autoPreview: true, tabSize: 2
  };

  function genId() { return '_t' + Date.now() + Math.random().toString(36).slice(2,6); }

  function initCM() {
    var container = document.getElementById('editorContainer');
    cm = CodeMirror(container, {
      value: '',
      theme: 'monokai',
      mode: 'htmlmixed',
      lineNumbers: settings.lineNumbers,
      lineWrapping: settings.wordWrap,
      tabSize: settings.tabSize,
      indentUnit: settings.tabSize,
      indentWithTabs: false,
      autoCloseBrackets: true,
      autoCloseTags: true,
      matchBrackets: true,
      foldGutter: true,
      gutters: ['CodeMirror-linenumber', 'CodeMirror-foldgutter'],
      styleActiveLine: true,
      extraKeys: {
        'Tab': function(cm) {
          if (cm.somethingSelected()) cm.indentSelection('add');
          else cm.replaceSelection(' '.repeat(settings.tabSize), 'end');
        },
        'Shift-Tab': function(cm) { cm.indentSelection('subtract'); },
        'Ctrl-/': function(cm) { cm.toggleComment(); },
        'Ctrl-S': function() { saveActive(); },
        'Ctrl-Enter': function() { Preview.run(); },
      }
    });
    cm.setSize('100%', '100%');
    cm.getWrapperElement().style.fontSize = settings.fontSize + 'px';

    cm.on('change', function() {
      var tab = getActiveTab();
      if (!tab) return;
      var lang = currentLang();
      if (lang === 'html') tab.htmlCode = cm.getValue();
      else if (lang === 'css') tab.cssCode = cm.getValue();
      else if (lang === 'js') tab.jsCode = cm.getValue();
      else if (tab.singleFile) tab.singleContent = cm.getValue();

      if (!tab.dirty) {
        tab.dirty = true;
        renderTabBar();
        var dot = document.getElementById('dirtyDot');
        if (dot) dot.classList.remove('hidden');
      }
      scheduleAutoPreview();
    });
  }

  function getActiveTab() {
    for (var i = 0; i < tabs.length; i++) {
      if (tabs[i].id === activeId) return tabs[i];
    }
    return null;
  }

  function getLangContent(tab, lang) {
    if (lang === 'html') return tab.htmlCode || '';
    if (lang === 'css')  return tab.cssCode  || '';
    if (lang === 'js')   return tab.jsCode   || '';
    return '';
  }

  function currentLang() {
    var active = document.querySelector('.lang-tab.active');
    return active ? active.dataset.lang : 'html';
  }

  function switchLang(lang) {
    document.querySelectorAll('.lang-tab').forEach(function(b) {
      b.classList.toggle('active', b.dataset.lang === lang);
    });
    var tab = getActiveTab();
    if (!tab) return;
    var content = tab.singleFile ? tab.singleContent : getLangContent(tab, lang);
    var mode = lang === 'html' ? 'htmlmixed' : lang === 'css' ? 'css' : 'javascript';
    cm.setOption('mode', mode);
    cm.setValue(content || '');
    cm.clearHistory();
  }

  function modeForFile(name) {
    var ext = (name.split('.').pop() || '').toLowerCase();
    if (ext === 'html' || ext === 'htm') return 'htmlmixed';
    if (ext === 'css') return 'css';
    if (ext === 'js' || ext === 'mjs') return 'javascript';
    if (ext === 'json') return 'javascript';
    if (ext === 'xml' || ext === 'svg') return 'xml';
    return 'null';
  }

  async function newTab(filePath) {
    var id = genId();
    var tab;
    if (filePath) {
      var content = await FileSystem.readFile(filePath) || '';
      tab = { id: id, filePath: filePath, dirty: false,
              singleFile: true, singleContent: content,
              htmlCode: '', cssCode: '', jsCode: '' };
    } else {
      var html = await FileSystem.readFile('/index.html') || '';
      var css  = await FileSystem.readFile('/style.css')  || '';
      var js   = await FileSystem.readFile('/script.js')  || '';
      tab = { id: id, filePath: null, dirty: false, singleFile: false,
              htmlCode: html, cssCode: css, jsCode: js };
    }
    tabs.push(tab);
    setActive(id);
    return id;
  }

  function closeTab(id) {
    var idx = tabs.findIndex(function(t) { return t.id === id; });
    if (idx < 0) return;
    tabs.splice(idx, 1);
    if (activeId === id) {
      activeId = null;
      if (tabs.length === 0) { newTab(); return; }
      activeId = tabs[Math.max(0, idx - 1)].id;
      loadTab(activeId);
    }
    renderTabBar();
  }

  function setActive(id) {
    activeId = id;
    loadTab(id);
    renderTabBar();
  }

  function loadTab(id) {
    var tab = null;
    for (var i = 0; i < tabs.length; i++) { if (tabs[i].id === id) { tab = tabs[i]; break; } }
    if (!tab) return;

    var lang = currentLang();
    var content, mode;
    if (tab.singleFile) {
      content = tab.singleContent || '';
      mode = modeForFile(tab.filePath || '');
    } else {
      content = getLangContent(tab, lang);
      mode = lang === 'html' ? 'htmlmixed' : lang === 'css' ? 'css' : 'javascript';
    }

    cm.setOption('mode', mode);
    cm.setValue(content);
    cm.clearHistory();

    var name = tab.filePath ? tab.filePath.split('/').pop() : 'Proyek';
    var fnEl = document.getElementById('currentFileName');
    if (fnEl) fnEl.textContent = name;
    var dot = document.getElementById('dirtyDot');
    if (dot) dot.classList.toggle('hidden', !tab.dirty);

    var langTabs = document.getElementById('langTabs');
    if (langTabs) langTabs.style.display = tab.singleFile ? 'none' : '';

    scheduleAutoPreview();
  }

  function renderTabBar() {
    var bar = document.getElementById('tabBar');
    if (!bar) return;
    bar.querySelectorAll('.tab-item').forEach(function(el) { el.remove(); });
    var newBtn = document.getElementById('btnNewTab');

    tabs.forEach(function(tab) {
      var el = document.createElement('div');
      el.className = 'tab-item' + (tab.id === activeId ? ' active' : '');
      var name = tab.filePath ? tab.filePath.split('/').pop() : 'Proyek';
      el.innerHTML =
        '<span class="tab-name">' + escHtml(name) + (tab.dirty ? ' ●' : '') + '</span>' +
        '<button class="tab-close" data-id="' + tab.id + '">×</button>';

      el.addEventListener('click', function(e) {
        if (!e.target.classList.contains('tab-close')) setActive(tab.id);
      });
      el.querySelector('.tab-close').addEventListener('click', function(e) {
        e.stopPropagation();
        if (tab.dirty && !confirm('Perubahan belum disimpan. Tutup tab?')) return;
        closeTab(tab.id);
      });
      bar.insertBefore(el, newBtn);
    });
  }

  async function saveActive() {
    var tab = getActiveTab();
    if (!tab) return;
    if (tab.singleFile) {
      await FileSystem.writeFile(tab.filePath, cm.getValue());
    } else {
      await FileSystem.writeFile('/index.html', tab.htmlCode || '');
      await FileSystem.writeFile('/style.css',  tab.cssCode  || '');
      await FileSystem.writeFile('/script.js',  tab.jsCode   || '');
    }
    tab.dirty = false;
    renderTabBar();
    var dot = document.getElementById('dirtyDot');
    if (dot) dot.classList.add('hidden');
    ConsoleLog.system('💾 Tersimpan');
  }

  function scheduleAutoPreview() {
    if (!settings.autoPreview) return;
    clearTimeout(autoPreviewTimer);
    autoPreviewTimer = setTimeout(function() { Preview.run(); }, 900);
  }

  function buildPreviewHTML() {
    var tab = getActiveTab();
    if (!tab) return '<html><body><p>Tidak ada konten</p></body></html>';

    if (tab.singleFile) {
      var ext = (tab.filePath || '').split('.').pop().toLowerCase();
      if (ext === 'css') return '<html><head><style>' + (tab.singleContent||'') + '</style></head><body></body></html>';
      if (ext === 'js')  return '<html><body><script>' + (tab.singleContent||'') + '<\/script></body></html>';
      return tab.singleContent || '';
    }

    var html = tab.htmlCode || '';
    var css  = tab.cssCode  || '';
    var js   = tab.jsCode   || '';

    // Inject CSS
    if (html.match(/<link[^>]+style\.css[^>]*>/i)) {
      html = html.replace(/<link[^>]+style\.css[^>]*>/i, '<style>' + css + '</style>');
    } else if (html.indexOf('</head>') !== -1) {
      html = html.replace('</head>', '<style>' + css + '</style></head>');
    } else {
      html = '<style>' + css + '</style>' + html;
    }

    // Inject JS
    if (html.match(/<script src=["']script\.js["']><\/script>/i)) {
      html = html.replace(/<script src=["']script\.js["']><\/script>/i, '<script>' + js + '<\/script>');
    } else if (html.indexOf('</body>') !== -1) {
      html = html.replace('</body>', '<script>' + js + '<\/script></body>');
    } else {
      html = html + '<script>' + js + '<\/script>';
    }

    return html;
  }

  function insertAtCursor(text) {
    if (!cm) return;
    cm.replaceSelection(text);
    cm.focus();
  }

  function applySettings(s) {
    settings = Object.assign({}, settings, s);
    if (!cm) return;
    cm.setOption('lineNumbers', settings.lineNumbers);
    cm.setOption('lineWrapping', settings.wordWrap);
    cm.setOption('tabSize', settings.tabSize);
    cm.setOption('indentUnit', settings.tabSize);
    cm.getWrapperElement().style.fontSize = settings.fontSize + 'px';

    var szVal = document.getElementById('szVal');
    if (szVal) szVal.textContent = settings.fontSize;
    var togLN = document.getElementById('togLineNum');
    if (togLN) togLN.checked = settings.lineNumbers;
    var togW = document.getElementById('togWrap');
    if (togW) togW.checked = settings.wordWrap;
    var togAP = document.getElementById('togAutoPreview');
    if (togAP) togAP.checked = settings.autoPreview;
    var selTS = document.getElementById('selTabSize');
    if (selTS) selTS.value = String(settings.tabSize);
  }

  async function loadSettings() {
    var s = await Storage.getAllSettings();
    applySettings({
      fontSize:    s.fontSize    !== undefined ? s.fontSize    : 14,
      lineNumbers: s.lineNumbers !== undefined ? s.lineNumbers : true,
      wordWrap:    s.wordWrap    !== undefined ? s.wordWrap    : false,
      autoPreview: s.autoPreview !== undefined ? s.autoPreview : true,
      tabSize:     s.tabSize     !== undefined ? s.tabSize     : 2,
    });
  }

  async function persistSetting(key, val) {
    settings[key] = val;
    await Storage.setSetting(key, val);
  }

  return {
    init: async function() {
      initCM();
      await loadSettings();
    },
    newTab: newTab,
    closeTab: closeTab,
    setActive: setActive,
    renderTabBar: renderTabBar,
    loadTab: loadTab,
    saveActive: saveActive,
    buildPreviewHTML: buildPreviewHTML,
    insertAtCursor: insertAtCursor,
    switchLang: switchLang,
    currentLang: currentLang,
    getLangContent: getLangContent,
    applySettings: applySettings,
    loadSettings: loadSettings,
    persistSetting: persistSetting,
    getSettings: function() { return settings; },
    getCM: function() { return cm; },
    getTabs: function() { return tabs; },
    getActive: getActiveTab,
  };
})();
