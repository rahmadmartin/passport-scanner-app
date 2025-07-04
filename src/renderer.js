const { ipcRenderer } = require('electron');

// Debug logging helper
function debugLog(emoji, message, data = null) {
    console.log(`${emoji} [RENDERER] ${message}`, data || '');
}

// Global variables
let capturedImageData = null;
let currentStream = null;
let selectedDocumentType = null;

// DOM Elements
const elements = {
    capturePreview: document.getElementById('capturePreview'),
    capturedImage: document.getElementById('capturedImage'),
    manualCaptureBtn: document.getElementById('manualCaptureBtn'),
    processOcrBtn: document.getElementById('processOcrBtn'),
    ocrResults: document.getElementById('ocrResults'),
    reservationNumber: document.getElementById('reservationNumber'),
    fullOcrText: document.getElementById('fullOcrText'),
    callApiBtn: document.getElementById('callApiBtn'),
    step1: document.getElementById('step1'),
    step2: document.getElementById('step2'),
    startScanBtn: document.getElementById('startScanBtn'),
    cameraSection: document.getElementById('cameraSection'),
    cameraVideo: document.getElementById('cameraVideo'),
    cameraCanvas: document.getElementById('cameraCanvas'),
    captureDocBtn: document.getElementById('captureDocBtn'),
    retakeBtn: document.getElementById('retakeBtn'),
    stopCameraBtn: document.getElementById('stopCameraBtn'),
    documentPreview: document.getElementById('documentPreview'),
    capturedDocument: document.getElementById('capturedDocument'),
    selectedDocType: document.getElementById('selectedDocType'),
    fileSize: document.getElementById('fileSize'),
    base64Status: document.getElementById('base64Status'),
    processDocBtn: document.getElementById('processDocBtn'),
    retakeDocBtn: document.getElementById('retakeDocBtn'),
    completeBtn: document.getElementById('completeBtn'),
    loadingOverlay: document.getElementById('loadingOverlay'),
    loadingText: document.getElementById('loadingText'),
    minimizeBtn: document.getElementById('minimizeBtn')
};

// Initialize application
function init() {
    debugLog('🚀', 'Initializing Reservation Scanner Application');
    
    // Check if all required elements exist
    Object.keys(elements).forEach(key => {
        if (!elements[key]) {
            debugLog('⚠️', `Missing element: ${key}`);
        }
    });
    
    setupEventListeners();
    debugLog('✅', 'Application initialized successfully');
}

// Setup all event listeners
function setupEventListeners() {
    debugLog('🔧', 'Setting up event listeners');
    
    // IPC Listeners
    ipcRenderer.on('screen-captured', handleScreenCaptured);
    
    // Button Event Listeners
    elements.minimizeBtn?.addEventListener('click', handleMinimize);
    elements.manualCaptureBtn?.addEventListener('click', handleManualCapture);
    elements.processOcrBtn?.addEventListener('click', handleOcrProcess);
    elements.callApiBtn?.addEventListener('click', handleApiCall);
    elements.startScanBtn?.addEventListener('click', handleStartScan);
    elements.captureDocBtn?.addEventListener('click', handleCaptureDocument);
    elements.retakeBtn?.addEventListener('click', handleRetake);
    elements.stopCameraBtn?.addEventListener('click', handleStopCamera);
    elements.processDocBtn?.addEventListener('click', handleProcessDocument);
    elements.retakeDocBtn?.addEventListener('click', handleRetakeDocument);
    elements.completeBtn?.addEventListener('click', handleComplete);
    
    // Document type radio buttons
    document.querySelectorAll('input[name="documentType"]').forEach(radio => {
        radio.addEventListener('change', handleDocumentTypeChange);
    });
    
    debugLog('✅', 'Event listeners setup complete');
}

// Handle screen capture from floating window
async function handleScreenCaptured(event, dataUrl) {
    debugLog('📸', 'Screen capture received from floating window');
    debugLog('📊', 'Data URL length:', dataUrl.length);
    
    try {
        // Display captured image
        capturedImageData = dataUrl;
        elements.capturedImage.src = dataUrl;
        elements.capturedImage.style.display = 'block';
        
        // Update UI
        elements.capturePreview.classList.add('has-image');
        elements.capturePreview.querySelector('.placeholder').style.display = 'none';
        elements.processOcrBtn.disabled = false;
        
        debugLog('✅', 'Screen capture displayed successfully');
        
    } catch (error) {
        debugLog('🚨', 'Error handling screen capture:', error);
    }
}

