/* =========================================
   Editor – CodeMirror multi-tab manager
   ========================================= */

const Editor = (() => {
  let cm = null;
  let tabs = [];       // { id, filePath, lang, dirty, htmlCode, cssCode, jsCode }
  let activeId = null;
  let autoPreviewTimer = null;
  let settings = {
    fontSize: 14, lineNumbers: true, wordWrap: false,
    autoPreview: true, tabSize: 4
  };

  function genId() { return '_t' + Date.now() + Math.random().toString(36).slice(2,6); }

  // ── Init CodeMirror ──
  function initCM() {
    const container = document.getElementById('editorContainer');
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
      gutters: ['CodeMirror-linenumber','CodeMirror-foldgutter'],
      styleActiveLine: true,
      extraKeys: {
        'Tab': cm => {
          if (cm.somethingSelected()) cm.indentSelection('add');
          else cm.replaceSelection(' '.repeat(settings.tabSize), 'end');
        },
        'Shift-Tab': cm => cm.indentSelection('subtract'),
        'Ctrl-/': cm => cm.toggleComment(),
        'Cmd-/':  cm => cm.toggleComment(),
        'Ctrl-S': () => saveActive(),
        'Cmd-S':  () => saveActive(),
        'Ctrl-Enter': () => Preview.run(),
        'Cmd-Enter':  () => Preview.run(),
      },
    });
    cm.setSize('100%', '100%');

    // Font size
    cm.getWrapperElement().style.fontSize = settings.fontSize + 'px';

    // Dirty tracking
    cm.on('change', () => {
      const tab = getActiveTab();
      if (!tab) return;
      // Store in correct lang slot
      const lang = document.querySelector('.lang-tab.active')?.dataset.lang || 'html';
      if (lang === 'html') tab.htmlCode = cm.getValue();
      else if (lang === 'css') tab.cssCode = cm.getValue();
      else if (lang === 'js') tab.jsCode = cm.getValue();

      if (!tab.dirty) {
        tab.dirty = true;
        renderTabBar();
        document.getElementById('dirtyDot').classList.remove('hidden');
      }
      scheduleAutoPreview();
    });
  }

  function getActiveTab() { return tabs.find(t => t.id === activeId) || null; }

  function getLangContent(tab, lang) {
    if (lang === 'html') return tab.htmlCode || '';
    if (lang === 'css')  return tab.cssCode  || '';
    if (lang === 'js')   return tab.jsCode   || '';
    return '';
  }

  // ── Lang tabs ──
  function switchLang(lang) {
    document.querySelectorAll('.lang-tab').forEach(b => b.classList.toggle('active', b.dataset.lang === lang));
    const tab = getActiveTab();
    if (!tab) return;
    const content = getLangContent(tab, lang);
    const mode = lang === 'html' ? 'htmlmixed' : lang === 'css' ? 'css' : 'javascript';
    cm.setOption('mode', mode);
    cm.setValue(content);
    cm.clearHistory();
  }

  function currentLang() {
    return document.querySelector('.lang-tab.active')?.dataset.lang || 'html';
  }

  // ── Tab management ──
  async function newTab(filePath = null) {
    const id = genId();
    let tab;
    if (filePath) {
      // Single file tab (e.g. CSS-only, JS-only)
      const content = await FileSystem.readFile(filePath) || '';
      const lang = FileSystem.modeForFile(filePath);
      tab = { id, filePath, lang, dirty: false,
              htmlCode: '', cssCode: '', jsCode: '',
              singleFile: true, singleContent: content };
    } else {
      // HTML/CSS/JS bundle tab
      const html = await FileSystem.readFile('/index.html') || defaultHTML;
      const css  = await FileSystem.readFile('/style.css')  || defaultCSS;
      const js   = await FileSystem.readFile('/script.js')  || defaultJS;
      tab = { id, filePath: null, dirty: false,
              htmlCode: html, cssCode: css, jsCode: js };
    }
    tabs.push(tab);
    setActive(id);
    return id;
  }

  function closeTab(id) {
    const idx = tabs.findIndex(t => t.id === id);
    if (idx < 0) return;
    tabs.splice(idx, 1);
    if (activeId === id) {
      activeId = tabs[Math.max(0, idx - 1)]?.id || null;
      if (!activeId && tabs.length === 0) newTab();
      else if (activeId) loadTab(activeId);
    }
    renderTabBar();
  }

  function setActive(id) {
    activeId = id;
    loadTab(id);
    renderTabBar();
  }

  function loadTab(id) {
    const tab = tabs.find(t => t.id === id);
    if (!tab) return;

    const lang = currentLang();
    const content = tab.singleFile ? tab.singleContent : getLangContent(tab, lang);
    const mode = tab.singleFile
      ? (FileSystem.modeForFile(tab.filePath || '') || 'null')
      : (lang === 'html' ? 'htmlmixed' : lang === 'css' ? 'css' : 'javascript');

    cm.setOption('mode', mode);
    cm.setValue(content);
    cm.clearHistory();

    // Update topbar
    const name = tab.filePath
      ? tab.filePath.split('/').pop()
      : 'Proyek';
    document.getElementById('currentFileName').textContent = name;
    document.getElementById('dirtyDot').classList.toggle('hidden', !tab.dirty);

    // Show/hide lang tabs
    const langTabs = document.getElementById('langTabs');
    langTabs.style.display = tab.singleFile ? 'none' : '';

    scheduleAutoPreview();
  }

  // ── Render tab bar ──
  function renderTabBar() {
    const bar = document.getElementById('tabBar');
    // Remove old tabs (keep + button)
    bar.querySelectorAll('.tab-item').forEach(el => el.remove());

    const newBtn = document.getElementById('btnNewTab');
    tabs.forEach(tab => {
      const el = document.createElement('div');
      el.className = 'tab-item' + (tab.id === activeId ? ' active' : '');
      const name = tab.filePath ? tab.filePath.split('/').pop() : 'Proyek';
      el.innerHTML = `
        <span class="tab-name">${escHtml(name)}${tab.dirty ? ' ●' : ''}</span>
        <button class="tab-close" data-id="${tab.id}">×</button>`;
      el.addEventListener('click', e => {
        if (!e.target.classList.contains('tab-close')) setActive(tab.id);
      });
      el.querySelector('.tab-close').addEventListener('click', e => {
        e.stopPropagation();
        if (tab.dirty && !confirm('Ada perubahan yang belum disimpan. Tutup tab?')) return;
        closeTab(tab.id);
      });
      bar.insertBefore(el, newBtn);
    });
  }

  // ── Save ──
  async function saveActive() {
    const tab = getActiveTab();
    if (!tab) return;
    if (tab.singleFile) {
      await FileSystem.writeFile(tab.filePath, cm.getValue());
    } else {
      // Save all three
      await FileSystem.writeFile('/index.html', tab.htmlCode);
      await FileSystem.writeFile('/style.css',  tab.cssCode);
      await FileSystem.writeFile('/script.js',  tab.jsCode);
    }
    tab.dirty = false;
    renderTabBar();
    document.getElementById('dirtyDot').classList.add('hidden');
    ConsoleLog.system('💾 Tersimpan');
  }

  // ── Auto preview ──
  function scheduleAutoPreview() {
    if (!settings.autoPreview) return;
    clearTimeout(autoPreviewTimer);
    autoPreviewTimer = setTimeout(() => Preview.run(), 800);
  }

  // ── Build combined HTML for preview ──
  function buildPreviewHTML() {
    const tab = getActiveTab();
    if (!tab) return '<html><body></body></html>';
    if (tab.singleFile) {
      const ext = (tab.filePath || '').split('.').pop().toLowerCase();
      if (ext === 'css')  return `<html><head><style>${tab.singleContent}</style></head><body></body></html>`;
      if (ext === 'js')   return `<html><body><script>${tab.singleContent}<\/script></body></html>`;
      return tab.singleContent;
    }
    const html = tab.htmlCode || '';
    const css  = tab.cssCode  || '';
    const js   = tab.jsCode   || '';

    // Inline CSS and JS if paths match defaults
    let out = html;
    // Inject CSS
    if (out.includes('<link') || out.includes('style.css')) {
      out = out.replace(/<link[^>]+style\.css[^>]*>/i, `<style>${css}</style>`);
    }
    if (!out.includes('<style')) {
      out = out.replace('</head>', `<style>${css}</style></head>`);
    }
    // Inject JS
    if (out.includes('<script src="script.js"')) {
      out = out.replace(/<script src="script\.js"><\/script>/i, `<script>${js}<\/script>`);
    } else if (!out.includes('<script')) {
      out = out.replace('</body>', `<script>${js}<\/script></body>`);
    }
    return out;
  }

  // ── Quick toolbar ──
  function insertAtCursor(text) {
    cm.replaceSelection(text);
    cm.focus();
  }

  // ── Settings ──
  function applySettings(s) {
    settings = { ...settings, ...s };
    cm.setOption('lineNumbers', settings.lineNumbers);
    cm.setOption('lineWrapping', settings.wordWrap);
    cm.setOption('tabSize', settings.tabSize);
    cm.setOption('indentUnit', settings.tabSize);
    cm.getWrapperElement().style.fontSize = settings.fontSize + 'px';
    document.getElementById('szVal').textContent = settings.fontSize;
    document.getElementById('togLineNum').checked = settings.lineNumbers;
    document.getElementById('togWrap').checked = settings.wordWrap;
    document.getElementById('togAutoPreview').checked = settings.autoPreview;
    document.getElementById('selTabSize').value = String(settings.tabSize);
  }

  async function loadSettings() {
    const s = await Storage.getAllSettings();
    const loaded = {
      fontSize:    s.fontSize    ?? 14,
      lineNumbers: s.lineNumbers ?? true,
      wordWrap:    s.wordWrap    ?? false,
      autoPreview: s.autoPreview ?? true,
      tabSize:     s.tabSize     ?? 4,
    };
    applySettings(loaded);
  }

  async function persistSetting(key, val) {
    settings[key] = val;
    await Storage.setSetting(key, val);
  }

  function getSettings() { return settings; }
  function getCM() { return cm; }
  function getTabs() { return tabs; }
  function getActive() { return getActiveTab(); }

  return {
    init: async () => {
      initCM();
      await loadSettings();
    },
    newTab, closeTab, setActive, renderTabBar, loadTab,
    saveActive, buildPreviewHTML, insertAtCursor,
    switchLang, currentLang, getLangContent,
    applySettings, loadSettings, persistSetting, getSettings,
    getCM, getTabs, getActive,
  };
})();

function escHtml(str) {
  return String(str).replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// defaultHTML, defaultCSS, defaultJS didefinisikan di files.js
