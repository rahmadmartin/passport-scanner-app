console.log('🚀 Renderer.js loaded');

const { ipcRenderer } = require('electron');
const axios = require('axios');

// Debug helper function
function debugLog(step, message, data = null) {
    console.log(`🔍 [${step}] ${message}`);
    if (data) {
        console.log(`📊 Data:`, data);
    }
}

// Global variables
let capturedImageData = null;
let cameraStream = null;
let selectedDocumentType = null;
let ocrWorker = null;

// Initialize Tesseract with proper Electron configuration
async function initializeTesseract() {
    try {
        console.log('🔧 Initializing Tesseract...');
        
        // Use CDN version of Tesseract for Electron compatibility
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.0.4/dist/tesseract.min.js';
        script.onload = () => {
            console.log('✅ Tesseract loaded from CDN');
        };
        script.onerror = (error) => {
            console.error('❌ Failed to load Tesseract from CDN:', error);
        };
        document.head.appendChild(script);
        
        return true;
    } catch (error) {
        console.error('❌ Tesseract initialization failed:', error);
        return false;
    }
}

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
    
    // Loading
    loadingOverlay: document.getElementById('loadingOverlay'),
    loadingText: document.getElementById('loadingText'),
    
    // Header
    minimizeBtn: document.getElementById('minimizeBtn')
};

// Utility Functions
function showLoading(message = 'Processing...') {
    debugLog('UI', `Showing loading: ${message}`);
    elements.loadingText.textContent = message;
    elements.loadingOverlay.style.display = 'flex';
}

function hideLoading() {
    debugLog('UI', 'Hiding loading overlay');
    elements.loadingOverlay.style.display = 'none';
}

function showStep2() {
    debugLog('UI', 'Switching to Step 2 - Document Scanning');
    elements.step1.style.display = 'none';
    elements.step2.style.display = 'block';
}

// Screen Capture Functions
async function captureScreen() {
    try {
        debugLog('CAPTURE', 'Initiating screen capture...');
        showLoading('Capturing screen...');
        
        const dataUrl = await ipcRenderer.invoke('capture-screen');
        debugLog('CAPTURE', 'Screen capture successful', {
            dataUrlLength: dataUrl?.length || 0,
            dataUrlPreview: dataUrl?.substring(0, 100) + '...'
        });
        
        if (dataUrl) {
            capturedImageData = dataUrl;
            displayCapturedImage(dataUrl);
            elements.processOcrBtn.disabled = false;
            
            // Update UI
            elements.capturePreview.classList.add('has-image');
            debugLog('CAPTURE', 'Image displayed and OCR button enabled');
        } else {
            throw new Error('No image data received');
        }
        
        hideLoading();
    } catch (error) {
        console.error('🚨 Screen capture failed:', error);
        debugLog('CAPTURE', 'Screen capture failed', error);
        hideLoading();
        alert('Failed to capture screen: ' + error.message);
    }
}

function displayCapturedImage(dataUrl) {
    debugLog('UI', 'Displaying captured image');
    elements.capturedImage.src = dataUrl;
    elements.capturedImage.style.display = 'block';
    elements.capturePreview.querySelector('.placeholder').style.display = 'none';
}

