const { ipcRenderer } = require('electron');
const Tesseract = require('tesseract.js');
const axios = require('axios');

// Debug utility
const debug = {
    log: (category, message, data = null) => {
        const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
        console.log(`[${timestamp}] ${category} ${message}`);
        if (data) {
            console.log('📊 Data:', data);
        }
    },
    error: (category, message, error = null) => {
        const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
        console.error(`[${timestamp}] ❌ ${category} ${message}`);
        if (error) {
            console.error('🚨 Error details:', error);
        }
    }
};

// Global state
let capturedImageData = null;
let currentStream = null;
let selectedDocumentType = null;
let capturedDocumentBase64 = null;

// DOM Elements
const elements = {
    // Step 1 elements
    capturePreview: document.getElementById('capturePreview'),
    capturedImage: document.getElementById('capturedImage'),
    manualCaptureBtn: document.getElementById('manualCaptureBtn'),
    processOcrBtn: document.getElementById('processOcrBtn'),
    ocrResults: document.getElementById('ocrResults'),
    reservationNumber: document.getElementById('reservationNumber'),
    fullOcrText: document.getElementById('fullOcrText'),
    callApiBtn: document.getElementById('callApiBtn'),
    
    // Step 2 elements
    step1: document.getElementById('step1'),
    step2: document.getElementById('step2'),
    documentTypeRadios: document.querySelectorAll('input[name="documentType"]'),
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
    
    // Common elements
    loadingOverlay: document.getElementById('loadingOverlay'),
    loadingText: document.getElementById('loadingText'),
    minimizeBtn: document.getElementById('minimizeBtn')
};

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    debug.log('🚀 [RENDERER]', 'Application initialized');
    setupEventListeners();
    checkElementsExistence();
});

function checkElementsExistence() {
    debug.log('🔍 [RENDERER]', 'Checking DOM elements...');
    Object.entries(elements).forEach(([key, element]) => {
        if (!element) {
            debug.error('🔍 [RENDERER]', `Element not found: ${key}`);
        } else {
            debug.log('🔍 [RENDERER]', `Element found: ${key}`);
        }
    });
}

function setupEventListeners() {
    debug.log('🔧 [RENDERER]', 'Setting up event listeners');
    
    // Listen for screen capture from floating window
    ipcRenderer.on('screen-captured', (event, dataUrl) => {
        debug.log('📨 [RENDERER]', 'Received screen capture from floating window');
        handleScreenCapture(dataUrl);
    });
    
    // Step 1 - Screen capture and OCR
    elements.manualCaptureBtn?.addEventListener('click', handleManualCapture);
    elements.processOcrBtn?.addEventListener('click', handleOcrProcess);
    elements.callApiBtn?.addEventListener('click', handleApiCall);
    
    // Step 2 - Document scanning
    elements.documentTypeRadios?.forEach(radio => {
        radio.addEventListener('change', handleDocumentTypeChange);
    });
    elements.startScanBtn?.addEventListener('click', handleStartScan);
    elements.captureDocBtn?.addEventListener('click', handleCaptureDocument);
    elements.retakeBtn?.addEventListener('click', handleRetake);
    elements.stopCameraBtn?.addEventListener('click', handleStopCamera);
    elements.processDocBtn?.addEventListener('click', handleProcessDocument);
    elements.retakeDocBtn?.addEventListener('click', handleRetakeDocument);
    elements.completeBtn?.addEventListener('click', handleComplete);
    
    // Common
    elements.minimizeBtn?.addEventListener('click', handleMinimize);
    
    debug.log('✅ [RENDERER]', 'Event listeners setup complete');
}

// Screen Capture Functions
async function handleManualCapture() {
    debug.log('🎯 [RENDERER]', 'Manual capture initiated');
    showLoading('Capturing screen...');
    
    try {
        const dataUrl = await ipcRenderer.invoke('capture-screen');
        debug.log('✅ [RENDERER]', 'Manual screen capture successful');
        handleScreenCapture(dataUrl);
    } catch (error) {
        debug.error('❌ [RENDERER]', 'Manual capture failed', error);
        alert(`Screen capture failed: ${error.message}`);
    } finally {
        hideLoading();
    }
}

