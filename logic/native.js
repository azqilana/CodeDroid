/* =========================================
   Native – Capacitor Bridge
   - Di APK: pakai FilePicker + Filesystem
   - Di browser: pakai FSA / input fallback
   ========================================= */

const Native = (() => {

  function isNative() {
    return !!(window.Capacitor?.isNativePlatform?.());
  }

  function getFS() {
    return window.Capacitor?.Plugins?.Filesystem;
  }

  function getPicker() {
    return window.Capacitor?.Plugins?.FilePicker;
  }

  // Mapping virtualPath → { nativePath, directory }
  const fileMap = new Map();

  function clearMap() {
    fileMap.clear();
  }

  function hasNativeFile(virtualPath) {
    return fileMap.has(virtualPath);
  }

  // ── Buka folder via FilePicker native ──────────────────────────────
  // Memilih banyak file sekaligus (simulasi folder)
  async function pickAndImportFolder() {
    const Picker = getPicker();
    const FS    = getFS();
    if (!Picker || !FS) return { ok: false, files: [] };

    try {
      // Pilih banyak file sekaligus
      const result = await Picker.pickFiles({
        multiple: true,
        readData: true   // baca konten langsung sebagai base64
      });

      if (!result?.files?.length) return { ok: false, files: [] };

      const imported = [];
      // Tentukan root folder dari nama file pertama (tidak ada path relatif di FilePicker)
      // Kita simpan flat di Documents/CodeDroid/
      const baseDir = 'CodeDroid/project';

      for (const f of result.files) {
        const name = f.name || 'file.txt';
        const nativePath = `${baseDir}/${name}`;
        const virtualPath = `/project/${name}`;

        // Decode base64 → string
        let content = '';
        try {
          content = f.data ? atob(f.data) : '';
        } catch (_) { content = ''; }

        // Tulis ke Documents
        try {
          await FS.writeFile({
            path: nativePath,
            data: content,
            encoding: 'utf8',
            directory: 'DOCUMENTS',
            recursive: true
          });
          fileMap.set(virtualPath, { nativePath, directory: 'DOCUMENTS' });
          imported.push({ virtualPath, name, content });
        } catch (e) {
          console.warn('Skip:', name, e.message);
        }
      }

      return { ok: true, files: imported };

    } catch (e) {
      if (e.message?.includes('cancel') || e.code === 'CANCELED') {
        return { ok: false, files: [], canceled: true };
      }
      console.error('FilePicker error:', e);
      return { ok: false, files: [], error: e.message };
    }
  }

  // ── Import folder dari input[webkitdirectory] (fallback) ───────────
  async function importFolderNative(files) {
    const FS = getFS();
    if (!FS) return false;
    fileMap.clear();

    const firstRel  = files[0]?.webkitRelativePath || '';
    const rootFolder = firstRel.split('/')[0] || 'project';
    const baseDir   = `CodeDroid/${rootFolder}`;

    for (const f of files) {
      const relPath    = f.webkitRelativePath || f.name;
      const virtualPath = '/' + relPath;
      const nativePath  = `${baseDir}/${relPath.split('/').slice(1).join('/')}`;

      try {
        const content = await f.text();
        await FS.writeFile({
          path: nativePath,
          data: content,
          encoding: 'utf8',
          directory: 'DOCUMENTS',
          recursive: true
        });
        fileMap.set(virtualPath, { nativePath, directory: 'DOCUMENTS' });
      } catch (e) {
        console.warn('Skip:', relPath, e.message);
      }
    }
    return true;
  }

  // ── Simpan file balik ke device ────────────────────────────────────
  async function saveNativeFile(virtualPath, content) {
    const FS    = getFS();
    const entry = fileMap.get(virtualPath);
    if (!FS || !entry) return false;
    try {
      await FS.writeFile({
        path: entry.nativePath,
        data: content,
        encoding: 'utf8',
        directory: entry.directory,
        recursive: true
      });
      return true;
    } catch (e) {
      console.error('saveNativeFile error:', e);
      return false;
    }
  }

  function getFileMap() { return fileMap; }

  return {
    isNative,
    pickAndImportFolder,
    importFolderNative,
    saveNativeFile,
    hasNativeFile,
    clearMap,
    getFileMap,
  };
})();
