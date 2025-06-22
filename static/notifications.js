// Debug version of Web Push notifications with extensive logging

let swRegistration = null;

// Enhanced debugging function
function debugEnvironment() {
    const info = {
        browser: {
            userAgent: navigator.userAgent,
            vendor: navigator.vendor,
            platform: navigator.platform
        },
        context: {
            protocol: window.location.protocol,
            hostname: window.location.hostname,
            isSecureContext: window.isSecureContext,
            hasServiceWorker: 'serviceWorker' in navigator,
            hasPushManager: 'PushManager' in window,
            hasNotification: 'Notification' in window
        },
        vapid: {
            hasVapidKey: !!window.VAPID_PUBLIC_KEY,
            vapidKeyLength: window.VAPID_PUBLIC_KEY ? window.VAPID_PUBLIC_KEY.length : 0,
            vapidKeyStart: window.VAPID_PUBLIC_KEY ? window.VAPID_PUBLIC_KEY.substring(0, 10) + '...' : 'undefined'
        }
    };
    console.log('🔍 Environment Debug Info:', info);
    return info;
}

// Test VAPID key validity
function testVapidKey(vapidKey) {
    console.log('🔑 Testing VAPID key...');
    
    if (!vapidKey) {
        console.error('❌ VAPID key is undefined');
        return false;
    }
    
    console.log('VAPID key details:', {
        length: vapidKey.length,
        hasCorrectLength: vapidKey.length === 88, // Standard VAPID key length
        firstChars: vapidKey.substring(0, 10),
        lastChars: vapidKey.substring(vapidKey.length - 10),
        hasValidChars: /^[A-Za-z0-9_-]+$/.test(vapidKey)
    });
    
    try {
        const converted = urlBase64ToUint8Array(vapidKey);
        console.log('✅ VAPID key conversion successful:', {
            originalLength: vapidKey.length,
            convertedLength: converted.length,
            expectedLength: 65 // Should be 65 bytes after conversion
        });
        return converted.length === 65;
    } catch (error) {
        console.error('❌ VAPID key conversion failed:', error);
        return false;
    }
}

// Check service worker status in detail
async function debugServiceWorker() {
    console.log('🔧 Debugging Service Worker...');
    
    if (!('serviceWorker' in navigator)) {
        console.error('❌ Service Worker not supported');
        return false;
    }
    
    try {
        const registration = await navigator.serviceWorker.getRegistration('/');
        console.log('Service Worker Registration:', {
            found: !!registration,
            scope: registration?.scope,
            active: !!registration?.active,
            installing: !!registration?.installing,
            waiting: !!registration?.waiting,
            updateViaCache: registration?.updateViaCache
        });
        
        if (registration?.active) {
            console.log('Active SW details:', {
                scriptURL: registration.active.scriptURL,
                state: registration.active.state
            });
        }
        
        return !!registration?.active;
    } catch (error) {
        console.error('❌ Service Worker check failed:', error);
        return false;
    }
}

// Test push manager capabilities
async function testPushManager() {
    console.log('📡 Testing Push Manager...');
    
    if (!swRegistration) {
        console.error('❌ No service worker registration');
        return false;
    }
    
    try {
        // Check if push manager exists
        if (!swRegistration.pushManager) {
            console.error('❌ Push Manager not available');
            return false;
        }
        
        // Check for existing subscription
        const existingSub = await swRegistration.pushManager.getSubscription();
        console.log('Existing subscription:', {
            hasSubscription: !!existingSub,
            endpoint: existingSub?.endpoint,
            keys: existingSub ? Object.keys(existingSub.toJSON().keys || {}) : []
        });
        
        // Test push manager permissions
        try {
            const permissionState = await swRegistration.pushManager.permissionState({
                userVisibleOnly: true
            });
            console.log('Push permission state:', permissionState);
        } catch (permError) {
            console.warn('Could not check permission state:', permError);
        }
        
        return true;
    } catch (error) {
        console.error('❌ Push Manager test failed:', error);
        return false;
    }
}

function urlBase64ToUint8Array(base64String) {
    try {
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
    } catch (error) {
        console.error('VAPID key conversion failed:', error);
        throw error;
    }
}

