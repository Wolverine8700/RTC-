const CACHE_NAME = 'rtc-billing-pwa-v37';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-192.png',
  './icon-maskable-512.png'
];
// Cross-origin scripts the app needs to render (Tailwind CSS) - cached so the app also works offline
const CDN_CACHE_HOSTS = ['cdn.tailwindcss.com'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(async c => {
      await Promise.all(ASSETS.map(a => c.add(a).catch(() => {})));
      // Pre-cache Tailwind (opaque response is fine for <script src>)
      await c.add(new Request('https://cdn.tailwindcss.com/3.4.17', { mode: 'no-cors' })).catch(() => {});
    })
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Never cache Google Apps Script (live data) or Google Fonts CSS
  if (url.hostname === 'script.google.com' || url.hostname === 'script.googleusercontent.com' ||
      url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    return;
  }
  const isCdn = CDN_CACHE_HOSTS.includes(url.hostname);
  const isSameOrigin = url.origin === self.location.origin;
  if (!isCdn && !isSameOrigin) return;

  e.respondWith(
    fetch(req)
      .then(res => {
        const cacheable = res && ((isSameOrigin && res.status === 200 && res.type === 'basic') ||
                                  (isCdn && (res.status === 200 || res.type === 'opaque')));
        if (cacheable) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: true }).then(r => {
          if (r) return r;
          // Only page navigations fall back to index.html (not images/scripts)
          if (req.mode === 'navigate') return caches.match('./index.html');
          return Response.error();
        })
      )
  );
});
