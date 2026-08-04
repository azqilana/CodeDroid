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

  // Selalu tampilkan welcome screen dulu
  showWelcome();

  // Kalau ada proyek sebelumnya, tampilkan tombol lanjutkan
  if (!FileSystem.isEmpty()) {
    var btnContinue = document.getElementById('wlcContinue');
    if (btnContinue) btnContinue.classList.remove('hidden');
  }

  FileSystem.onChange(renderSidebar);

  // ── Top bar buttons ───────────────────────
  document.getElementById('btnSidebar').addEventListener('click', openSidebar);
  document.getElementById('btnRun').addEventListener('click', () => {
    switchView('preview');
    setTimeout(function() { Preview.run(); }, 80);
  });
  document.getElementById('btnSave').addEventListener('click', async () => {
    // Selalu simpan ke IndexedDB dulu agar tidak hilang
    await Editor.saveActive();
    // Jika file sudah terhubung ke HP, langsung tulis ke sana juga
    if (supportsFileSystemAccess()) {
      const tab = Editor.getActive();
      if (tab && _fileHandles[tab.filePath]) {
        await saveToDevice();
      } else {
        // Belum terhubung ke HP, tawarkan lewat saveToDevice (akan minta pilih lokasi)
        await saveToDevice();
      }
    } else {
      ConsoleLog.system('💾 Tersimpan di browser.');
    }
  });
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
    closeSidebar();
    if (supportsFileSystemAccess()) { openFromDevice(); }
    else { document.getElementById('fileInput').click(); }
  });

  document.getElementById('btnImportFolder').addEventListener('click', function() {
    closeSidebar();
    if (supportsFileSystemAccess()) { openFolderFromDevice(); }
    else { document.getElementById('folderInput').click(); }
  });

  document.getElementById('btnExportFile').addEventListener('click', downloadActive);
  document.getElementById('fileInput').addEventListener('change', handleFileImport);
  document.getElementById('folderInput').addEventListener('change', handleFolderImport);

  // ── Context menu ─────────────────────────
  document.getElementById('ctxRename').addEventListener('click', async () => {
    hideCtxMenu('ctxMenu');
    if (!_ctxTarget) return;
    const target = _ctxTarget;
    _ctxTarget = null;
    const node = findInTree(target);
    const newName = await showModal('Rename', node?.name || '');
    if (!newName || newName === node?.name) return;
    try {
      const newPath = await FileSystem.renameNode(target, newName);
      Editor.getTabs().forEach(function(t) { if (t.filePath === target) t.filePath = newPath; });
      Editor.renderTabBar();
    } catch (e) { alert(e.message); }
  });

  document.getElementById('ctxDelete').addEventListener('click', async () => {
    hideCtxMenu('ctxMenu');
    if (!_ctxTarget) return;
    const target = _ctxTarget;
    _ctxTarget = null;
    if (!confirm('Hapus "' + target + '"?')) return;
    const deleted = await FileSystem.deleteNode(target);
    (deleted || []).forEach(p => {
      const tab = Editor.getTabs().find(t => t.filePath === p);
      if (tab) Editor.closeTab(tab.id);
    });
  });

  document.getElementById('ctxDownload').addEventListener('click', async () => {
    hideCtxMenu('ctxMenu');
    if (!_ctxTarget) return;
    const target = _ctxTarget;
    _ctxTarget = null;
    const content = await FileSystem.readFile(target);
    if (content === null) return;
    downloadBlob((target||'').split('/').pop(), content, FileSystem.getMimeForExt(target));
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
  renderSidebar();
}

// Welcome button handlers
document.getElementById('wlcContinue').addEventListener('click', async function() {
  await enterApp();
});

document.getElementById('wlcNewProject').addEventListener('click', async function() {
  try {
    if (!supportsFileSystemAccess()) {
      // Fallback lama jika tidak support
      if (!findInTree('/index.html')) await FileSystem.createFile('index.html');
      if (!findInTree('/style.css'))  await FileSystem.createFile('style.css');
      if (!findInTree('/script.js'))  await FileSystem.createFile('script.js');
      await FileSystem.writeFile('/index.html', DEFAULT_HTML);
      await FileSystem.writeFile('/style.css',  DEFAULT_CSS);
      await FileSystem.writeFile('/script.js',  DEFAULT_JS);
      await enterApp();
      await openFileTab('/index.html');
      Preview.run();
      ConsoleLog.system('🚀 Proyek baru dibuat!');
      return;
    }

    // Minta user pilih folder di HP untuk menyimpan proyek
    var dirHandle;
    try {
      dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    } catch(e) {
      if (e.name === 'AbortError') return;
      throw e;
    }

    // Buat 3 file di folder yang dipilih dan simpan handle-nya
    var files = [
      { name: 'index.html', content: DEFAULT_HTML },
      { name: 'style.css',  content: DEFAULT_CSS  },
      { name: 'script.js',  content: DEFAULT_JS   },
    ];

    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      var fileHandle = await dirHandle.getFileHandle(f.name, { create: true });
      var writable   = await fileHandle.createWritable();
      await writable.write(f.content);
      await writable.close();

      // Simpan ke FileSystem internal dan simpan handle
      var absPath = '/' + f.name;
      if (!findInTree(absPath)) await FileSystem.createFile(f.name);
      await FileSystem.writeFile(absPath, f.content);
      _fileHandles[absPath] = fileHandle;
    }

    await enterApp();
    await openFileTab('/index.html');
    Preview.run();
    ConsoleLog.system('🚀 Proyek baru dibuat di "' + dirHandle.name + '". Ctrl+S untuk simpan langsung ke HP!');
  } catch(e) {
    alert('Gagal membuat proyek: ' + e.message);
  }
});

