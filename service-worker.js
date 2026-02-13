const CACHE_NAME = 'namaz-app-v3-personal';
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

// Глобальные переменные для хранения данных
let currentLocation = 'Назрань';
let currentPrayerTimes = null;
let lastNotificationKey = null;

console.log('[SW] 🕌 Service Worker для намазов загружен');

// Установка Service Worker
self.addEventListener('install', event => {
  console.log('[SW] 📥 Установка Service Worker');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] 💾 Кэширование файлов');
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

// Активация Service Worker
self.addEventListener('activate', event => {
  console.log('[SW] ✅ Активация Service Worker');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME && cacheName !== 'namaz-data') {
            console.log('[SW] 🗑️ Удаление старого кэша:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );

  // Загружаем сохраненные данные
  loadSavedData();

  return self.clients.claim();
});

// Загрузка сохраненных данных из localStorage
async function loadSavedData() {
  try {
    const location = await getFromStorage('selectedLocation');
    const times = await getFromStorage('prayerTimes');
    const lastKey = await getFromStorage('lastNotification');

    if (location) {
      currentLocation = location;
      console.log('[SW] 📍 Загружен город:', currentLocation);
    }

    if (times) {
      currentPrayerTimes = JSON.parse(times);
      console.log('[SW] ⏰ Загружено время намаза для:', currentLocation);
      console.log('[SW] 🕐 Время:', currentPrayerTimes);
    }

    if (lastKey) {
      lastNotificationKey = lastKey;
    }
  } catch (error) {
    console.error('[SW] ❌ Ошибка загрузки данных:', error);
  }
}

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

// Обработка сообщений от клиента
self.addEventListener('message', event => {
  console.log('[SW] 📨 Получено сообщение:', event.data);

  if (event.data && event.data.type === 'UPDATE_PRAYER_TIMES') {
    const { location, prayerTimes } = event.data;

    // Обновляем глобальные переменные
    currentLocation = location;
    currentPrayerTimes = prayerTimes;

    // Сохраняем в кэш
    setInStorage('selectedLocation', location);
    setInStorage('prayerTimes', JSON.stringify(prayerTimes));

    console.log('[SW] ✅ Обновлены данные:');
    console.log('[SW] 📍 Город:', currentLocation);
    console.log('[SW] ⏰ Время:', currentPrayerTimes);
  }
});

// Проверка времени намаза каждую минуту
setInterval(() => {
  checkPrayerTime();
}, 60000); // Каждую минуту

// Также проверяем сразу при загрузке
setTimeout(() => {
  checkPrayerTime();
}, 5000);

// Функция проверки времени намаза
async function checkPrayerTime() {
  try {
    // Если данные еще не загружены - загружаем
    if (!currentPrayerTimes || !currentLocation) {
      await loadSavedData();
    }

    if (!currentPrayerTimes) {
      console.log('[SW] ⚠️ Нет данных о времени намаза');
      return;
    }

    const now = new Date();
    const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    console.log(`[SW] 🕐 Проверка: ${currentTimeStr} в ${currentLocation}`);

    // Проверяем каждый намаз
    for (let prayer of ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']) {
      const prayerTime = currentPrayerTimes[prayer];

      if (prayerTime === currentTimeStr) {
        const notificationKey = `${prayer}-${currentTimeStr}-${now.getDate()}-${currentLocation}`;

        // Проверяем, не отправляли ли уже это уведомление
        if (lastNotificationKey !== notificationKey) {
          console.log(`[SW] 🔔 ВРЕМЯ НАМАЗА! ${prayer} в ${currentLocation}`);

          // Отправляем уведомление
          await sendPrayerNotification(prayer, currentLocation);

          // Сохраняем ключ последнего уведомления
          lastNotificationKey = notificationKey;
          await setInStorage('lastNotification', notificationKey);

          console.log('[SW] ✅ Уведомление отправлено');
        } else {
          console.log('[SW] ⏭️ Уведомление уже было отправлено');
        }
      }
    }
  } catch (error) {
    console.error('[SW] ❌ Ошибка проверки времени:', error);
  }
}

// Отправка уведомления о намазе
async function sendPrayerNotification(prayer, location) {
  try {
    const prayerInfo = PRAYER_NAMES[prayer];

    const notification = {
      title: `${prayerInfo.icon} ${prayerInfo.name} - ${location}`,
      body: `Наступило время намаза ${prayerInfo.name} в ${location}`,
      icon: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="192" height="192"%3E%3Crect width="192" height="192" fill="%231a3a3a"/%3E%3Ctext x="96" y="96" font-size="100" text-anchor="middle" dominant-baseline="central" fill="white"%3E🕌%3C/text%3E%3C/svg%3E',
      badge: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="96" height="96"%3E%3Crect width="96" height="96" fill="%231a3a3a"/%3E%3Ctext x="48" y="48" font-size="50" text-anchor="middle" dominant-baseline="central" fill="white"%3E🕌%3C/text%3E%3C/svg%3E',
      vibrate: [300, 100, 300, 100, 300, 100, 300, 100, 300],
      tag: `prayer-${prayer}-${location}`,
      requireInteraction: true,
      silent: false,
      timestamp: Date.now(),
      data: {
        prayer,
        location,
        time: new Date().toISOString()
      }
    };

    console.log('[SW] 📢 Отправка уведомления:', notification.title);

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

    console.log('[SW] 🎵 Команда на воспроизведение звука отправлена');

  } catch (error) {
    console.error('[SW] ❌ Ошибка отправки уведомления:', error);
  }
}

// Обработка клика по уведомлению
self.addEventListener('notificationclick', event => {
  console.log('[SW] 👆 Клик по уведомлению');
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        for (let client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
  );
});

// Вспомогательные функции для работы с Cache API
async function getFromStorage(key) {
  try {
    const cache = await caches.open('namaz-data');
    const response = await cache.match(`/data/${key}`);
    if (response) {
      return await response.text();
    }
    return null;
  } catch (error) {
    console.error('[SW] ❌ Ошибка чтения:', key, error);
    return null;
  }
}

async function setInStorage(key, value) {
  try {
    const cache = await caches.open('namaz-data');
    const response = new Response(value);
    await cache.put(`/data/${key}`, response);
    console.log('[SW] 💾 Сохранено:', key);
  } catch (error) {
    console.error('[SW] ❌ Ошибка записи:', key, error);
  }
}

console.log('[SW] 🚀 Service Worker готов к работе');