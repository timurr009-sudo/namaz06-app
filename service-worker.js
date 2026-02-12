// service-worker.js
// Service Worker для PWA - работа оффлайн и уведомления

const CACHE_NAME = 'ingushetia-namaz-v1.0';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-72.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  'https://unpkg.com/react@18/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
  'https://unpkg.com/@babel/standalone/babel.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap'
];

// Установка Service Worker
self.addEventListener('install', event => {
  console.log('Service Worker: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Caching files');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
  );
});

// Активация Service Worker
self.addEventListener('activate', event => {
  console.log('Service Worker: Activating...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('Service Worker: Clearing old cache');
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Стратегия: Network First, затем Cache
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Клонируем ответ
        const responseToCache = response.clone();

        // Добавляем в кэш
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseToCache);
        });

        return response;
      })
      .catch(() => {
        // Если нет сети - берём из кэша
        return caches.match(event.request);
      })
  );
});

// Синхронизация в фоне
self.addEventListener('sync', event => {
  if (event.tag === 'sync-prayer-times') {
    event.waitUntil(syncPrayerTimes());
  }
});

async function syncPrayerTimes() {
  try {
    console.log('Background sync: Updating prayer times');
    // Здесь можно обновить время намазов в фоне
  } catch (error) {
    console.error('Background sync failed:', error);
  }
}

// Периодическая синхронизация (если поддерживается)
self.addEventListener('periodicsync', event => {
  if (event.tag === 'update-prayer-times') {
    event.waitUntil(syncPrayerTimes());
  }
});

console.log('Service Worker: Loaded');
