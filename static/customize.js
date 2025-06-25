// Image validation
function setupImageValidation() {
    const iconUrlInput = document.getElementById('icon-url');
    const validationMessage = document.getElementById('icon-validation-message');
    if (!iconUrlInput || !validationMessage) return;

    // Use input event for real-time validation
    iconUrlInput.addEventListener('input', async function(e) {
        const url = e.target.value.trim().toLowerCase();
        
        // Clear validation if empty
        if (!url) {
            validationMessage.style.display = 'none';
            validationMessage.textContent = '';
            e.target.setCustomValidity('');
            return;
        }

        // Only validate if it's a URL
        if (url.startsWith('http://') || url.startsWith('https://')) {
            // Check file extension
            const validExtensions = ['.png', '.jpg', '.jpeg', '.webp'];
            if (!validExtensions.some(ext => url.endsWith(ext))) {
                validationMessage.textContent = 'Invalid image format. Please provide a URL to a PNG, JPEG, or WebP image.';
                validationMessage.style.display = 'block';
                e.target.setCustomValidity('Invalid image format');
                return;
            }

            try {
                // Check if image is square
                const img = new Image();
                img.crossOrigin = 'anonymous';  // Enable CORS for the image
                
                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = () => reject(new Error('Failed to load image'));
                    img.src = url;
                });

                if (img.width !== img.height) {
                    validationMessage.textContent = 'Image must be square (equal width and height).';
                    validationMessage.style.display = 'block';
                    e.target.setCustomValidity('Image must be square');
                    return;
                }

                // All validations passed
                validationMessage.style.display = 'none';
                validationMessage.textContent = '';
                e.target.setCustomValidity('');
            } catch (error) {
                validationMessage.textContent = 'Failed to validate image. Please check the URL and try again.';
                validationMessage.style.display = 'block';
                e.target.setCustomValidity('Failed to validate image');
            }
        } else {
            // If it's not a URL, it might be a prompt for AI generation
            validationMessage.style.display = 'none';
            validationMessage.textContent = '';
            e.target.setCustomValidity('');
        }
    });
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  setupImageValidation();
});

// Handle refresh button
const retryIconBtn = document.getElementById('retry-icon');
retryIconBtn.addEventListener('click', async () => {
  const iconInput = document.getElementById('icon-url').value.trim().toLowerCase();
  if (!iconInput) return;
  
  const previewImage = document.getElementById('app-icon');
  const appPreview = document.querySelector('.app-preview');
  
  // Store the original image source in case we need to revert
  const originalSrc = previewImage.src;
  
  // Show loading state
  appPreview.classList.add('loading');

  try {
      // Check if the input is a URL
      if (iconInput.startsWith('http://') || iconInput.startsWith('https://')) {
          // Use the URL directly
          await new Promise((resolve, reject) => {
              const tempImage = new Image();
              tempImage.onload = () => {
                  // Only update the preview image if the new image loads successfully
                  previewImage.src = iconInput;
                  resolve();
              };
              tempImage.onerror = () => {
                  // If the new image fails to load, keep the original
                  previewImage.src = originalSrc;
                  reject(new Error('Failed to load image from URL'));
              };
              tempImage.src = iconInput;
          });
      } else {
          // Generate icon using AI
          const generateResponse = await fetch('/api/generate-icon', {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                  prompt: iconInput
              })
          });
          
          const generateResult = await generateResponse.json();
          
          if (generateResult.status === 'success') {
              await new Promise((resolve, reject) => {
                  const tempImage = new Image();
                  tempImage.onload = () => {
                      // Only update the preview image if the new image loads successfully
                      previewImage.src = generateResult.icon_url;
                      resolve();
                  };
                  tempImage.onerror = () => {
                      // If the new image fails to load, keep the original
                      previewImage.src = originalSrc;
                      reject(new Error('Failed to load generated icon'));
                  };
                  tempImage.src = generateResult.icon_url;
              });
          } else {
              throw new Error(generateResult.message || 'Failed to generate icon');
          }
      }
  } catch (error) {
      console.error('Error retrying icon:', error);
      alert(`Error: ${error.message}`);
      // Ensure we keep the original image on any error
      previewImage.src = originalSrc;
  } finally {
      appPreview.classList.remove('loading');
  }
});

