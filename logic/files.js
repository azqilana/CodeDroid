/* =========================================
   Files – Virtual File System
   ========================================= */

var FileSystem = (function() {
  var tree = [];
  var listeners = [];

  function notify() {
    listeners.forEach(function(fn) { fn(tree); });
  }

  function getNode(path, nodes) {
    nodes = nodes || tree;
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].path === path) return nodes[i];
      if (nodes[i].type === 'folder' && nodes[i].children) {
        var found = getNode(path, nodes[i].children);
        if (found) return found;
      }
    }
    return null;
  }

  function getParentList(path, nodes) {
    nodes = nodes || tree;
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].path === path) return nodes;
      if (nodes[i].type === 'folder' && nodes[i].children) {
        var found = getParentList(path, nodes[i].children);
        if (found) return found;
      }
    }
    return null;
  }

  function allFilePaths(nodes, out) {
    out = out || [];
    nodes = nodes || [];
    nodes.forEach(function(n) {
      if (n.type === 'file') out.push(n.path);
      if (n.type === 'folder' && n.children) allFilePaths(n.children, out);
    });
    return out;
  }

  function serialize() {
    return JSON.stringify(tree.map(serializeNode));
  }

  function serializeNode(n) {
    if (n.type === 'file') return { name: n.name, type: 'file', path: n.path };
    return { name: n.name, type: 'folder', path: n.path, open: n.open,
             children: (n.children || []).map(serializeNode) };
  }

  async function save() {
    await Storage.setSetting('fs_tree', serialize());
  }

  async function load() {
    var raw = await Storage.getSetting('fs_tree');
    if (raw) {
      try { tree = JSON.parse(raw); } catch(e) { tree = []; }
    }
    if (!tree) tree = [];
  }

  function isEmpty() { return tree.length === 0; }

  async function createFile(name, parentPath) {
    var path = parentPath ? parentPath + '/' + name : '/' + name;
    if (getNode(path)) throw new Error('File sudah ada: ' + path);
    var node = { name: name, type: 'file', path: path };
    if (parentPath) {
      var parent = getNode(parentPath);
      if (!parent || parent.type !== 'folder') throw new Error('Folder tidak ditemukan');
      parent.children = parent.children || [];
      parent.children.push(node);
    } else {
      tree.push(node);
    }
    await Storage.saveFile(path, '');
    await save();
    notify();
    return node;
  }

  async function createFolder(name, parentPath) {
    var path = parentPath ? parentPath + '/' + name : '/' + name;
    var node = { name: name, type: 'folder', path: path, children: [], open: true };
    if (parentPath) {
      var parent = getNode(parentPath);
      if (!parent || parent.type !== 'folder') throw new Error('Folder tidak ditemukan');
      parent.children = parent.children || [];
      parent.children.push(node);
    } else {
      tree.push(node);
    }
    await save();
    notify();
    return node;
  }

  async function deleteNode(path) {
    var list = getParentList(path);
    if (!list) return [];
    var idx = -1;
    for (var i = 0; i < list.length; i++) { if (list[i].path === path) { idx = i; break; } }
    if (idx < 0) return [];
    var node = list[idx];
    var paths = node.type === 'file' ? [node.path] : allFilePaths([node]);
    for (var j = 0; j < paths.length; j++) await Storage.deleteFile(paths[j]);
    list.splice(idx, 1);
    await save();
    notify();
    return paths;
  }

  async function renameNode(path, newName) {
    var node = getNode(path);
    if (!node) throw new Error('Node tidak ditemukan');
    var lastSlash = path.lastIndexOf('/');
    var parentPath = lastSlash > 0 ? path.substring(0, lastSlash) : '';
    var newPath = parentPath ? parentPath + '/' + newName : '/' + newName;
    var oldContent = node.type === 'file' ? await Storage.loadFile(path) : null;
    node.name = newName;
    node.path = newPath;
    if (node.type === 'file' && oldContent !== null) {
      await Storage.deleteFile(path);
      await Storage.saveFile(newPath, oldContent);
    }
    await save();
    notify();
    return newPath;
  }

  function getMimeForExt(name) {
    var ext = (name.split('.').pop() || '').toLowerCase();
    var map = { html:'text/html', htm:'text/html', css:'text/css',
                js:'application/javascript', json:'application/json',
                txt:'text/plain', md:'text/markdown',
                svg:'image/svg+xml', xml:'text/xml' };
    return map[ext] || 'text/plain';
  }

  return {
    load: load,
    createFile: createFile,
    createFolder: createFolder,
    deleteNode: deleteNode,
    renameNode: renameNode,
    readFile: function(path) { return Storage.loadFile(path); },
    writeFile: function(path, content) { return Storage.saveFile(path, content); },
    onChange: function(fn) { listeners.push(fn); },
    getMimeForExt: getMimeForExt,
    getTree: function() { return tree; },
    isEmpty: isEmpty,
  };
})();

/* ── Default starter content ── */
var DEFAULT_HTML = '<!DOCTYPE html>\n<html lang="id">\n<head>\n  <meta charset="UTF-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n  <title>Hello CodeDroid</title>\n  <link rel="stylesheet" href="style.css" />\n</head>\n<body>\n  <div class="container">\n    <h1>\uD83D\uDE80 Hello, <span class="highlight">CodeDroid!</span></h1>\n    <p>Edit kode di editor, lihat hasilnya di preview.</p>\n    <button onclick="greet()">Klik Saya \u26A1</button>\n    <div id="output"></div>\n  </div>\n  <script src="script.js"><\/script>\n</body>\n</html>';

var DEFAULT_CSS = '* { box-sizing: border-box; margin: 0; padding: 0; }\n\nbody {\n  font-family: -apple-system, sans-serif;\n  background: #1a1a2e;\n  color: #e0e0e0;\n  min-height: 100vh;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n}\n\n.container {\n  text-align: center;\n  padding: 40px 20px;\n}\n\nh1 { font-size: 2rem; margin-bottom: 16px; }\n\n.highlight { color: #f92672; }\n\np { color: #90908a; margin-bottom: 24px; }\n\nbutton {\n  padding: 12px 28px;\n  background: #f92672;\n  color: white;\n  border: none;\n  border-radius: 8px;\n  font-size: 16px;\n  cursor: pointer;\n  transition: opacity 0.2s;\n}\n\nbutton:hover { opacity: 0.85; }\n\n#output { margin-top: 20px; font-size: 1.2rem; color: #a6e22e; }';

var DEFAULT_JS = 'function greet() {\n  var messages = [\n    "Halo Dunia! \uD83D\uDC4B",\n    "Selamat Coding! \uD83D\uDCBB",\n    "Keep Building! \uD83D\uDE80",\n    "You Got This! \u26A1",\n  ];\n  var msg = messages[Math.floor(Math.random() * messages.length)];\n  document.getElementById("output").textContent = msg;\n  console.log("Pesan:", msg);\n}\n\nconsole.log("Script dimuat!");';
