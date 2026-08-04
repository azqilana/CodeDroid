/* =========================================
   Console – log capture and display
   ========================================= */

const ConsoleLog = (() => {
  const MAX_LINES = 500;
  let lines = [];
  let errorCount = 0;

  function fmt(args) {
    return args.map(a => {
      if (a === null) return 'null';
      if (a === undefined) return 'undefined';
      if (typeof a === 'string') return a;
      if (a instanceof Error) return `${a.name}: ${a.message}`;
      try { return JSON.stringify(a, null, 2); } catch { return String(a); }
    }).join(' ');
  }

  function append(type, ...args) {
    const text = fmt(args);
    lines.push({ type, text });
    if (lines.length > MAX_LINES) lines.shift();
    if (type === 'error') errorCount++;
    renderLine({ type, text });
    updateCount();
  }

  function renderLine(line) {
    const out = document.getElementById('consoleOutput');
    if (!out) return;
    const div = document.createElement('div');
    div.className = `log-line log-${line.type}`;
    const prefix = { log:'', info:'ℹ ', warn:'⚠ ', error:'✖ ', result:'← ', system:'• ' }[line.type] || '';
    div.innerHTML = `<span class="log-prefix">${prefix}</span>${escHtml(line.text)}`;
    out.appendChild(div);
    out.scrollTop = out.scrollHeight;
  }

  function updateCount() {
    const el = document.getElementById('consoleCount');
    if (!el) return;
    if (errorCount > 0) { el.textContent = errorCount + ' err'; el.style.display = ''; }
    else { el.style.display = 'none'; }
  }

  function clear() {
    lines = [];
    errorCount = 0;
    const out = document.getElementById('consoleOutput');
    if (out) out.innerHTML = '';
    updateCount();
  }

  function system(msg) { append('system', msg); }

  function evalInFrame(expr) {
    const frame = document.getElementById('previewFrame');
    if (!frame || !frame.contentWindow) {
      append('error', 'Preview frame tidak tersedia');
      return;
    }
    try {
      const result = frame.contentWindow.eval(expr);
      append('result', result);
    } catch (e) {
      append('error', e.message);
    }
  }

  return { append, clear, system, evalInFrame };
})();

// ── Listen to messages from iframe ──
window.addEventListener('message', e => {
  if (!e.data || e.data.source !== 'codedroid-preview') return;
  const { type, args } = e.data;
  ConsoleLog.append(type || 'log', ...(args || []));
});
