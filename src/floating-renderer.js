const { ipcRenderer } = require('electron');

let capturedImageData = null;
let currentStep = 1;

const elements = {
    minimizeBtn: document.getElementById('minimizeBtn'),
    manualCaptureBtn: document.getElementById('manualCaptureBtn'),
    processOcrBtn: document.getElementById('processOcrBtn'),
    callApiBtn: document.getElementById('callApiBtn'),
    capturedImage: document.getElementById('capturedImage'),
    capturePreview: document.getElementById('capturePreview'),
    ocrResults: document.getElementById('ocrResults'),
    reservationNumber: document.getElementById('reservationNumber'),
    guestName: document.getElementById('guestName'),
    roomNumber: document.getElementById('roomNumber'),
    fullOcrText: document.getElementById('fullOcrText'),
    stepCards: document.querySelectorAll('.step-card'),
    progressSteps: document.querySelectorAll('.progress-step'),
    scanDocumentBtn: document.getElementById('scanDocumentBtn'),
    helpBtn: document.getElementById('helpBtn'),
    loadingOverlay: document.getElementById('loadingOverlay')
};

function debugLog(...args) {
    console.log('[Renderer]', ...args);
}

// --- Step Management ---
function goToStep(stepNumber) {
    currentStep = stepNumber;
    elements.stepCards.forEach((card, index) => {
        card.style.display = index === stepNumber - 1 ? 'block' : 'none';
    });

    elements.progressSteps.forEach((step, index) => {
        step.classList.toggle('active', index === stepNumber - 1);
    });

    debugLog(`➡️ Moved to step ${stepNumber}`);
}

// --- Minimize Button ---
function handleMinimize() {
    ipcRenderer.send('window-minimize');
}

// --- Screen Capture ---
function handleManualCapture() {
    debugLog('📤', 'Requesting screen capture');
    ipcRenderer.send('start-screen-capture');  // This line triggers the above handler
}

// --- IPC: Received Screen Capture ---
async function handleScreenCaptured(event, dataUrl) {
    capturedImageData = dataUrl;

    const img = elements.capturedImage;
    img.src = dataUrl;
    img.style.display = 'block';

    document.querySelector('#capturePreview .placeholder').style.display = 'none';
    elements.processOcrBtn.disabled = false;
}

// --- OCR Processing ---
async function handleOcrProcess() {
    if (!capturedImageData) return;

    showLoader(true);

    try {
        const ocrResult = await performOcr(capturedImageData);
        elements.ocrResults.style.display = 'block';
        elements.reservationNumber.value = ocrResult.reservationNumber || '';
        elements.guestName.value = ocrResult.guestName || '';
        elements.roomNumber.value = ocrResult.roomNumber || '';
        elements.fullOcrText.value = ocrResult.fullText || '';

        elements.callApiBtn.disabled = false;
    } catch (err) {
        alert('OCR failed: ' + err.message);
    } finally {
        showLoader(false);
    }
}

// --- API Lookup ---
async function handleApiCall() {
    const reservationId = elements.reservationNumber.value.trim();
    if (!reservationId) return alert('Missing reservation number');

    showLoader(true);

    try {
        const result = await lookupReservation(reservationId);
        debugLog('✅ API Lookup result:', result);

        // You might want to populate more fields here

        goToStep(2);
    } catch (err) {
        alert('API lookup failed: ' + err.message);
    } finally {
        showLoader(false);
    }
}

// --- Document Type Change ---
// Handle document type change
function handleDocumentTypeChange(event) {
    selectedDocumentType = event.target.value;
    debugLog('📄', 'Document type selected:', selectedDocumentType);
    
    elements.startScanBtn.disabled = false;
    elements.selectedDocType.textContent = selectedDocumentType.toUpperCase();
}

// --- Show/Hide Loading ---
function showLoader(visible) {
    elements.loadingOverlay.style.display = visible ? 'flex' : 'none';
}

// --- Dummy OCR Processor ---
// async function performOcr(imageData) {
//     // Simulate a delay and return mock OCR
//     await new Promise(resolve => setTimeout(resolve, 1000));

//     return {
//         reservationNumber: 'R123456',
//         guestName: 'John Doe',
//         roomNumber: '205',
//         fullText: 'Reservation R123456\nGuest: John Doe\nRoom: 205'
//     };
// }

async function performOcr(imageData) {
    debugLog('🔍', 'OCR processing initiated');
    
    if (!imageData) {
        debugLog('⚠️', 'No captured image data available');
        alert('Please capture a screen first');
        return;
    }
    
    try {
        debugLog('📤', 'Sending OCR request to main process');
        const result = await ipcRenderer.invoke('process-ocr', imageData);
        
        debugLog('📥', 'OCR result received:', result);
        
        if (result.success) {
            debugLog('✅', 'OCR processing successful');
            debugLog('📝', 'Full text:', result.fullText);
            debugLog('🎯', 'Confidence:', result.confidence);
            
            // Display results
            elements.fullOcrText.value = result.fullText;
            elements.reservationNumber.value = extractConfirmationNumber(result.fullText) || '';
            
            // Show OCR results section
            // elements.ocrResults.style.display = 'block';
            
            // Log extracted field values
            debugLog('📋', 'Extracted fields:');
            debugLog('👤', 'Name:', result.reservationData.name);
            debugLog('👤', 'First Name:', result.reservationData.firstName);
            debugLog('🎫', 'Confirmation Number:', elements.reservationNumber.value);
            debugLog('🏠', 'Room:', result.reservationData.room);

            debugLog('🔍', 'Extracted data:', result.reservationData);

            return {
                reservationNumber: result.reservationData.confirmationNumber || '',
                guestName: result.reservationData.name || '',
                roomNumber: result.reservationData.room || '',
                fullText: result.fullText || ''
            };

            
        } else {
            debugLog('🚨', 'OCR processing failed:', result.error);
            alert('OCR processing failed: ' + result.error);
        }
        
    } catch (error) {
        debugLog('🚨', 'OCR processing error:', error);
        alert('OCR processing error: ' + error.message);
    }
}

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

// --- Dummy API Lookup ---
async function lookupReservation(reservationId) {
    // Simulate a delay and return mock data
    await new Promise(resolve => setTimeout(resolve, 1000));

    return {
        id: reservationId,
        valid: true,
        guest: 'John Doe',
        room: '205'
    };
}

// --- Init ---
function init() {
    setupEventListeners();
    goToStep(1);
}

function setupEventListeners() {
    ipcRenderer.on('screen-captured', handleScreenCaptured);

    elements.minimizeBtn?.addEventListener('click', handleMinimize);
    elements.manualCaptureBtn?.addEventListener('click', handleManualCapture);
    elements.processOcrBtn?.addEventListener('click', handleOcrProcess);
    elements.callApiBtn?.addEventListener('click', handleApiCall);
    elements.scanDocumentBtn?.addEventListener('click', () => goToStep(3));

    document.querySelectorAll('input[name="documentType"]').forEach(radio => {
        radio.addEventListener('change', handleDocumentTypeChange);
    });

    elements.helpBtn?.addEventListener('click', () => {
        alert('Need help? Make sure the reservation screen is visible before capture.');
    });

    debugLog('✅ Event listeners initialized');
}

document.addEventListener('DOMContentLoaded', init);