// OCR Functions
async function processOCR() {
    try {
        debugLog('OCR', 'Starting OCR process...');
        
        if (!capturedImageData) {
            throw new Error('No captured image available for OCR');
        }
        
        showLoading('Processing OCR... This may take a moment');
        
        // Check if Tesseract is available
        if (typeof Tesseract === 'undefined') {
            debugLog('OCR', 'Tesseract not loaded, attempting to initialize...');
            await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait for script to load
            
            if (typeof Tesseract === 'undefined') {
                throw new Error('Tesseract OCR library not available');
            }
        }
        
        debugLog('OCR', 'Tesseract available, starting recognition...');
        
        // Create image element for OCR
        const img = new Image();
        img.onload = async () => {
            try {
                debugLog('OCR', 'Image loaded, processing with Tesseract...', {
                    width: img.width,
                    height: img.height
                });
                
                // Use Tesseract with proper configuration for Electron
                const result = await Tesseract.recognize(
                    img,
                    'eng',
                    {
                        logger: (m) => {
                            if (m.status === 'recognizing text') {
                                debugLog('OCR', `Progress: ${Math.round(m.progress * 100)}%`);
                                showLoading(`OCR Progress: ${Math.round(m.progress * 100)}%`);
                            }
                        }
                    }
                );
                
                debugLog('OCR', 'OCR completed successfully', {
                    confidence: result.data.confidence,
                    textLength: result.data.text.length,
                    textPreview: result.data.text.substring(0, 200) + '...'
                });
                
                await handleOCRResult(result.data);
                
            } catch (ocrError) {
                console.error('🚨 OCR processing error:', ocrError);
                debugLog('OCR', 'OCR processing failed', ocrError);
                hideLoading();
                alert('OCR processing failed: ' + ocrError.message);
            }
        };
        
        img.onerror = (error) => {
            console.error('🚨 Image loading error:', error);
            debugLog('OCR', 'Image loading failed', error);
            hideLoading();
            alert('Failed to load image for OCR');
        };
        
        img.src = capturedImageData;
        
    } catch (error) {
        console.error('🚨 OCR initialization error:', error);
        debugLog('OCR', 'OCR initialization failed', error);
        hideLoading();
        alert('OCR initialization failed: ' + error.message);
    }
}

async function handleOCRResult(ocrData) {
    try {
        debugLog('OCR', 'Processing OCR results...', {
            fullText: ocrData.text,
            confidence: ocrData.confidence
        });
        
        const fullText = ocrData.text.trim();
        const reservationNumber = extractReservationNumber(fullText);
        
        debugLog('OCR', 'Extracted reservation number', {
            reservationNumber,
            extractionMethod: 'regex pattern matching'
        });
        
        // Update UI
        elements.fullOcrText.value = fullText;
        elements.reservationNumber.value = reservationNumber || 'Not found';
        elements.ocrResults.style.display = 'block';
        
        hideLoading();
        
        if (reservationNumber) {
            debugLog('OCR', 'Reservation number found, API call button enabled');
        } else {
            debugLog('OCR', 'No reservation number found in OCR text');
            console.warn('⚠️ No reservation number pattern found in:', fullText);
        }
        
    } catch (error) {
        console.error('🚨 OCR result handling error:', error);
        debugLog('OCR', 'OCR result handling failed', error);
        hideLoading();
    }
}

