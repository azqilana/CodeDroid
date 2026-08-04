/* =========================================
   Native – Capacitor Filesystem Bridge
   Mendeteksi apakah app jalan di APK Android
   atau di browser biasa, lalu pakai API yang sesuai
   ========================================= */

const Native = (() => {
  // Cek apakah Capacitor tersedia (jalan di APK)
  function isNative() {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  }

  // Lazy-load plugin hanya saat di APK
  function getFS() {
    return window.Capacitor?.Plugins?.Filesystem;
  }
  function getDialog() {
    return window.Capacitor?.Plugins?.Dialog;
  }

  // ── State ──────────────────────────────
  // Menyimpan mapping path virtual → path asli di device
  let nativeFileMap = new Map(); // virtualPath → nativePath (string uri)
  let openedFolderUri = null;

  // ── Buka Folder (native) ───────────────
  // Capacitor tidak punya folder picker resmi,
  // kita pakai @capacitor-community/file-picker atau
  // FilePicker dari @capawesome/capacitor-file-picker
  // Tapi karena kita hanya pakai @capacitor/filesystem,
  // kita buat sendiri dengan FilePicker input webkitdirectory
  // yang tetap bekerja di WebView Android (Chromium-based)
  // dan tulis balik pakai Filesystem.writeFile

  async function readNativeFile(uri) {
    const FS = getFS();
    if (!FS) return null;
    try {
      const result = await FS.readFile({ path: uri, encoding: 'utf8' });
      return result.data;
    } catch (e) {
      console.error('Native readFile error:', e);
      return null;
    }
  }

  async function writeNativeFile(uri, content) {
    const FS = getFS();
    if (!FS) return false;
    try {
      await FS.writeFile({ path: uri, data: content, encoding: 'utf8', recursive: true });
      return true;
    } catch (e) {
      console.error('Native writeFile error:', e);
      return false;
    }
  }

  // Konversi file dari input[webkitdirectory] ke URI native
  // Di Android WebView, file.name dan webkitRelativePath tersedia
  // URI native bisa didapat dari path absolut via Filesystem
  async function importFolderNative(files) {
    const FS = getFS();
    if (!FS) return false;

    nativeFileMap.clear();
    openedFolderUri = null;

    // Ambil root folder dari file pertama
    const firstRel = files[0]?.webkitRelativePath || '';
    const rootFolder = firstRel.split('/')[0] || 'project';

    // Di Android, kita simpan ke Documents/CodeDroid/<rootFolder>/
    const baseDir = `CodeDroid/${rootFolder}`;

    // Tulis semua file ke Documents dulu (sebagai "workspace")
    for (const f of files) {
      const relPath = f.webkitRelativePath || f.name;
      const virtualPath = '/' + relPath;
      const nativePath = `${baseDir}/${relPath.split('/').slice(1).join('/')}`;

      try {
        const content = await f.text();
        await FS.writeFile({
          path: nativePath,
          data: content,
          encoding: 'utf8',
          directory: 'DOCUMENTS',
          recursive: true
        });
        // Simpan mapping: virtualPath → nativePath untuk tulis balik nanti
        nativeFileMap.set(virtualPath, { nativePath, directory: 'DOCUMENTS' });
      } catch (e) {
        console.warn('Skip file:', relPath, e.message);
      }
    }

    openedFolderUri = baseDir;
    return true;
  }

  async function saveNativeFile(virtualPath, content) {
    const FS = getFS();
    if (!FS) return false;
    const entry = nativeFileMap.get(virtualPath);
    if (!entry) return false;
    return await writeNativeFile(entry.nativePath, content) ||
      // fallback dengan directory
      (await FS.writeFile({
        path: entry.nativePath,
        data: content,
        encoding: 'utf8',
        directory: entry.directory,
        recursive: true
      }).then(() => true).catch(() => false));
  }

  function hasNativeFile(virtualPath) {
    return nativeFileMap.has(virtualPath);
  }

  function getOpenedFolder() {
    return openedFolderUri;
  }

  function clearMap() {
    nativeFileMap.clear();
    openedFolderUri = null;
  }

  return {
    isNative,
    importFolderNative,
    saveNativeFile,
    hasNativeFile,
    getOpenedFolder,
    clearMap,
  };
})();
