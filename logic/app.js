/* =========================================
   App – Main orchestrator
   ========================================= */

// ── Error overlay (tampil jika crash) ──
window.onerror = function(msg, src, line, col, err) {
  showFatalError((err ? err.stack : msg) || msg);
};
window.onunhandledrejection = function(e) {
  showFatalError(String(e.reason?.stack || e.reason || 'Unknown promise error'));
};
function showFatalError(msg) {
  document.getElementById('splash').innerHTML =
    '<div style="padding:24px;color:#f92672;font-family:monospace;font-size:13px;background:#1e1f1c;position:fixed;inset:0;overflow:auto;white-space:pre-wrap;z-index:99999">' +
    '<b style="color:#a6e22e">❌ ERROR — kirim screenshot ini ke developer</b>\n\n' +
    escHtml(msg) + '</div>';
  document.getElementById('splash').style.opacity = '1';
  document.getElementById('splash').style.animation = 'none';
  document.getElementById('splash').style.display = 'flex';
}

function escHtml(str) {
  return String(str).replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ── Boot ──────────────────────────────────
async function bootApp() {
  await FileSystem.load();
  await Editor.init();

  // Hide splash
  var splash = document.getElementById('splash');
  if (splash) {
    splash.style.transition = 'opacity 0.3s';
    splash.style.opacity = '0';
    setTimeout(function() { if (splash.parentNode) splash.remove(); }, 400);
  }

  // Kalau tidak ada file → welcome screen
  if (FileSystem.isEmpty()) {
    showWelcome();
  } else {
    await enterApp();
  }

  FileSystem.onChange(renderSidebar);

  // ── Top bar buttons ───────────────────────
  document.getElementById('btnSidebar').addEventListener('click', openSidebar);
  document.getElementById('btnRun').addEventListener('click', () => Preview.run());
  document.getElementById('btnSave').addEventListener('click', () => Editor.saveActive());
  document.getElementById('btnMore').addEventListener('click', e => {
    e.stopPropagation();
    showCtxMenu('moreMenu', e.clientX, e.clientY);
  });

  // ── Tab bar ───────────────────────────────
  document.getElementById('btnNewTab').addEventListener('click', () => Editor.newTab());

  // ── Lang tabs ─────────────────────────────
  document.querySelectorAll('.lang-tab').forEach(btn => {
    btn.addEventListener('click', () => Editor.switchLang(btn.dataset.lang));
  });

  // ── Preview ───────────────────────────────
  document.getElementById('btnRefreshPreview').addEventListener('click', () => Preview.refresh());
  document.getElementById('btnFullPreview').addEventListener('click', toggleFullPreview);

  // ── Console ───────────────────────────────
  document.getElementById('btnClearConsole').addEventListener('click', () => ConsoleLog.clear());
  document.getElementById('btnToggleConsole').addEventListener('click', () => {
    document.getElementById('consoleArea').classList.toggle('collapsed');
  });
  const consoleInput = document.getElementById('consoleInput');
  consoleInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const expr = consoleInput.value.trim();
      if (!expr) return;
      ConsoleLog.append('log', '> ' + expr);
      ConsoleLog.evalInFrame(expr);
      consoleInput.value = '';
    }
  });

  // ── Quick toolbar ────────────────────────
  document.querySelectorAll('.qtbtn[data-insert]').forEach(btn => {
    btn.addEventListener('click', () => Editor.insertAtCursor(btn.dataset.insert));
  });
  document.getElementById('qtUndo').addEventListener('click', () => {
    Editor.getCM().undo(); Editor.getCM().focus();
  });
  document.getElementById('qtRedo').addEventListener('click', () => {
    Editor.getCM().redo(); Editor.getCM().focus();
  });

  // ── Bottom nav ────────────────────────────
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  // ── Sidebar actions ───────────────────────
  document.getElementById('btnNewFile').addEventListener('click', async () => {
    const name = await showModal('Nama file baru', 'file.html');
    if (!name) return;
    try { await FileSystem.createFile(name); }
    catch (e) { alert(e.message); }
  });

  document.getElementById('btnNewFolder').addEventListener('click', async () => {
    const name = await showModal('Nama folder baru', 'folder');
    if (!name) return;
    try { await FileSystem.createFolder(name); }
    catch (e) { alert(e.message); }
  });

  document.getElementById('btnImportFile').addEventListener('click', function() {
    document.getElementById('fileInput').click();
  });

  document.getElementById('btnImportFolder').addEventListener('click', function() {
    document.getElementById('folderInput').click();
  });

  document.getElementById('btnExportFile').addEventListener('click', downloadActive);
  document.getElementById('fileInput').addEventListener('change', handleFileImport);
  document.getElementById('folderInput').addEventListener('change', handleFolderImport);

  // ── Context menu ─────────────────────────
  let ctxTarget = null;

  document.getElementById('ctxRename').addEventListener('click', async () => {
    hideCtxMenu('ctxMenu');
    if (!_ctxTarget) return;
    const node = findInTree(_ctxTarget);
    const newName = await showModal('Rename', node?.name || '');
    if (!newName || newName === node?.name) return;
    try {
      const newPath = await FileSystem.renameNode(_ctxTarget, newName);
      Editor.getTabs().forEach(function(t) { if (t.filePath === _ctxTarget) t.filePath = newPath; });
      Editor.renderTabBar();
    } catch (e) { alert(e.message); }
  });

  document.getElementById('ctxDelete').addEventListener('click', async () => {
    hideCtxMenu('ctxMenu');
    if (!_ctxTarget) return;
    if (!confirm('Hapus "' + _ctxTarget + '"?')) return;
    const deleted = await FileSystem.deleteNode(_ctxTarget);
    (deleted || []).forEach(p => {
      const tab = Editor.getTabs().find(t => t.filePath === p);
      if (tab) Editor.closeTab(tab.id);
    });
  });

  document.getElementById('ctxDownload').addEventListener('click', async () => {
    hideCtxMenu('ctxMenu');
    if (!_ctxTarget) return;
    const content = await FileSystem.readFile(_ctxTarget);
    if (content === null) return;
    downloadBlob((_ctxTarget||'').split('/').pop(), content, FileSystem.getMimeForExt(_ctxTarget));
  });

  // ── More menu ─────────────────────────────
  document.getElementById('menuFormat').addEventListener('click', () => {
    hideCtxMenu('moreMenu'); formatCode();
  });
  document.getElementById('menuDuplicate').addEventListener('click', () => {
    hideCtxMenu('moreMenu');
    const active = Editor.getActive();
    if (active) Editor.newTab(active.filePath);
  });
  document.getElementById('menuDownload').addEventListener('click', () => {
    hideCtxMenu('moreMenu'); downloadActive();
  });
  document.getElementById('menuImport').addEventListener('click', () => {
    hideCtxMenu('moreMenu');
    document.getElementById('fileInput').click();
  });
  document.getElementById('menuSettings').addEventListener('click', () => {
    hideCtxMenu('moreMenu'); openSettings();
  });

  // ── Settings ──────────────────────────────
  document.getElementById('szUp').addEventListener('click', async () => {
    const s = Editor.getSettings();
    const sz = Math.min(s.fontSize + 1, 24);
    await Editor.persistSetting('fontSize', sz);
    Editor.applySettings({ fontSize: sz });
  });
  document.getElementById('szDown').addEventListener('click', async () => {
    const s = Editor.getSettings();
    const sz = Math.max(s.fontSize - 1, 10);
    await Editor.persistSetting('fontSize', sz);
    Editor.applySettings({ fontSize: sz });
  });
  document.getElementById('togLineNum').addEventListener('change', async e => {
    await Editor.persistSetting('lineNumbers', e.target.checked);
    Editor.applySettings({ lineNumbers: e.target.checked });
  });
  document.getElementById('togWrap').addEventListener('change', async e => {
    await Editor.persistSetting('wordWrap', e.target.checked);
    Editor.applySettings({ wordWrap: e.target.checked });
  });
  document.getElementById('togAutoPreview').addEventListener('change', async e => {
    await Editor.persistSetting('autoPreview', e.target.checked);
    Editor.applySettings({ autoPreview: e.target.checked });
  });
  document.getElementById('selTabSize').addEventListener('change', async e => {
    const sz = parseInt(e.target.value, 10);
    await Editor.persistSetting('tabSize', sz);
    Editor.applySettings({ tabSize: sz });
  });
  document.getElementById('settingsClose').addEventListener('click', closeSettings);
  document.getElementById('settingsOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('settingsOverlay')) closeSettings();
  });

  // ── Close menus on outside click ──────────
  document.addEventListener('click', e => {
    if (!e.target.closest('#ctxMenu'))  hideCtxMenu('ctxMenu');
    if (!e.target.closest('#moreMenu') && !e.target.closest('#btnMore')) hideCtxMenu('moreMenu');
  });

  document.getElementById('btnCloseSidebar').addEventListener('click', closeSidebar);
  document.getElementById('sidebarOverlay').addEventListener('click', closeSidebar);

  // ── Keyboard shortcuts ────────────────────
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); Editor.saveActive(); }
    if (e.key === 'Escape') { closeSidebar(); hideCtxMenu('ctxMenu'); hideCtxMenu('moreMenu'); }
  });

  initDividerDrag();
}