document.getElementById('wlcOpenFile').addEventListener('click', async function() {
  if (!supportsFileSystemAccess()) {
    document.getElementById('fileInput').click();
    return;
  }
  await openFromDevice();
});

document.getElementById('wlcOpenFolder').addEventListener('click', async function() {
  if (!supportsFileSystemAccess()) {
    document.getElementById('folderInput').click();
    return;
  }
  await openFolderFromDevice();
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
  // Kalau view masih 'files', kembalikan ke editor agar konten tidak tersembunyi
  var main = document.querySelector('.main-area');
  if (main && main.classList.contains('view-files')) {
    document.querySelectorAll('.nav-btn').forEach(function(b) {
      b.classList.toggle('active', b.dataset.view === 'editor');
    });
    main.className = 'main-area view-editor';
  }
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
        _ctxTarget = node.path;
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
        _ctxTarget = node.path;
        showCtxMenu('ctxMenu', e.clientX, e.clientY);
      });
      container.appendChild(el);
    }
  });
}

// shared ctxTarget untuk context menu
var _ctxTarget = null;

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
    // Buka file pertama yang berhasil diimport
    var firstImported = null;
    for (var j = 0; j < files.length; j++) {
      var ext2 = files[j].name.split('.').pop().toLowerCase();
      if (TEXT_EXTS.includes(ext2)) { firstImported = '/' + files[j].name; break; }
    }
    if (firstImported && findInTree(firstImported)) await openFileTab(firstImported);
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

// ── File System Access API ────────────────
// Simpan file handle per path agar Ctrl+S bisa langsung tulis tanpa dialog
var _fileHandles = {}; // { filePath: FileSystemFileHandle }

function supportsFileSystemAccess() {
  return typeof window.showSaveFilePicker === 'function';
}

async function saveToDevice() {
  if (!supportsFileSystemAccess()) return;

  const tab = Editor.getActive();
  if (!tab) return;

  const filePath = tab.filePath;
  // Ambil konten langsung dari CodeMirror (yang paling fresh)
  const content  = Editor.getCM() ? Editor.getCM().getValue() : (await FileSystem.readFile(filePath) || '');
  const fileName = filePath ? filePath.split('/').pop() : 'index.html';
  const ext      = fileName.split('.').pop().toLowerCase();

  const typeMap = {
    html: [{ description: 'HTML File', accept: { 'text/html': ['.html', '.htm'] } }],
    css:  [{ description: 'CSS File',  accept: { 'text/css':  ['.css'] } }],
    js:   [{ description: 'JavaScript File', accept: { 'text/javascript': ['.js'] } }],
    json: [{ description: 'JSON File', accept: { 'application/json': ['.json'] } }],
    md:   [{ description: 'Markdown File', accept: { 'text/markdown': ['.md'] } }],
  };

  try {
    var handle = _fileHandles[filePath];

    if (!handle) {
      handle = await window.showSaveFilePicker({
        suggestedName: fileName,
        types: typeMap[ext] || [{ description: 'Text File', accept: { 'text/plain': ['.' + ext] } }],
      });
      _fileHandles[filePath] = handle;
    }

    const writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();

    var savedName = (await handle.getFile()).name;
    ConsoleLog.system('✅ Tersimpan ke HP: ' + savedName);

    // Tampilkan toast di topbar
    var toast = document.getElementById('saveToast');
    var dot   = document.getElementById('dirtyDot');
    if (toast) {
      toast.textContent = '✅ Tersimpan';
      toast.classList.remove('hidden', 'fading');
      if (dot) dot.classList.add('hidden');
      setTimeout(function() {
        toast.classList.add('fading');
        setTimeout(function() {
          toast.classList.add('hidden');
          toast.classList.remove('fading');
        }, 500);
      }, 2000);
    }

  } catch (err) {
    if (err.name !== 'AbortError') {
      ConsoleLog.append('error', 'Gagal simpan ke HP: ' + err.message);
    }
    // Data tetap aman di IndexedDB meski HP gagal
  }
}

