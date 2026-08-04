/* =========================================
   Preview – iframe renderer
   ========================================= */

const Preview = (() => {
  // Console bridge injected into preview
  const BRIDGE = `
<script>
(function(){
  var _parent = window.parent;
  function send(type, args) {
    try {
      _parent.postMessage({ source:'codedroid-preview', type:type, args:args }, '*');
    } catch(e) {}
  }
  function safe(a) {
    return Array.from(a).map(function(x){
      if (x === null) return 'null';
      if (x === undefined) return 'undefined';
      if (x instanceof Error) return x.name + ': ' + x.message;
      if (typeof x === 'object') { try { return JSON.stringify(x); } catch(e) { return String(x); } }
      return String(x);
    });
  }
  var _log   = console.log.bind(console);
  var _info  = console.info.bind(console);
  var _warn  = console.warn.bind(console);
  var _error = console.error.bind(console);
  console.log   = function(){ send('log',   safe(arguments)); _log.apply(console, arguments);   };
  console.info  = function(){ send('info',  safe(arguments)); _info.apply(console, arguments);  };
  console.warn  = function(){ send('warn',  safe(arguments)); _warn.apply(console, arguments);  };
  console.error = function(){ send('error', safe(arguments)); _error.apply(console, arguments); };
  window.onerror = function(msg, src, line, col, err){
    send('error', [(err ? err.name+': ' : '') + msg + ' (line ' + line + ')']);
    return false;
  };
  window.onunhandledrejection = function(e){
    send('error', ['Unhandled Promise: ' + (e.reason || 'unknown')]);
  };
})();
<\/script>`;

  function injectBridge(html) {
    if (html.includes('<head>')) return html.replace('<head>', '<head>' + BRIDGE);
    if (html.includes('<html>')) return html.replace('<html>', '<html>' + BRIDGE);
    return BRIDGE + html;
  }

  function run() {
    const html = Editor.buildPreviewHTML();
    const injected = injectBridge(html);
    const frame = document.getElementById('previewFrame');
    if (!frame) return;

    // Use srcdoc for isolated context
    frame.srcdoc = injected;
    ConsoleLog.system('▶ Preview diperbarui');
  }

  function refresh() { run(); }

  return { run, refresh };
})();