// ===========================================
// WELCOME SCREEN
// ===========================================

function showWelcome() {
  var w = document.getElementById('welcome');
  var app = document.getElementById('app');
  if (w) w.classList.remove('hidden');
  if (app) app.style.display = 'none';
}

function hideWelcome() {
  var w = document.getElementById('welcome');
  if (w) {
    w.style.transition = 'opacity 0.2s';
    w.style.opacity = '0';
    setTimeout(function() { w.classList.add('hidden'); w.style.opacity = ''; }, 220);
  }
}

async function enterApp() {
  hideWelcome();
  var app = document.getElementById('app');
  if (app) app.style.display = 'flex';
  if (Editor.getTabs().length === 0) {
    await Editor.newTab();
  }
  renderSidebar();
}

// Welcome button handlers
document.getElementById('wlcNewProject').addEventListener('click', async function() {
  // Buat proyek baru kosong
  await FileSystem.createFile('index.html');
  await FileSystem.createFile('style.css');
  await FileSystem.createFile('script.js');
  await FileSystem.writeFile('/index.html', DEFAULT_HTML);
  await FileSystem.writeFile('/style.css',  DEFAULT_CSS);
  await FileSystem.writeFile('/script.js',  DEFAULT_JS);
  await enterApp();
  Preview.run();
  ConsoleLog.system('🚀 Proyek baru dibuat!');
});