function extractReservationNumber(text) {
    debugLog('EXTRACT', 'Attempting to extract reservation number from text', {
        textLength: text.length,
        textPreview: text.substring(0, 200)
    });
    
    // Multiple patterns to try
    const patterns = [
        /(?:reservation|booking|ref|confirmation)[\s#:]*([A-Z0-9]{4,12})/i,
        /\b([A-Z]{2,3}[0-9]{4,8})\b/g,
        /\b([0-9]{6,10})\b/g,
        /\b([A-Z0-9]{6,12})\b/g
    ];
    
    for (let i = 0; i < patterns.length; i++) {
        const pattern = patterns[i];
        const matches = text.match(pattern);
        
        debugLog('EXTRACT', `Pattern ${i + 1} matches`, matches);
        
        if (matches && matches.length > 0) {
            const extracted = matches[0].replace(/^(reservation|booking|ref|confirmation)[\s#:]*/i, '').trim();
            debugLog('EXTRACT', `Extracted reservation number using pattern ${i + 1}:`, extracted);
            return extracted;
        }
    }
    
    debugLog('EXTRACT', 'No reservation number pattern matched');
    return null;
}

// API Functions
async function callReservationAPI() {
    try {
        debugLog('API', 'Starting API call...');
        
        const reservationNum = elements.reservationNumber.value.trim();
        if (!reservationNum) {
            throw new Error('No reservation number available');
        }
        
        showLoading('Calling reservation API...');
        
        // Replace with your actual API endpoint
        const apiUrl = 'https://your-api-endpoint.com/reservation';
        const requestData = {
            reservationNumber: reservationNum,
            timestamp: new Date().toISOString(),
            source: 'electron-scanner'
        };
        
        debugLog('API', 'Making API request', {
            url: apiUrl,
            data: requestData
        });
        
        try {
            const response = await axios.post(apiUrl, requestData, {
                timeout: 10000,
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            });
            
            debugLog('API', 'API response received', {
                status: response.status,
                data: response.data
            });
            
            hideLoading();
            alert('API call successful! Moving to document scanning...');
            showStep2();
            
        } catch (apiError) {
            if (apiError.code === 'ENOTFOUND' || apiError.message.includes('Network Error')) {
                debugLog('API', 'API endpoint not reachable (expected for demo)', apiError.message);
                hideLoading();
                alert('Demo mode: API endpoint not configured. Proceeding to document scanning...');
                showStep2();
            } else {
                throw apiError;
            }
        }
        
    } catch (error) {
        console.error('🚨 API call failed:', error);
        debugLog('API', 'API call failed', error);
        hideLoading();
        alert('API call failed: ' + error.message);
    }
}

// Camera Functions
async function startCamera() {
    try {
        debugLog('CAMERA', 'Starting camera...');
        showLoading('Starting camera...');
        
        const constraints = {
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: { ideal: 'environment' } // Try to use back camera
            }
        };
        
        debugLog('CAMERA', 'Requesting camera access with constraints', constraints);
        
        cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        debugLog('CAMERA', 'Camera stream obtained', {
            streamActive: cameraStream.active,
            tracks: cameraStream.getTracks().length
        });
        
        elements.cameraVideo.srcObject = cameraStream;
        elements.cameraSection.style.display = 'block';
        
        // Wait for video to be ready
        await new Promise((resolve) => {
            elements.cameraVideo.onloadedmetadata = () => {
                debugLog('CAMERA', 'Video metadata loaded', {
                    videoWidth: elements.cameraVideo.videoWidth,
                    videoHeight: elements.cameraVideo.videoHeight
                });
                resolve();
            };
        });
        
        hideLoading();
        debugLog('CAMERA', 'Camera started successfully');
        
    } catch (error) {
        console.error('🚨 Camera start failed:', error);
        debugLog('CAMERA', 'Camera start failed', error);
        hideLoading();
        alert('Failed to start camera: ' + error.message);
    }
}

function stopCamera() {
    debugLog('CAMERA', 'Stopping camera...');
    
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => {
            debugLog('CAMERA', `Stopping track: ${track.kind}`);
            track.stop();
        });
        cameraStream = null;
    }
    
    elements.cameraVideo.srcObject = null;
    elements.cameraSection.style.display = 'none';
    debugLog('CAMERA', 'Camera stopped');
}

function captureDocument() {
    try {
        debugLog('DOCUMENT', 'Capturing document photo...');
        
        const canvas = elements.cameraCanvas;
        const video = elements.cameraVideo;
        const context = canvas.getContext('2d');
        
        // Set canvas size to match video
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        debugLog('DOCUMENT', 'Canvas setup', {
            canvasWidth: canvas.width,
            canvasHeight: canvas.height,
            videoWidth: video.videoWidth,
            videoHeight: video.videoHeight
        });
        
        // Draw video frame to canvas
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Convert to base64
        const imageDataUrl = canvas.toDataURL('image/jpeg', 0.8);
        const base64Data = imageDataUrl.split(',')[1];
        
        debugLog('DOCUMENT', 'Document captured and converted to base64', {
            imageSize: imageDataUrl.length,
            base64Size: base64Data.length,
            format: 'JPEG'
        });
        
        // Display captured document
        elements.capturedDocument.src = imageDataUrl;
        elements.selectedDocType.textContent = selectedDocumentType.toUpperCase();
        elements.fileSize.textContent = Math.round(imageDataUrl.length / 1024) + ' KB';
        elements.base64Status.textContent = 'Ready ✅';
        
        // Show preview and hide camera
        elements.documentPreview.style.display = 'block';
        stopCamera();
        
        // Store for later use
        window.capturedDocumentBase64 = base64Data;
        
        debugLog('DOCUMENT', 'Document capture completed successfully');
        
    } catch (error) {
        console.error('🚨 Document capture failed:', error);
        debugLog('DOCUMENT', 'Document capture failed', error);
        alert('Failed to capture document: ' + error.message);
    }
}

