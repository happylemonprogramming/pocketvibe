let currentPollingInterval = null;
let pollingStartTime = null;
const POLLING_TIMEOUT = 20 * 60 * 1000; // 20 minutes in milliseconds (longer than backend 15-minute timeout)
const POLLING_INTERVAL = 5000; // 5 seconds between polls
let processedSiteIds = new Set(); // Track processed site IDs
let pushSubscription = null; // Store the push subscription

// // Initialize app state
// async function initializeAppState() {
//     // Clear processed sites on app start
//     processedSiteIds.clear();
    
//     // Check for any pending sites from previous session
//     const pendingSites = JSON.parse(localStorage.getItem('pendingSites') || '[]');
//     if (pendingSites.length > 0) {
//         console.log('Found pending sites from previous session:', pendingSites);
//         await checkPendingSites();
//     }
// }

// // Call initialization when the page loads
// document.addEventListener('DOMContentLoaded', initializeAppState);

async function callAIAPI(prompt, site_id) {
    try {
        // Get the current push subscription if it exists
        let subscription = null;
        if ('serviceWorker' in navigator) {
            const registration = await navigator.serviceWorker.ready;
            subscription = await registration.pushManager.getSubscription();
        }

        const response = await fetch('/api/generate-site', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                prompt: prompt,
                site_id: site_id,
                subscription: subscription ? subscription.toJSON() : null
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error calling AI API:', error);
        throw error;
    }
}

async function checkSiteStatus(siteId) {
    try {
        const response = await fetch(`/api/site-status/${siteId}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error checking site status:', error);
        throw error;
    }
}

// Store site ID in localStorage when user leaves
function storePendingSite(siteId) {
    const pendingSites = JSON.parse(localStorage.getItem('pendingSites') || '[]');
    if (!pendingSites.includes(siteId)) {
        pendingSites.push(siteId);
        localStorage.setItem('pendingSites', JSON.stringify(pendingSites));
    }
}

// Remove site ID from localStorage when complete
function removePendingSite(siteId) {
    const pendingSites = JSON.parse(localStorage.getItem('pendingSites') || '[]');
    const updatedSites = pendingSites.filter(id => id !== siteId);
    localStorage.setItem('pendingSites', JSON.stringify(updatedSites));
}

// Check status of pending sites when user returns
async function checkPendingSites() {
    const pendingSites = JSON.parse(localStorage.getItem('pendingSites') || '[]');
    if (pendingSites.length === 0) return;

    for (const siteId of pendingSites) {
        try {
            const statusData = await checkSiteStatus(siteId);
            if (statusData.status === 'success') {
                await handlePollingSuccess(siteId);
                removePendingSite(siteId);
            } else if (statusData.status === 'error' || statusData.status === 'timeout') {
                handlePollingError(`Site generation ${statusData.status}`);
                removePendingSite(siteId);
            }
        } catch (error) {
            console.error('Error checking pending site:', error);
        }
    }
}

function startPolling(siteId) {
    if (currentPollingInterval) {
        clearInterval(currentPollingInterval);
    }
    
    pollingStartTime = Date.now();
    storePendingSite(siteId);  // Store site ID when starting to poll
    
    const poll = async () => {
        try {
            // Check if we've exceeded the timeout
            if (Date.now() - pollingStartTime > POLLING_TIMEOUT) {
                clearInterval(currentPollingInterval);
                // Don't handle error here, let the background check handle it
                return;
            }

            const statusData = await checkSiteStatus(siteId);
            
            switch (statusData.status) {
                case 'success':
                    clearInterval(currentPollingInterval);
                    await handlePollingSuccess(siteId);
                    removePendingSite(siteId);
                    break;
                case 'error':
                case 'timeout':
                    clearInterval(currentPollingInterval);
                    handlePollingError(`Site generation ${statusData.status}`);
                    removePendingSite(siteId);
                    break;
                case 'processing':
                    // Continue polling
                    break;
                default:
                    clearInterval(currentPollingInterval);
                    handlePollingError('Unknown status received');
                    removePendingSite(siteId);
            }
        } catch (error) {
            console.error('Polling error:', error);
            // Don't clear interval on network errors, allow retry
        }
    };

    // Initial poll
    poll();
    
    // Set up polling interval
    currentPollingInterval = setInterval(poll, POLLING_INTERVAL);
}

async function handlePollingSuccess(siteId) {
    try {
        // Check if we've already processed this site
        if (processedSiteIds.has(siteId)) {
            console.log('Site already processed:', siteId);
            return;
        }
        
        // Mark site as processed
        processedSiteIds.add(siteId);

        // Check if we need to update the app icon and name
        const appTitle = document.getElementById('app-title');
        const appIcon = document.getElementById('app-icon');

        if (appTitle.getAttribute('data-text') !== "" || !appIcon.src.includes('pocketvibe.png')) {
            try {
                console.log('appTitle.getAttribute("data-text")')
                console.log(appTitle.getAttribute('data-text'))
                console.log(appTitle.getAttribute('data-text') !== "")

                console.log('appIcon.src')
                console.log(appIcon.src)
                console.log(!appIcon.src.includes('pocketvibe.png'))

                // Update the app with the icon
                const response = await fetch('/api/update-app-icon', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        app_name: appTitle.getAttribute('data-text'),
                        image_url: appIcon.src,
                        site_id: siteId
                    })
                });
                
                const result = await response.json();
                
                if (result.status === 'success') {
                    // Get the new URL
                    const host = window.location.origin;
                    const newUrl = `https://pocket-vibe.koyeb.app/site/${result.app_url}`;

                    // Update the site URL
                    const siteUrl = document.getElementById('site-url');
                    if (siteUrl) {
                        siteUrl.textContent = newUrl;
                        siteUrl.setAttribute('data-url', newUrl);  // Store the URL in a data attribute
                    }
                    
                    // Stop the generation animation
                    if (typeof stopGenerationAnimation === 'function') {
                        stopGenerationAnimation(true);
                    }
                    
                    // Fetch the site content and store it in the client database
                    fetch(siteUrl)
                        .then(response => response.text())
                        .then(htmlContent => {
                            // Store the site in the client database
                            if (typeof storeGeneratedSite === 'function') {
                                storeGeneratedSite(siteId, htmlContent, 'Generated site');
                            }
                        })
                        .catch(error => {
                            console.error('Failed to fetch site content:', error);
                        });
                    return;
                } else {
                    alert('Error updating app icon');
                    return;
                }
            } catch (error) {
                console.error('Error updating app icon:', error);
                alert('Error updating app icon');
                return;
            }
        }
        // Get the current host
        const host = window.location.origin;
        const siteUrl = `https://pocket-vibe.koyeb.app/site/${siteId}`;
        console.log('Site generated successfully:', siteUrl);
        // showNotification('Pocket Vibe', 'Your app is ready!', {
        //     tag: 'notification-test',
        //     requireInteraction: true
        // });
        
        // // Send push notification
        // notifyAppReady(pushSubscription).catch(error => {
        //     console.error('Failed to send ready notification:', error);
        // });
        
        // Update UI elements
        const siteIdElement = document.getElementById('site-id');
        const siteUrlElement = document.getElementById('site-url');
        // const demoApps = document.getElementById('demoApps');
        
        // Update the hidden elements
        if (siteIdElement) siteIdElement.textContent = siteId;
        if (siteUrlElement) {
            siteUrlElement.textContent = siteUrl;
            siteUrlElement.setAttribute('data-url', siteUrl);  // Store the URL in a data attribute
        }
        
        // // Show the demo apps section
        // if (demoApps) {
        //     demoApps.style.display = 'grid';
        //     // Scroll to the demo apps
        //     demoApps.scrollIntoView({ 
        //         behavior: 'smooth',
        //         block: 'start'
        //     });
        // }
        
        // Stop the generation animation
        if (typeof stopGenerationAnimation === 'function') {
            stopGenerationAnimation(true);
        }
        
        // Fetch the site content and store it in the client database
        fetch(siteUrl)
            .then(response => response.text())
            .then(htmlContent => {
                // Store the site in the client database
                if (typeof storeGeneratedSite === 'function') {
                    storeGeneratedSite(siteId, htmlContent, 'Generated site');
                }
            })
            .catch(error => {
                console.error('Failed to fetch site content:', error);
            });
    } catch (error) {
        // Stop the generation animation
        if (typeof stopGenerationAnimation === 'function') {
            stopGenerationAnimation(false);
        }
    }
}

