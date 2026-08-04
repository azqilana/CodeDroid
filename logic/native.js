/* =========================================
   Native – Capacitor Bridge
   FolderPicker: plugin custom SAF Android
   ========================================= */

const Native = (() => {

  function isNative() {
    return !!(window.Capacitor?.isNativePlatform?.());
  }

  function getFolderPicker() {
    return window.Capacitor?.Plugins?.FolderPicker;
  }

  // Mapping virtualPath → { treeUri, docId }
  const fileMap = new Map();

  function clearMap() { fileMap.clear(); }
  function hasNativeFile(vp) { return fileMap.has(vp); }
  function getFileMap() { return fileMap; }

  // ── Buka folder via SAF Android ───────────────────────────────────
  async function pickAndImportFolder() {
    const FP = getFolderPicker();
    if (!FP) return { ok: false, files: [], error: 'FolderPicker plugin tidak tersedia' };

    try {
      const result = await FP.pickFolder();
      if (!result?.files?.length) return { ok: false, files: [], canceled: true };

      fileMap.clear();
      const imported = [];

      for (const f of result.files) {
        // f.name = path relatif misal "src/index.js"
        const virtualPath = '/' + f.name;
        fileMap.set(virtualPath, {
          treeUri: f.treeUri,
          docId:   f.docId
        });
        imported.push({
          virtualPath,
          name:    f.name.split('/').pop(),
          content: f.data || ''
        });
      }

      return { ok: true, files: imported };

    } catch (e) {
      if (e.message?.toLowerCase().includes('cancel')) {
        return { ok: false, files: [], canceled: true };
      }
      return { ok: false, files: [], error: e.message };
    }
  }

  // ── Pilih file satu/beberapa via SAF ─────────────────────────────
  async function pickFiles() {
    const FP = getFolderPicker();
    if (!FP) return { ok: false, files: [], error: 'Plugin tidak tersedia' };
    try {
      const result = await FP.pickFiles();
      if (!result?.files?.length) return { ok: false, files: [], canceled: true };

      const imported = [];
      for (const f of result.files) {
        const virtualPath = '/' + f.name;
        // Simpan mapping untuk save balik
        fileMap.set(virtualPath, {
          treeUri: f.treeUri || '',
          docId:   f.docId   || '',
          uri:     f.uri,
          singleFile: true
        });
        imported.push({
          virtualPath,
          name:    f.name,
          content: f.data || ''
        });
      }
      return { ok: true, files: imported };
    } catch (e) {
      if (e.message?.toLowerCase().includes('cancel')) {
        return { ok: false, files: [], canceled: true };
      }
      return { ok: false, files: [], error: e.message };
    }
  }

  // ── Simpan file balik ke device via SAF ───────────────────────────
  async function saveNativeFile(virtualPath, content) {
    const FP    = getFolderPicker();
    const entry = fileMap.get(virtualPath);
    if (!FP || !entry) return false;
    try {
      if (entry.singleFile) {
        await FP.saveSingleFile({ uri: entry.uri, content });
      } else {
        await FP.saveFile({ treeUri: entry.treeUri, docId: entry.docId, content });
      }
      return true;
    } catch (e) {
      console.error('saveNativeFile:', e);
      return false;
    }
  }

  // Fallback import dari input[webkitdirectory]
  async function importFolderNative(files) {
    return false; // tidak dipakai di APK
  }

  return {
    isNative,
    pickAndImportFolder,
    pickFiles,
    importFolderNative,
    saveNativeFile,
    hasNativeFile,
    clearMap,
    getFileMap,
  };
})();
