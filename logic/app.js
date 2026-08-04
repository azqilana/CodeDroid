/* =========================================
   App – Main orchestrator
   ========================================= */

(async () => {
  // ── Boot ──────────────────────────────────
  await FileSystem.load();
  await Editor.init();

  // Kalau sudah ada file sebelumnya, buka tab — kalau belum, tampilkan welcome
  if (FileSystem.getTree().length > 0) {
    await Editor.newTab();
  } else {
    showWelcomeScreen();
  }
  renderSidebar();
  Preview.run();
  ConsoleLog.system('🚀 CodeDroid siap!');

  // Hide splash after anim, then show app
  setTimeout(() => {
    document.getElementById('splash').remove();
    document.getElementById('app').classList.remove('hidden');
  }, 1700);

  FileSystem.onChange(renderSidebar);

  // ── Top bar buttons ───────────────────────
  document.getElementById('btnSidebar').addEventListener('click', openSidebar);
  document.getElementById('btnRun').addEventListener('click', () => Preview.run());
  document.getElementById('btnSave').addEventListener('click', () => Editor.saveActive());
  document.getElementById('btnMore').addEventListener('click', e => {
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
  document.getElementById('qtUndo').addEventListener('click', () => { Editor.getCM().undo(); Editor.getCM().focus(); });
  document.getElementById('qtRedo').addEventListener('click', () => { Editor.getCM().redo(); Editor.getCM().focus(); });

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

  document.getElementById('btnImportFile').addEventListener('click', () => {
    document.getElementById('fileInput').click();
  });

  document.getElementById('btnOpenFolder').addEventListener('click', openFolderFSA);

  document.getElementById('btnExportFile').addEventListener('click', downloadActive);

  document.getElementById('fileInput').addEventListener('change', handleFileImport);
  document.getElementById('folderInput').addEventListener('change', handleFolderImport);

  // ── Context menu ─────────────────────────
  let ctxTarget = null;
  document.getElementById('ctxRename').addEventListener('click', async () => {
    if (!ctxTarget) return;
    const node = FileSystem.getTree().find(n => n.path === ctxTarget) || findInTree(ctxTarget);
    const newName = await showModal('Rename', node?.name || '');
    if (!newName || newName === node?.name) return;
    try {
      const newPath = await FileSystem.renameNode(ctxTarget, newName);
      // Update open tabs
      Editor.getTabs().forEach(t => { if (t.filePath === ctxTarget) t.filePath = newPath; });
      Editor.renderTabBar();
    } catch (e) { alert(e.message); }
  });

  document.getElementById('ctxDelete').addEventListener('click', async () => {
    if (!ctxTarget) return;
    if (!confirm('Hapus "' + ctxTarget + '"?')) return;
    const deleted = await FileSystem.deleteNode(ctxTarget);
    // Close affected tabs
    (deleted || []).forEach(p => {
      const tab = Editor.getTabs().find(t => t.filePath === p);
      if (tab) Editor.closeTab(tab.id);
    });
  });

  document.getElementById('ctxDownload').addEventListener('click', async () => {
    if (!ctxTarget) return;
    const content = await FileSystem.readFile(ctxTarget);
    if (content === null) return;
    downloadBlob(ctxTarget.split('/').pop(), content, FileSystem.getMimeForExt(ctxTarget));
  });

  // ── More menu actions ─────────────────────
  document.getElementById('menuFormat').addEventListener('click', () => {
    hideCtxMenu('moreMenu');
    formatCode();
  });
  document.getElementById('menuDuplicate').addEventListener('click', () => {
    hideCtxMenu('moreMenu');
    const active = Editor.getActive();
    if (active) Editor.newTab(active.filePath);
  });
  document.getElementById('menuDownload').addEventListener('click', () => {
    hideCtxMenu('moreMenu');
    downloadActive();
  });
  document.getElementById('menuImport').addEventListener('click', () => {
    hideCtxMenu('moreMenu');
    document.getElementById('fileInput').click();
  });
  document.getElementById('menuSettings').addEventListener('click', () => {
    hideCtxMenu('moreMenu');
    openSettings();
  });

  // ── Settings panel ────────────────────────
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

  // ── Close menus on outside click ─────────
  document.addEventListener('click', e => {
    if (!e.target.closest('#ctxMenu'))  hideCtxMenu('ctxMenu');
    if (!e.target.closest('#moreMenu') && !e.target.closest('#btnMore')) hideCtxMenu('moreMenu');
  });

  // ── Pane drag (desktop) ───────────────────
  initDividerDrag();

  // ── Keyboard shortcuts ────────────────────
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); Editor.saveActive(); }
    if (e.key === 'Escape') { closeSidebar(); hideCtxMenu('ctxMenu'); hideCtxMenu('moreMenu'); }
  });

  // ── PWA beforeinstallprompt ───────────────
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    ConsoleLog.system('💡 Ketuk "Tambahkan ke layar utama" untuk install aplikasi');
  });

  // ===========================================
  // HELPER FUNCTIONS
  // ===========================================

  // ── View switching ─────────────────────────
  function switchView(view) {
    document.querySelectorAll('.nav-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.view === view));
    const main = document.querySelector('.main-area');
    main.className = `main-area view-${view}`;

    if (view === 'files') { openSidebar(); return; }

    if (view === 'preview') {
      // Jalankan preview terbaru saat buka tab preview
      Preview.run();
    }

    if (view === 'console') {
      // Pastikan console tidak collapsed saat dibuka via nav
      document.getElementById('consoleArea').classList.remove('collapsed');
      setTimeout(() => document.getElementById('consoleInput').focus(), 100);
    }
  }

  // ── Sidebar ────────────────────────────────
  function openSidebar() {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebarOverlay').classList.add('open');
  }
  function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('open');
  }
  document.getElementById('btnCloseSidebar').addEventListener('click', closeSidebar);
  document.getElementById('sidebarOverlay').addEventListener('click', closeSidebar);

  // ── Render sidebar tree ────────────────────
  function renderSidebar() {
    const tree = document.getElementById('sidebarTree');
    tree.innerHTML = '';
    renderNodes(FileSystem.getTree(), tree);
  }

  function renderNodes(nodes, container) {
    nodes.forEach(node => {
      if (node.type === 'folder') {
        const folderEl = document.createElement('div');
        folderEl.innerHTML = `
          <div class="tree-folder" data-path="${escHtml(node.path)}">
            <span class="tree-icon">${node.open ? '📂' : '📁'}</span>
            <span class="tree-name">${escHtml(node.name)}</span>
            <span class="tree-folder-toggle">${node.open ? '▾' : '▸'}</span>
          </div>
          <div class="tree-children" ${node.open ? '' : 'style="display:none"'}></div>`;
        const header = folderEl.querySelector('.tree-folder');
        const children = folderEl.querySelector('.tree-children');
        header.addEventListener('click', () => {
          node.open = !node.open;
          renderSidebar();
        });
        header.addEventListener('contextmenu', e => {
          e.preventDefault();
          ctxTarget = node.path;
          showCtxMenu('ctxMenu', e.clientX, e.clientY);
        });
        if (node.children) renderNodes(node.children, children);
        container.appendChild(folderEl);
      } else {
        const fileEl = document.createElement('div');
        fileEl.className = 'tree-file';
        fileEl.dataset.path = node.path;
        const ext = node.name.split('.').pop().toLowerCase();
        const icon = { html:'🌐', css:'🎨', js:'⚡', json:'📋',
                       md:'📝', txt:'📄', svg:'🖼', xml:'📰' }[ext] || '📄';
        fileEl.innerHTML = `
          <span class="tree-icon">${icon}</span>
          <span class="tree-name">${escHtml(node.name)}</span>`;
        fileEl.addEventListener('click', async () => {
          openFileTab(node.path);
          closeSidebar();
        });
        fileEl.addEventListener('contextmenu', e => {
          e.preventDefault();
          ctxTarget = node.path;
          showCtxMenu('ctxMenu', e.clientX, e.clientY);
        });
        container.appendChild(fileEl);
      }
    });
  }

  async function openFileTab(filePath) {
    // Check if already open
    const existing = Editor.getTabs().find(t => t.filePath === filePath);
    if (existing) { Editor.setActive(existing.id); return; }
    await Editor.newTab(filePath);
  }

  // ── Context menu ──────────────────────────
  function showCtxMenu(id, x, y) {
    const menu = document.getElementById(id);
    menu.classList.remove('hidden');
    const vw = window.innerWidth, vh = window.innerHeight;
    const mw = 180, mh = 140;
    menu.style.left = Math.min(x, vw - mw - 8) + 'px';
    menu.style.top  = Math.min(y, vh - mh - 8) + 'px';
  }
  function hideCtxMenu(id) {
    document.getElementById(id)?.classList.add('hidden');
  }

  function findInTree(path, nodes = FileSystem.getTree()) {
    for (const n of nodes) {
      if (n.path === path) return n;
      if (n.children) { const f = findInTree(path, n.children); if (f) return f; }
    }
    return null;
  }

  // ── File import ───────────────────────────
  async function handleFileImport(e) {
    const files = Array.from(e.target.files);
    for (const f of files) {
      const content = await f.text();
      const path = '/' + f.name;
      // Check if exists
      const exists = findInTree(path);
      if (!exists) {
        await FileSystem.createFile(f.name);
      }
      await FileSystem.writeFile(path, content);
    }
    e.target.value = '';
    ConsoleLog.system(`📂 ${files.length} file diimpor`);
    renderSidebar();
  }

  // ── Welcome Screen ────────────────────────
  function showWelcomeScreen() {
    // Pastikan tidak ada tab terbuka
    const main = document.querySelector('.main-area');

    const el = document.createElement('div');
    el.className = 'welcome-screen';
    el.id = 'welcomeScreen';
    el.innerHTML = `
      <div class="welcome-logo">
        <svg width="72" height="72" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="120" height="120" rx="24" fill="#4a0e5c"/>
          <polyline points="28,38 12,55 28,72" stroke="#7c6fcd" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
          <line x1="52" y1="75" x2="68" y2="35" stroke="#e02020" stroke-width="7" stroke-linecap="round"/>
          <polyline points="92,38 108,55 92,72" stroke="#f0f0f0" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        </svg>
        <span class="welcome-logo-text">CodeDroid</span>
      </div>
      <div class="welcome-tagline">Mobile Code Editor</div>

      <div class="welcome-actions">
        <button class="welcome-btn welcome-btn-primary" id="wBtnNewProject">
          <span class="welcome-btn-icon">✨</span>
          <div>
            <div>Buat Project Baru</div>
            <div class="welcome-btn-desc">Mulai dari file HTML, CSS, JS kosong</div>
          </div>
        </button>
        <button class="welcome-btn" id="wBtnOpenFolder">
          <span class="welcome-btn-icon">📁</span>
          <div>
            <div>Buka Folder</div>
            <div class="welcome-btn-desc">Buka folder project yang sudah ada</div>
          </div>
        </button>
        <button class="welcome-btn" id="wBtnOpenFile">
          <span class="welcome-btn-icon">📄</span>
          <div>
            <div>Buka File</div>
            <div class="welcome-btn-desc">Buka satu file untuk diedit</div>
          </div>
        </button>
      </div>

      <div class="welcome-guide">
        <div class="welcome-guide-title">📖 Cara Pakai</div>
        <div class="welcome-step">
          <div class="welcome-step-num">1</div>
          <div class="welcome-step-text">
            <strong>Buat atau buka project</strong> — pilih salah satu tombol di atas untuk mulai.
          </div>
        </div>
        <div class="welcome-step">
          <div class="welcome-step-num">2</div>
          <div class="welcome-step-text">
            <strong>Edit kode</strong> — klik file di File Manager (ikon 📁 kiri atas) untuk membuka dan mengedit.
          </div>
        </div>
        <div class="welcome-step">
          <div class="welcome-step-num">3</div>
          <div class="welcome-step-text">
            <strong>Simpan</strong> — tekan tombol 💾 di kanan atas atau Ctrl+S. Muncul notifikasi hijau artinya berhasil.
          </div>
        </div>
        <div class="welcome-step">
          <div class="welcome-step-num">4</div>
          <div class="welcome-step-text">
            <strong>Preview & Console</strong> — tekan tombol Preview atau Console di bawah untuk lihat hasil dan debug.
          </div>
        </div>
        <div class="welcome-step">
          <div class="welcome-step-num">5</div>
          <div class="welcome-step-text">
            <strong>Buka Folder</strong> di Chrome Android mendukung <strong>tulis balik otomatis</strong> — perubahan langsung tersimpan ke file asli di device.
          </div>
        </div>
      </div>
    `;

    main.appendChild(el);

    // Tombol di welcome screen
    document.getElementById('wBtnNewProject').addEventListener('click', async () => {
      el.remove();
      // Buat project default
      await FileSystem.createFile('index.html');
      await FileSystem.writeFile('/index.html', defaultWelcomeHTML);
      await FileSystem.createFile('style.css');
      await FileSystem.writeFile('/style.css', '');
      await FileSystem.createFile('script.js');
      await FileSystem.writeFile('/script.js', '');
      renderSidebar();
      await Editor.newTab();
    });

    document.getElementById('wBtnOpenFolder').addEventListener('click', () => {
      el.remove();
      openFolderFSA();
    });

    document.getElementById('wBtnOpenFile').addEventListener('click', () => {
      el.remove();
      document.getElementById('fileInput').click();
    });
  }

  // Konten default untuk project baru
  const defaultWelcomeHTML = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Project Baru</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <h1>Halo Dunia!</h1>
  <script src="script.js"><\/script>
