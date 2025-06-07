// Initialize SQLite database
let db = null;
initDatabase();

// Register Service Worker with timeout
async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
        console.log('Service workers are not supported');
        return null;
    }

    try {
        console.log('Registering service worker...');
        
        // Register the service worker
        const registration = await navigator.serviceWorker.register('/service-worker.js', {
            scope: '/',
            updateViaCache: 'none'
        });

        console.log('ServiceWorker registration successful with scope:', registration.scope);

        // Wait for the service worker to become active
        await new Promise((resolve, reject) => {
            const startTime = Date.now();
            const timeout = 5000; // 5 seconds timeout

            // Function to check if service worker is active
            const checkActive = () => {
                if (registration.active) {
                    console.log('Service worker is active');
                    setupKeepAlive(registration.active);
                    resolve();
                    return;
                }

                // Check if we've exceeded the timeout
                if (Date.now() - startTime > timeout) {
                    reject(new Error('Service worker activation timeout'));
                    return;
                }

                // Check again in 100ms
                setTimeout(checkActive, 100);
            };

            // Start checking
            checkActive();
        });

        return registration;

    } catch (error) {
        console.error('ServiceWorker registration failed:', error);
        // If registration fails, try to unregister any existing service workers
        try {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (const registration of registrations) {
                await registration.unregister();
            }
            console.log('Unregistered existing service workers');
        } catch (unregisterError) {
            console.error('Failed to unregister service workers:', unregisterError);
        }
        return null;
    }
}

// Register service worker when the page loads
window.addEventListener('load', () => {
    registerServiceWorker().then(registration => {
        if (registration) {
            // Get VAPID public key from the template
            const vapidPublicKey = document.querySelector('meta[name="vapid-public-key"]')?.content;
            if (vapidPublicKey) {
                window.VAPID_PUBLIC_KEY = vapidPublicKey;
            }

            // Listen for messages from the service worker
            navigator.serviceWorker.addEventListener('message', (event) => {
                if (event.data.type === 'syncComplete') {
                    const result = event.data.result;
                    if (result) {
                        handleAIResponse(result, 'Background processed request');
                    }
                }
            });
        }
    });
});

// Setup keep-alive interval only when worker is active
function setupKeepAlive(worker) {
    if (!worker) return;
    
    // Set up periodic keep-alive
    setInterval(() => {
        if (worker.state === 'activated') {
            try {
                const messageChannel = new MessageChannel();
                messageChannel.port1.onmessage = (event) => {
                    if (event.data === 'alive') {
                        console.log('Service worker is alive');
                    }
                };
                worker.postMessage('keepAlive', [messageChannel.port2]);
            } catch (error) {
                console.error('Error sending keep-alive message:', error);
            }
        }
    }, 30000); // Every 30 seconds
}