// Handle minimize button
function handleMinimize() {
    debugLog('🔽', 'Minimizing main window');
    ipcRenderer.invoke('hide-main-window');
}

// Handle manual screen capture
async function handleManualCapture() {
    debugLog('📸', 'Manual capture initiated');
    showLoading('Capturing screen...');
    
    try {
        const dataUrl = await ipcRenderer.invoke('capture-screen');
        debugLog('✅', 'Manual capture successful, data URL length:', dataUrl.length);
        
        await handleScreenCaptured(null, dataUrl);
        hideLoading();
        
    } catch (error) {
        debugLog('🚨', 'Manual capture failed:', error);
        hideLoading();
        alert('Screen capture failed: ' + error.message);
    }
}

// Handle OCR processing
async function handleOcrProcess() {
    debugLog('🔍', 'OCR processing initiated');
    
    if (!capturedImageData) {
        debugLog('⚠️', 'No captured image data available');
        alert('Please capture a screen first');
        return;
    }
    
    showLoading('Processing OCR...');
    
    try {
        debugLog('📤', 'Sending OCR request to main process');
        const result = await ipcRenderer.invoke('process-ocr', capturedImageData);
        
        debugLog('📥', 'OCR result received:', result);
        
        if (result.success) {
            debugLog('✅', 'OCR processing successful');
            debugLog('📝', 'Full text:', result.fullText);
            debugLog('🎯', 'Confidence:', result.confidence);
            
            // Display results
            elements.fullOcrText.value = result.fullText;
            elements.reservationNumber.value = extractConfirmationNumber(result.fullText) || '';
            
            // Show OCR results section
            elements.ocrResults.style.display = 'block';
            
            // Log extracted field values
            debugLog('📋', 'Extracted fields:');
            debugLog('👤', 'Name:', result.reservationData.name);
            debugLog('👤', 'First Name:', result.reservationData.firstName);
            debugLog('🎫', 'Confirmation Number:', elements.reservationNumber.value);
            debugLog('🏠', 'Room:', result.reservationData.room);

            debugLog('🔍', 'Extracted data:', result.reservationData);

            
        } else {
            debugLog('🚨', 'OCR processing failed:', result.error);
            alert('OCR processing failed: ' + result.error);
        }
        
    } catch (error) {
        debugLog('🚨', 'OCR processing error:', error);
        alert('OCR processing error: ' + error.message);
    } finally {
        hideLoading();
    }
}

// Function to extract confirmation number from the OCR text
function extractConfirmationNumber(text) {
    const lines = text.split('\n'); // Split the text into lines
    
    // Find the line that contains 'Confirmation Number'
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes('confirmation number')) {
            // The confirmation number should be in the next line
            const nextLine = lines[i + 1]; 
            const match = nextLine.match(/^\d+/); // Match digits at the start of the next line
            if (match) {
                return match[0]; // Return the found confirmation number
            }
        }
    }
    return ''; // Return an empty string if no match is found
}


// Handle API call
async function handleApiCall() {
    debugLog('📡', 'API call initiated');
    
    const reservationNum = elements.reservationNumber.value.trim();
    if (!reservationNum) {
        debugLog('⚠️', 'No reservation number provided');
        alert('Please provide a reservation number');
        return;
    }
    
    showLoading('Calling API...');
    
    try {
        debugLog('🔄', 'Making API request with reservation number:', reservationNum);
        
        // Simulate API call (replace with actual API endpoint)
        const apiResponse = await simulateApiCall(reservationNum);
        debugLog('📥', 'API response received:', apiResponse);
        
        if (apiResponse.success) {
            debugLog('✅', 'API call successful');
            
            // Move to next step
            elements.step1.style.display = 'none';
            elements.step2.style.display = 'block';
            
            debugLog('🎯', 'Moved to document scanning step');
        } else {
            debugLog('🚨', 'API call failed:', apiResponse.error);
            alert('API call failed: ' + apiResponse.error);
        }
        
    } catch (error) {
        debugLog('🚨', 'API call error:', error);
        alert('API call error: ' + error.message);
    } finally {
        hideLoading();
    }
}

// Simulate API call (replace with actual implementation)
async function simulateApiCall(reservationNumber) {
    debugLog('🎭', 'Simulating API call for reservation:', reservationNumber);
    
    return new Promise(resolve => {
        setTimeout(() => {
            resolve({
                success: true,
                data: {
                    reservationNumber: reservationNumber,
                    status: 'confirmed',
                    guest: 'John Doe'
                }
            });
        }, 2000);
    });
}