function handleScreenCapture(dataUrl) {
    debug.log('🖼️ [RENDERER]', 'Processing captured screen', {
        dataLength: dataUrl.length,
        format: dataUrl.substring(0, 50)
    });
    
    try {
        capturedImageData = dataUrl;
        
        // Update UI
        if (elements.capturedImage && elements.capturePreview) {
            elements.capturedImage.src = dataUrl;
            elements.capturedImage.style.display = 'block';
            elements.capturePreview.classList.add('has-image');
            elements.capturePreview.querySelector('.placeholder').style.display = 'none';
            
            debug.log('✅ [RENDERER]', 'Image displayed in preview');
        }
        
        // Enable OCR button
        if (elements.processOcrBtn) {
            elements.processOcrBtn.disabled = false;
            debug.log('✅ [RENDERER]', 'OCR button enabled');
        }
        
    } catch (error) {
        debug.error('❌ [RENDERER]', 'Error processing captured screen', error);
    }
}

// OCR Functions
async function handleOcrProcess() {
    if (!capturedImageData) {
        debug.error('❌ [RENDERER]', 'No captured image data for OCR');
        alert('No image captured for OCR processing');
        return;
    }
    
    debug.log('🔤 [RENDERER]', 'Starting OCR process');
    showLoading('Processing OCR...');
    
    try {
        debug.log('🔤 [RENDERER]', 'Initializing Tesseract worker');
        
        const { data } = await Tesseract.recognize(capturedImageData, 'eng', {
            logger: m => {
                debug.log('🔤 [TESSERACT]', `${m.status}: ${Math.round(m.progress * 100)}%`);
                updateLoadingText(`OCR Progress: ${Math.round(m.progress * 100)}%`);
            }
        });
        
        debug.log('✅ [RENDERER]', 'OCR completed successfully', {
            confidence: data.confidence,
            textLength: data.text.length,
            wordsCount: data.words?.length || 0
        });
        
        console.log('📝 [OCR] Full recognized text:', data.text);
        console.log('📊 [OCR] Confidence score:', data.confidence);
        console.log('📊 [OCR] Words detected:', data.words?.length || 0);
        
        // Process OCR results
        const reservationNum = extractReservationNumber(data.text);
        debug.log('🎯 [RENDERER]', 'Reservation number extraction result', {
            found: !!reservationNum,
            value: reservationNum
        });
        
        // Update UI
        if (elements.fullOcrText) {
            elements.fullOcrText.value = data.text;
        }
        
        if (elements.reservationNumber) {
            elements.reservationNumber.value = reservationNum || '';
        }
        
        if (elements.ocrResults) {
            elements.ocrResults.style.display = 'block';
        }
        
        debug.log('✅ [RENDERER]', 'OCR results displayed in UI');
        
    } catch (error) {
        debug.error('❌ [RENDERER]', 'OCR processing failed', error);
        alert(`OCR processing failed: ${error.message}`);
    } finally {
        hideLoading();
    }
}