document.getElementById('wlcOpenFile').addEventListener('click', function() {
  document.getElementById('fileInput').click();
});

document.getElementById('wlcOpenFolder').addEventListener('click', function() {
  document.getElementById('folderInput').click();
});

// ===========================================
// HELPER FUNCTIONS
// ===========================================

function switchView(view) {
  document.querySelectorAll('.nav-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.view === view));
  const main = document.querySelector('.main-area');
  main.className = 'main-area view-' + view;
  if (view === 'files') { openSidebar(); return; }
  if (view === 'console') {
    document.getElementById('consoleArea').classList.remove('collapsed');
    setTimeout(() => document.getElementById('consoleInput').focus(), 100);
  }
}

function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebarOverlay').classList.add('open');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('open');
}

function renderSidebar() {
  const tree = document.getElementById('sidebarTree');
  tree.innerHTML = '';
  renderNodes(FileSystem.getTree(), tree);
}

function renderNodes(nodes, container) {
  nodes.forEach(function(node) {
    if (node.type === 'folder') {
      const wrap = document.createElement('div');
      const header = document.createElement('div');
      header.className = 'tree-folder';
      header.dataset.path = node.path;
      header.innerHTML =
        '<span class="tree-icon">' + (node.open ? '📂' : '📁') + '</span>' +
        '<span class="tree-name">' + escHtml(node.name) + '</span>' +
        '<span class="tree-folder-toggle">' + (node.open ? '▾' : '▸') + '</span>';
      const children = document.createElement('div');
      children.className = 'tree-children';
      if (!node.open) children.style.display = 'none';
      header.addEventListener('click', function() {
        node.open = !node.open;
        renderSidebar();
      });
      header.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        __ctxTarget = node.path;
        showCtxMenu('ctxMenu', e.clientX, e.clientY);
      });
      if (node.children) renderNodes(node.children, children);
      wrap.appendChild(header);
      wrap.appendChild(children);
      container.appendChild(wrap);
    } else {
      const el = document.createElement('div');
      el.className = 'tree-file';
      el.dataset.path = node.path;
      const ext = node.name.split('.').pop().toLowerCase();
      const icons = { html:'🌐', htm:'🌐', css:'🎨', js:'⚡', json:'📋', md:'📝', txt:'📄', svg:'🖼', xml:'📰' };
      const icon = icons[ext] || '📄';
      el.innerHTML = '<span class="tree-icon">' + icon + '</span><span class="tree-name">' + escHtml(node.name) + '</span>';
      el.addEventListener('click', function() {
        openFileTab(node.path);
        closeSidebar();
      });
      el.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        __ctxTarget = node.path;
        showCtxMenu('ctxMenu', e.clientX, e.clientY);
      });
      container.appendChild(el);
    }
  });
}

