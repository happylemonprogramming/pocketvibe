// Floating particles animation
function createParticles() {
    const container = document.getElementById('particles');
    
    for (let i = 0; i < 50; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.animationDelay = Math.random() * 20 + 's';
        particle.style.animationDuration = (Math.random() * 10 + 15) + 's';
        container.appendChild(particle);
    }
}

// // Generate button functionality
// document.getElementById('generateBtn').addEventListener('click', function() {
//     const prompt = document.getElementById('promptInput').value.trim();
    
//     if (!prompt) {
//         alert('Please describe your app idea first!');
//         return;
//     }

//     // Start generation animation
//     this.classList.add('loading');
//     document.getElementById('btnText').textContent = 'Generating...';
//     document.getElementById('generationSteps').style.display = 'block';

//     // Define steps content
//     const steps = [
//         { icon: '🧠', text: 'Analyzing your requirements...' },
//         { icon: '🏗️', text: 'Designing architecture...' },
//         { icon: '🎨', text: 'Creating UI/UX design...' },
//         { icon: '⚡', text: 'Generating code...' },
//         { icon: '🚀', text: 'Building your app...' }
//     ];
    
//     let currentStepIndex = 0;
//     let cycles = 0;
//     const totalCycles = 1;
//     const stepElement = document.getElementById('currentStep');
//     const stepIcon = stepElement.querySelector('.step-icon');
//     const stepText = stepElement.querySelector('.step-text');

//     const updateStep = () => {
//         // Fade out
//         stepElement.style.opacity = '0';
        
//         setTimeout(() => {
//             // Update content
//             stepIcon.textContent = steps[currentStepIndex].icon;
//             stepText.textContent = steps[currentStepIndex].text;
            
//             // Move to next step
//             currentStepIndex = (currentStepIndex + 1) % steps.length;
            
//             // If we've completed a full cycle
//             if (currentStepIndex === 0) {
//                 cycles++;
//                 if (cycles >= totalCycles) {
//                     clearInterval(stepInterval); // Clear the interval
//                     // Show completion
//                     setTimeout(() => {
//                         this.classList.remove('loading');
//                         document.getElementById('btnText').textContent = 'Create New App';
//                         document.getElementById('generationSteps').style.display = 'none';
//                         document.getElementById('demoApps').style.display = 'grid';
                        
//                         // Scroll to results
//                         document.getElementById('demoApps').scrollIntoView({ 
//                             behavior: 'smooth',
//                             block: 'start'
//                         });
//                     }, 1000);
//                     return;
//                 }
//             }
            
//             // Fade in
//             stepElement.style.opacity = '1';
//         }, 300);
//     };

//     // Start the cycle
//     const stepInterval = setInterval(updateStep, 2500);
//     updateStep(); // Show first step immediately
// });


// Initialize
createParticles();

// Add some sample prompts for inspiration
const samplePrompts = [
    "A pomodoro timer with customizable work/break cycles and task tracking...",
    "A recipe calculator that scales ingredients and saves favorites locally...",
    "A habit tracker with progress visualization and daily reminders...",
    "A color palette generator with accessibility contrast checking...",
    "A markdown editor with live preview and local file saving...",
    "A weather dashboard using browser geolocation and local storage..."
];

// Placeholder text animation
let placeholderIndex = 0;
const promptInput = document.getElementById('promptInput');

// Auto-expand textarea
function adjustTextareaHeight() {
    promptInput.style.height = 'auto'; // Reset height to auto
    const newHeight = Math.min(promptInput.scrollHeight, 400); // Cap at max-height
    promptInput.style.height = newHeight + 'px';
    
    // Add/remove scrollable class based on content height
    if (promptInput.scrollHeight > 400) {
        promptInput.classList.add('scrollable');
    } else {
        promptInput.classList.remove('scrollable');
    }
}

// Adjust height on input
promptInput.addEventListener('input', adjustTextareaHeight);

// Initial height adjustment
adjustTextareaHeight();

setInterval(() => {
    if (promptInput.value === '' && document.activeElement !== promptInput) {
        promptInput.placeholder = samplePrompts[placeholderIndex];
        placeholderIndex = (placeholderIndex + 1) % samplePrompts.length;
    }
}, 4000);
