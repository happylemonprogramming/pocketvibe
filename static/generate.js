let currentPollingInterval = null;
let pollingStartTime = null;
const POLLING_TIMEOUT = 20 * 60 * 1000; // 20 minutes in milliseconds (longer than backend 15-minute timeout)
const POLLING_INTERVAL = 5000; // 5 seconds between polls
let processedSiteIds = new Set(); // Track processed site IDs
let pushSubscription = null; // Store the push subscription

// Validate and clean up completed sites
async function validateCompletedSites() {
    const completedSites = JSON.parse(localStorage.getItem('completedSites') || '[]');
    if (completedSites.length === 0) return;

    const validCompletedSites = [];
    
    for (const site of completedSites) {
        try {
            // Try to fetch the site to see if it still exists
            const response = await fetch(site.siteUrl);
            if (response.ok) {
                validCompletedSites.push(site);
            } else {
                console.log(`Completed site ${site.siteId} no longer accessible, removing from history`);
            }
        } catch (error) {
            console.log(`Completed site ${site.siteId} not accessible, removing from history`);
            // Don't add to valid sites if we can't access it
        }
    }
    
    // Update localStorage with only valid completed sites
    if (validCompletedSites.length !== completedSites.length) {
        localStorage.setItem('completedSites', JSON.stringify(validCompletedSites));
        console.log(`Cleaned up ${completedSites.length - validCompletedSites.length} invalid completed sites`);
    }
}

// Initialize app state
async function initializeAppState() {
    // Clear processed sites on app start
    processedSiteIds.clear();
    
    // Validate and clean up completed sites first
    await validateCompletedSites();
    
    // Check for any pending sites from previous session
    const pendingSites = JSON.parse(localStorage.getItem('pendingSites') || '[]');
    if (pendingSites.length > 0) {
        console.log('Found pending sites from previous session:', pendingSites);
        await checkPendingSites();
    }
    
    // Check for completed sites from previous session
    const completedSites = JSON.parse(localStorage.getItem('completedSites') || '[]');
    if (completedSites.length > 0) {
        console.log('Found completed sites from previous session:', completedSites);
        await restoreCompletedSites(completedSites);
    }
}

// Call initialization when the page loads
document.addEventListener('DOMContentLoaded', initializeAppState);

// Show/hide "View My Apps" button based on completed sites
function updateViewAppsButton() {
    const completedSites = JSON.parse(localStorage.getItem('completedSites') || '[]');
    const viewAppsBtn = document.getElementById('viewAppsBtn');
    
    if (viewAppsBtn) {
        if (completedSites.length > 0) {
            viewAppsBtn.style.display = 'flex';
        } else {
            viewAppsBtn.style.display = 'none';
        }
    }
}