// shared ctxTarget (closure workaround)
var _ctxTarget = null;
// patch ctxTarget references in event listeners above to use _ctxTarget
document.addEventListener('DOMContentLoaded', function() {
  document.getElementById('ctxRename') && (document.getElementById('ctxRename')._useGlobal = true);
});

async function openFileTab(filePath) {
  const existing = Editor.getTabs().find(t => t.filePath === filePath);
  if (existing) { Editor.setActive(existing.id); return; }
  await Editor.newTab(filePath);
}

function showCtxMenu(id, x, y) {
  const menu = document.getElementById(id);
  if (!menu) return;
  menu.classList.remove('hidden');
  const vw = window.innerWidth, vh = window.innerHeight;
  menu.style.left = Math.min(x, vw - 185) + 'px';
  menu.style.top  = Math.min(y, vh - 145) + 'px';
}
function hideCtxMenu(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden');
}

function findInTree(path, nodes) {
  nodes = nodes || FileSystem.getTree();
  for (var i = 0; i < nodes.length; i++) {
    if (nodes[i].path === path) return nodes[i];
    if (nodes[i].children) {
      var f = findInTree(path, nodes[i].children);
      if (f) return f;
    }
  }
  return null;
}

async function handleFileImport(e) {
  var files = Array.from(e.target.files);
  var TEXT_EXTS = ['html','htm','css','js','mjs','json','txt','md','xml','svg','ts','jsx','vue','py','php','rb','sh','yaml','yml','toml','ini','env'];
  var count = 0;
  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    var ext = f.name.split('.').pop().toLowerCase();
    if (!TEXT_EXTS.includes(ext)) continue;
    var content = await f.text();
    var path = '/' + f.name;
    if (!findInTree(path)) await FileSystem.createFile(f.name);
    await FileSystem.writeFile(path, content);
    count++;
  }
  e.target.value = '';
  if (count > 0) {
    await enterApp();
    ConsoleLog.system('📄 ' + count + ' file diimpor');
    renderSidebar();
  }
}

