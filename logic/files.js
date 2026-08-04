/* =========================================
   Files – Virtual File System
   ========================================= */

const FileSystem = (() => {
  // tree: { name, type:'file'|'folder', path, children?, content? }
  let tree = [];
  let listeners = [];

  function notify() { listeners.forEach(fn => fn(tree)); }

  function getNode(path, nodes = tree) {
    for (const n of nodes) {
      if (n.path === path) return n;
      if (n.type === 'folder' && n.children) {
        const found = getNode(path, n.children);
        if (found) return found;
      }
    }
    return null;
  }

  function getParentList(path, nodes = tree) {
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].path === path) return nodes;
      if (nodes[i].type === 'folder' && nodes[i].children) {
        const found = getParentList(path, nodes[i].children);
        if (found) return found;
      }
    }
    return null;
  }

  function allFilePaths(nodes = tree, out = []) {
    for (const n of nodes) {
      if (n.type === 'file') out.push(n.path);
      if (n.type === 'folder' && n.children) allFilePaths(n.children, out);
    }
    return out;
  }

  function serialize() {
    return JSON.stringify(tree.map(serializeNode));
  }
  function serializeNode(n) {
    if (n.type === 'file') return { name:n.name, type:'file', path:n.path };
    return { name:n.name, type:'folder', path:n.path, open:n.open,
             children:(n.children||[]).map(serializeNode) };
  }

  async function save() {
    await Storage.setSetting('fs_tree', serialize());
  }
  // Hapus SEMUA data — tree + konten file
  async function reset() {
    await Storage.clearAllFiles();
    await Storage.clearFsTree();
    tree = [];
  }

  async function load() {
    const raw = await Storage.getSetting('fs_tree');
    if (raw) tree = JSON.parse(raw);
    else {
      // Pertama kali buka — tree kosong, tampilkan welcome screen
      tree = [];
    }
  }

  // ── Public API ──────────────────────────

  async function createFile(name, parentPath = null) {
    const path = parentPath ? `${parentPath}/${name}` : `/${name}`;
    if (getNode(path)) throw new Error('File sudah ada');
    const node = { name, type:'file', path };
    if (parentPath) {
      const parent = getNode(parentPath);
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

  async function createFolder(name, parentPath = null) {
    const path = parentPath ? `${parentPath}/${name}` : `/${name}`;
    const node = { name, type:'folder', path, children:[], open:true };
    if (parentPath) {
      const parent = getNode(parentPath);
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
    const list = getParentList(path);
    if (!list) return;
    const idx = list.findIndex(n => n.path === path);
    if (idx < 0) return;
    const node = list[idx];
    // delete all file contents
    const paths = node.type === 'file' ? [node.path] : allFilePaths([node]);
    for (const p of paths) await Storage.deleteFile(p);
    list.splice(idx, 1);
    await save();
    notify();
    return paths;
  }

  async function renameNode(path, newName) {
    const node = getNode(path);
    if (!node) throw new Error('Node tidak ditemukan');
    const parentPath = path.substring(0, path.lastIndexOf('/')) || null;
    const newPath = parentPath ? `${parentPath}/${newName}` : `/${newName}`;

    const oldContent = node.type === 'file' ? await Storage.loadFile(path) : null;

    // Update node
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

  async function readFile(path)         { return await Storage.loadFile(path); }
  async function writeFile(path, content) {
    await Storage.saveFile(path, content);
  }

  function onChange(fn) { listeners.push(fn); }

  function getMimeForExt(name) {
    const ext = name.split('.').pop().toLowerCase();
    return { html:'text/html', htm:'text/html', css:'text/css',
             js:'application/javascript', json:'application/json',
             txt:'text/plain', md:'text/markdown',
             svg:'image/svg+xml', xml:'text/xml' }[ext] || 'text/plain';
  }

  function modeForFile(name) {
    const ext = (name.split('.').pop()||'').toLowerCase();
    if (['html','htm'].includes(ext)) return 'htmlmixed';
    if (ext === 'css') return 'css';
    if (['js','mjs','cjs'].includes(ext)) return 'javascript';
    if (ext === 'json') return { name:'javascript', json:true };
    if (ext === 'xml' || ext === 'svg') return 'xml';
    return 'null';
  }

  function getTree() { return tree; }

  return { load, reset, createFile, createFolder, deleteNode, renameNode,
           readFile, writeFile, onChange, getMimeForExt, modeForFile, getTree };
})();

/* ── Default content ── */
const defaultHTML = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Hello CodeDroid</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <div class="container">
    <h1>🚀 Hello, <span class="highlight">CodeDroid!</span></h1>
    <p>Edit kode di sebelah kiri, lihat hasilnya di sini.</p>
    <button onclick="greet()">Klik Saya</button>
    <div id="output"></div>
  </div>
  <script src="script.js"><\/script>
</body>
</html>`;

const defaultCSS = `* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, sans-serif;
  background: #1a1a2e;
  color: #e0e0e0;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}

.container {
  text-align: center;
  padding: 40px 20px;
}

h1 {
  font-size: 2rem;
  margin-bottom: 16px;
}

.highlight {
  color: #f92672;
}

p {
  color: #90908a;
  margin-bottom: 24px;
}

button {
  padding: 12px 28px;
  background: #f92672;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  cursor: pointer;
  transition: opacity 0.2s;
}

button:hover {
  opacity: 0.85;
}

#output {
  margin-top: 20px;
  font-size: 1.2rem;
  color: #a6e22e;
}`;

const defaultJS = `function greet() {
  const messages = [
    "Halo Dunia! 👋",
    "Selamat Coding! 💻",
    "Keep Building! 🚀",
    "You Got This! ⚡",
  ];
  const msg = messages[Math.floor(Math.random() * messages.length)];
  document.getElementById('output').textContent = msg;
  console.log('Pesan:', msg);
}

console.log('Script dimuat!');
`;
