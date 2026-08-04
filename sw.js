/* =========================================
   Service Worker – CodeDroid PWA
   ========================================= */

var CACHE = 'codedroid-v1';
var ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/style/app.css',
  '/style/editor.css',
  '/style/monokai.css',
  '/logic/storage.js',
  '/logic/files.js',
  '/logic/editor.js',
  '/logic/console.js',
  '/logic/preview.js',
  '/logic/app.js',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
  '/assets/icon.webp',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.17/codemirror.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.17/theme/monokai.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.17/codemirror.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.17/mode/htmlmixed/htmlmixed.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.17/mode/css/css.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.17/mode/javascript/javascript.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.17/mode/xml/xml.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.17/addon/edit/closebrackets.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.17/addon/edit/closetag.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.17/addon/edit/matchbrackets.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.17/addon/comment/comment.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.17/addon/fold/foldcode.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.17/addon/fold/foldgutter.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.17/addon/fold/brace-fold.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.17/addon/fold/xml-fold.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.17/addon/fold/indent-fold.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.17/addon/fold/foldgutter.min.css'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(cache) {
      return cache.addAll(ASSETS);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function(e) {
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      if (cached) return cached;
      return fetch(e.request).then(function(response) {
        // Cache CDN assets
        if (e.request.url.indexOf('cdnjs.cloudflare.com') !== -1) {
          var clone = response.clone();
          caches.open(CACHE).then(function(cache) { cache.put(e.request, clone); });
        }
        return response;
      }).catch(function() {
        // Offline fallback
        if (e.request.destination === 'document') {
          return caches.match('/index.html');
        }
      });
    })
  );
});
