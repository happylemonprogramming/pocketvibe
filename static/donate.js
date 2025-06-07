// Add event listener for donate button
document.addEventListener('DOMContentLoaded', function() {
    const donateButton = document.getElementById('donateButton');
    if (donateButton) {
        donateButton.addEventListener('click', openPaymentModal);
    }
});

// Modal Functions
function openPaymentModal() {
    document.getElementById('paymentModal').classList.add('show');
}

function closePaymentModal() {
    document.getElementById('paymentModal').classList.remove('show');
}

// Close modal when clicking outside
document.getElementById('paymentModal').addEventListener('click', function(e) {
    if (e.target === this) {
        closePaymentModal();
    }
});

// Close modal with Escape key
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && document.getElementById('paymentModal').classList.contains('show')) {
        closePaymentModal();
    }
});

// Close modal when clicking the X
document.querySelector('#paymentModal .modal-close').addEventListener('click', closePaymentModal);

// Payment toggle functionality
document.getElementById('paymentToggle').addEventListener('change', function() {
    const stripePayment = document.getElementById('stripePayment');
    const btcPayment = document.getElementById('btcPayment');

    if (this.checked) {
        stripePayment.style.display = 'none';
        btcPayment.style.display = 'flex';
    } else {
        stripePayment.style.display = 'flex';
        btcPayment.style.display = 'none';
    }
});

// Function to make QR container copyable
function makeQRContainerCopyable(container, text) {
    container.title = 'Click to copy';
    container.style.cursor = 'pointer';
    
    // Store the full text as a data attribute
    container.dataset.copyText = text;
    
    container.onclick = async () => {
        try {
            // Get the full text from the data attribute
            const textToCopy = container.dataset.copyText;
            await navigator.clipboard.writeText(textToCopy);
            
            // Show copy feedback
            const qrAddress = container.querySelector('.qr-address');
            const originalText = qrAddress.textContent;
            qrAddress.textContent = '✓ Copied!';
            
            // Add a temporary class for visual feedback
            container.classList.add('copied');
            
            setTimeout(() => {
                qrAddress.textContent = originalText;
                container.classList.remove('copied');
            }, 2000);
        } catch (err) {
            console.error('Failed to copy: ', err);
        }
    };
}

// When generating a new QR code
const qrContainer = document.querySelector('.qr-container');
const qrCode = document.querySelector('.qr-code');

// BTC donation form handler
document.getElementById('btcDonationForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const amount = document.getElementById('donationAmount').value;
    const qrCode = document.querySelector('.qr-code');
    const qrAddress = document.querySelector('.qr-address');
    const qrContainer = document.querySelector('.qr-container');
    
    try {
        // Show loading spinner but keep current QR code
        qrContainer.classList.add('loading');
        qrAddress.textContent = 'Generating invoice...';
        
        // Generate invoice
        const response = await fetch('/api/generate-invoice', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ amount })
        });
        
        const data = await response.json();
        
        if (data.status === 'success') {
            // Create a new image to preload
            const newQR = new Image();
            newQR.onload = () => {
                // Only update the QR code once the new image is loaded
                qrCode.src = newQR.src;
                qrContainer.classList.remove('loading');
            };
            newQR.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(data.lnInvoice)}&color=FFFFFF&bgcolor=16213E`;
            
            // Display truncated invoice but store full invoice for copying
            const truncatedInvoice = data.lnInvoice.substring(0, 21) + '...';
            qrAddress.textContent = truncatedInvoice;
            makeQRContainerCopyable(qrContainer, data.lnInvoice);
            
            // Start polling for payment status
            const checkPayment = async () => {
                try {
                    const statusResponse = await fetch(`/api/check-invoice/${data.invoiceId}`);
                    const statusData = await statusResponse.json();
                    
                    if (statusData.status === 'success' && statusData.isPaid) {
                        // Payment received - show green check
                        const checkImage = new Image();
                        checkImage.onload = () => {
                            qrCode.src = checkImage.src;
                        };
                        checkImage.src = '/static/buttons/check.png';
                        qrAddress.textContent = 'Thank you!';
                        // Close the modal
                        closePaymentModal();
                        return;
                    }
                    
                    // Continue polling if not paid
                    setTimeout(checkPayment, 1000);
                } catch (error) {
                    console.error('Error checking payment status:', error);
                }
            };
            
            // Start polling
            checkPayment();
        } else {
            throw new Error(data.message || 'Failed to generate invoice');
        }
    } catch (error) {
        console.error('Error:', error);
        qrContainer.classList.remove('loading');
        const errorImage = new Image();
        errorImage.onload = () => {
            qrCode.src = errorImage.src;
        };
        errorImage.src = '/static/buttons/error.png';
        qrAddress.textContent = 'Error generating invoice. Please try again.';
    }
});

// Make initial QR container copyable
document.addEventListener('DOMContentLoaded', function() {
    const qrContainer = document.querySelector('.qr-container');
    if (qrContainer && qrContainer.querySelector('.qr-address').textContent === 'lemonlemons@strike.me') {
        makeQRContainerCopyable(qrContainer, 'lemonlemons@strike.me');
    }
});