async function handleFolderImport(e) {
  var files = Array.from(e.target.files);
  if (!files.length) return;

  var TEXT_EXTS = ['html','htm','css','js','mjs','cjs','json','txt','md','xml','svg',
                   'ts','tsx','jsx','vue','py','php','rb','sh','bash','yaml','yml',
                   'toml','ini','env','gitignore','htaccess','c','cpp','h','java',
                   'kt','swift','go','rs','sql','graphql','scss','sass','less'];

  // Ambil nama folder root dari file pertama
  // webkitRelativePath format: "folderName/sub/file.ext"
  var rootFolder = '';
  if (files[0].webkitRelativePath) {
    rootFolder = files[0].webkitRelativePath.split('/')[0];
  } else {
    rootFolder = 'imported-folder';
  }

  ConsoleLog.system('📁 Mengimpor folder "' + rootFolder + '"...');

  // Buat struktur folder di FileSystem
  var createdFolders = {};

  async function ensureFolder(folderPath) {
    if (createdFolders[folderPath]) return;
    // Buat parent dulu
    var parts = folderPath.split('/').filter(Boolean);
    var built = '';
    for (var i = 0; i < parts.length; i++) {
      var prev = built || null;
      built = built ? built + '/' + parts[i] : '/' + parts[i];
      if (!createdFolders[built] && !findInTree(built)) {
        try { await FileSystem.createFolder(parts[i], prev); } catch(err) {}
      }
      createdFolders[built] = true;
    }
  }

  var count = 0;
  var skipped = 0;

  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    var relPath = f.webkitRelativePath || f.name;
    var ext = f.name.split('.').pop().toLowerCase();

    // Skip file binary / tersembunyi / terlalu besar (>500KB)
    if (f.name.startsWith('.')) { skipped++; continue; }
    if (f.size > 512 * 1024) {
      ConsoleLog.system('⚠ Dilewati (terlalu besar): ' + relPath);
      skipped++; continue;
    }
    if (!TEXT_EXTS.includes(ext) && f.name.indexOf('.') !== -1) {
      skipped++; continue;
    }

    // Buat path absolut
    var absPath = '/' + relPath;

    // Pastikan folder parent ada
    var lastSlash = absPath.lastIndexOf('/');
    if (lastSlash > 0) {
      var folderPath = absPath.substring(0, lastSlash);
      await ensureFolder(folderPath);
    }

    // Baca dan simpan file
    try {
      var content = await f.text();
      if (!findInTree(absPath)) {
        var fileName = f.name;
        var parentPath = lastSlash > 0 ? absPath.substring(0, lastSlash) : null;
        await FileSystem.createFile(fileName, parentPath || undefined);
      }
      await FileSystem.writeFile(absPath, content);
      count++;
    } catch(err) {
      ConsoleLog.append('error', 'Gagal import ' + f.name + ': ' + err.message);
    }
  }

  e.target.value = '';
  await enterApp();
  renderSidebar();
  ConsoleLog.system('✅ Folder "' + rootFolder + '" diimpor: ' + count + ' file' + (skipped ? ', ' + skipped + ' dilewati' : ''));

  // Auto buka file utama jika ada
  var mainFiles = ['/' + rootFolder + '/index.html', '/' + rootFolder + '/index.js', '/' + rootFolder + '/main.js'];
  for (var m = 0; m < mainFiles.length; m++) {
    if (findInTree(mainFiles[m])) {
      await openFileTab(mainFiles[m]);
      break;
    }
  }
}