// Handle "View My Apps" button click
document.addEventListener('DOMContentLoaded', () => {
    const viewAppsBtn = document.getElementById('viewAppsBtn');
    if (viewAppsBtn) {
        viewAppsBtn.addEventListener('click', () => {
            const completedSites = JSON.parse(localStorage.getItem('completedSites') || '[]');
            if (completedSites.length > 0) {
                showCompletedSitesList(completedSites);
            }
        });
    }
    
    // Initial check for completed sites
    updateViewAppsButton();
});

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
            if (response.status === 404) {
                return { status: 'not_found' };
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        // Only log as error if it's not a 404 (which is expected for old/invalid sites)
        if (error.message && error.message.includes('404')) {
            return { status: 'not_found' };
        } else {
            console.error('Error checking site status:', error);
        }
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

    const validPendingSites = [];
    
    for (const siteId of pendingSites) {
        try {
            const statusData = await checkSiteStatus(siteId);
            
            if (statusData.status === 'not_found') {
                // Site doesn't exist anymore, remove it from pending sites
                console.log(`Site ${siteId} not found, removing from pending sites`);
                removePendingSite(siteId);
            } else if (statusData.status === 'success') {
                await handlePollingSuccess(siteId);
                removePendingSite(siteId);
            } else if (statusData.status === 'error' || statusData.status === 'timeout') {
                handlePollingError(`Site generation ${statusData.status}`);
                removePendingSite(siteId);
            } else {
                // Site is still processing, keep it in pending sites
                validPendingSites.push(siteId);
            }
        } catch (error) {
            console.error('Error checking pending site:', error);
            // For other errors, keep the site in pending sites for now
            validPendingSites.push(siteId);
        }
    }
    
    // Update localStorage with only valid pending sites
    if (validPendingSites.length !== pendingSites.length) {
        localStorage.setItem('pendingSites', JSON.stringify(validPendingSites));
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
            // Add a small delay to ensure site content is saved before updating icon
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Retry mechanism for icon update
            let retryCount = 0;
            const maxRetries = 3;
            let iconUpdateSuccess = false;
            
            while (retryCount < maxRetries && !iconUpdateSuccess) {
                try {
                    console.log(`Attempting icon update (attempt ${retryCount + 1}/${maxRetries})`);
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
                        iconUpdateSuccess = true;
                        // Get the new URL
                        const host = window.location.origin;
                        const newUrl = `https://pocket-vibe.koyeb.app/site/${result.app_url}`;

                        // Update the site URL
                        const siteUrl = document.getElementById('site-url');
                        if (siteUrl) {
                            siteUrl.textContent = newUrl;
                            siteUrl.setAttribute('data-url', newUrl);  // Store the URL in a data attribute
                        }
                        
                        // Store the completed site for persistence
                        const appName = appTitle.getAttribute('data-text') || 'Generated App';
                        storeCompletedSite(siteId, newUrl, appName);
                        
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
                        console.error('Error updating app icon:', result.message);
                        if (result.message && result.message.includes('still being generated')) {
                            retryCount++;
                            if (retryCount < maxRetries) {
                                console.log(`Site still being generated, retrying in ${retryCount * 5} seconds...`);
                                
                                // Check site status before retrying to see if it's ready
                                try {
                                    const statusResponse = await fetch(`/api/site-status/${siteId}`);
                                    const statusResult = await statusResponse.json();
                                    
                                    if (statusResult.status === 'success') {
                                        console.log('Site is now ready, retrying immediately...');
                                        continue; // Retry immediately
                                    }
                                } catch (statusError) {
                                    console.log('Could not check site status, continuing with delay...');
                                }
                                
                                await new Promise(resolve => setTimeout(resolve, retryCount * 5000));
                                continue;
                            }
                        }
                        // Don't show alert for "still being generated" error, just continue with normal flow
                        if (!result.message || !result.message.includes('still being generated')) {
                            alert('Error updating app icon: ' + result.message);
                        }
                        break;
                    }
                } catch (error) {
                    console.error('Error updating app icon:', error);
                    retryCount++;
                    if (retryCount < maxRetries) {
                        console.log(`Network error, retrying in ${retryCount * 2} seconds...`);
                        await new Promise(resolve => setTimeout(resolve, retryCount * 2000));
                        continue;
                    }
                    // Don't show alert for network errors, just continue with normal flow
                    if (error.name !== 'TypeError' && !error.message.includes('fetch')) {
                        alert('Error updating app icon');
                    }
                    break;
                }
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
        
        // Store the completed site for persistence
        const appName = document.getElementById('app-title')?.getAttribute('data-text') || 'Generated App';
        storeCompletedSite(siteId, siteUrl, appName);
        
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

// Handle visibility change (app going to background/foreground)
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        // Clear any existing polling
        if (currentPollingInterval) {
            clearInterval(currentPollingInterval);
            currentPollingInterval = null;
        }
        
        // Check pending sites when returning to the app
        checkPendingSites();
    }
});

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
    console.log('generateBtn clicked');
    const installAppContainer = document.getElementById('installAppContainer');
    installAppContainer.classList.remove('show');
    // Check if running in standalone mode (installed as PWA)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                        window.navigator.standalone || 
                        document.referrer.includes('android-app://');

    // Only proceed if installed as PWA
    if ((isStandalone) || (('Notification' in window) || ('serviceWorker' in navigator))) {
        // This won't block the main process
        requestNotificationPermissionAndSubscribe().catch(error => {
            console.error('Notification subscription failed:', error);
            // Don't show error to user since this is non-critical
        });
    }

    const userText = input.value.trim();
    if (!userText) {
        alert('Please describe your app idea first!');
        return;
    }

    // Generate site_id client-side
    const hexChars = 'abcdef0123456789';
    let site_id = 'pv_';
    for (let i = 0; i < 8; i++) {
        site_id += hexChars[Math.floor(Math.random() * hexChars.length)];
    }
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