// Handle document type change
function handleDocumentTypeChange(event) {
    selectedDocumentType = event.target.value;
    debugLog('📄', 'Document type selected:', selectedDocumentType);
    
    elements.startScanBtn.disabled = false;
    elements.selectedDocType.textContent = selectedDocumentType.toUpperCase();
}

// Handle start document scan
async function handleStartScan() {
    debugLog('📹', 'Starting document scan for type:', selectedDocumentType);
    
    if (!selectedDocumentType) {
        debugLog('⚠️', 'No document type selected');
        alert('Please select a document type first');
        return;
    }
    
    try {
        debugLog('🎥', 'Requesting camera access...');
        currentStream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                facingMode: 'environment' // Use back camera
            } 
        });
        
        debugLog('✅', 'Camera access granted');
        
        elements.cameraVideo.srcObject = currentStream;
        elements.cameraSection.style.display = 'block';
        
        debugLog('📹', 'Camera stream started');
        
    } catch (error) {
        debugLog('🚨', 'Camera access error:', error);
        alert('Camera access failed: ' + error.message);
    }
}

// Handle document capture
function handleCaptureDocument() {
    debugLog('📸', 'Capturing document image');
    
    if (!currentStream) {
        debugLog('⚠️', 'No camera stream available');
        alert('Camera not available');
        return;
    }
    
    try {
        const canvas = elements.cameraCanvas;
        const video = elements.cameraVideo;
        const context = canvas.getContext('2d');
        
        // Set canvas dimensions to match video
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        debugLog('📐', 'Canvas dimensions:', canvas.width, 'x', canvas.height);
        
        // Draw video frame to canvas
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Convert to base64
        const base64Image = canvas.toDataURL('image/jpeg', 0.8);
        debugLog('📊', 'Base64 image length:', base64Image.length);
        
        // Display captured document
        elements.capturedDocument.src = base64Image;
        elements.fileSize.textContent = Math.round(base64Image.length / 1024) + ' KB';
        elements.base64Status.textContent = 'Ready';
        elements.documentPreview.style.display = 'block';
        
        // Stop camera
        handleStopCamera();
        
        debugLog('✅', 'Document captured successfully');
        
    } catch (error) {
        debugLog('🚨', 'Document capture error:', error);
        alert('Document capture failed: ' + error.message);
    }
}

// Handle retake
function handleRetake() {
    debugLog('🔄', 'Retaking document photo');
    elements.documentPreview.style.display = 'none';
    handleStartScan();
}

// Handle stop camera
function handleStopCamera() {
    debugLog('🛑', 'Stopping camera');
    
    if (currentStream) {
        currentStream.getTracks().forEach(track => {
            track.stop();
            debugLog('🔌', 'Camera track stopped');
        });
        currentStream = null;
    }
    
    elements.cameraSection.style.display = 'none';
}

// Handle process document
function handleProcessDocument() {
    debugLog('⚙️', 'Processing document');
    showLoading('Processing document...');
    
    setTimeout(() => {
        debugLog('✅', 'Document processed successfully');
        hideLoading();
        alert('Document processed successfully!');
    }, 2000);
}

// Handle retake document
function handleRetakeDocument() {
    debugLog('🔄', 'Retaking document');
    elements.documentPreview.style.display = 'none';
    handleStartScan();
}

// Handle complete process
function handleComplete() {
    debugLog('🎉', 'Process completed successfully');
    alert('Process completed successfully!');
    
    // Reset to initial state
    elements.step1.style.display = 'block';
    elements.step2.style.display = 'none';
    elements.ocrResults.style.display = 'none';
    elements.documentPreview.style.display = 'none';
    
    // Clear data
    capturedImageData = null;
    selectedDocumentType = null;
    elements.capturedImage.style.display = 'none';
    elements.capturePreview.classList.remove('has-image');
    elements.capturePreview.querySelector('.placeholder').style.display = 'block';
    elements.processOcrBtn.disabled = true;
    
    debugLog('🔄', 'Application reset to initial state');
}

// Show loading overlay
function showLoading(message) {
    debugLog('⏳', 'Showing loading:', message);
    elements.loadingText.textContent = message;
    elements.loadingOverlay.style.display = 'flex';
}

// Hide loading overlay
function hideLoading() {
    debugLog('✅', 'Hiding loading overlay');
    elements.loadingOverlay.style.display = 'none';
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', init);

// Handle window errors
window.addEventListener('error', (event) => {
    debugLog('🚨', 'Window error:', event.error);
});

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
    debugLog('🚨', 'Unhandled promise rejection:', event.reason);
});

debugLog('📋', 'Renderer script loaded');