function extractReservationNumber(text) {
    debug.log('🔍 [RENDERER]', 'Extracting reservation number from text');
    
    // Multiple patterns to match reservation numbers
    const patterns = [
        /(?:reservation|booking|ref|confirmation)[\s#:]*([A-Z0-9]{6,12})/i,
        /(?:res|rsv)[\s#:]*([A-Z0-9]{6,12})/i,
        /[A-Z]{2,3}[0-9]{4,8}/g,
        /[0-9]{6,10}/g,
        /[A-Z0-9]{6,12}/g
    ];
    
    console.log('🔍 [EXTRACT] Full text to analyze:', text);
    
    for (let i = 0; i < patterns.length; i++) {
        const matches = text.match(patterns[i]);
        if (matches) {
            debug.log('🎯 [RENDERER]', `Pattern ${i + 1} matched`, matches);
            console.log(`🎯 [EXTRACT] Pattern ${i + 1} matches:`, matches);
            return matches[0];
        }
    }
    
    debug.log('⚠️ [RENDERER]', 'No reservation number pattern matched');
    return null;
}

// API Functions
async function handleApiCall() {
    const reservationNum = elements.reservationNumber?.value;
    
    if (!reservationNum) {
        debug.error('❌ [RENDERER]', 'No reservation number for API call');
        alert('Please enter a reservation number');
        return;
    }
    
    debug.log('📡 [RENDERER]', 'Making API call', { reservationNumber: reservationNum });
    showLoading('Calling API...');
    
    try {
        // Replace with your actual API endpoint
        const apiUrl = 'https://your-api-endpoint.com/reservation';
        
        debug.log('📡 [RENDERER]', 'API request details', {
            url: apiUrl,
            method: 'POST',
            data: { reservationNumber: reservationNum }
        });
        
        const response = await axios.post(apiUrl, {
            reservationNumber: reservationNum,
            timestamp: new Date().toISOString()
        });
        
        debug.log('✅ [RENDERER]', 'API call successful', {
            status: response.status,
            dataKeys: Object.keys(response.data || {})
        });
        
        console.log('📡 [API] Response data:', response.data);
        
        // Show step 2
        if (elements.step2) {
            elements.step2.style.display = 'block';
            debug.log('✅ [RENDERER]', 'Step 2 displayed');
        }
        
        alert('API call successful! You can now proceed to document scanning.');
        
    } catch (error) {
        debug.error('❌ [RENDERER]', 'API call failed', error);
        console.log('📡 [API] Error details:', {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status
        });
        
        // For demo purposes, still show step 2
        if (elements.step2) {
            elements.step2.style.display = 'block';
            debug.log('⚠️ [RENDERER]', 'Step 2 displayed despite API error (demo mode)');
        }
        
        alert(`API call failed (but continuing for demo): ${error.message}`);
    } finally {
        hideLoading();
    }
}

// Document Scanning Functions
function handleDocumentTypeChange(event) {
    selectedDocumentType = event.target.value;
    debug.log('📄 [RENDERER]', 'Document type selected', { type: selectedDocumentType });
    
    if (elements.startScanBtn) {
        elements.startScanBtn.disabled = false;
        debug.log('✅ [RENDERER]', 'Start scan button enabled');
    }
}

async function handleStartScan() {
    if (!selectedDocumentType) {
        debug.error('❌ [RENDERER]', 'No document type selected');
        alert('Please select a document type first');
        return;
    }
    
    debug.log('📷 [RENDERER]', 'Starting camera for document scan', { docType: selectedDocumentType });
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: { ideal: 'environment' }, // Back camera
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        });
        
        debug.log('✅ [RENDERER]', 'Camera stream obtained', {
            tracks: stream.getVideoTracks().length,
            settings: stream.getVideoTracks()[0]?.getSettings()
        });
        
        currentStream = stream;
        
        if (elements.cameraVideo) {
            elements.cameraVideo.srcObject = stream;
            elements.cameraSection.style.display = 'block';
            debug.log('✅ [RENDERER]', 'Camera video displayed');
        }
        
    } catch (error) {
        debug.error('❌ [RENDERER]', 'Camera access failed', error);
        alert(`Camera access failed: ${error.message}`);
    }
}

function handleCaptureDocument() {
    if (!currentStream || !elements.cameraVideo) {
        debug.error('❌ [RENDERER]', 'No active camera stream for capture');
        return;
    }
    
    debug.log('📸 [RENDERER]', 'Capturing document from camera');
    
    try {
        const canvas = elements.cameraCanvas;
        const video = elements.cameraVideo;
        const context = canvas.getContext('2d');
        
        // Set canvas size to match video
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
        
        debug.log('📸 [RENDERER]', 'Canvas setup', {
            width: canvas.width,
            height: canvas.height,
            videoWidth: video.videoWidth,
            videoHeight: video.videoHeight
        });
        
        // Draw video frame to canvas
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Convert to base64
        const base64Data = canvas.toDataURL('image/jpeg', 0.8);
        capturedDocumentBase64 = base64Data;
        
        debug.log('✅ [RENDERER]', 'Document captured and converted to base64', {
            base64Length: base64Data.length,
            format: base64Data.substring(0, 50)
        });
        
        // Update UI
        if (elements.capturedDocument) {
            elements.capturedDocument.src = base64Data;
        }
        
        if (elements.selectedDocType) {
            elements.selectedDocType.textContent = selectedDocumentType.toUpperCase();
        }
        
        if (elements.fileSize) {
            const sizeKB = Math.round(base64Data.length * 0.75 / 1024); // Rough base64 to bytes conversion
            elements.fileSize.textContent = `${sizeKB} KB`;
        }
        
        if (elements.base64Status) {
            elements.base64Status.textContent = 'Ready ✓';
            elements.base64Status.style.color = 'green';
        }
        
        if (elements.documentPreview) {
            elements.documentPreview.style.display = 'block';
        }
        
        debug.log('✅ [RENDERER]', 'Document preview UI updated');
        
        // Stop camera
        handleStopCamera();
        
    } catch (error) {
        debug.error('❌ [RENDERER]', 'Document capture failed', error);
        alert(`Document capture failed: ${error.message}`);
    }
}

