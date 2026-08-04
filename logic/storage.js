/* =========================================
   Storage – IndexedDB wrapper
   ========================================= */

var Storage = (function() {
  var DB_NAME = 'codedroid';
  var DB_VER  = 2;
  var db = null;

  function open() {
    return new Promise(function(res, rej) {
      if (db) return res(db);
      var req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = function(e) {
        var d = e.target.result;
        if (!d.objectStoreNames.contains('files')) {
          d.createObjectStore('files', { keyPath: 'path' });
        }
        if (!d.objectStoreNames.contains('settings')) {
          d.createObjectStore('settings', { keyPath: 'key' });
        }
      };
      req.onsuccess = function(e) { db = e.target.result; res(db); };
      req.onerror   = function(e) { rej(e.target.error); };
    });
  }

  function tx(store, mode, fn) {
    return open().then(function(d) {
      return new Promise(function(res, rej) {
        var t   = d.transaction(store, mode);
        var s   = t.objectStore(store);
        var req = fn(s);
        req.onsuccess = function() { res(req.result); };
        req.onerror   = function() { rej(req.error); };
      });
    });
  }

  return {
    saveFile:  function(path, content) { return tx('files','readwrite', function(s) { return s.put({ path: path, content: content, updated: Date.now() }); }); },
    loadFile:  function(path)          { return tx('files','readonly',  function(s) { return s.get(path); }).then(function(r) { return r ? r.content : null; }); },
    deleteFile:function(path)          { return tx('files','readwrite', function(s) { return s.delete(path); }); },
    listFiles: function()              { return tx('files','readonly',  function(s) { return s.getAll(); }); },

    setSetting:  function(key, val) { return tx('settings','readwrite', function(s) { return s.put({ key: key, val: val }); }); },
    getSetting:  function(key)      { return tx('settings','readonly',  function(s) { return s.get(key); }).then(function(r) { return r ? r.val : null; }); },
    getAllSettings: function() {
      return tx('settings','readonly', function(s) { return s.getAll(); }).then(function(rows) {
        var obj = {};
        rows.forEach(function(r) { obj[r.key] = r.val; });
        return obj;
      });
    },
  };
})();