function handlePollingError(errorMessage) {
    console.error('Polling error:', errorMessage);
    
    // Send push notification
    notifyAppError(pushSubscription, errorMessage).catch(error => {
        console.error('Failed to send error notification:', error);
    });
    
    // Stop the generation animation
    if (typeof stopGenerationAnimation === 'function') {
        stopGenerationAnimation(false);
    }
    
    // Show error alert
    alert(`Error: ${errorMessage}`);
}

// // Handle visibility change (app going to background/foreground)
// document.addEventListener('visibilitychange', () => {
//     if (document.visibilityState === 'visible') {
//         // Clear any existing polling
//         if (currentPollingInterval) {
//             clearInterval(currentPollingInterval);
//             currentPollingInterval = null;
//         }
        
//         // Check pending sites when returning to the app
//         checkPendingSites();
//     }
// });

let currentSiteId = null;

async function handleAIResponse(response, userText) {
    try {
        if (response.status === 'processing') {
            currentSiteId = response.site_id;
             
            // Start polling for status
            startPolling(response.site_id);
        } else {
            handlePollingError('Unexpected response from server');
        }
    } catch (error) {
        console.error('Error handling AI response:', error);
        handlePollingError('Failed to process server response');
    }
}

generateBtn.addEventListener('click', async (e) => {
    e.preventDefault();

    // This won't block the main process
    requestNotificationPermissionAndSubscribe().catch(error => {
        console.error('Notification subscription failed:', error);
        // Don't show error to user since this is non-critical
    });

    const userText = input.value.trim();
    if (!userText) {
        alert('Please describe your app idea first!');
        return;
    }

    // Generate site_id client-side
    const site_id = "pv_" + crypto.randomUUID().slice(0, 8);
    console.log("Generated site_id:", site_id);
    
    // Store site_id immediately in the DOM
    const siteIdElement = document.getElementById('site-id');
    if (siteIdElement) {
        siteIdElement.textContent = site_id;
    }

    console.log("Form submitted with text:", userText);
    console.log("VAPID Public Key available:", !!window.VAPID_PUBLIC_KEY);
    console.log("Service Worker available:", 'serviceWorker' in navigator);
    
    // input.value = '';
    // input.style.height = 'auto';
    
    const mainInterface = document.getElementById('mainInterface');
    mainInterface.style.display = 'none';

    // Start the generation animation
    startGenerationAnimation();
    
    try {
        console.log("Calling AI API...");
        
        // Check if we're online
        if (navigator.onLine) {
            // Call the AI API with the generated site_id
            const aiResponse = await callAIAPI(userText, site_id);
            if (aiResponse.status === 'processing' && aiResponse.site_id === site_id) {
                // Start polling using the existing function from generate.js
                startPolling(site_id);
            } else {
                throw new Error('Invalid response from server');
            }
        } else {
            // Store for background sync with the generated site_id
            const submission = {
                data: { 
                    prompt: userText,
                    site_id: site_id 
                },
                timestamp: Date.now()
            };
            
            // Store in IndexedDB for background sync
            const db = await openDatabase();
            await db.add('pendingSubmissions', submission);
            
            // Request background sync
            if ('serviceWorker' in navigator && 'SyncManager' in window) {
                const registration = await navigator.serviceWorker.ready;
                await registration.sync.register('submit-form');
                
                // Also register for periodic sync if available
                if ('periodicSync' in registration) {
                    try {
                        await registration.periodicSync.register('retry-failed-submissions', {
                            minInterval: 24 * 60 * 60 * 1000 // 24 hours
                        });
                    } catch (error) {
                        console.log('Periodic sync could not be registered:', error);
                    }
                }
            }
            
            alert('You\'re offline. Your request will be processed when you\'re back online.');
        }
    } catch (error) {
        console.error("Error in form submission:", {
            name: error.name,
            message: error.message,
            stack: error.stack
        });
        stopGenerationAnimation(false);
        alert(`Error: ${error.message}`);
    }
});