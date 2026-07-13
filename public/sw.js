const CACHE_NAME = 'badcot-cache-v3';
const ASSETS_TO_CACHE = [
  '/manifest.json',
  '/badcotlogo.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // Next.js HTML/청크는 배포·개발 시 파일명이 바뀌므로 서비스워커가 캐시하지 않는다.
  // 그렇지 않으면 이전 HTML이 새 빌드에 없는 청크를 요청하여 404가 발생한다.
  const isNextAsset = requestUrl.pathname.startsWith('/_next/');
  const isDocument = event.request.destination === 'document';

  // Bypass Supabase, API, HTML and Next.js assets to prevent stale app shells.
  if (
    event.request.url.includes('supabase.co') ||
    event.request.url.includes('/api/') ||
    event.request.method !== 'GET' ||
    isNextAsset ||
    isDocument ||
    requestUrl.pathname === '/sw.js'
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((response) => {
        // 허용한 정적 자산만 동적으로 캐시한다.
        if (response.status === 200 && ASSETS_TO_CACHE.includes(requestUrl.pathname)) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      });
    }).catch(() => {
      // Offline fallback
      return caches.match('/');
    })
  );
});
