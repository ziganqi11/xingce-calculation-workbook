const CACHE = 'xingce-workbook-shell-v16';
const SHELL = ['./', './index.html', './style.css?v=16', './app.js?v=16', './division.js', './manifest.json', './icon.svg', './assets/study-calf.svg', './assets/study-notes.svg'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL.map(path => new Request(path, {cache:'reload'})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('xingce-workbook-shell-') && key !== CACHE).map(key => caches.delete(key)))), self.clients.claim()]));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.includes('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request,{cache:'reload'}).catch(() => caches.match('./index.html')));
    return;
  }
  event.respondWith(fetch(request,{cache:'reload'}).then(response => {
    if (response.ok) { const copy=response.clone(); caches.open(CACHE).then(cache => cache.put(request, copy)); }
    return response;
  }).catch(() => caches.match(request)));
});