// Ctrl+S / Cmd+S → simpan ke IndexedDB + HP
document.addEventListener('keydown', async function(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    await Editor.saveActive();
    if (supportsFileSystemAccess()) {
      await saveToDevice();
    } else {
      ConsoleLog.system('💾 Tersimpan di browser.');
    }
  }
});

// ── Buka Folder dari HP (File System Access API) ─────────────
async function openFolderFromDevice() {
  if (!supportsFileSystemAccess()) {
    document.getElementById('folderInput').click();
    return;
  }

  var dirHandle;
  try {
    dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
  } catch(e) {
    if (e.name !== 'AbortError') ConsoleLog.append('error', 'Gagal buka folder: ' + e.message);
    return;
  }

  var TEXT_EXTS = ['html','htm','css','js','mjs','cjs','json','txt','md','xml','svg',
                   'ts','tsx','jsx','vue','py','php','rb','sh','bash','yaml','yml',
                   'toml','ini','env','c','cpp','h','java','kt','swift','go','rs',
                   'sql','graphql','scss','sass','less'];

  var count   = 0;
  var skipped = 0;
  var firstPath = null;

  // Rekursif baca semua file dalam folder
  async function readDir(handle, parentPath) {
    for await (var entry of handle.values()) {
      var entryPath = parentPath + '/' + entry.name;

      if (entry.kind === 'directory') {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        if (!findInTree(entryPath)) {
          try { await FileSystem.createFolder(entry.name, parentPath || null); } catch(e) {}
        }
        await readDir(entry, entryPath);

      } else if (entry.kind === 'file') {
        if (entry.name.startsWith('.')) { skipped++; continue; }
        var ext = entry.name.split('.').pop().toLowerCase();
        if (!TEXT_EXTS.includes(ext)) { skipped++; continue; }

        try {
          var file    = await entry.getFile();
          if (file.size > 512 * 1024) {
            ConsoleLog.system('⚠ Dilewati (terlalu besar): ' + entryPath);
            skipped++; continue;
          }
          var content = await file.text();
          if (!findInTree(entryPath)) {
            var lastSlash = entryPath.lastIndexOf('/');
            var par = lastSlash > 0 ? entryPath.substring(0, lastSlash) : null;
            await FileSystem.createFile(entry.name, par || undefined);
          }
          await FileSystem.writeFile(entryPath, content);

          // Simpan handle untuk simpan langsung ke HP
          _fileHandles[entryPath] = entry;

          if (!firstPath) firstPath = entryPath;
          count++;
        } catch(err) {
          ConsoleLog.append('error', 'Gagal baca ' + entry.name + ': ' + err.message);
        }
      }
    }
  }

  ConsoleLog.system('📁 Membuka folder "' + dirHandle.name + '"...');

  // Buat folder root di FileSystem
  var rootPath = '/' + dirHandle.name;
  if (!findInTree(rootPath)) {
    try { await FileSystem.createFolder(dirHandle.name); } catch(e) {}
  }

  await readDir(dirHandle, rootPath);

  if (count > 0) {
    await enterApp();
    renderSidebar();
    ConsoleLog.system('✅ "' + dirHandle.name + '" dibuka: ' + count + ' file' + (skipped ? ', ' + skipped + ' dilewati' : '') + '. Ctrl+S simpan langsung ke HP!');

    // Prioritas buka file utama
    var mainCandidates = [
      rootPath + '/index.html',
      rootPath + '/index.js',
      rootPath + '/main.js',
      firstPath
    ];
    for (var m = 0; m < mainCandidates.length; m++) {
      if (mainCandidates[m] && findInTree(mainCandidates[m])) {
        await openFileTab(mainCandidates[m]);
        break;
      }
    }
  }
}