discardButton = document.getElementById('discardButton');
discardButton.addEventListener('click', () => {
  // Remove editable fields
  discardButton.style.display = 'none';
  acceptButton.style.display = 'none';
  document.querySelector('.icon-url-container').style.display = 'none';
  appNameInput.style.display = 'none';
  validationMessage.style.display = 'none';

  // Show original fields
  if (siteUrl.textContent.includes('pocket-vibe.koyeb.app')) {
    siteUrl.style.display = '';
  }
  editButton.style.display = '';
  shareButton.style.display = '';
  retryButton.style.display = '';
  donateButton.style.display = '';
  viewButton.style.display = '';
//   appTitle.style.display = '';

  // Clear the flags since user discarded changes
  const demoApps = document.getElementById('demoApps');
  if (demoApps) {
    demoApps.removeAttribute('data-loaded-from-list');
    demoApps.removeAttribute('data-original-site-id');
  }
});

acceptButton = document.getElementById('acceptButton');
acceptButton.addEventListener('click', async (e) => {
    e.preventDefault();
    
    const appName = appNameInput.value.trim();
    const appTitle = document.getElementById('app-title');
    appTitle.setAttribute('data-text', appName);
    const validationMessage = document.getElementById('icon-validation-message');
    const siteUrl = document.getElementById('site-url');

    
    if (!appName) {
        validationMessage.textContent = 'Please enter an app name';
        validationMessage.style.display = 'block';
        appNameInput.style.borderColor = 'red';
        appNameInput.focus();
        return;
    }
    
    // Clear validation message and styling
    validationMessage.style.display = 'none';
    validationMessage.textContent = '';
    appNameInput.style.borderColor = '';
    
    const previewImage = document.getElementById('app-icon');
    const siteId = document.getElementById('site-id').textContent;
    
    if (siteUrl.getAttribute('data-url').includes('pocket-vibe.koyeb.app')) {
        // Update the app with the icon
        const response = await fetch('/api/update-app-icon', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                app_name: appName,
                image_url: previewImage.src,
                site_id: siteId
            })
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            // Get the new URL
            const host = window.location.origin;
            const newUrl = `https://pocket-vibe.koyeb.app/site/${result.app_url}`;

            // Update the site URL
            siteUrl.textContent = newUrl;
            siteUrl.setAttribute('data-url', newUrl);  // Store the URL in a data attribute

            // Update stored site data if this site was loaded from the completed sites list
            if (typeof updateStoredSiteData === 'function') {
                try {
                    const updated = updateStoredSiteData(result.app_url, newUrl, appName, previewImage.src);
                    if (updated) {
                        console.log('Successfully updated stored site data');
                    }
                } catch (error) {
                    console.warn('Failed to update stored site data:', error);
                }
            } else {
                console.log('updateStoredSiteData function not available');
            }

        } else {
            alert('Something went wrong, please try again');
            // Remove editable fields
            discardButton.style.display = 'none';
            acceptButton.style.display = 'none';
            appNameInput.style.display = 'none';
            document.querySelector('.icon-url-container').style.display = 'none';
            validationMessage.style.display = 'none';

            // Show original fields
            if (siteUrl.getAttribute('data-url').includes('pocket-vibe.koyeb.app')) {
                siteUrl.style.display = '';
            }

            editButton.style.display = '';
            shareButton.style.display = '';
            retryButton.style.display = '';
            donateButton.style.display = '';
            viewButton.style.display = '';
            // appTitle.style.display = '';
            }
    }

    // Remove editable fields
    discardButton.style.display = 'none';
    acceptButton.style.display = 'none';
    appNameInput.style.display = 'none';
    document.querySelector('.icon-url-container').style.display = 'none';
    validationMessage.style.display = 'none';

    // Show original fields
    if (siteUrl.getAttribute('data-url').includes('pocket-vibe.koyeb.app')) {
        siteUrl.style.display = '';
    }

    editButton.style.display = '';
    shareButton.style.display = '';
    retryButton.style.display = '';
    donateButton.style.display = '';
    viewButton.style.display = '';
    // appTitle.style.display = '';
});

// Listen for changes to app name input and update title in real-time
const appNameInput = document.getElementById('app-name');
appNameInput.addEventListener('input', (e) => {
    const appTitle = document.getElementById('app-title');
    const newName = e.target.value.trim();
    appTitle.textContent = newName || 'Super Cool App';
});
