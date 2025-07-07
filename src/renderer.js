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

// Handle data extraction when user clicks the button
async function handleProcessDocument() {
    if (!elements.capturedDocument.src) {
        alert('No captured document available');
        return;
    }
    
    try {
        await extractDocumentData(elements.capturedDocument.src);
    } catch (error) {
        debugLog('🚨', 'Extraction error:', error);
        alert('Failed to extract document data: ' + error.message);
    }
}

// Handle process document
// function handleProcessDocument() {
//     debugLog('⚙️', 'Processing document');
//     showLoading('Processing document...');
    
//     setTimeout(() => {
//         debugLog('✅', 'Document processed successfully');
//         hideLoading();
//         alert('Document processed successfully!');
//     }, 2000);
// }

// Extract document data from API
async function extractDocumentData(base64Image) {
    console.log('[extractDocumentData] Starting document data extraction');
    console.log('[extractDocumentData] Input base64Image length:', base64Image.length);
    
    try {
        console.log('[extractDocumentData] Showing loading indicator');
        showLoading('Extracting document data...');
        
        // Remove the data URL prefix if present
        console.log('[extractDocumentData] Processing base64 image data');
        const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');
        console.log('[extractDocumentData] Processed base64Data length:', base64Data.length);
        
        console.log('[extractDocumentData] Preparing API request');
        const requestPayload = {
            base64_image: base64Data,
            ignore_parse: false
        };
        console.log('[extractDocumentData] Request payload:', {
            ...requestPayload,
            base64_image: `${requestPayload.base64_image.substring(0, 30)}...` // Log first 30 chars to avoid huge logs
        });
        
        console.log('[extractDocumentData] Sending request to API endpoint');
        const response = await fetch('http://localhost:8000/extract', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestPayload)
        });
        
        console.log('[extractDocumentData] Received response, status:', response.status);
        if (!response.ok) {
            const errorBody = await response.text().catch(() => 'Unable to read error body');
            console.error('[extractDocumentData] API request failed:', {
                status: response.status,
                statusText: response.statusText,
                errorBody: errorBody
            });
            throw new Error(`API request failed with status ${response.status}: ${response.statusText}`);
        }
        
        console.log('[extractDocumentData] Parsing response JSON');
        const data = await response.json();
        console.log('[extractDocumentData] Extracted data:', {
            ...data,
            // Truncate long values for logging
            ...Object.fromEntries(
                Object.entries(data).map(([key, val]) => 
                    [key, typeof val === 'string' && val.length > 50 ? `${val.substring(0, 50)}...` : val]
            )
        )});
        
        console.log('[extractDocumentData] Displaying extracted data');
        displayExtractedData(data);
        
        console.log('[extractDocumentData] Data extraction completed successfully');
        debugLog('✅', 'Data extraction successful');
    } catch (error) {
        console.error('[extractDocumentData] Error during extraction:', {
            error: error,
            message: error.message,
            stack: error.stack
        });
        debugLog('🚨', 'Extraction error:', error);
        throw error;
    } finally {
        console.log('[extractDocumentData] Hiding loading indicator');
        hideLoading();
    }
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

// Display extracted data in editable fields
function displayExtractedData(data) {
    // Create or show the results container
    const resultsContainer = document.getElementById('extractedDataContainer') || createResultsContainer();
    resultsContainer.style.display = 'block';
    
    // Clear previous results
    resultsContainer.innerHTML = '';
    
    // Add a title
    const title = document.createElement('h3');
    title.textContent = 'Extracted Document Data';
    resultsContainer.appendChild(title);
    
    // Create a table for the data
    const table = document.createElement('table');
    table.className = 'extracted-data-table';
    
    // Add table headers
    const headerRow = document.createElement('tr');
    headerRow.innerHTML = '<th>Field</th><th>Value</th><th>Actions</th>';
    table.appendChild(headerRow);
    
    // Add each field as a row
    for (const [field, value] of Object.entries(data)) {
        const row = document.createElement('tr');
        
        // Field name column
        const fieldCell = document.createElement('td');
        fieldCell.textContent = field;
        row.appendChild(fieldCell);
        
        // Value column (with editable input)
        const valueCell = document.createElement('td');
        const input = document.createElement('input');
        input.type = 'text';
        input.value = value || '';
        input.dataset.field = field;
        valueCell.appendChild(input);
        row.appendChild(valueCell);
        
        // Actions column (edit button)
        const actionsCell = document.createElement('td');
        const editButton = document.createElement('button');
        editButton.textContent = 'Edit';
        editButton.className = 'edit-btn';
        editButton.onclick = () => {
            input.focus();
        };
        actionsCell.appendChild(editButton);
        row.appendChild(actionsCell);
        
        table.appendChild(row);
    }
    
    resultsContainer.appendChild(table);
    
    // Add save button
    const saveButton = document.createElement('button');
    saveButton.textContent = 'Save Changes';
    saveButton.className = 'save-btn';
    saveButton.onclick = () => saveUpdatedData();
    resultsContainer.appendChild(saveButton);
}

// Create the results container if it doesn't exist
function createResultsContainer() {
    const container = document.createElement('div');
    container.id = 'extractedDataContainer';
    container.className = 'extracted-data-container';
    document.body.appendChild(container);
    return container;
}

// Save updated data
function saveUpdatedData() {
    const inputs = document.querySelectorAll('#extractedDataContainer input');
    const updatedData = {};
    
    inputs.forEach(input => {
        updatedData[input.dataset.field] = input.value;
    });
    
    debugLog('💾', 'Updated data:', updatedData);
    alert('Data updated successfully!');
    // Here you would typically send the updated data back to your server
    // Example: saveToServer(updatedData);
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