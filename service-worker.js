// Service Worker для iOS 16.4+ и Android
// Версия: 6.1 iOS-оптимизированная

const CACHE_NAME = 'namaz-v6-ios';
const urlsToCache = [
    './',
    './index.html',
    './manifest.json'
];

// Установка Service Worker
self.addEventListener('install', event => {
    console.log('✅ Service Worker установлен');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
            .then(() => self.skipWaiting())
    );
});

// Активация Service Worker
self.addEventListener('activate', event => {
    console.log('✅ Service Worker активирован');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Обработка запросов
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => response || fetch(event.request))
            .catch(() => caches.match('./index.html'))
    );
});

// Хранилище времени намазов
let prayerTimesData = {
    location: 'Назрань',
    times: {},
    lastUpdate: null
};

// Получение сообщений от главного приложения
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'UPDATE_PRAYER_TIMES') {
        prayerTimesData.location = event.data.location;
        prayerTimesData.times = event.data.prayerTimes;
        prayerTimesData.lastUpdate = Date.now();

        console.log('✅ Время намазов обновлено для:', prayerTimesData.location);

        // Для iOS: планируем проверку уведомлений
        scheduleNextNotification();
    }

    if (event.data && event.data.type === 'CHECK_PRAYER_TIME') {
        checkPrayerTime();
    }
});

// Функция проверки времени намаза
function checkPrayerTime() {
    if (!prayerTimesData.times || Object.keys(prayerTimesData.times).length === 0) {
        return;
    }

    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const prayers = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
    const prayerNames = {
        'Fajr': 'Фаджр',
        'Dhuhr': 'Зухр',
        'Asr': 'Аср',
        'Maghrib': 'Магриб',
        'Isha': 'Иша'
    };

    for (let prayer of prayers) {
        const prayerTime = prayerTimesData.times[prayer];
        if (prayerTime && prayerTime === currentTime) {
            console.log(`🕌 Время намаза: ${prayerNames[prayer]}`);
            showPrayerNotification(prayer, prayerNames[prayer]);
            break;
        }
    }
}

// Показ уведомления (iOS-совместимое)
function showPrayerNotification(prayer, prayerName) {
    const options = {
        body: `Время намаза ${prayerName} для ${prayerTimesData.location}`,
        icon: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="192" height="192"%3E%3Crect width="192" height="192" fill="%231a3a3a"/%3E%3Ctext x="96" y="96" font-size="100" text-anchor="middle" dominant-baseline="central" fill="white"%3E🕌%3C/text%3E%3C/svg%3E',
        badge: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="96" height="96"%3E%3Crect width="96" height="96" fill="%231a3a3a"/%3E%3Ctext x="48" y="48" font-size="60" text-anchor="middle" dominant-baseline="central" fill="white"%3E🕌%3C/text%3E%3C/svg%3E',
        tag: 'prayer-time',
        requireInteraction: true,
        vibrate: [400, 200, 400, 200, 400],
        // iOS использует системный звук
        silent: false,
        data: {
            prayer: prayer,
            location: prayerTimesData.location,
            timestamp: Date.now()
        }
    };

    self.registration.showNotification(`🕌 ${prayerName}`, options)
        .then(() => {
            console.log('✅ Уведомление показано');

            // Отправляем сообщение в приложение для воспроизведения звука
            // (работает только если приложение открыто на iOS)
            self.clients.matchAll({ includeUncontrolled: true, type: 'window' })
                .then(clients => {
                    clients.forEach(client => {
                        client.postMessage({
                            type: 'PLAY_ADHAN_SOUND',
                            prayer: prayer
                        });
                    });
                });
        })
        .catch(err => console.error('❌ Ошибка уведомления:', err));
}

// Планирование следующего уведомления
function scheduleNextNotification() {
    // Проверяем время каждую минуту
    setInterval(() => {
        checkPrayerTime();
    }, 60000);
}

// Клик по уведомлению
self.addEventListener('notificationclick', event => {
    console.log('🔔 Клик по уведомлению');
    event.notification.close();

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(clientList => {
                // Если приложение уже открыто - фокусируем
                for (let client of clientList) {
                    if ('focus' in client) {
                        return client.focus();
                    }
                }
                // Если не открыто - открываем
                if (self.clients.openWindow) {
                    return self.clients.openWindow('./');
                }
            })
    );
});

// Запускаем проверку времени
scheduleNextNotification();

console.log('✅ Service Worker готов (iOS 16.4+ оптимизированный)');
