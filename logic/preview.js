/* =========================================
   Preview – iframe renderer
   ========================================= */

var Preview = (function() {
  var BRIDGE = '<script>' +
    '(function(){' +
    'var p=window.parent;' +
    'function send(t,a){try{p.postMessage({source:"codedroid-preview",type:t,args:a},"*");}catch(e){}}' +
    'function safe(a){return Array.prototype.slice.call(a).map(function(x){' +
      'if(x===null)return"null";if(x===undefined)return"undefined";' +
      'if(x instanceof Error)return x.name+": "+x.message;' +
      'if(typeof x==="object"){try{return JSON.stringify(x);}catch(e){return String(x);}}' +
      'return String(x);' +
    '});}' +
    'var _l=console.log.bind(console),_i=console.info.bind(console),' +
    '_w=console.warn.bind(console),_e=console.error.bind(console);' +
    'console.log=function(){send("log",safe(arguments));_l.apply(console,arguments);};' +
    'console.info=function(){send("info",safe(arguments));_i.apply(console,arguments);};' +
    'console.warn=function(){send("warn",safe(arguments));_w.apply(console,arguments);};' +
    'console.error=function(){send("error",safe(arguments));_e.apply(console,arguments);};' +
    'window.onerror=function(msg,src,line,col,err){' +
      'send("error",[(err?err.name+": ":"")+msg+" (baris "+line+")"]);return false;};' +
    'window.onunhandledrejection=function(e){' +
      'send("error",["Promise error: "+String(e.reason||"unknown")]);};' +
    '})();' +
  '<\/script>';

  function injectBridge(html) {
    if (/<head>/i.test(html)) return html.replace(/<head>/i, '<head>' + BRIDGE);
    if (/<html>/i.test(html)) return html.replace(/<html>/i, '<html>' + BRIDGE);
    return BRIDGE + html;
  }

  function run() {
    var html = Editor.buildPreviewHTML();
    if (!html || html.trim() === '') {
      html = '<html><body style="background:#272822;color:#75715e;font-family:monospace;padding:20px">Tulis kode HTML dulu...</body></html>';
    }
    var injected = injectBridge(html);
    var frame = document.getElementById('previewFrame');
    if (!frame) return;
    frame.srcdoc = injected;
  }

  return {
    run: run,
    refresh: run,
  };
})();