// Initialize the database connection
async function initDatabase() {
  try {
    // Using IndexedDB as the storage backend for SQLite
    const SQL = await initSQLJS();
    
    // Try to load existing database from IndexedDB
    const dbData = await new Promise((resolve) => {
      const request = indexedDB.open('pocketvibe_db', 1);
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('sqlite')) {
          db.createObjectStore('sqlite');
        }
      };
      
      request.onsuccess = (event) => {
        const db = event.target.result;
        const transaction = db.transaction(['sqlite'], 'readonly');
        const store = transaction.objectStore('sqlite');
        const getRequest = store.get('database');
        
        getRequest.onsuccess = () => {
          resolve(getRequest.result);
        };
      };
      
      request.onerror = () => {
        resolve(null);
      };
    });

    // Create new database or load existing one
    if (dbData) {
      db = new SQL.Database(dbData);
      console.log("Loaded existing database from IndexedDB");
    } else {
      db = new SQL.Database();
      console.log("Created new database");
    }
    
    // Create table for storing generated sites
    db.run(`CREATE TABLE IF NOT EXISTS generated_sites (
      id TEXT PRIMARY KEY,
      html_content TEXT NOT NULL,
      description TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    
    // Save database to IndexedDB periodically
    setInterval(async () => {
      if (db) {
        const data = db.export();
        const request = indexedDB.open('pocketvibe_db', 1);
        request.onsuccess = (event) => {
          const db = event.target.result;
          const transaction = db.transaction(['sqlite'], 'readwrite');
          const store = transaction.objectStore('sqlite');
          store.put(data, 'database');
        };
      }
    }, 5000); // Save every 5 seconds
    
    console.log("Database initialized successfully");
    return true;
  } catch (error) {
    console.error("Failed to initialize database:", error);
    return false;
  }
}

const input = document.getElementById('promptInput');
const generateBtn = document.getElementById('generateBtn');
const validationMessage = document.getElementById('icon-validation-message');

// Add keyboard shortcut for form submission
input.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'Enter') {
    e.preventDefault();
    generateBtn.dispatchEvent(new Event('click'));
  }
});

// Animation state management
let animationInterval = null;
const steps = [
    { icon: '🧠', text: 'Analyzing your requirements...' },
    { icon: '🏗️', text: 'Designing architecture...' },
    { icon: '🎨', text: 'Creating UI/UX design...' },
    { icon: '⚡', text: 'Generating code...' },
    { icon: '🚀', text: 'Building your app...' }
];

function startGenerationAnimation() {
  const generateBtn = document.getElementById('generateBtn');
  const btnText = document.getElementById('btnText');
  const generationSteps = document.getElementById('generationSteps');
  const stepElement = document.getElementById('currentStep');
  const stepIcon = stepElement.querySelector('.step-icon');
  const stepText = stepElement.querySelector('.step-text');
  const siteUrl = document.getElementById('site-url');
  const viewButton = document.getElementById('viewButton');
  const shareButton = document.getElementById('shareButton');
  const appTitle = document.getElementById('app-title');
  
  let currentStepIndex = 0;
  
  // Start animation
  generateBtn.classList.add('loading');
  btnText.textContent = 'Generating...';
  siteUrl.style.display = 'none';
  viewButton.classList.add('tag-disabled');
  shareButton.classList.add('tag-disabled');
  generationSteps.style.display = 'block';
  demoApps.style.display = 'grid';

  // Scroll to results
  demoApps.scrollIntoView({ 
      behavior: 'smooth',
      block: 'start'
  });
  
  // Show first step immediately
  stepIcon.textContent = steps[0].icon;
  stepText.textContent = steps[0].text;
  stepElement.style.opacity = '1';
  
  const updateStep = () => {
      // Fade out
      stepElement.style.opacity = '0';
      
      setTimeout(() => {
          // Update content
          currentStepIndex = (currentStepIndex + 1) % steps.length;
          stepIcon.textContent = steps[currentStepIndex].icon;
          stepText.textContent = steps[currentStepIndex].text;
          
          // Fade in
          stepElement.style.opacity = '1';
      }, 300);
  };

  // Start the cycle after a delay
  animationInterval = setInterval(updateStep, 10000);
}

function stopGenerationAnimation(success = true) {
  if (animationInterval) {
      clearInterval(animationInterval);
      animationInterval = null;
  }
  
  const generateBtn = document.getElementById('generateBtn');
  const btnText = document.getElementById('btnText');
  const generationSteps = document.getElementById('generationSteps');
  const demoApps = document.getElementById('demoApps');
  
  // Reset button state
  generateBtn.classList.remove('loading');
  btnText.textContent = 'Create App';
  generationSteps.style.display = 'none';
  
  if (success) {
    siteUrl.style.display = 'block';
    generationSteps.style.display = 'none';
    viewButton.classList.remove('tag-disabled');
    shareButton.classList.remove('tag-disabled');
  } else {
      demoApps.style.display = 'none';
      mainInterface.style.display = 'block';
      alert('Error: Failed to generate app. Please try again.');
  }
}

// function startGenerationAnimation() {
//     const generateBtn = document.getElementById('generateBtn');
//     const btnText = document.getElementById('btnText');
//     const generationSteps = document.getElementById('generationSteps');
//     const stepElement = document.getElementById('currentStep');
//     const stepIcon = stepElement.querySelector('.step-icon');
//     const stepText = stepElement.querySelector('.step-text');
    
//     let currentStepIndex = 0;
    
//     // Start animation
//     generateBtn.classList.add('loading');
//     btnText.textContent = 'Generating...';
//     generationSteps.style.display = 'block';
    
//     // Show first step immediately
//     stepIcon.textContent = steps[0].icon;
//     stepText.textContent = steps[0].text;
//     stepElement.style.opacity = '1';
    
//     const updateStep = () => {
//         // Fade out
//         stepElement.style.opacity = '0';
        
//         setTimeout(() => {
//             // Update content
//             currentStepIndex = (currentStepIndex + 1) % steps.length;
//             stepIcon.textContent = steps[currentStepIndex].icon;
//             stepText.textContent = steps[currentStepIndex].text;
            
//             // Fade in
//             stepElement.style.opacity = '1';
//         }, 300);
//     };
    
//     // Start the cycle after a delay
//     animationInterval = setInterval(updateStep, 10000);
// }

// function stopGenerationAnimation(success = true) {
//     if (animationInterval) {
//         clearInterval(animationInterval);
//         animationInterval = null;
//     }
    
//     const generateBtn = document.getElementById('generateBtn');
//     const btnText = document.getElementById('btnText');
//     const generationSteps = document.getElementById('generationSteps');
//     const demoApps = document.getElementById('demoApps');
    
//     // Reset button state
//     generateBtn.classList.remove('loading');
//     btnText.textContent = 'Create App';
//     generationSteps.style.display = 'none';
    
//     if (success) {
//         demoApps.style.display = 'grid';
//         // Scroll to results
//         demoApps.scrollIntoView({ 
//             behavior: 'smooth',
//             block: 'start'
//         });
//     } else {
//         mainInterface.style.display = 'block';
//         alert('Error: Failed to generate app. Please try again.');
//     }
// }

// generateBtn.addEventListener('click', async (e) => {
//     e.preventDefault();

//     const userText = input.value.trim();
//     if (!userText) {
//         alert('Please describe your app idea first!');
//         return;
//     }

//     console.log("Form submitted with text:", userText);
//     console.log("VAPID Public Key available:", !!window.VAPID_PUBLIC_KEY);
//     console.log("Service Worker available:", 'serviceWorker' in navigator);
    
//     input.value = '';
//     input.style.height = 'auto';
    
//     const mainInterface = document.getElementById('mainInterface');
//     mainInterface.style.display = 'none';

//     // Start the generation animation
//     startGenerationAnimation();
    
//     console.log("Initializing notifications...");
//     await initializeNotifications();
//     console.log("Notifications initialized");
    
//     try {
//         console.log("Calling AI API...");
        
//         // Check if we're online
//         if (navigator.onLine) {
//             // Call the AI API directly
//             const aiResponse = await callAIAPI(userText);
//             if (aiResponse.status === 'processing' && aiResponse.site_id) {
//                 // Start polling using the existing function from generate.js
//                 startPolling(aiResponse.site_id);
//             } else {
//                 throw new Error('Invalid response from server');
//             }
//         } else {
//             // Store for background sync
//             const submission = {
//                 data: { prompt: userText },
//                 timestamp: Date.now()
//             };
            
//             // Store in IndexedDB for background sync
//             const db = await openDatabase();
//             await db.add('pendingSubmissions', submission);
            
//             // Request background sync
//             if ('serviceWorker' in navigator && 'SyncManager' in window) {
//                 const registration = await navigator.serviceWorker.ready;
//                 await registration.sync.register('submit-form');
                
//                 // Also register for periodic sync if available
//                 if ('periodicSync' in registration) {
//                     try {
//                         await registration.periodicSync.register('retry-failed-submissions', {
//                             minInterval: 24 * 60 * 60 * 1000 // 24 hours
//                         });
//                     } catch (error) {
//                         console.log('Periodic sync could not be registered:', error);
//                     }
//                 }
//             }
            
//             alert('You\'re offline. Your request will be processed when you\'re back online.');
//         }
//     } catch (error) {
//         console.error("Error in form submission:", {
//             name: error.name,
//             message: error.message,
//             stack: error.stack
//         });
//         stopGenerationAnimation(false);
//         alert(`Error: ${error.message}`);
//     }
// });

// Check for completed submissions when the app comes back online
window.addEventListener('online', async () => {
  try {
    const db = await openDatabase();
    const completedSubmissions = await db.getAll('completedSubmissions');
    
    for (const submission of completedSubmissions) {
      handleAIResponse(submission.data, 'Background processed request');
      await db.delete('completedSubmissions', submission.id);
    }
  } catch (error) {
    console.error('Error checking completed submissions:', error);
  }
});


// Generate a unique ID for the site
function generateUniqueId() {
  return Math.random().toString(36).substring(2, 10);
}

// Store the generated site in SQLite
function storeGeneratedSite(siteId, htmlContent, description) {
  if (!db) {
    console.error("Database not initialized");
    alert('Error: Database not initialized. Please refresh the page.');
    return false;
  }

  try {
    // Using prepared statements for SQL.js with REPLACE to overwrite existing entries
    const stmt = db.prepare(
      "INSERT OR REPLACE INTO generated_sites (id, html_content, description) VALUES (?, ?, ?)"
    );
    stmt.run([siteId, htmlContent, description]);
    stmt.free();
    console.log("Site stored with ID:", siteId);
    return true;
  } catch (error) {
    console.error("Failed to store site:", error);
    alert('Error: Failed to store the generated site.');
    return false;
  }
}

// Get a site from SQLite by ID
function getSiteById(siteId) {
  if (!db) {
    console.error("Database not initialized");
    return null;
  }

  try {
    // SQL.js uses a different parameter binding syntax than regular SQLite
    const stmt = db.prepare("SELECT html_content FROM generated_sites WHERE id = ?");
    stmt.bind([siteId]);
    
    if (stmt.step()) {
      const result = stmt.getAsObject();
      stmt.free(); // Clean up
      return result.html_content;
    } else {
      stmt.free();
      return null;
    }
  } catch (error) {
    console.error("Failed to retrieve site:", error);
    return null;
  }
}


// Utility function to load SQL.js
async function initSQLJS() {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/sql-wasm.js';
    script.onload = async () => {
      try {
        const SQL = await initSqlJs({
          locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
        });
        resolve(SQL);
      } catch (err) {
        reject(err);
      }
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}