// Comprehensive subscription attempt with detailed logging
async function debugSubscriptionProcess() {
    console.log('🚀 Starting comprehensive subscription debug...');
    
    // Step 1: Environment check
    const envInfo = debugEnvironment();
    if (!envInfo.context.isSecureContext) {
        console.error('❌ Not in secure context');
        return { success: false, error: 'Not in secure context' };
    }
    
    // Step 2: Permission check
    console.log('🔐 Checking permissions...');
    let permission = Notification.permission;
    console.log('Current permission:', permission);
    
    if (permission === 'default') {
        console.log('Requesting permission...');
        permission = await Notification.requestPermission();
        console.log('Permission after request:', permission);
    }
    
    if (permission !== 'granted') {
        console.error('❌ Permission not granted');
        return { success: false, error: 'Permission denied' };
    }
    
    // Step 3: Service Worker check
    const swReady = await debugServiceWorker();
    if (!swReady) {
        console.error('❌ Service Worker not ready');
        return { success: false, error: 'Service Worker not ready' };
    }
    
    // Step 4: Get registration
    swRegistration = await navigator.serviceWorker.ready;
    console.log('✅ Service Worker ready');
    
    // Step 5: Test Push Manager
    const pmReady = await testPushManager();
    if (!pmReady) {
        console.error('❌ Push Manager not ready');
        return { success: false, error: 'Push Manager not ready' };
    }
    
    // Step 6: VAPID key test
    const vapidKey = window.VAPID_PUBLIC_KEY;
    const vapidValid = testVapidKey(vapidKey);
    if (!vapidValid) {
        console.error('❌ Invalid VAPID key');
        return { success: false, error: 'Invalid VAPID key' };
    }
    
    // Step 7: Attempt subscription
    console.log('📱 Attempting subscription...');
    try {
        const applicationServerKey = urlBase64ToUint8Array(vapidKey);
        
        console.log('Subscription options:', {
            userVisibleOnly: true,
            applicationServerKeyLength: applicationServerKey.length
        });
        
        // Try with minimal options first
        console.log('Attempting basic subscription...');
        const subscription = await swRegistration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: applicationServerKey
        });
        
        console.log('✅ Subscription successful!', {
            endpoint: subscription.endpoint,
            keys: Object.keys(subscription.toJSON().keys || {})
        });
        
        return { success: true, subscription };
        
    } catch (error) {
        console.error('❌ Subscription failed:', {
            name: error.name,
            message: error.message,
            stack: error.stack
        });
        
        // Additional error analysis
        if (error.name === 'AbortError') {
            console.error('🔍 AbortError analysis:');
            console.error('- This usually means the push service rejected the request');
            console.error('- Common causes: Invalid VAPID key, server issues, rate limiting');
            console.error('- Check your VAPID key generation and server configuration');
        }
        
        return { success: false, error: error.message, details: error };
    }
}

// Initialize and run debug
async function initializeAndDebug() {
    console.log('🎬 Starting notification system debug...');
    
    try {
        // Register service worker first
        if ('serviceWorker' in navigator) {
            swRegistration = await navigator.serviceWorker.register('/service-worker.js', {
                scope: '/',
                updateViaCache: 'none'
            });
            console.log('✅ Service Worker registered');
        }
        
        // Run comprehensive debug
        const result = await debugSubscriptionProcess();
        
        console.log('🏁 Debug complete:', result);
        return result;
        
    } catch (error) {
        console.error('💥 Debug process failed:', error);
        return { success: false, error: error.message };
    }
}