function handleRetake() {
    debug.log('🔄 [RENDERER]', 'Retaking photo');
    handleStartScan();
}

function handleStopCamera() {
    debug.log('🛑 [RENDERER]', 'Stopping camera');
    
    if (currentStream) {
        currentStream.getTracks().forEach(track => {
            track.stop();
            debug.log('🛑 [RENDERER]', `Track stopped: ${track.kind}`);
        });
        currentStream = null;
    }
    
    if (elements.cameraSection) {
        elements.cameraSection.style.display = 'none';
    }
    
    debug.log('✅ [RENDERER]', 'Camera stopped successfully');
}

function handleProcessDocument() {
    if (!capturedDocumentBase64) {
        debug.error('❌ [RENDERER]', 'No document captured for processing');
        alert('No document captured');
        return;
    }
    
    debug.log('⚙️ [RENDERER]', 'Processing document', {
        docType: selectedDocumentType,
        base64Length: capturedDocumentBase64.length
    });
    
    console.log('📄 [DOCUMENT] Base64 data ready for transmission:');
    console.log('📊 [DOCUMENT] Document type:', selectedDocumentType);
    console.log('📊 [DOCUMENT] Base64 size:', capturedDocumentBase64.length, 'characters');
    console.log('📊 [DOCUMENT] Base64 preview:', capturedDocumentBase64.substring(0, 100) + '...');
    
    // Here you would typically send the base64 data to your API
    // For demo, we'll just log it
    alert('Document processed successfully! Check console for base64 data.');
}

function handleRetakeDocument() {
    debug.log('🔄 [RENDERER]', 'Retaking document');
    capturedDocumentBase64 = null;
    
    if (elements.documentPreview) {
        elements.documentPreview.style.display = 'none';
    }
    
    handleStartScan();
}

function handleComplete() {
    debug.log('🎉 [RENDERER]', 'Process completed');
    
    console.log('🎉 [COMPLETE] Final summary:');
    console.log('📝 Reservation number:', elements.reservationNumber?.value);
    console.log('📄 Document type:', selectedDocumentType);
    console.log('🖼️ Document base64 ready:', !!capturedDocumentBase64);
    
    alert('Process completed successfully! All data has been captured.');
    
    // Reset for next use
    resetApplication();
}

function handleMinimize() {
    debug.log('🪟 [RENDERER]', 'Minimizing window');
    ipcRenderer.invoke('hide-main-window');
}

// Utility Functions
function showLoading(text = 'Processing...') {
    debug.log('⏳ [RENDERER]', `Showing loading: ${text}`);
    if (elements.loadingOverlay && elements.loadingText) {
        elements.loadingText.textContent = text;
        elements.loadingOverlay.style.display = 'flex';
    }
}

function hideLoading() {
    debug.log('✅ [RENDERER]', 'Hiding loading');
    if (elements.loadingOverlay) {
        elements.loadingOverlay.style.display = 'none';
    }
}

function updateLoadingText(text) {
    if (elements.loadingText) {
        elements.loadingText.textContent = text;
    }
}

function resetApplication() {
    debug.log('🔄 [RENDERER]', 'Resetting application state');
    
    // Reset global state
    capturedImageData = null;
    capturedDocumentBase64 = null;
    selectedDocumentType = null;
    
    // Reset UI
    if (elements.capturedImage) {
        elements.capturedImage.style.display = 'none';
        elements.capturedImage.src = '';
    }
    
    if (elements.capturePreview) {
        elements.capturePreview.classList.remove('has-image');
        elements.capturePreview.querySelector('.placeholder').style.display = 'block';
    }
    
    if (elements.ocrResults) {
        elements.ocrResults.style.display = 'none';
    }
    
    if (elements.step2) {
        elements.step2.style.display = 'none';
    }
    
    if (elements.documentPreview) {
        elements.documentPreview.style.display = 'none';
    }
    
    // Reset form elements
    elements.documentTypeRadios?.forEach(radio => {
        radio.checked = false;
    });
    
    if (elements.reservationNumber) {
        elements.reservationNumber.value = '';
    }
    
    if (elements.fullOcrText) {
        elements.fullOcrText.value = '';
    }
    
    debug.log('✅ [RENDERER]', 'Application reset complete');
}