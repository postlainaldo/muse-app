const CACHE_NAME = 'muse-cache-v2';
const urlsToCache = [
  './',
  './index.html'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(urlsToCache);
    })
  );
});

// Cơ chế thông minh: Luôn tải mã nguồn mới nhất khi có mạng, chỉ dùng cache khi ngoại tuyến
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});