// Coffee Review — Service Worker
// Cache strategy:
//   • App shell + CDN libs: stale-while-revalidate
//   • Supabase API: pass-through, always go to network

const VERSION = 'v8';
const CACHE = `coffee-review-${VERSION}`;

const APP_SHELL = [
    './',
    './index.html',
    './app.js',
    './styles.css',
    './manifest.json',
    './icons/icon-192.png',
    './icons/icon-512.png',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js',
    'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css',
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE)
            .then(cache => cache.addAll(APP_SHELL).catch(() =>
                Promise.all(APP_SHELL.map(u => cache.add(u).catch(() => null)))
            ))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => k !== CACHE).map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

function shouldBypass(url) {
    const host = url.hostname;
    // Supabase REST / Realtime / Storage — always go to network
    if (host.endsWith('.supabase.co') || host.endsWith('.supabase.in')) return true;
    // Google Maps / Places — always go to network (避免快取 API 回應與動態 JS)
    if (host === 'maps.googleapis.com' || host === 'places.googleapis.com') return true;
    return false;
}

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;
    const url = new URL(event.request.url);
    if (shouldBypass(url)) return;

    event.respondWith((async () => {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(event.request);
        const networkPromise = fetch(event.request)
            .then(res => {
                if (res && res.ok && (res.type === 'basic' || res.type === 'cors')) {
                    cache.put(event.request, res.clone()).catch(() => {});
                }
                return res;
            })
            .catch(() => null);
        const res = cached || await networkPromise;
        return res || new Response(
            '離線且無快取',
            { status: 504, statusText: 'Gateway Timeout', headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
        );
    })());
});