function downloadBlob(filename, content, mime) {
  const blob = new Blob([content], { type: mime || 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function downloadActive() {
  const tab = Editor.getActive();
  if (!tab) return;
  if (tab.singleFile) {
    const content = await FileSystem.readFile(tab.filePath);
    downloadBlob(tab.filePath.split('/').pop(), content || '', FileSystem.getMimeForExt(tab.filePath));
  } else {
    downloadBlob('index.html', Editor.buildPreviewHTML(), 'text/html');
  }
}

function formatCode() {
  const cm = Editor.getCM();
  const val = cm.getValue();
  const lang = Editor.currentLang();
  if (lang === 'js') {
    try {
      const parsed = JSON.parse(val);
      cm.setValue(JSON.stringify(parsed, null, 2));
      return;
    } catch(e) {}
  }
  ConsoleLog.system('💡 Format JSON: ganti ke tab JS dulu lalu menu Format.');
}

var _prevFull = false;
function toggleFullPreview() {
  _prevFull = !_prevFull;
  const area  = document.getElementById('previewArea');
  const frame = document.getElementById('previewFrame');
  if (_prevFull) {
    area.style.cssText = 'position:fixed;inset:0;z-index:400;display:flex;flex-direction:column';
    frame.style.height = '100%';
  } else {
    area.style.cssText = '';
    frame.style.height = '';
  }
}

function openSettings()  { document.getElementById('settingsOverlay').classList.remove('hidden'); }
function closeSettings() { document.getElementById('settingsOverlay').classList.add('hidden'); }

function initDividerDrag() {
  const divider = document.getElementById('paneDivider');
  const edPane  = document.getElementById('editorPane');
  const rtPane  = document.getElementById('rightPane');
  if (!divider) return;
  var dragging = false;

  divider.addEventListener('mousedown', function(e) { dragging = true; e.preventDefault(); });
  divider.addEventListener('touchstart', function() { dragging = true; }, { passive:true });
  window.addEventListener('mousemove', function(e) { if (dragging) resize(e.clientX, e.clientY); });
  window.addEventListener('touchmove', function(e) { if (dragging) resize(e.touches[0].clientX, e.touches[0].clientY); }, { passive:true });
  window.addEventListener('mouseup',  function() { dragging = false; });
  window.addEventListener('touchend', function() { dragging = false; });

  function resize(x, y) {
    const main = document.querySelector('.main-area');
    const rect = main.getBoundingClientRect();
    const isRow = getComputedStyle(main).flexDirection === 'row';
    if (isRow) {
      const pct = Math.max(20, Math.min(80, (x - rect.left) / rect.width * 100));
      edPane.style.width = pct + '%'; edPane.style.flex = 'none'; rtPane.style.flex = '1';
    } else {
      const pct = Math.max(20, Math.min(80, (y - rect.top) / rect.height * 100));
      edPane.style.height = pct + '%'; edPane.style.flex = 'none'; rtPane.style.flex = '1';
    }
  }
}

// ── Start ──
bootApp().catch(function(err) {
  showFatalError(err && err.stack ? err.stack : String(err));
});

// ── PWA Install prompt ──
var _deferredInstall = null;
window.addEventListener('beforeinstallprompt', function(e) {
  e.preventDefault();
  _deferredInstall = e;
  // Tampilkan tombol install di console
  ConsoleLog.system('💡 App bisa diinstall! Ketuk ⬇ di topbar untuk install.');
  // Tambah tombol install di topbar
  var btn = document.createElement('button');
  btn.className = 'topbar-btn';
  btn.title = 'Install App';
  btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
  btn.addEventListener('click', function() {
    if (_deferredInstall) {
      _deferredInstall.prompt();
      _deferredInstall.userChoice.then(function(r) {
        if (r.outcome === 'accepted') ConsoleLog.system('✅ App berhasil diinstall!');
        _deferredInstall = null;
        btn.remove();
      });
    }
  });
  var topbarActions = document.querySelector('.topbar-actions');
  if (topbarActions) topbarActions.prepend(btn);
});

window.addEventListener('appinstalled', function() {
  ConsoleLog.system('✅ CodeDroid berhasil diinstall sebagai PWA!');
  _deferredInstall = null;
});
