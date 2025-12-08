/* eslint-disable no-restricted-globals */

// Use build date or version for cache busting
// This will be replaced during build with actual version
const APP_VERSION = '1764335234428-unknown-1764335234431' || new Date().getTime().toString();
const CACHE_NAME = `ai-chief-of-staff-${APP_VERSION}`;
const urlsToCache = [
  '/',
  '/index.html',
  '/static/css/main.css',
  '/static/js/main.js',
  '/manifest.json'
];

// Maximum cache age in milliseconds (1 hour)
const MAX_CACHE_AGE = 60 * 60 * 1000;

// Install event - cache assets
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Caching app shell');
        return cache.addAll(urlsToCache).catch((err) => {
          console.log('[Service Worker] Cache addAll failed:', err);
        });
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches and force update
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...', CACHE_NAME);
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
    .then(() => {
      // Force all clients to use this service worker
      return self.clients.claim();
    })
    .then(() => {
      // Notify all clients about the update
      return self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({
            type: 'SW_UPDATED',
            version: APP_VERSION
          });
        });
      });
    })
  );
});

// Fetch event - network first with cache fallback, and cache validation
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;
  
  // Skip API requests (let them go to network, no caching)
  if (event.request.url.includes('/api/')) {
    return;
  }
  
  // Skip chrome-extension and other non-http(s) URLs
  if (!event.request.url.startsWith('http')) {
    return;
  }

  // For HTML files, always check network first (stale-while-revalidate)
  if (event.request.url.endsWith('.html') || event.request.url.endsWith('/')) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          // Update cache with fresh response
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Network failed, try cache
          return caches.match(event.request).then((cachedResponse) => {
            return cachedResponse || caches.match('/index.html');
          });
        })
    );
    return;
  }

  // For other assets, use cache-first with network validation
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        // Check if cached response is still fresh
        if (cachedResponse) {
          const cachedDate = cachedResponse.headers.get('date');
          if (cachedDate) {
            const cacheAge = Date.now() - new Date(cachedDate).getTime();
            // If cache is fresh (< 1 hour), return it
            if (cacheAge < MAX_CACHE_AGE) {
              // Still check network in background for updates
              fetch(event.request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                  const responseToCache = networkResponse.clone();
                  caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseToCache);
                  });
                }
              }).catch(() => {
                // Network check failed, that's okay
              });
              return cachedResponse;
            }
          }
        }

        // Cache miss or stale - fetch from network
        return fetch(event.request)
          .then((networkResponse) => {
            // Check if valid response
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
              return networkResponse;
            }

            // Clone the response
            const responseToCache = networkResponse.clone();

            // Update cache
            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });

            return networkResponse;
          })
          .catch(() => {
            // Network failed, return cached version if available
            return cachedResponse || caches.match('/index.html');
          });
      })
  );
});

// Push notification event
self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push received:', event);
  
  let notificationData = {
    title: 'AI Chief of Staff',
    body: 'New notification',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'ai-chief-of-staff',
    actions: []
  };
  
  // Parse the JSON payload from the server
  if (event.data) {
    try {
      const payload = event.data.json();
      notificationData = {
        title: payload.title || 'AI Chief of Staff',
        body: payload.body || 'New notification',
        icon: payload.icon || '/icon-192.png',
        badge: payload.badge || '/icon-192.png',
        tag: payload.tag || 'ai-chief-of-staff',
        data: payload.data || {},
        actions: payload.actions || []
      };
    } catch (e) {
      console.error('[Service Worker] Failed to parse notification data:', e);
    }
  }
  
  const options = {
    body: notificationData.body,
    icon: notificationData.icon,
    badge: notificationData.badge,
    vibrate: [200, 100, 200],
    tag: notificationData.tag,
    requireInteraction: false,
    data: notificationData.data,
    actions: notificationData.actions
  };

  event.waitUntil(
    self.registration.showNotification(notificationData.title, options)
  );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  console.log('[Service Worker] Notification click:', event);
  
  event.notification.close();
  
  // Handle notification actions (dismiss vs open)
  if (event.action === 'dismiss') {
    // Call API to dismiss this notification
    const notificationTag = event.notification.data?.notificationTag || event.notification.tag;
    
    event.waitUntil(
      fetch('/api/notifications/dismiss', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ notificationTag })
      })
        .then((response) => {
          if (response.ok) {
            console.log('[Service Worker] Notification dismissed:', notificationTag);
          } else {
            console.error('[Service Worker] Failed to dismiss notification');
          }
        })
        .catch((error) => {
          console.error('[Service Worker] Error dismissing notification:', error);
        })
    );
    return;
  }

  // Get the URL from notification data, or default to home
  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Check if app is already open
        for (let i = 0; i < clientList.length; i++) {
          const client = clientList[i];
          if (client.url.includes(self.registration.scope) && 'focus' in client) {
            // Navigate to the URL and focus
            return client.focus().then(() => client.navigate(urlToOpen));
          }
        }
        // No existing window, open new one
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

// Background sync for offline task creation
self.addEventListener('sync', (event) => {
  console.log('[Service Worker] Background sync:', event.tag);
  
  if (event.tag === 'sync-tasks') {
    event.waitUntil(syncOfflineTasks());
  }
});

/**
 * Sync offline tasks when connection is restored
 */
async function syncOfflineTasks() {
  try {
    // Get offline tasks from IndexedDB
    const db = await openIndexedDB();
    const offlineTasks = await getOfflineTasks(db);
    
    if (offlineTasks.length === 0) {
      console.log('[Service Worker] No offline tasks to sync');
      return;
    }
    
    console.log(`[Service Worker] Syncing ${offlineTasks.length} offline tasks`);
    
    // Send each task to the server
    const results = await Promise.allSettled(
      offlineTasks.map(task => syncTask(task))
    );
    
    // Remove successfully synced tasks
    const successfulIds = results
      .filter((result, index) => result.status === 'fulfilled')
      .map((_, index) => offlineTasks[index].id);
    
    await removeOfflineTasks(db, successfulIds);
    
    console.log(`[Service Worker] Synced ${successfulIds.length} tasks, ${results.length - successfulIds.length} failed`);
    
    // Show notification if tasks were synced
    if (successfulIds.length > 0) {
      self.registration.showNotification('Tasks Synced', {
        body: `${successfulIds.length} offline task(s) synced successfully`,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: 'sync-success'
      });
    }
  } catch (error) {
    console.error('[Service Worker] Sync failed:', error);
  }
}

/**
 * Sync a single task to the server
 */
async function syncTask(task) {
  const response = await fetch('/api/commitments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(task.data)
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  
  return response.json();
}

/**
 * Open IndexedDB for offline storage
 */
function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('ai-chief-of-staff', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // Create object store for offline tasks
      if (!db.objectStoreNames.contains('offlineTasks')) {
        db.createObjectStore('offlineTasks', { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

/**
 * Get all offline tasks from IndexedDB
 */
function getOfflineTasks(db) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['offlineTasks'], 'readonly');
    const store = transaction.objectStore('offlineTasks');
    const request = store.getAll();
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Remove offline tasks from IndexedDB
 */
function removeOfflineTasks(db, ids) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['offlineTasks'], 'readwrite');
    const store = transaction.objectStore('offlineTasks');
    
    ids.forEach(id => store.delete(id));
    
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

console.log('[Service Worker] Loaded');