// Store completed site information
function storeCompletedSite(siteId, siteUrl, appName = '') {
    const completedSites = JSON.parse(localStorage.getItem('completedSites') || '[]');
    const siteInfo = {
        siteId: siteId,
        siteUrl: siteUrl,
        appName: appName,
        completedAt: Date.now()
    };
    
    // Remove if already exists and add new entry
    const filteredSites = completedSites.filter(site => site.siteId !== siteId);
    filteredSites.unshift(siteInfo); // Add to beginning
    
    // Keep only the last 10 completed sites
    const trimmedSites = filteredSites.slice(0, 10);
    localStorage.setItem('completedSites', JSON.stringify(trimmedSites));
    
    // Update the "View My Apps" button visibility
    updateViewAppsButton();
}

// Restore completed sites to UI
async function restoreCompletedSites(completedSites) {
    if (completedSites.length === 0) return;
    
    // Get the most recent completed site
    const mostRecent = completedSites[0];
    
    // // Update UI with the most recent site
    // const siteIdElement = document.getElementById('site-id');
    // const siteUrlElement = document.getElementById('site-url');
    
    // if (siteIdElement) siteIdElement.textContent = mostRecent.siteId;
    // if (siteUrlElement) {
    //     siteUrlElement.textContent = mostRecent.siteUrl;
    //     siteUrlElement.setAttribute('data-url', mostRecent.siteUrl);
    // }
    
    // Update the "View My Apps" button visibility
    updateViewAppsButton();
    
    // // Show a notification that the app was restored
    // if ('Notification' in window && Notification.permission === 'granted') {
    //     new Notification('Pocket Vibe', {
    //         body: 'Your generated app has been restored!',
    //         icon: '/static/icons/pocketvibe.png'
    //     });
    // }
    
    // Don't automatically show the modal - let users click the button instead
}

// Show list of completed sites
function showCompletedSitesList(completedSites) {
    // Create a dropdown or modal to show all completed sites
    const container = document.createElement('div');
    container.className = 'completed-sites-modal';
    container.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Your Generated Apps</h3>
                <button class="modal-close" onclick="this.parentElement.parentElement.parentElement.remove()">&times;</button>
            </div>
            <div class="sites-list">
                ${completedSites.map(site => `
                    <div class="site-item" data-site-id="${site.siteId}" data-site-url="${site.siteUrl}">
                        <div class="site-info">
                            <strong>${site.appName || 'Generated App'}</strong>
                            <small>${new Date(site.completedAt).toLocaleDateString()}</small>
                        </div>
                        <div class="site-actions">
                            <button class="view-site-btn" onclick="openSite('${site.siteUrl}')">View</button>
                            <button class="delete-site-btn" onclick="removeCompletedSite('${site.siteId}'); this.parentElement.parentElement.remove();" title="Delete">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="3,6 5,6 21,6"></polyline>
                                    <path d="M19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"></path>
                                </svg>
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    
    document.body.appendChild(container);
}

// Function to open a site
function openSite(siteUrl) {
    window.open(siteUrl, '_blank');
}

// Function to remove a completed site
function removeCompletedSite(siteId) {
    const completedSites = JSON.parse(localStorage.getItem('completedSites') || '[]');
    const updatedSites = completedSites.filter(site => site.siteId !== siteId);
    localStorage.setItem('completedSites', JSON.stringify(updatedSites));
    
    // Update the "View My Apps" button visibility
    updateViewAppsButton();
    
    // Remove the modal if no sites left
    if (updatedSites.length === 0) {
        const modal = document.querySelector('.completed-sites-modal');
        if (modal) {
            modal.remove();
        }
    }
}