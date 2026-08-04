/* =========================================
   Storage – IndexedDB wrapper
   ========================================= */

const Storage = (() => {
  const DB_NAME = 'codedroid';
  const DB_VER  = 2;
  let db = null;

  function open() {
    return new Promise((res, rej) => {
      if (db) return res(db);
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = e => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains('files')) {
          d.createObjectStore('files', { keyPath: 'path' });
        }
        if (!d.objectStoreNames.contains('settings')) {
          d.createObjectStore('settings', { keyPath: 'key' });
        }
      };
      req.onsuccess  = e => { db = e.target.result; res(db); };
      req.onerror    = e => rej(e.target.error);
    });
  }

  function tx(store, mode, fn) {
    return open().then(d => new Promise((res, rej) => {
      const t = d.transaction(store, mode);
      const s = t.objectStore(store);
      const req = fn(s);
      req.onsuccess = () => res(req.result);
      req.onerror   = () => rej(req.error);
    }));
  }

  return {
    // Files
    saveFile: (path, content) => tx('files','readwrite', s => s.put({ path, content, updated: Date.now() })),
    loadFile: (path)          => tx('files','readonly',  s => s.get(path)).then(r => r?.content ?? null),
    deleteFile:(path)         => tx('files','readwrite', s => s.delete(path)),
    listFiles: ()             => tx('files','readonly',  s => s.getAll()),

    clearAllFiles: () => tx('files','readwrite', s => s.clear()),
    clearFsTree:   () => tx('settings','readwrite', s => s.delete('fs_tree')),

    // Settings
    setSetting: (key, val) => tx('settings','readwrite', s => s.put({ key, val })),
    getSetting: (key)      => tx('settings','readonly',  s => s.get(key)).then(r => r?.val ?? null),
    getAllSettings: ()      => tx('settings','readonly',  s => s.getAll()).then(rows => {
      const obj = {};
      rows.forEach(r => obj[r.key] = r.val);
      return obj;
    }),
  };
})();
