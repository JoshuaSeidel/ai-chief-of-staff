// This optional code is used to register a service worker.
// register() is not called by default.

const isLocalhost = Boolean(
  window.location.hostname === 'localhost' ||
    window.location.hostname === '[::1]' ||
    window.location.hostname.match(/^127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/)
);

export function register(config) {
  if ('serviceWorker' in navigator) {
    const publicUrl = new URL(import.meta.env.BASE_URL || '', window.location.href);
    if (publicUrl.origin !== window.location.origin) {
      return;
    }

    window.addEventListener('load', () => {
      const swUrl = `${import.meta.env.BASE_URL || ''}service-worker.js`;

      if (isLocalhost) {
        checkValidServiceWorker(swUrl, config);
        navigator.serviceWorker.ready.then(() => {
          console.log('Service worker is active (localhost)');
        });
      } else {
        registerValidSW(swUrl, config);
      }
    });
  }
}

function registerValidSW(swUrl, config) {
  navigator.serviceWorker
    .register(swUrl)
    .then((registration) => {
      console.log('Service Worker registered:', registration);
      
      // Check for updates every time
      registration.update();
      
      // Check for updates periodically (every 5 minutes)
      setInterval(() => {
        registration.update();
      }, 5 * 60 * 1000);
      
      registration.onupdatefound = () => {
        const installingWorker = registration.installing;
        if (installingWorker == null) {
          return;
        }
        installingWorker.onstatechange = () => {
          if (installingWorker.state === 'installed') {
            if (navigator.serviceWorker.controller) {
              console.log('New content is available; please refresh.');
              // Force reload after a short delay to allow SW to activate
              setTimeout(() => {
                window.location.reload();
              }, 1000);
              if (config && config.onUpdate) {
                config.onUpdate(registration);
              }
            } else {
              console.log('Content is cached for offline use.');
              if (config && config.onSuccess) {
                config.onSuccess(registration);
              }
            }
          }
        };
      };
      
      // Listen for service worker messages
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'SW_UPDATED') {
          console.log('Service worker updated to version:', event.data.version);
          // Optionally reload the page
          if (window.confirm('A new version is available. Reload now?')) {
            window.location.reload();
          }
        }
      });
      
      // Request notification permission and subscribe to push
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().then(async (permission) => {
          console.log('Notification permission:', permission);
          
          if (permission === 'granted') {
            // Subscribe to push notifications
            try {
              await subscribeToPush(registration);
            } catch (error) {
              console.error('Failed to subscribe to push:', error);
            }
          }
        });
      } else if ('Notification' in window && Notification.permission === 'granted') {
        // Already have permission, subscribe
        subscribeToPush(registration);
      }
    })
    .catch((error) => {
      console.error('Error during service worker registration:', error);
    });
}

async function subscribeToPush(registration) {
  try {
    // Get VAPID public key from server
    const API_BASE_URL = import.meta.env.VITE_API_URL ||
                         (window.location.hostname === 'localhost' && window.location.port === '3000'
                           ? 'http://localhost:3001/api'
                           : '/api');
    
    const response = await fetch(`${API_BASE_URL}/notifications/vapid-public-key`);
    if (!response.ok) {
      console.log('Push notifications not configured on server');
      return;
    }
    
    const { publicKey } = await response.json();
    
    // Check for existing subscription
    const existingSubscription = await registration.pushManager.getSubscription();
    if (existingSubscription) {
      // Unsubscribe if applicationServerKey doesn't match
      console.log('Existing push subscription found, checking if update needed...');
      try {
        await existingSubscription.unsubscribe();
        console.log('Unsubscribed from old push subscription');
      } catch (err) {
        console.error('Failed to unsubscribe:', err);
      }
    }
    
    // Subscribe to push notifications
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });
    
    // Send subscription to server
    await fetch(`${API_BASE_URL}/notifications/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ subscription })
    });
    
    console.log('Successfully subscribed to push notifications');
  } catch (error) {
    // Only log errors that aren't about existing subscriptions
    if (!error.message.includes('already exists')) {
      console.error('Failed to subscribe to push:', error);
    }
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function checkValidServiceWorker(swUrl, config) {
  fetch(swUrl, {
    headers: { 'Service-Worker': 'script' },
  })
    .then((response) => {
      const contentType = response.headers.get('content-type');
      if (
        response.status === 404 ||
        (contentType != null && contentType.indexOf('javascript') === -1)
      ) {
        navigator.serviceWorker.ready.then((registration) => {
          registration.unregister().then(() => {
            window.location.reload();
          });
        });
      } else {
        registerValidSW(swUrl, config);
      }
    })
    .catch(() => {
      console.log('No internet connection found. App is running in offline mode.');
    });
}

export function unregister() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((registration) => {
        registration.unregister();
      })
      .catch((error) => {
        console.error(error.message);
      });
  }
}

