const CACHE_NAME = 'namaz-app-v2';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://unpkg.com/react@18/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
  'https://unpkg.com/@babel/standalone/babel.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap'
];

const PRAYER_NAMES = {
  'Fajr': { name: 'Фаджр', icon: '🌅' },
  'Dhuhr': { name: 'Зухр', icon: '☀️' },
  'Asr': { name: 'Аср', icon: '🌤️' },
  'Maghrib': { name: 'Магриб', icon: '🌆' },
  'Isha': { name: 'Иша', icon: '🌙' }
};

// Установка Service Worker
self.addEventListener('install', event => {
  console.log('[SW] Установка Service Worker');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Кэширование файлов');
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

// Активация Service Worker
self.addEventListener('activate', event => {
  console.log('[SW] Активация Service Worker');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Удаление старого кэша:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// Обработка запросов
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }

        return fetch(event.request)
          .then(response => {
            if (!response || response.status !== 200 || response.type === 'error') {
              return response;
            }

            const responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });

            return response;
          })
          .catch(() => {
            return caches.match(event.request);
          });
      })
  );
});

// Проверка времени намаза каждую минуту
setInterval(() => {
  checkPrayerTimes();
}, 60000); // Каждую минуту

// Функция проверки времени намаза
async function checkPrayerTimes() {
  try {
    const prayerTimesStr = await getFromStorage('prayerTimes');
    const location = await getFromStorage('location');

    if (!prayerTimesStr) return;

    const prayerTimes = JSON.parse(prayerTimesStr);
    const now = new Date();
    const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    // Проверяем каждый намаз
    for (let prayer of ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']) {
      const prayerTime = prayerTimes[prayer];

      if (prayerTime === currentTimeStr) {
        const lastNotification = await getFromStorage('lastNotification');
        const notificationKey = `${prayer}-${currentTimeStr}-${now.getDate()}`;

        if (lastNotification !== notificationKey) {
          // Отправляем уведомление
          await sendPrayerNotification(prayer, location || 'Назрань');
          await setInStorage('lastNotification', notificationKey);
        }
      }
    }
  } catch (error) {
    console.error('[SW] Ошибка проверки времени:', error);
  }
}

// Отправка уведомления о намазе
async function sendPrayerNotification(prayer, location) {
  try {
    const prayerInfo = PRAYER_NAMES[prayer];

    const notification = {
      title: `${prayerInfo.icon} ${prayerInfo.name} - ${location}`,
      body: `Наступило время намаза ${prayerInfo.name}`,
      icon: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="192" height="192"%3E%3Crect width="192" height="192" fill="%231a3a3a"/%3E%3Ctext x="96" y="96" font-size="100" text-anchor="middle" dominant-baseline="central" fill="white"%3E🕌%3C/text%3E%3C/svg%3E',
      badge: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="96" height="96"%3E%3Crect width="96" height="96" fill="%231a3a3a"/%3E%3Ctext x="48" y="48" font-size="50" text-anchor="middle" dominant-baseline="central" fill="white"%3E🕌%3C/text%3E%3C/svg%3E',
      vibrate: [300, 100, 300, 100, 300, 100, 300, 100, 300],
      tag: `prayer-${prayer}`,
      requireInteraction: true,
      silent: false,
      timestamp: Date.now(),
      data: {
        prayer,
        location,
        time: new Date().toISOString()
      }
    };

    console.log('[SW] Отправка уведомления:', notification.title);

    await self.registration.showNotification(notification.title, notification);

    // Отправляем сообщение всем клиентам для воспроизведения звука
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'PLAY_ADHAN_SOUND',
        prayer,
        location
      });
    });

  } catch (error) {
    console.error('[SW] Ошибка отправки уведомления:', error);
  }
}

// Обработка клика по уведомлению
self.addEventListener('notificationclick', event => {
  console.log('[SW] Клик по уведомлению');
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        // Если приложение уже открыто - фокусируемся на нём
        for (let client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus();
          }
        }
        // Иначе открываем новое окно
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
  );
});

// Обработка сообщений от клиента
self.addEventListener('message', event => {
  console.log('[SW] Получено сообщение:', event.data);

  if (event.data && event.data.type === 'SCHEDULE_NOTIFICATIONS') {
    const { prayerTimes, location } = event.data;
    console.log('[SW] Запланированы уведомления для:', location);
    // Сохраняем данные в кэш для последующей проверки
    setInStorage('prayerTimes', JSON.stringify(prayerTimes));
    setInStorage('location', location);
  }
});

// Вспомогательные функции для работы с IndexedDB/localStorage
async function getFromStorage(key) {
  return new Promise((resolve) => {
    try {
      // Используем Cache API для хранения данных
      caches.open('namaz-data').then(cache => {
        cache.match(`/data/${key}`).then(response => {
          if (response) {
            response.text().then(text => resolve(text));
          } else {
            resolve(null);
          }
        });
      });
    } catch (error) {
      console.error('[SW] Ошибка чтения:', error);
      resolve(null);
    }
  });
}

async function setInStorage(key, value) {
  try {
    const cache = await caches.open('namaz-data');
    const response = new Response(value);
    await cache.put(`/data/${key}`, response);
  } catch (error) {
    console.error('[SW] Ошибка записи:', error);
  }
}

console.log('[SW] Service Worker загружен');