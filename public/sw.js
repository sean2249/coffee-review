// Coffee Review — Service Worker
// Cache strategy:
//   • 整頁導航: network-first，離線才用快取（讓 Access 的重新登入能發生）
//   • App shell + CDN libs: stale-while-revalidate
//   • /api/* 與 /cdn-cgi/*: pass-through, always go to network

const VERSION = 'v16';
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

// API 與 Cloudflare Access 的端點一律不進快取。這比舊的 Supabase 規則更要緊：
// Access 的 session 過期時 /api/* 會被 302 導去登入頁，下面的 handler 會把跟隨
// 重導後那個 200 的 HTML 登入頁存到 /api/records 底下，之後永遠回錯的東西。
function shouldBypass(url) {
    if (url.origin !== self.location.origin) return false;
    if (url.pathname.startsWith('/api/')) return true;
    if (url.pathname.startsWith('/cdn-cgi/')) return true;
    return false;
}

// 整頁導航走 network-first，離線才退回快取。Cloudflare Access 的 session 過期時，
// 只有導航請求真的到達邊緣，才會被 302 去 Google 重新登入 —— 若從快取回 index.html，
// app.js 的「重新載入」永遠碰不到 Access，/api/* 一直 302，使用者卡在擋板上。
// 導航請求的 redirect mode 是 manual，所以拿到的是 opaqueredirect，原樣交回給
// 瀏覽器，由它去跟隨。
async function handleNavigate(request) {
    const cache = await caches.open(CACHE);
    try {
        const res = await fetch(request);
        if (res.ok && res.type === 'basic') cache.put(request, res.clone()).catch(() => {});
        return res;
    } catch {
        const cached = await cache.match(request) || await cache.match('./index.html');
        return cached || new Response(
            '離線且無快取',
            { status: 504, statusText: 'Gateway Timeout', headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
        );
    }
}

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;
    const url = new URL(event.request.url);
    if (shouldBypass(url)) return;
    if (event.request.mode === 'navigate') {
        event.respondWith(handleNavigate(event.request));
        return;
    }

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
