// Popup window for preview
function popupWindow(url) {
  // Open in new tab
  window.open(url, '_blank', 'noopener,noreferrer');
}

viewButton = document.getElementById('viewButton');
viewButton.addEventListener('click', () => {
  // Get the URL from the data attribute instead of text content
  const siteUrl = document.getElementById('site-url').getAttribute('data-url');
  if (siteUrl) {
    popupWindow(siteUrl);
  }
});

shareButton = document.getElementById('shareButton');
if (navigator.share) {
    shareButton.addEventListener('click', async () => {
        const siteUrl = document.getElementById('site-url').getAttribute('data-url');
        if (siteUrl) {
            try {
                await navigator.share({
                    url: siteUrl
                });
            } catch (error) {
                if (error.name !== 'AbortError') {
                    alert('Error sharing: ' + error.message);
                }
            }
        }
    });
} else {
    shareButton.addEventListener('click', () => {
        alert('Web Share API not supported');
    });
}

editButton = document.getElementById('editButton');
editButton.addEventListener('click', () => {
  // Hide original fields
  editButton.style.display = 'none';
  shareButton.style.display = 'none';
  retryButton.style.display = 'none';
  donateButton.style.display = 'none';
  viewButton.style.display = 'none';
  siteUrl.style.display = 'none';
//   appTitle.style.display = 'none';

  // Show editable fields
  discardButton.style.display = '';
  acceptButton.style.display = '';
  document.querySelector('.icon-url-container').style.display = '';
  appNameInput.style.display = '';
  validationMessage.style.display = '';
});

iconUrlInput = document.getElementById('icon-url');
appNameInput = document.getElementById('app-name');
appTitle = document.getElementById('app-title');


retryButton = document.getElementById('retryButton');
retryButton.addEventListener('click', () => {
    // Hide demo apps and show main interface
    const demoApps = document.getElementById('demoApps');
    const mainInterface = document.getElementById('mainInterface');
    
    demoApps.style.display = 'none';
    mainInterface.style.display = 'block';
    
    // Scroll to main interface
    mainInterface.scrollIntoView({ 
        behavior: 'smooth',
        block: 'start'
    });
    
    // Clear and focus the prompt input
    const promptInput = document.getElementById('promptInput');
    if (promptInput) {
        // promptInput.value = '';
        promptInput.style.height = 'auto';
        // Focus the input after a short delay to ensure smooth scroll completes
        setTimeout(() => {
            promptInput.focus();
        }, 500);
    }

    // Reset app icon to default
    const appIcon = document.getElementById('app-icon');
    const iconUrl = document.getElementById('icon-url');

    appIcon.src = '/static/icons/pocketvibe.png';
    iconUrl.value = '';

    // Reset app title
    const appName = document.getElementById('app-name');
    const appTitle = document.getElementById('app-title');

    appTitle.textContent = 'Super Cool App'; // placeholder
    appTitle.setAttribute('data-text', '');
    appName.value = '';

    // Reset site url and id
    const siteId = document.getElementById('site-id');
    siteId.textContent = '';

    const siteUrl = document.getElementById('site-url');
    siteUrl.style.display = 'none';
    siteUrl.textContent = '';
    siteUrl.setAttribute('data-url', '');

    // Clear any flags from loaded sites
    if (demoApps) {
        demoApps.removeAttribute('data-loaded-from-list');
        demoApps.removeAttribute('data-original-site-id');
    }
});

siteUrl = document.getElementById('site-url');
siteUrl.addEventListener('click', () => {
  originalUrl = siteUrl.textContent;

  // Copy the URL to the clipboard
  navigator.clipboard.writeText(siteUrl.textContent);

  // Show copied message in same div temporarily
  siteUrl.textContent = 'Copied!';
  setTimeout(() => {
    siteUrl.textContent = originalUrl;
  }, 2000);
});
  