// Event Listeners
function setupEventListeners() {
    debugLog('INIT', 'Setting up event listeners...');
    
    // Header controls
    elements.minimizeBtn?.addEventListener('click', () => {
        debugLog('UI', 'Minimize button clicked');
        ipcRenderer.invoke('hide-main-window');
    });
    
    // Step 1 - Screen capture and OCR
    elements.manualCaptureBtn?.addEventListener('click', () => {
        debugLog('UI', 'Manual capture button clicked');
        captureScreen();
    });
    
    elements.processOcrBtn?.addEventListener('click', () => {
        debugLog('UI', 'Process OCR button clicked');
        processOCR();
    });
    
    elements.callApiBtn?.addEventListener('click', () => {
        debugLog('UI', 'Call API button clicked');
        callReservationAPI();
    });
    
    // Step 2 - Document type selection
    elements.documentTypeRadios?.forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.checked) {
                selectedDocumentType = e.target.value;
                elements.startScanBtn.disabled = false;
                debugLog('UI', 'Document type selected', selectedDocumentType);
            }
        });
    });
    
    // Step 2 - Camera controls
    elements.startScanBtn?.addEventListener('click', () => {
        debugLog('UI', 'Start scan button clicked');
        if (selectedDocumentType) {
            startCamera();
        }
    });
    
    elements.captureDocBtn?.addEventListener('click', () => {
        debugLog('UI', 'Capture document button clicked');
        captureDocument();
    });
    
    elements.retakeBtn?.addEventListener('click', () => {
        debugLog('UI', 'Retake button clicked');
        startCamera();
    });
    
    elements.stopCameraBtn?.addEventListener('click', () => {
        debugLog('UI', 'Stop camera button clicked');
        stopCamera();
    });
    
    elements.retakeDocBtn?.addEventListener('click', () => {
        debugLog('UI', 'Retake document button clicked');
        elements.documentPreview.style.display = 'none';
        startCamera();
    });
    
    elements.completeBtn?.addEventListener('click', () => {
        debugLog('COMPLETE', 'Process completed');
        alert('Process completed successfully!\n\nReservation processed and document captured.');
        console.log('📋 Final Results Summary:');
        console.log('- Reservation Number:', elements.reservationNumber.value);
        console.log('- Document Type:', selectedDocumentType);
        console.log('- Base64 Data Available:', !!window.capturedDocumentBase64);
        console.log('- Base64 Length:', window.capturedDocumentBase64?.length || 0);
    });
    
    debugLog('INIT', 'Event listeners setup completed');
}

// IPC Listeners
function setupIpcListeners() {
    debugLog('INIT', 'Setting up IPC listeners...');
    
    // Listen for screen capture from floating window
    ipcRenderer.on('screen-captured', (event, dataUrl) => {
        debugLog('IPC', 'Screen capture received from floating window', {
            dataLength: dataUrl?.length || 0
        });
        
        if (dataUrl) {
            capturedImageData = dataUrl;
            displayCapturedImage(dataUrl);
            elements.processOcrBtn.disabled = false;
            elements.capturePreview.classList.add('has-image');
        }
    });
    
    debugLog('INIT', 'IPC listeners setup completed');
}

// Initialize Application
async function initializeApp() {
    console.log('🚀 Initializing Reservation Scanner App...');
    debugLog('INIT', 'Starting application initialization');
    
    try {
        // Initialize Tesseract
        await initializeTesseract();
        
        // Setup event listeners
        setupEventListeners();
        setupIpcListeners();
        
        debugLog('INIT', 'Application initialized successfully');
        console.log('✅ App ready! Waiting for user interaction...');
        
    } catch (error) {
        console.error('🚨 Application initialization failed:', error);
        debugLog('INIT', 'Application initialization failed', error);
    }
}

// Start the application when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}