/**
 * Academic File PWA — Service Worker
 * Cache-first for app shell, network-first for API
 */

const CACHE_NAME = 'acad-file-v3';
const APP_SHELL = [
  './',
  './index.html',
  './app.html',
  './css/app.css',
  './js/firebase-config.js',
  './js/api.js',
  './js/app.js',
  './manifest.json',
  './appstart/config.js',
  './appstart/license.js',
  './appstart/keystore.js',
  './appstart/translator.js',
  './appstart/schema.js',
  './appstart/appstart.js',
  './appstart/appstart.css'
];

// Install — cache app shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// Activate — clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch strategy
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // API calls (Google Apps Script) → network-first
  if (url.hostname.includes('script.google.com') || url.hostname.includes('googleapis.com')) {
    event.respondWith(
      fetch(event.request)
        .then(response => response)
        .catch(() => new Response(JSON.stringify({ success: false, error: 'Offline' }),
          { headers: { 'Content-Type': 'application/json' } }))
    );
    return;
  }

  // Google Fonts → cache-first
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        });
      })
    );
    return;
  }

  // App shell → cache-first, fallback to network
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.ok && event.request.method === 'GET' && !url.protocol.startsWith('chrome-extension')) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    }).catch(() => {
      // Fallback for navigation
      if (event.request.mode === 'navigate') {
        return caches.match('./app.html') || caches.match('app.html') || caches.match('./index.html');
      }
    })
  );
});

// ══════════════════════════════════════
// WEB PUSH NOTIFICATION HANDLERS (FIREBASE / FCM)
// ══════════════════════════════════════
self.addEventListener('push', event => {
  let data = {
    title: 'Academic File Alert',
    body: 'New update available.',
    icon: 'icons/icon-192.png'
  };

  try {
    if (event.data) {
      data = Object.assign(data, event.data.json());
    }
  } catch (e) {
    if (event.data) data.body = event.data.text();
  }

  const options = {
    body: data.body || 'New update available in Academic File App.',
    icon: data.icon || 'icons/icon-192.png',
    badge: data.badge || 'icons/icon-192.png',
    vibrate: [100, 50, 100, 50, 100],
    tag: data.tag || 'acad-notification',
    data: data.data || { url: './index.html' },
    actions: data.actions || [
      { action: 'open', title: 'Open App' },
      { action: 'close', title: 'Dismiss' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'VibeMantra Academic Alert', options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'close') return;

  const targetUrl = (event.notification.data && event.notification.data.url) ? event.notification.data.url : './index.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
