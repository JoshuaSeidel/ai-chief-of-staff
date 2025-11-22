/**
 * Utility for handling offline task creation with IndexedDB
 */

const DB_NAME = 'ai-chief-of-staff';
const DB_VERSION = 1;
const STORE_NAME = 'offlineTasks';

/**
 * Open IndexedDB connection
 */
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

/**
 * Save task for offline sync
 */
export async function saveOfflineTask(taskData) {
  try {
    const db = await openDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      const task = {
        data: taskData,
        createdAt: new Date().toISOString()
      };
      
      const request = store.add(task);
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to save offline task:', error);
    throw error;
  }
}

/**
 * Trigger background sync
 */
export async function triggerSync() {
  if ('serviceWorker' in navigator && 'sync' in navigator.serviceWorker) {
    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.sync.register('sync-tasks');
      console.log('Background sync registered');
      return true;
    } catch (error) {
      console.error('Failed to register background sync:', error);
      return false;
    }
  }
  return false;
}

/**
 * Get all offline tasks (for displaying pending status)
 */
export async function getOfflineTasks() {
  try {
    const db = await openDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to get offline tasks:', error);
    return [];
  }
}

/**
 * Check if app is online
 */
export function isOnline() {
  return navigator.onLine;
}

/**
 * Listen for online/offline events
 */
export function setupOnlineListener(onOnline, onOffline) {
  window.addEventListener('online', () => {
    console.log('App is online');
    if (onOnline) onOnline();
    // Trigger sync when coming back online
    triggerSync();
  });
  
  window.addEventListener('offline', () => {
    console.log('App is offline');
    if (onOffline) onOffline();
  });
}

