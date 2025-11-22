/* eslint-disable no-restricted-globals */

const CACHE_NAME = 'ai-chief-of-staff-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/static/css/main.css',
  '/static/js/main.js',
  '/manifest.json'
];

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

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
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
    }).then(() => self.clients.claim())
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;
  
  // Skip API requests (let them go to network)
  if (event.request.url.includes('/api/')) {
    return;
  }
  
  // Skip chrome-extension and other non-http(s) URLs
  if (!event.request.url.startsWith('http')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Cache hit - return response
        if (response) {
          return response;
        }

        // Clone the request
        const fetchRequest = event.request.clone();

        return fetch(fetchRequest).then((response) => {
          // Check if valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Clone the response
          const responseToCache = response.clone();

          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(event.request, responseToCache);
            });

          return response;
        }).catch(() => {
          // Network failed, try to return cached version
          return caches.match('/index.html');
        });
      })
  );
});

// Push notification event
self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push received:', event);
  
  const options = {
    body: event.data ? event.data.text() : 'New notification',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200],
    tag: 'ai-chief-of-staff',
    requireInteraction: false,
    actions: [
      {
        action: 'open',
        title: 'View'
      },
      {
        action: 'close',
        title: 'Dismiss'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification('AI Chief of Staff', options)
  );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  console.log('[Service Worker] Notification click:', event);
  
  event.notification.close();

  if (event.action === 'open' || !event.action) {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
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

