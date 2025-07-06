self.addEventListener('install', event => {
    console.log('Service Worker installato');
});

self.addEventListener('activate', event => {
    console.log('Service Worker attivato');
});

self.addEventListener('push', event => {
    const data = event.data.json();
    self.registration.showNotification(data.title, {
        body: data.body,
        icon: 'https://via.placeholder.com/48',
        badge: 'https://via.placeholder.com/48',
        vibrate: [200, 100, 200]
    });
});