</body>
</html>`;

  // ── File System Access API ─────────────────
  // Menyimpan handle direktori dan mapping path → FileHandle
  let fsaDirectoryHandle = null;
  const fsaFileHandles = new Map(); // path → FileSystemFileHandle

  async function openFolderFSA() {
    if (Native.isNative()) {
      // ── Mode APK: pakai FilePicker native ──
      showToast('⏳ Membuka file picker...');
      const result = await Native.pickAndImportFolder();

      if (result.canceled) return;
      if (!result.ok || !result.files.length) {
        showToast('❌ Tidak ada file dipilih', 'error');
        return;
      }

      await FileSystem.reset();
      Editor.getTabs().forEach(t => Editor.closeTab(t.id));

      // Buat folder project
      try { await FileSystem.createFolder('project'); } catch (_) {}

      // Import semua file yang dipilih
      for (const { virtualPath, name, content } of result.files) {
        try {
          await FileSystem.createFile(`project/${name}`);
          await FileSystem.writeFile(virtualPath, content);
        } catch (_) {}
      }

      showToast(`📁 ${result.files.length} file diimpor ✅`);
      renderSidebar();
      // Buka file pertama
      if (result.files[0]) {
        await Editor.newTab(result.files[0].virtualPath);
      } else {
        await Editor.newTab();
      }

    } else if (window.showDirectoryPicker) {
      // ── Mode Browser Chrome: pakai File System Access API ──
      try {
        const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        fsaDirectoryHandle = dirHandle;
        fsaFileHandles.clear();

        await FileSystem.reset();
        Editor.getTabs().forEach(t => Editor.closeTab(t.id));

        const allFiles = [];
        await collectEntries(dirHandle, '', allFiles);

        const folderPaths = new Set();
        for (const { relPath } of allFiles) {
          const parts = relPath.split('/');
          for (let i = 1; i < parts.length; i++) {
            folderPaths.add(parts.slice(0, i).join('/'));
          }
        }
        for (const fp of [...folderPaths].sort((a,b) => a.split('/').length - b.split('/').length)) {
          try { await FileSystem.createFolder(fp); } catch (_) {}
        }

        let imported = 0;
        for (const { relPath, fileHandle } of allFiles) {
          const filePath = '/' + relPath;
          try {
            const file = await fileHandle.getFile();
            const content = await file.text();
            await FileSystem.createFile(relPath);
            await FileSystem.writeFile(filePath, content);
            fsaFileHandles.set(filePath, fileHandle);
            imported++;
          } catch (_) {}
        }

        ConsoleLog.system(`📁 Folder "${dirHandle.name}" dibuka: ${imported} file (mode tulis aktif ✅)`);
        renderSidebar();
        await Editor.newTab();

      } catch (err) {
        if (err.name !== 'AbortError') {
          ConsoleLog.system('❌ Gagal buka folder: ' + err.message);
        }
      }
    } else {
      // ── Fallback: browser tidak mendukung FSA ──
      ConsoleLog.system('⚠️ Browser tidak mendukung buka folder langsung. Gunakan "Buka File".');
      document.getElementById('folderInput').click();
    }
  }

  // Rekursif kumpulkan semua file dari DirectoryHandle
  async function collectEntries(dirHandle, prefix, out) {
    for await (const [name, handle] of dirHandle.entries()) {
      const relPath = prefix ? `${prefix}/${name}` : name;
      if (handle.kind === 'file') {
        out.push({ relPath, fileHandle: handle });
      } else if (handle.kind === 'directory') {
        await collectEntries(handle, relPath, out);
      }
    }
  }

  // ── Toast notification ────────────────────
  let toastTimer = null;
  function showToast(msg, type = 'success') {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = `toast toast-${type} show`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.remove('show');
    }, 2500);
  }

  // Override saveActive agar tulis ke file asli (FSA browser atau Capacitor native)
  const _origSaveActive = Editor.saveActive.bind(Editor);
  Editor.saveActive = async function() {
    await _origSaveActive();
    const tab = Editor.getActive();
    if (!tab || !tab.filePath || !tab.singleFile) {
      showToast('💾 Tersimpan');
      return;
    }
    const content = Editor.getCM().getValue();

    // ── APK: tulis via Capacitor Filesystem ──
    if (Native.isNative() && Native.hasNativeFile(tab.filePath)) {
      const ok = await Native.saveNativeFile(tab.filePath, content);
      if (ok) showToast('💾 Tersimpan ke device');
      else showToast('❌ Gagal simpan ke device', 'error');
      return;
    }

    // ── Browser Chrome: tulis via File System Access API ──
    const fileHandle = fsaFileHandles.get(tab.filePath);
    if (fileHandle) {
      try {
        const writable = await fileHandle.createWritable();
        await writable.write(content);
        await writable.close();
        showToast('💾 Tersimpan ke file asli');
      } catch (err) {
        showToast('❌ Gagal simpan: ' + err.message, 'error');
      }
    } else {
      showToast('💾 Tersimpan');
    }
  };

  // ── Folder import (APK native + browser fallback) ─
  async function handleFolderImport(e) {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    // Hapus semua data lama — tree + konten file
    await FileSystem.reset();
    Editor.getTabs().forEach(t => Editor.closeTab(t.id));
    Native.clearMap();

    // Di APK: simpan juga ke storage native via Capacitor Filesystem
    if (Native.isNative()) {
      await Native.importFolderNative(files);
    }

    // Kumpulkan semua path folder unik
    const folderPaths = new Set();
    for (const f of files) {
      const parts = (f.webkitRelativePath || f.name).split('/');
      for (let i = 1; i < parts.length; i++) {
        folderPaths.add(parts.slice(0, i).join('/'));
      }
    }
    for (const fp of [...folderPaths].sort((a,b) => a.split('/').length - b.split('/').length)) {
      try { await FileSystem.createFolder(fp); } catch (_) {}
    }

    let imported = 0;
    for (const f of files) {
      const relPath = f.webkitRelativePath || f.name;
      const filePath = '/' + relPath;
      try {
        const content = await f.text();
        await FileSystem.createFile(relPath);
        await FileSystem.writeFile(filePath, content);
        imported++;
      } catch (_) {}
    }

    e.target.value = '';
    const mode = Native.isNative() ? ' (tersimpan ke Documents/CodeDroid ✅)' : '';
    ConsoleLog.system(`📁 Folder diimpor: ${imported} file${mode}`);
    renderSidebar();
    await Editor.newTab();
  }

  // ── Download ──────────────────────────────
  function downloadBlob(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function downloadActive() {
    const tab = Editor.getActive();
    if (!tab) return;
    if (tab.singleFile) {
      const content = await FileSystem.readFile(tab.filePath);
      downloadBlob(tab.filePath.split('/').pop(), content || '', FileSystem.getMimeForExt(tab.filePath));
    } else {
      // Download as ZIP-like bundle → just download combined HTML
      const html = Editor.buildPreviewHTML();
      downloadBlob('index.html', html, 'text/html');
    }
  }

  // ── Format code ───────────────────────────
  function formatCode() {
    const cm = Editor.getCM();
    const val = cm.getValue();
    const lang = Editor.currentLang();
    // Simple indent formatter (no external lib)
    try {
      if (lang === 'js') {
        // Try JSON parse for JSON-like
        const parsed = JSON.parse(val);
        cm.setValue(JSON.stringify(parsed, null, 2));
        return;
      }
    } catch {}
    ConsoleLog.system('💡 Format otomatis hanya tersedia untuk JSON. Coba Ctrl+A lalu Tab untuk re-indent.');
  }

  // ── Full preview toggle ───────────────────
  let prevFull = false;
  function toggleFullPreview() {
    prevFull = !prevFull;
    const frame = document.getElementById('previewFrame');
    const area  = document.getElementById('previewArea');
    if (prevFull) {
      area.style.position = 'fixed';
      area.style.inset = '0';
      area.style.zIndex = '400';
      frame.style.height = '100%';
    } else {
      area.style.position = '';
      area.style.inset = '';
      area.style.zIndex = '';
      frame.style.height = '';
    }
  }

  // ── Modal ─────────────────────────────────
  function showModal(title, defaultVal = '') {
    return new Promise(res => {
      const overlay = document.getElementById('modalOverlay');
      const input   = document.getElementById('modalInput');
      document.getElementById('modalTitle').textContent = title;
      input.value = defaultVal;
      overlay.classList.remove('hidden');
      setTimeout(() => { input.focus(); input.select(); }, 50);

      function ok() {
        overlay.classList.add('hidden');
        off();
        res(input.value.trim() || null);
      }
      function cancel() {
        overlay.classList.add('hidden');
        off();
        res(null);
      }
      function keydown(e) {
        if (e.key === 'Enter') ok();
        if (e.key === 'Escape') cancel();
      }

      document.getElementById('modalOk').addEventListener('click', ok,     { once: true });
      document.getElementById('modalCancel').addEventListener('click', cancel, { once: true });
      input.addEventListener('keydown', keydown);

      function off() {
        input.removeEventListener('keydown', keydown);
        document.getElementById('modalOk').removeEventListener('click', ok);
        document.getElementById('modalCancel').removeEventListener('click', cancel);
      }
    });
  }

  // ── Settings modal ────────────────────────
  function openSettings() {
    document.getElementById('settingsOverlay').classList.remove('hidden');
  }
  function closeSettings() {
    document.getElementById('settingsOverlay').classList.add('hidden');
  }
  document.getElementById('settingsOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('settingsOverlay')) closeSettings();
  });

  // ── Pane divider drag ─────────────────────
  function initDividerDrag() {
    const divider = document.getElementById('paneDivider');
    const edPane  = document.getElementById('editorPane');
    const rtPane  = document.getElementById('rightPane');
    let dragging = false;

    divider.addEventListener('mousedown', e => {
      dragging = true;
      e.preventDefault();
    });
    divider.addEventListener('touchstart', e => {
      dragging = true;
    }, { passive: true });

    window.addEventListener('mousemove', e => {
      if (!dragging) return;
      resize(e.clientX, e.clientY);
    });
    window.addEventListener('touchmove', e => {
      if (!dragging) return;
      resize(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });

    window.addEventListener('mouseup',  () => { dragging = false; });
    window.addEventListener('touchend', () => { dragging = false; });

    function resize(x, y) {
      const main = document.querySelector('.main-area');
      const rect = main.getBoundingClientRect();
      const isRow = getComputedStyle(main).flexDirection === 'row';
      if (isRow) {
        const pct = Math.max(20, Math.min(80, (x - rect.left) / rect.width * 100));
        edPane.style.width  = pct + '%';
        rtPane.style.flex   = '1';
        edPane.style.flex   = 'none';
      } else {
        const pct = Math.max(20, Math.min(80, (y - rect.top) / rect.height * 100));
        edPane.style.height = pct + '%';
        rtPane.style.flex   = '1';
        edPane.style.flex   = 'none';
      }
    }
  }

})();