// Check if web push is supported
function isPushNotificationSupported() {
    // Check if it's iOS Safari
    const isIOSSafari = /iPad|iPhone|iPod/.test(navigator.userAgent) && 
                       !window.MSStream && 
                       /Safari/.test(navigator.userAgent) && 
                       !/Chrome/.test(navigator.userAgent);

    // For iOS Safari, check if running in standalone mode (PWA)
    if (isIOSSafari) {
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                           window.navigator.standalone === true;
        
        console.log('iOS Safari PWA status:', {
            isStandalone,
            displayMode: window.matchMedia('(display-mode: standalone)').matches,
            navigatorStandalone: window.navigator.standalone
        });
        
        if (!isStandalone) {
            console.log('Push notifications only available when installed as PWA on iOS Safari');
            return false;
        }
    }

    const supported = 'serviceWorker' in navigator && 
                     'PushManager' in window &&
                     'Notification' in window;
    
    console.log('Push support:', {
        serviceWorker: 'serviceWorker' in navigator,
        pushManager: 'PushManager' in window,
        notification: 'Notification' in window,
        browser: {
            isIOSSafari,
            isStandalone: window.matchMedia('(display-mode: standalone)').matches || 
                         window.navigator.standalone === true,
            userAgent: navigator.userAgent
        }
    });
    
    return supported;
}

// Convert VAPID key to Uint8Array
function urlBase64ToUint8Array(base64String) {
    try {
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
    } catch (error) {
        console.error('VAPID key conversion failed:', error);
        throw error;
    }
}

// Send subscription to server
async function sendSubscriptionToServer(subscription) {
    try {
        const response = await fetch('/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subscription: subscription.toJSON() })
        });
        if (!response.ok) throw new Error(`Server responded with ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error('Server subscription failed:', error);
        throw error;
    }
}

// Show a notification
function showNotification(title, body, options = {}) {
    if (!swRegistration) {
        console.error('Service worker not registered');
        return;
    }
    swRegistration.showNotification(title, {
        body,
        icon: '/static/icons/pocketvibe.png',
        // badge: '/static/icons/pocketvibe.png',
        ...options
    }).catch(error => console.error('Notification failed:', error));
}

// Request permission and subscribe in one user gesture
async function requestNotificationPermissionAndSubscribe() {
    try {
        // Request permission
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            console.log('Notification permission denied');
            return;
        }

        // Get service worker ready
        swRegistration = await navigator.serviceWorker.ready;
        console.log('Service worker ready:', {
            scope: swRegistration.scope,
            state: swRegistration.active?.state
        });

        // Check existing subscription
        const existingSubscription = await swRegistration.pushManager.getSubscription();
        if (existingSubscription) {
            console.log('Using existing subscription');
            await sendSubscriptionToServer(existingSubscription);
            return existingSubscription;
        }

        // Get VAPID key
        const vapidPublicKey = window.VAPID_PUBLIC_KEY;
        if (!vapidPublicKey) {
            console.error('VAPID key not found');
            return;
        }

        // Create subscription
        const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
        const subscription = await swRegistration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey
        });

        console.log('Subscription created:', {
            endpoint: subscription.endpoint,
            keys: subscription.toJSON().keys
        });

        // Send to server and show success
        await sendSubscriptionToServer(subscription);
        // showNotification('Pocket Vibe', 'Notifications are now enabled!', {
        //     tag: 'notification-test',
        //     requireInteraction: true
        // });

        return subscription;
    } catch (error) {
        console.error('Subscription failed:', {
            name: error.name,
            message: error.message,
            browser: {
                protocol: window.location.protocol,
                host: window.location.host,
                isSecure: window.location.protocol === 'https:'
            }
        });
        return null;
    }
}

// Initialize notifications
async function initializeNotifications() {
    try {
        if ('serviceWorker' in navigator) {
            swRegistration = await navigator.serviceWorker.register('/service-worker.js', {
                scope: '/',
                updateViaCache: 'none'
            });
            
            // Listen for updates
            swRegistration.addEventListener('updatefound', () => {
                const newWorker = swRegistration.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        window.location.reload();
                    }
                });
            });
        }
        return true;
    } catch (error) {
        console.error('Service worker registration failed:', error);
        return false;
    }
}

// Export functions
window.initializeNotifications = initializeNotifications;
window.showNotification = showNotification;
window.requestNotificationPermissionAndSubscribe = requestNotificationPermissionAndSubscribe;

// Export debug functions
window.debugNotifications = initializeAndDebug;
window.debugSubscriptionProcess = debugSubscriptionProcess;
window.testVapidKey = testVapidKey;