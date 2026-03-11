// PetLinkID Service Worker — v2.0
const CACHE   = 'petlinkid-v2';
const STATIC  = [
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // FIX BUG 6: correct operator precedence with explicit parentheses
  // Never intercept Firebase or Google APIs
  const isFirebase   = url.hostname.includes('firestore.googleapis.com')
                    || url.hostname.includes('firebaseio.com')
                    || url.hostname.includes('firebase.googleapis.com')
                    || url.hostname.includes('identitytoolkit.googleapis.com');
  const isGoogleFont = url.hostname.includes('fonts.googleapis.com')
                    || url.hostname.includes('fonts.gstatic.com');

  if (isFirebase) return; // Let Firebase handle its own requests natively

  // FIX BUG 12: tag.html must always be network-first so profile updates are seen
  // immediately by the person who finds the pet
  const isTagPage = url.pathname.includes('tag.html');
  if (isTagPage) {
    e.respondWith(
      fetch(e.request)
        .catch(() => caches.match(e.request)) // fallback to cache only if offline
    );
    return;
  }

  // Google Fonts: cache-first (they never change)
  if (isGoogleFont) {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      }))
    );
    return;
  }

  // Everything else: cache-first with network fallback
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => {
        if (e.request.destination === 'document') return caches.match('/index.html');
      });
    })
  );
});

// Push Notifications (for future scan alerts)
self.addEventListener('push', e => {
  if (!e.data) return;
  const data = e.data.json();
  self.registration.showNotification(data.title || '🐾 PetLinkID', {
    body:     data.body    || 'Alguien escaneó el tag de tu mascota.',
    icon:     '/icons/icon-192.png',
    badge:    '/icons/icon-192.png',
    tag:      'petlinkid-scan',
    vibrate:  [200, 100, 200],
    data:     { url: data.url || '/' }
  });
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data?.url || '/'));
});
