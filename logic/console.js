/* =========================================
   Console – log capture and display
   ========================================= */

var ConsoleLog = (function() {
  var MAX_LINES = 300;
  var lines = [];
  var errorCount = 0;

  function fmt(args) {
    return Array.prototype.slice.call(args).map(function(a) {
      if (a === null) return 'null';
      if (a === undefined) return 'undefined';
      if (typeof a === 'string') return a;
      if (a instanceof Error) return a.name + ': ' + a.message;
      try { return JSON.stringify(a, null, 2); } catch(e) { return String(a); }
    }).join(' ');
  }

  function append(type, args_or_str) {
    var text;
    if (typeof args_or_str === 'string') {
      text = args_or_str;
    } else {
      text = fmt(Array.prototype.slice.call(arguments, 1));
    }
    lines.push({ type: type, text: text });
    if (lines.length > MAX_LINES) lines.shift();
    if (type === 'error') errorCount++;
    renderLine({ type: type, text: text });
    updateCount();
  }

  function renderLine(line) {
    var out = document.getElementById('consoleOutput');
    if (!out) return;
    var div = document.createElement('div');
    div.className = 'log-line log-' + line.type;
    var prefixes = { log:'', info:'ℹ ', warn:'⚠ ', error:'✖ ', result:'← ', system:'• ' };
    var prefix = prefixes[line.type] || '';
    div.innerHTML = '<span class="log-prefix">' + prefix + '</span>' + escHtml(String(line.text));
    out.appendChild(div);
    out.scrollTop = out.scrollHeight;
  }

  function updateCount() {
    var el = document.getElementById('consoleCount');
    if (!el) return;
    if (errorCount > 0) {
      el.textContent = errorCount + ' err';
      el.style.display = '';
    } else {
      el.style.display = 'none';
    }
  }

  function clear() {
    lines = [];
    errorCount = 0;
    var out = document.getElementById('consoleOutput');
    if (out) out.innerHTML = '';
    updateCount();
  }

  function system(msg) { append('system', msg); }

  function evalInFrame(expr) {
    var frame = document.getElementById('previewFrame');
    if (!frame || !frame.contentWindow) {
      append('error', 'Preview frame tidak tersedia. Jalankan preview dulu.');
      return;
    }
    try {
      var result = frame.contentWindow.eval(expr);
      if (result !== undefined) {
        append('result', String(result));
      }
    } catch(e) {
      append('error', e.message);
    }
  }

  return {
    append: append,
    clear: clear,
    system: system,
    evalInFrame: evalInFrame,
  };
})();

// Listen pesan dari iframe
window.addEventListener('message', function(e) {
  if (!e.data || e.data.source !== 'codedroid-preview') return;
  var type = e.data.type || 'log';
  var args = e.data.args;
  var text;
  if (Array.isArray(args)) {
    text = args.join(' ');
  } else if (args !== undefined && args !== null) {
    text = String(args);
  } else {
    text = '';
  }
  if (text) ConsoleLog.append(type, text);
});
