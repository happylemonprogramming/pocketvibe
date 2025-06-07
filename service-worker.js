// Service worker for Pocket Vibe

// Install event - just skip waiting
self.addEventListener('install', (event) => {
    console.log('Service worker installing...');
    event.waitUntil(self.skipWaiting());
});

// Activate event - just claim clients
self.addEventListener('activate', (event) => {
    console.log('Service worker activating...');
    event.waitUntil(self.clients.claim());
});

// Push event - handle incoming push notifications
self.addEventListener('push', (event) => {
    console.log('[Service Worker] Push event received:', {
        type: event.type,
        data: event.data ? 'present' : 'absent',
        endpoint: event.target.registration?.pushManager?.getSubscription()?.then(sub => sub?.endpoint) || 'unknown'
    });

    if (event.data) {
        try {
            const data = event.data.json();
            console.log('[Service Worker] Push data received:', {
                title: data.title,
                body: data.body,
                url: data.url,
                options: data.options
            });
            
            const notificationOptions = {
                body: data.body,
                icon: '/static/icons/pocketvibe.png',
                badge: '/static/icons/pocketvibe.png',
                tag: data.tag || 'default',
                requireInteraction: data.requireInteraction || false,
                data: {
                    url: data.url
                },
                ...data.options
            };
            
            console.log('[Service Worker] Showing notification with options:', notificationOptions);
            
            event.waitUntil(
                self.registration.showNotification(data.title || 'Pocket Vibe', notificationOptions)
                    .then(() => console.log('[Service Worker] Notification shown successfully'))
                    .catch(error => console.error('[Service Worker] Error showing notification:', error))
            );
        } catch (error) {
            console.error('[Service Worker] Error handling push event:', error);
            // Show a fallback notification
            event.waitUntil(
                self.registration.showNotification('Pocket Vibe', {
                    body: 'You have a new notification',
                    icon: '/static/icons/pocketvibe.png',
                    badge: '/static/icons/pocketvibe.png'
                }).catch(error => console.error('[Service Worker] Error showing fallback notification:', error))
            );
        }
    } else {
        console.log('[Service Worker] Push event received without data');
    }
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
    console.log('Notification click:', {
        tag: event.notification.tag,
        action: event.action
    });

    event.notification.close();

    // Handle notification click
    event.waitUntil(
        clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        }).then(clientList => {
            // If a window is already open, focus it
            for (const client of clientList) {
                if (client.url === '/' && 'focus' in client) {
                    return client.focus();
                }
            }
            // Otherwise open a new window
            if (clients.openWindow) {
                return clients.openWindow('/');
            }
        })
    );
});

// Handle messages from clients
self.addEventListener('message', (event) => {
    console.log('Message from client:', event.data);
    // Handle client messages if needed
}); 