// ── Buka File dari HP (File System Access API) ────────────────
async function openFromDevice() {
  if (!supportsFileSystemAccess()) return;
  var handles;
  try {
    handles = await window.showOpenFilePicker({
      multiple: true,
      types: [
        {
          description: 'File Kode',
          accept: {
            'text/html':       ['.html', '.htm'],
            'text/css':        ['.css'],
            'text/javascript': ['.js', '.mjs'],
            'application/json':['.json'],
            'text/plain':      ['.txt', '.md', '.xml', '.svg'],
          }
        }
      ]
    });
  } catch(e) {
    if (e.name !== 'AbortError') ConsoleLog.append('error', 'Gagal buka: ' + e.message);
    return;
  }

  var count = 0;
  var firstPath = null;

  for (var i = 0; i < handles.length; i++) {
    var handle = handles[i];
    try {
      var file    = await handle.getFile();
      var content = await file.text();
      var absPath = '/' + file.name;

      // Simpan handle agar Simpan ke HP langsung tulis ke file yang sama
      _fileHandles[absPath] = handle;

      if (!findInTree(absPath)) {
        await FileSystem.createFile(file.name);
      }
      await FileSystem.writeFile(absPath, content);

      if (!firstPath) firstPath = absPath;
      count++;
    } catch(err) {
      ConsoleLog.append('error', 'Gagal baca ' + handle.name + ': ' + err.message);
    }
  }

  if (count > 0) {
    await enterApp();
    renderSidebar();
    ConsoleLog.system('📱 ' + count + ' file dibuka dari HP. Ctrl+S untuk simpan langsung.');
    if (firstPath) await openFileTab(firstPath);
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

  // Coba format sebagai JSON dulu (berlaku untuk lang js/json)
  if (lang === 'js') {
    try {
      const parsed = JSON.parse(val);
      cm.setValue(JSON.stringify(parsed, null, 2));
      ConsoleLog.system('✅ JSON diformat.');
      return;
    } catch(e) {}
  }

  // Format HTML: indentasi sederhana
  if (lang === 'html') {
    try {
      var indent = 0;
      var result = val
        .replace(/>\s*</g, '>\n<')
        .split('\n')
        .map(function(line) {
          line = line.trim();
          if (!line) return '';
          if (/^<\//.test(line)) indent = Math.max(0, indent - 1);
          var out = '  '.repeat(indent) + line;
          if (/^<[^\/!][^>]*[^\/]>$/.test(line) && !/^<(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)/i.test(line)) indent++;
          return out;
        })
        .join('\n');
      cm.setValue(result);
      ConsoleLog.system('✅ HTML diformat.');
      return;
    } catch(e) {}
  }

  // Format CSS: indentasi sederhana
  if (lang === 'css') {
    try {
      var result = val
        .replace(/\s*\{\s*/g, ' {\n  ')
        .replace(/;\s*/g, ';\n  ')
        .replace(/\s*\}\s*/g, '\n}\n')
        .replace(/  \n}/g, '\n}')
        .trim();
      cm.setValue(result);
      ConsoleLog.system('✅ CSS diformat.');
      return;
    } catch(e) {}
  }

  ConsoleLog.system('💡 Format tidak tersedia untuk tipe ini.');
}

// ── Modal input ───────────────────────────
function showModal(title, defaultValue) {
  return new Promise(function(resolve) {
    var overlay = document.getElementById('modalOverlay');
    var titleEl = document.getElementById('modalTitle');
    var input   = document.getElementById('modalInput');
    var btnOk   = document.getElementById('modalOk');
    var btnCancel = document.getElementById('modalCancel');

    titleEl.textContent = title;
    input.value = defaultValue || '';
    overlay.classList.remove('hidden');
    setTimeout(function() { input.focus(); input.select(); }, 50);

    function cleanup() {
      overlay.classList.add('hidden');
      btnOk.removeEventListener('click', onOk);
      btnCancel.removeEventListener('click', onCancel);
      input.removeEventListener('keydown', onKey);
    }
    function onOk() {
      var val = input.value.trim();
      cleanup();
      resolve(val || null);
    }
    function onCancel() {
      cleanup();
      resolve(null);
    }
    function onKey(e) {
      if (e.key === 'Enter') onOk();
      if (e.key === 'Escape') onCancel();
    }
    btnOk.addEventListener('click', onOk);
    btnCancel.addEventListener('click', onCancel);
    input.addEventListener('keydown', onKey);
  });
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
