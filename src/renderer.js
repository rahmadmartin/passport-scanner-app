const { ipcRenderer } = require('electron');
const configManager = require('./config-manager');
const axios = require('axios');
const { logToFile } = require('./logger');

// Debug logging helper
function debugLog(emoji, message, data = null) {
  logToFile(`${emoji} [RENDERER] ${message}`, data || '');
}

// Global variables
let capturedImageData = null;
let cameraStream = null;
let selectedReservation = null;
let selectedDocumentType = 'Passport'; // Default to Passport
let base64Image = null;

let currentStep = 1;
let totalSteps = 6;
let extractedReservationNumber = '';
let isProcessingCapture = false;

// Token management
let tokenData = {
  token: null,
  expiry: null,
};

let companions = []; // Array to store companion data
let isCompanionScan = false; // Flag to track if we're scanning a companion
let currentCompanionIndex = 0; // Track which companion we're processing

const API_CONFIG = configManager.loadConfig();

const elements = {
  // Steps
  steps: document.querySelectorAll('.step-section'),
  progressSteps: document.querySelectorAll('.progress-step'),

  // Step 1 - Capture
  captureBtn: document.getElementById('captureBtn'),
  processBtn: document.getElementById('processBtn'),
  capturePreview: document.getElementById('capturePreview'),
  capturedImage: document.getElementById('capturedImage'),

  // Step 2 - Reservations
  backToCapture: document.getElementById('backToCapture'),
  reservationResults: document.getElementById('reservationResults'),
  proceedToDocType: document.getElementById('proceedToDocType'),

  // Step 3 - Document Type
  backToReservation: document.getElementById('backToReservation'),
  documentTypeCards: document.querySelectorAll('.document-type-card'),
  proceedToScan: document.getElementById('proceedToScan'),

  // Step 4 - Document Scanning
  backToDocType: document.getElementById('backToDocType'),
  startCameraBtn: document.getElementById('startCameraBtn'),
  captureDocBtn: document.getElementById('captureDocBtn'),
  processDocBtn: document.getElementById('processDocBtn'),
  stopCameraBtn: document.getElementById('stopCameraBtn'),
  retakeDocBtn: document.getElementById('retakeDocBtn'),
  cameraContainer: document.getElementById('cameraContainer'),
  cameraVideo: document.getElementById('cameraVideo'),
  documentPreview: document.getElementById('documentPreview'),
  capturedDocument: document.getElementById('capturedDocument'),
  // selectedDocType: document.getElementById('selectedDocType'),

  // Popups
  ocrPopup: document.getElementById('ocrPopup'),
  apiPopup: document.getElementById('apiPopup'),
  reservationNumber: document.getElementById('reservationNumber'),
  finalReservationNumber: document.getElementById('finalReservationNumber'),
  ocrStatus: document.getElementById('ocrStatus'),
  apiStatus: document.getElementById('apiStatus'),
  cancelOcr: document.getElementById('cancelOcr'),
  cancelApi: document.getElementById('cancelApi'),
  editReservationNumber: document.getElementById('editReservationNumber'),
  retryApi: document.getElementById('retryApi'),
  documentDataPopup: document.getElementById('documentDataPopup'),

  // Loading
  loadingOverlay: document.getElementById('loadingOverlay'),
  loadingText: document.getElementById('loadingText'),

  addCompanionBtn: document.getElementById('addCompanionBtn'),
  addShareBtn: document.getElementById('addShareBtn'),
  companionsList: document.getElementById('companionsList'),
  continueToComplete: document.getElementById('continueToComplete'),

  companionPopup: document.getElementById('companionPopup'),
  skipCompanions: document.getElementById('skipCompanions'),
  completeProcess: document.getElementById('completeProcess'),

  // Other
  minimizeBtn: document.getElementById('minimizeBtn'),

  // Initialize buttons
  cancelDocumentData: document.getElementById('cancelDocumentData'),
  saveDocumentData: document.getElementById('saveDocumentData'),
};

// Add this listener at the top of your file:
ipcRenderer.on('manual-lookup-data', (event, { reservationId, lastName }) => {
  // debugLog('🎯 Received lookup data in main window:', {
  //   reservationId,
  //   lastName,
  // });

  if (API_CONFIG?.HotelPms?.toUpperCase() == 'DEMO') {
    extractedReservationNumber = reservationId;

    showApiPopup();

    // Simulate API call
    simulateApiCall();

    setTimeout(() => {
      // closeApiPopup();
      showReservationResults();
    }, 1000);
  } else {
    // 1. Populate fields
    if (elements.reservationNumber) {
      elements.reservationNumber.value = reservationId || '';
    }

    if (elements.lastNameInput) {
      elements.lastNameInput.value = lastName || '';
    }

    // debugLog('📋 Fields populated:', {
    //   reservationNumber: elements.reservationNumber.value,
    //   // lastName: elements.lastNameInput.value
    // });

    // 2. Automatically trigger search if reservation ID exists
    if (reservationId || lastName) {
      extractedReservationNumber = reservationId;
      showApiPopup();

      callReservationApi();
    }
  }
  // Add else-if for lastName search if needed
});

ipcRenderer.on('reset-app-state', () => {
  debugLog('🔄', 'Received reset command from main process');
  try {
    if (typeof resetAppState === 'function') {
      resetAppState();
      debugLog('✅', 'App state reset completed');
    } else {
      debugLog('🚨', 'resetAppState function not found');
    }
  } catch (error) {
    debugLog('🚨', 'Error during app state reset:', error);
  }
});

// Initialize application
function init() {
  debugLog('🚀', 'Initializing Reservation Scanner Application');

  // Check if all required elements exist
  Object.keys(elements).forEach((key) => {
    if (!elements[key]) {
      debugLog('⚠️', `Missing element: ${key}`);
    }
  });

  setupEventListeners();

  if (typeof resetAppState === 'function') {
    resetAppState();
  }

  debugLog('✅', 'Application initialized successfully');
}

// Setup all event listeners
function setupEventListeners() {
  debugLog('🔧', 'Setting up event listeners');

  // IPC Listeners
  ipcRenderer.on('screen-captured', handleScreenCaptured);

  // Step 1 - Capture
  elements.captureBtn.addEventListener('click', captureScreen);
  elements.processBtn.addEventListener('click', processCapture);

  // Step 2 - Reservations
  elements.backToCapture.addEventListener('click', () => showStep(1));
  elements.proceedToDocType.addEventListener('click', () => showStep(3));

  // Step 3 - Document Type
  elements.backToReservation.addEventListener('click', () => showStep(2));
  elements.proceedToScan.addEventListener('click', () => {
    showStep(4);
    startCamera();
  });
  elements.documentTypeCards.forEach((card) => {
    card.addEventListener('click', () => selectDocumentType(card));
  });

  // Step 4 - Document Scanning
  elements.startCameraBtn.addEventListener('click', startCamera);
  elements.backToDocType.addEventListener('click', () => {
    stopCamera();
    elements.documentPreview.style.display = 'none';
    elements.processDocBtn.style.display = 'none';
    elements.retakeDocBtn.style.display = 'none';
    showStep(3);
  });
  elements.captureDocBtn.addEventListener('click', captureDocument);
  elements.processDocBtn.addEventListener('click', processDocument);
  elements.stopCameraBtn.addEventListener('click', stopCamera);
  elements.retakeDocBtn.addEventListener('click', retakeDocument);

  // Popups
  elements.cancelOcr.addEventListener('click', closeOcrPopup);
  elements.cancelApi.addEventListener('click', closeApiPopup);
  elements.editReservationNumber.addEventListener(
    'click',
    editReservationNumber
  );
  elements.retryApi.addEventListener('click', retryApiCall);

  // Other
  elements.minimizeBtn.addEventListener('click', minimizeApp);

  elements.cancelDocumentData.addEventListener('click', closeDocumentDataPopup);

  elements.saveDocumentData.addEventListener('click', saveUpdatedData);

  if (elements.addCompanionBtn) {
    elements.addCompanionBtn.addEventListener('click', startCompanionScan);
  }

  if (elements.addShareBtn) {
    elements.addShareBtn.addEventListener('click', startShareScan);
  }

  if (elements.continueToComplete) {
    elements.continueToComplete.addEventListener(
      'click',
      processAllGuestsAndCompanions
    );
  }

  if (elements.skipCompanions) {
    elements.skipCompanions.addEventListener('click', () => {
      closeCompanionPopup();
      handleComplete();
      // processAllGuestsAndCompanions();
    });
  }

  if (elements.completeProcess) {
    elements.completeProcess.addEventListener('click', () => {
      closeCompanionPopup();
      processAllGuestsAndCompanions();
    });
  }

  debugLog('✅', 'Event listeners setup complete');
}

// Handle screen capture from floating window
async function handleScreenCaptured(event, dataUrl) {
  // Prevent duplicate processing
  if (isProcessingCapture) {
    debugLog('⚠️', 'Already processing capture, ignoring duplicate');
    return;
  }

  isProcessingCapture = true;

  try {
    debugLog('📸', 'Screen capture received from floating window');
    debugLog('📊', 'Data URL length:', dataUrl.length);

    // Display captured image
    capturedImageData = dataUrl;
    const imgElement = elements.capturedImage;

    // Load the image first to get its dimensions
    await new Promise((resolve, reject) => {
      imgElement.onload = resolve;
      imgElement.onerror = reject;
      imgElement.src = dataUrl;
    });

    // Display captured image
    elements.capturedImage.src = capturedImageData;
    elements.capturedImage.style.display = 'block';
    elements.capturePreview.querySelector('.placeholder').style.display =
      'none';
    elements.ocrStatus.className = 'processing-status';

    // Show process button
    elements.processBtn.style.display = 'inline-flex';

    debugLog('✅', 'Screen capture displayed successfully as preview');

    await processCapture();
  } catch (error) {
    debugLog('🚨', 'Error handling screen capture:', error);
    resetAppState();
  } finally {
    // Reset processing flag after delay
    setTimeout(() => {
      isProcessingCapture = false;
    }, 2000);
  }
}

// Handle minimize button
function minimizeApp() {
  debugLog('🔽', 'Minimizing main window');
  ipcRenderer.invoke('hide-main-window');
}

// Step Navigation
function showStep(stepNumber) {
  currentStep = stepNumber;

  // Hide all steps
  elements.steps.forEach((step) => step.classList.remove('active'));

  // Show current step
  const currentStepElement = document.getElementById(`step${stepNumber}`);
  if (currentStepElement) {
    currentStepElement.classList.add('active');
  }

  // Update progress
  updateProgress(stepNumber);
}

function updateProgress(stepNumber) {
  elements.progressSteps.forEach((step, index) => {
    const stepNum = index + 1;
    step.classList.remove('active', 'completed');

    if (stepNum < stepNumber) {
      step.classList.add('completed');
    } else if (stepNum === stepNumber) {
      step.classList.add('active');
    }
  });
}

// Handle manual screen capture
async function captureScreen(event = null) {
  // Prevent multiple clicks if called from event listener
  if (event && event.target) {
    event.target.disabled = true;
  }

  try {
    debugLog('📸', 'Manual capture initiated');
    showLoading('Capturing screen...');

    if (API_CONFIG?.HotelPms?.toUpperCase() == 'DEMO') {
      try {
        // Simulate screen capture
        await simulateDelay(1000);

        // For demo purposes, create a mock screenshot
        const canvas = document.createElement('canvas');
        canvas.width = 800;
        canvas.height = 600;
        const ctx = canvas.getContext('2d');

        // Create a gradient background
        const gradient = ctx.createLinearGradient(0, 0, 800, 600);
        gradient.addColorStop(0, '#f3f4f6');
        gradient.addColorStop(1, '#e5e7eb');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 800, 600);

        // Add some mock reservation text
        ctx.fillStyle = '#1f2937';
        ctx.font = 'bold 24px Arial';
        ctx.fillText('CONFIRMATION', 50, 100);
        ctx.font = '18px Arial';
        ctx.fillText('Confirmation Number: ABC123456', 50, 150);
        ctx.fillText('Guest Name: John Doe', 50, 180);
        ctx.fillText('Check-in: 2024-03-15', 50, 210);
        ctx.fillText('Check-out: 2024-03-18', 50, 240);

        capturedImageData = canvas.toDataURL('image/png');

        // Display captured image
        elements.capturedImage.src = capturedImageData;
        elements.capturedImage.style.display = 'block';
        elements.capturePreview.querySelector('.placeholder').style.display =
          'none';

        // Show process button
        elements.processBtn.style.display = 'inline-flex';

        hideLoading();
      } catch (error) {
        debugLog('🚨', 'Screen capture failed:', error);
        hideLoading();
        alert('Screen capture failed. Please try again.');
      }
    } else {
      try {
        console.log('🎯 Capture function called');

        // First, reset the main window app state
        console.log('🔄 Resetting main window app state...');
        await ipcRenderer.invoke('reset-main-window-state');

        await ipcRenderer.invoke('show-main-window');

        // Hide floating window first and wait longer
        await ipcRenderer.invoke('hide-floating-window');
        console.log('👻 Floating window hidden');

        await ipcRenderer.invoke('hide-main-window');
        console.log('👻 Main window hidden for capture');

        // Wait longer for window to fully hide on Windows
        await new Promise((resolve) => setTimeout(resolve, 750)); // Increased from original
        console.log('⏰ Wait completed');

        // Capture screen
        console.log('📸 Starting screen capture...');
        const dataUrl = await ipcRenderer.invoke('capture-screen');
        console.log('✅ Screen captured, data length:', dataUrl.length);

        debugLog(
          '✅',
          'Manual capture successful, data URL length:',
          dataUrl.length
        );

        // Show windows back
        await ipcRenderer.invoke('show-floating-window');
        await ipcRenderer.invoke('show-main-window');
        console.log('🏠 Windows shown');

        hideLoading();

        // Send to main window with shorter delay
        setTimeout(async () => {
          await ipcRenderer.invoke(
            'send-to-main-window',
            'screen-captured',
            dataUrl
          );
          console.log('📤 Data sent to main window');
        }, 100); // Reduced delay
      } catch (error) {
        debugLog('🚨', 'Manual capture failed:', error);
        console.error('🚨 Screen capture failed:', error);

        // Show floating window even if error
        await ipcRenderer.invoke('show-floating-window');
        hideLoading();
        alert('Screen capture failed: ' + error.message);

        // Reset app state even on error
        try {
          await ipcRenderer.invoke('reset-main-window-state');
        } catch (resetError) {
          console.error('🚨 Failed to reset app state:', resetError);
        }
      }
    }
  } finally {
    // Re-enable button after a delay if called from event listener
    if (event && event.target) {
      setTimeout(() => {
        event.target.disabled = false;
      }, 1000);
    }
  }
}

async function processCapture() {
  debugLog('🔍', 'OCR processing initiated');

  // Enhanced null safety checks for capturedImageData
  if (!capturedImageData) {
    debugLog('⚠️', 'No captured image data available');
    alert('Please capture a screen first');
    return;
  }

  // Additional validation for image data format
  if (
    typeof capturedImageData !== 'string' &&
    !Buffer.isBuffer(capturedImageData) &&
    !(capturedImageData instanceof ArrayBuffer)
  ) {
    debugLog('⚠️', 'Invalid image data format:', typeof capturedImageData);
    showUserFriendlyError(
      'Invalid image format. Please try capturing the screen again.'
    );
    return;
  }

  // Check for empty string or zero-length data
  if (typeof capturedImageData === 'string' && capturedImageData.length === 0) {
    debugLog('⚠️', 'Empty image data string');
    showUserFriendlyError(
      'No image data found. Please capture the screen again.'
    );
    return;
  }

  // Check for string length limits (JavaScript string max length is about 268MB)
  if (
    typeof capturedImageData === 'string' &&
    capturedImageData.length > 268435456
  ) {
    debugLog('⚠️', 'Image data too large:', capturedImageData.length);
    showUserFriendlyError(
      'The captured image is too large to process. Please try capturing a smaller area of the screen.'
    );
    return;
  }

  // Show OCR popup first
  showOcrPopup();

  if (API_CONFIG?.HotelPms?.toUpperCase() == 'DEMO') {
    try {
      // Simulate OCR processing
      await simulateOcr();

      closeOcrPopup();

      // Show API popup
      showApiPopup();

      // Simulate API call
      await simulateApiCall();

      setTimeout(() => {
        // closeApiPopup();
        showReservationResults();
      }, 1000);
    } catch (error) {
      debugLog('🚨', 'Demo mode error:', error);
      closeOcrPopup();
      closeApiPopup();
      showUserFriendlyError(
        'Processing failed in demo mode. Please try again.'
      );
    }
  } else {
    try {
      debugLog('📤', 'Sending OCR request to main process');
      debugLog('📊', 'Image data type:', typeof capturedImageData);
      debugLog(
        '📏',
        'Image data length:',
        capturedImageData?.length || 'undefined'
      );

      // Additional safety check before IPC call
      if (
        !capturedImageData ||
        (typeof capturedImageData === 'string' &&
          capturedImageData.trim() === '')
      ) {
        throw new Error('Image data is null or empty');
      }

      const result = await ipcRenderer.invoke('process-ocr', capturedImageData);

      debugLog('📥', 'OCR result received:', result);

      // Null safety check for result
      if (!result) {
        throw new Error('No result received from OCR processing');
      }

      if (result.success) {
        debugLog('✅', 'OCR processing successful');
        debugLog('📝', 'Full text:', result.fullText || 'No text extracted');
        debugLog(
          '🎯',
          'Confidence:',
          result.confidence || 'No confidence data'
        );

        // Extract confirmation number with null safety
        const confirmationNumber = result.fullText
          ? extractConfirmationNumber(result.fullText) || ''
          : '';

        // Null safety checks for DOM elements
        if (elements?.reservationNumber) {
          elements.reservationNumber.value = confirmationNumber;
        }

        const finalReservationElement = document.getElementById(
          'finalReservationNumber'
        );
        if (finalReservationElement) {
          finalReservationElement.value = confirmationNumber;
        }

        // Update OCR status to success with null safety
        if (elements?.ocrStatus) {
          elements.ocrStatus.innerHTML =
            '<span>Confirmation number extracted successfully!</span>';
          elements.ocrStatus.className = 'processing-status success';
        }

        if (elements?.editReservationNumber) {
          elements.editReservationNumber.disabled = false;
        }

        // debugLog(
        //   '🔍',
        //   'Extracted screenshot data:',
        //   JSON.stringify(result, null, 2)
        // );

        if (confirmationNumber === '') {
          debugLog('⚠️', 'No confirmation number found in the screen');

          // Update OCR status to show warning with null safety
          if (elements?.ocrStatus) {
            elements.ocrStatus.innerHTML =
              '<span>⚠️ No confirmation number found. Please enter manually.</span>';
            elements.ocrStatus.className = 'processing-status error';
          }

          if (elements?.reservationNumber) {
            elements.reservationNumber.readOnly = false;
            elements.reservationNumber.focus();
            elements.reservationNumber.placeholder =
              'Enter confirmation number manually';
          }
        } else {
          // Auto-proceed to API call after a short delay
          setTimeout(() => {
            if (typeof editReservationNumber === 'function') {
              editReservationNumber(); // This will close OCR popup and proceed
            } else {
              debugLog('⚠️', 'editReservationNumber function not available');
            }
          }, 1500);
        }
      } else {
        const errorMessage = result.error || 'Unknown OCR processing error';
        debugLog('🚨', 'Read image processing failed:', errorMessage);

        // Handle specific error types with user-friendly messages
        handleOcrError(errorMessage);
      }
    } catch (error) {
      const errorMessage = error?.message || 'Unknown error occurred';
      debugLog('🚨', 'Read image processing error:', errorMessage);

      // Handle specific error types with user-friendly messages
      handleProcessingError(errorMessage);
    }
  }
}

// Helper function to handle OCR-specific errors
function handleOcrError(errorMessage) {
  let userMessage = 'OCR processing failed. Please try again.';

  if (errorMessage.toLowerCase().includes('invalid string length')) {
    userMessage =
      'The captured image is too large to process. Please try capturing a smaller area of the screen.';
  } else if (errorMessage.toLowerCase().includes('timeout')) {
    userMessage =
      'Processing is taking too long. Please try capturing the screen again.';
  } else if (errorMessage.toLowerCase().includes('memory')) {
    userMessage =
      'Not enough memory to process the image. Please try capturing a smaller area.';
  }

  // Update OCR status to show error with null safety
  if (elements?.ocrStatus) {
    elements.ocrStatus.innerHTML = '<span>' + userMessage + '</span>';
    elements.ocrStatus.className = 'processing-status error';
  }

  if (elements?.editReservationNumber) {
    elements.editReservationNumber.disabled = false;
  }

  if (elements?.reservationNumber) {
    elements.reservationNumber.readOnly = false;
    elements.reservationNumber.focus();
    elements.reservationNumber.placeholder =
      'Enter confirmation number manually';
  }
}

// Helper function to handle general processing errors
function handleProcessingError(errorMessage) {
  let userMessage =
    'Unable to process the image. Please enter the confirmation number manually.';

  if (errorMessage.toLowerCase().includes('invalid string length')) {
    userMessage =
      'The captured image is too large to process. Please try capturing a smaller area of the screen or enter the confirmation number manually.';
  } else if (errorMessage.toLowerCase().includes('network')) {
    userMessage =
      'Network connection issue. Please check your connection and try again.';
  } else if (errorMessage.toLowerCase().includes('timeout')) {
    userMessage =
      'Processing timeout. Please try again or enter the confirmation number manually.';
  } else if (
    errorMessage.toLowerCase().includes('memory') ||
    errorMessage.toLowerCase().includes('out of memory')
  ) {
    userMessage =
      'Not enough memory to process the image. Please try capturing a smaller area or enter the confirmation number manually.';
  }

  // Update OCR status to show error with null safety
  if (elements?.ocrStatus) {
    elements.ocrStatus.innerHTML = '<span>' + userMessage + '</span>';
    elements.ocrStatus.className = 'processing-status error';
  }

  if (elements?.editReservationNumber) {
    elements.editReservationNumber.disabled = false;
  }

  if (elements?.reservationNumber) {
    elements.reservationNumber.readOnly = false;
    elements.reservationNumber.focus();
    elements.reservationNumber.placeholder =
      'Enter confirmation number manually';
  }
}

// Helper function to show user-friendly error messages (can be customized)
function showUserFriendlyError(message) {
  // You can customize this to use your preferred notification method
  alert(message);

  // Or update the OCR status element if available
  if (elements?.ocrStatus) {
    elements.ocrStatus.innerHTML = '<span>' + message + '</span>';
    elements.ocrStatus.className = 'processing-status error';
  }

  // Enable manual input as fallback
  if (elements?.reservationNumber) {
    elements.reservationNumber.readOnly = false;
    elements.reservationNumber.focus();
    elements.reservationNumber.placeholder =
      'Enter confirmation number manually';
  }

  if (elements?.editReservationNumber) {
    elements.editReservationNumber.disabled = false;
  }
}

async function simulateOcr() {
  await simulateDelay(2000);

  // Extract mock reservation number
  extractedReservationNumber = 'ABC123456';
  elements.reservationNumber.value = extractedReservationNumber;
  elements.editReservationNumber.disabled = false;

  elements.ocrStatus.innerHTML =
    '<div class="spinner-small"></div><span>Confirmation number extracted successfully!</span>';
  elements.ocrStatus.className = 'processing-status success';

  await simulateDelay(500);
}

// Function to extract confirmation number from the OCR text
function extractConfirmationNumber(text) {
  debugLog('🔍', 'Extracting confirmation number from OCR text', text);
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

function selectDocumentType(card) {
  // Remove previous selection
  elements.documentTypeCards.forEach((c) => c.classList.remove('selected'));

  // Select current card
  card.classList.add('selected');
  selectedDocumentType = card.dataset.type;
  elements.proceedToScan.disabled = false;

  // If companion scan, update the document type accordingly
  if (isCompanionScan) {
    selectedDocumentType = 'Companion ' + selectedDocumentType;
  }
}

async function getToken() {
  debugLog('🔑', 'Checking token status...');

  // Check if we have a valid token
  if (
    tokenData.token &&
    tokenData.expiry &&
    new Date() < new Date(tokenData.expiry.getTime() - 60000)
  ) {
    debugLog('✅', 'Using cached token');
    return tokenData;
  }

  debugLog('🔄', 'Requesting new token...');

  const isOCIM = API_CONFIG.Ohip_authMethod?.toUpperCase() === 'OCIM';

  try {
    // Prepare form data for URL-encoded request
    const params = new URLSearchParams();
    params.append('grant_type', isOCIM ? 'client_credentials' : 'password');

    if (isOCIM) {
      params.append('operaEntId', API_CONFIG.Ohip_enterpriseId);
      params.append('scope', 'urn:opc:hgbu:ws:__myscopes__');
    } else {
      params.append('username', API_CONFIG.Ohip_user);
      params.append('password', API_CONFIG.Ohip_password);
    }

    // Prepare headers
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'x-app-key': API_CONFIG.Ohip_appKey,
    };

    if (isOCIM) {
      headers['enterpriseId'] = API_CONFIG.Ohip_enterpriseId;
      // Generate Basic auth header from username and password
      const basicAuthString = Buffer.from(
        `${API_CONFIG.Ohip_user}:${API_CONFIG.Ohip_password}`
      ).toString('base64');
      headers['Authorization'] = `Basic ${basicAuthString}`;
    }

    // debugLog('🔍 Token request headers:', JSON.stringify(headers, null, 2));
    // debugLog('🔍 Token request params:', params.toString());

    const response = await axios.post(
      `${API_CONFIG.Ohip_baseURL}/oauth/v1/tokens`,
      params,
      { headers }
    );

    if (response.data && response.data.access_token) {
      tokenData.token = response.data;
      tokenData.expiry = new Date(Date.now() + response.data.expires_in * 1000);

      // Log token details for debugging (similar to Java implementation)
      try {
        const tokenParts = response.data.access_token.split('.');
        if (tokenParts.length === 3) {
          const header = JSON.parse(
            atob(tokenParts[0].replace(/-/g, '+').replace(/_/g, '/'))
          );
          const payload = JSON.parse(
            atob(tokenParts[1].replace(/-/g, '+').replace(/_/g, '/'))
          );
          debugLog('🔍', 'Token JWT Header:', header);
          debugLog('🔍', 'Token JWT Payload:', payload);
        }
      } catch (e) {
        debugLog('⚠️', 'Failed to decode token for logging:', e.message);
      }

      debugLog('✅', 'Token obtained successfully');
      return tokenData;
    } else {
      throw new Error('Invalid token response');
    }
  } catch (error) {
    debugLog(
      '🚨',
      'Token request failed:',
      error.response?.data || error.message
    );
    throw new Error(
      `Authentication failed: ${error.response?.data?.error || error.message}`
    );
  }
}

async function getAuthorization() {
  // DEMO short-circuit
  if (API_CONFIG?.HotelPms?.toUpperCase() === 'DEMO') {
    const mockToken = `Bearer DEMO-MOCK-TOKEN-12345`;
    debugLog('🧪', 'DEMO MODE AUTHORIZATION:', mockToken);
    return mockToken;
  }

  // Real flow
  const token = await getToken();
  const auth = `${token.token.token_type} ${token.token.access_token}`;
  debugLog('🔑', 'Authorization token acquired');
  return auth;
}

// Name similarity function (simplified version)
function calculateNameSimilarity(name1, name2) {
  if (!name1 || !name2) return 0;

  const str1 = name1.toUpperCase();
  const str2 = name2.toUpperCase();

  if (str1 === str2) return 1;

  // Simple Levenshtein distance implementation
  const matrix = [];
  const len1 = str1.length;
  const len2 = str2.length;

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  const maxLen = Math.max(len1, len2);
  return maxLen === 0 ? 1 : (maxLen - matrix[len1][len2]) / maxLen;
}

async function doFindReservation(
  reservationId,
  lastName,
  room,
  disposition,
  arrival,
  departure,
  arrivalEnd,
  departureEnd,
  full
) {
  try {
    // First attempt: Search with reservationId as both confirmationId and externalReferenceId
    let searchParams = {
      reservationIds: null,
      confirmationNumberList: reservationId,
      externalReferenceIds: reservationId,
      customReference: null,
      lastName: lastName,
      room: room,
      arrivalStartDate: arrival,
      departureStartDate: departure,
      arrivalEndDate: arrivalEnd,
      departureEndDate: departureEnd,
      disposition: disposition,
    };

    let searchResponse = await findReservations(searchParams);

    // If no results and we have a reservationId, try second search with customReference
    if (searchResponse.totalResults === 0) {
      // debugLog('🔍', `First search empty, JSONStringify(${JSON.stringify(searchResponse)}) trying second search with customReference`);

      searchParams = {
        reservationIds: null,
        confirmationNumberList: null,
        externalReferenceIds: null,
        customReference: reservationId,
        lastName: lastName,
        room: room,
        arrivalStartDate: arrival,
        departureStartDate: departure,
        arrivalEndDate: arrivalEnd,
        departureEndDate: departureEnd,
        disposition: disposition,
      };

      searchResponse = await findReservations(searchParams);
    }

    // if (searchResponse.totalResults === 0) {
    //     // debugLog('🔍', `First search empty, JSONStringify(${JSON.stringify(searchResponse)}) trying second search with customReference`);

    //     searchParams = {
    //         reservationIds: null,
    //         confirmationNumberList: null,
    //         externalReferenceIds: null,
    //         customReference: null,
    //         lastName: lastName,
    //         room: room,
    //         arrivalStartDate: arrival,
    //         departureStartDate: departure,
    //         arrivalEndDate: arrivalEnd,
    //         departureEndDate: departureEnd,
    //         disposition: disposition
    //     };

    //     searchResponse = await findReservations(searchParams);
    // }

    // debugLog(
    //   '🔍 Second search found reservations:',
    //   JSON.stringify(searchResponse.totalResults)
    // );

    // Extract the actual results array from the response
    const results = searchResponse.reservations || [];

    // // Apply additional filtering logic similar to Java code
    // const filteredResults = results.filter(reservation => {
    //     // Apply lastName filtering if lastName is provided
    //     if (lastName && lastName.trim() !== '' && reservation.reservationGuests && reservation.reservationGuests.length > 0) {
    //         const guestLastName = reservation.reservationGuests[0].person?.name?.surname?.toUpperCase() || '';
    //         const filterLastName = lastName.toUpperCase();

    //         debugLog('🔍', `Filtering reservation ${reservation.reservationIdList?.[0]?.id} by name similarity`);

    //         // Simple name matching (you might want to implement similarity function)
    //         const nameMatches = guestLastName.includes(filterLastName) || filterLastName.includes(guestLastName);

    //         if (!nameMatches) {
    //             // Check companions if available (similar to Java logic)
    //             // This would depend on your data structure for companions
    //             return false;
    //         }
    //     }

    //     // Apply disposition filtering if provided
    //     if (disposition && disposition.length > 0) {
    //         const reservationStatus = reservation.reservationStatus;
    //         return disposition.includes(reservationStatus);
    //     }

    //     return true;
    // });

    return results;
  } catch (error) {
    debugLog('🚨', 'doFindReservation failed:', error.message);
    throw error;
  }
}

async function findReservations(searchParams) {
  debugLog(
    '🔍',
    'Finding reservations with params:',
    JSON.stringify(searchParams, null, 2)
  );

  try {
    const authorization = await getAuthorization();

    // Prepare the request body based on search parameters
    const requestBody = {
      limit: 100,
      offset: 0,
    };

    // Add search parameters to request body (only if they have values)
    if (searchParams.reservationIds && searchParams.reservationIds.length > 0) {
      requestBody.reservationIds = searchParams.reservationIds;
    }
    if (
      searchParams.confirmationNumberList &&
      searchParams.confirmationNumberList.length > 0
    ) {
      requestBody.confirmationNumberList = searchParams.confirmationNumberList;
    }
    if (
      searchParams.externalReferenceIds &&
      searchParams.externalReferenceIds.length > 0
    ) {
      requestBody.externalReferenceIds = searchParams.externalReferenceIds;
    }
    if (
      searchParams.customReference &&
      searchParams.customReference.trim() !== ''
    ) {
      requestBody.customReference = searchParams.customReference;
    }
    if (searchParams.lastName && searchParams.lastName.trim() !== '') {
      requestBody.surname = searchParams.lastName;
    }
    if (searchParams.room && searchParams.room.trim() !== '') {
      requestBody.room = searchParams.room;
    }
    if (searchParams.arrivalStartDate) {
      requestBody.arrivalStartDate = searchParams.arrivalStartDate;
    }
    if (searchParams.departureStartDate) {
      requestBody.departureStartDate = searchParams.departureStartDate;
    }
    if (searchParams.arrivalEndDate) {
      requestBody.arrivalEndDate = searchParams.arrivalEndDate;
    }
    if (searchParams.departureEndDate) {
      requestBody.departureEndDate = searchParams.departureEndDate;
    }
    if (searchParams.disposition && searchParams.disposition.length > 0) {
      // Convert disposition to statuses if needed
      requestBody.statuses = searchParams.disposition;
    }

    // Prepare headers matching the curl command
    const headers = {
      'Content-Type': 'application/json',
      'x-hotelid': API_CONFIG.Ohip_hotelId,
      'x-app-key': API_CONFIG.Ohip_appKey,
      Authorization: authorization,
    };

    const baseUrl = `${API_CONFIG.Ohip_baseURL}/rsv/v1/hotels/${API_CONFIG.Ohip_hotelId}/reservations`;

    // Create URLSearchParams to build the query string
    const urlParams = new URLSearchParams();
    Object.entries(requestBody).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        if (Array.isArray(value)) {
          value.forEach((item) => urlParams.append(key, item));
        } else {
          urlParams.append(key, value);
        }
      }
    });

    const completeUrl = `${baseUrl}?${urlParams.toString()}`;

    // logToFile('🔍 Reservation search headers:', JSON.stringify(headers, null, 2));
    // logToFile('🔍 Reservation search params:', JSON.stringify(requestBody, null, 2));

    const response = await axios.get(baseUrl, { headers, params: requestBody });

    /* The above code is making an asynchronous GET request using the axios library in JavaScript.
        It is sending a request to the `baseUrl` with specified headers and request parameters
        contained in the `requestBody`. The response from the request is stored in the `response`
        variable. */
    // logToFile('🔍 Reservation search response:', JSON.stringify(response.data, null, 2));
    // logToFile('🔍 Complete URL:', completeUrl);

    debugLog(
      '🔍',
      'Reservation search response:',
      JSON.stringify(response.data.reservations, null, 2)
    );

    if (response.data.reservations.totalResults > 0) {
      return response.data;
    } else {
      debugLog('⚠️', 'No reservations found in response');
      return {
        reservations: [],
        totalResults: 0,
        totalPages: 0,
        hasMore: false,
      };
    }
  } catch (error) {
    debugLog(
      '🚨',
      'Reservation search failed:',
      error.response?.data || error.message
    );
    if (error.response?.status === 401) {
      // Token might be expired, clear it and retry once
      tokenData.token = null;
      tokenData.expiry = null;
      throw new Error('Authentication failed. Please try again.');
    }
    throw new Error(
      `Reservation search failed: ${
        error.response?.data?.message || error.message
      }`
    );
  }
}

// Helper function to implement name similarity (simplified version)
function nameSimilarity(name1, name2) {
  if (!name1 || !name2) return 0;

  const str1 = name1.toLowerCase();
  const str2 = name2.toLowerCase();

  // Simple contains check - you might want to implement Levenshtein distance
  if (str1.includes(str2) || str2.includes(str1)) {
    return 1.0;
  }

  // Simple character overlap ratio
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  let matches = 0;
  for (let char of shorter) {
    if (longer.includes(char)) {
      matches++;
    }
  }

  return matches / longer.length;
}

// Main API call handler
async function callReservationApi() {
  debugLog('📡', 'API call initiated');

  // Get values from both fields
  const reservationNum =
    elements.finalReservationNumber?.value.trim() ||
    elements.reservationNumber?.value.trim() ||
    '';
  const lastName = elements.lastNameInput?.value.trim();

  if (!reservationNum && !lastName) {
    debugLog('⚠️', 'No search criteria provided');

    // Update API status to show error
    elements.apiStatus.innerHTML =
      '<span>Please provide either confirmation number or last name</span>';
    elements.apiStatus.className = 'processing-status error';
    elements.retryApi.style.display = 'inline-flex';
    return;
  }

  try {
    debugLog(
      '🔄',
      'Making request with:',
      reservationNum ? `Reservation: ${reservationNum}` : `Name: ${lastName}`
    );

    // Prepare search parameters
    const searchParams = {};

    if (reservationNum) {
      searchParams.reservationIds = [reservationNum];
      searchParams.confirmationIds = [reservationNum];
      searchParams.externalReferenceIds = [reservationNum];
      searchParams.customReference = reservationNum;
    }

    if (lastName) {
      searchParams.lastName = lastName;
    }

    // Perform the search
    const response = await doFindReservation(
      reservationNum,
      lastName,
      null,
      [],
      null,
      null,
      null,
      null,
      false
    );

    debugLog(
      '📥',
      'Reservations found:',
      JSON.stringify(response.totalResults)
    );

    if (response.totalResults > 0) {
      // debugLog('✅', 'Request successful');

      // Update API status to success
      elements.apiStatus.innerHTML = '<span>Reservations found!</span>';
      elements.apiStatus.className = 'processing-status success';

      // Store the results for use in step 2
      window.searchResults = response.reservationInfo;

      // Wait a moment then close popup and show results
      setTimeout(() => {
        closeApiPopup();
        showReservationResults(response.reservationInfo);
      }, 1000);
    } else {
      throw new Error('No reservations found matching your criteria');
    }
  } catch (error) {
    debugLog('🚨', 'Request error:', error);

    // Update API status to show error
    elements.apiStatus.innerHTML = '<span>Error: ' + error.message + '</span>';
    elements.apiStatus.className = 'processing-status error';
    elements.retryApi.style.display = 'inline-flex';
  }
}

function retryApiCall() {
  elements.apiStatus.innerHTML =
    '<div class="spinner-small"></div><span>Retrying API call...</span>';
  elements.apiStatus.className = 'processing-status';
  elements.retryApi.style.display = 'none';

  callReservationApi();
}

// Enhanced reservation results display function
function displayReservationResults(reservationInfo) {
  elements.reservationResults.innerHTML = '';

  reservationInfo.forEach((reservation, index) => {
    const reservationElement = createReservationElement(reservation, index);
    elements.reservationResults.appendChild(reservationElement);
  });

  debugLog('📋', `Displayed ${reservationInfo.length} reservations`);
}

// Update the showReservationResults function to work with your data structure
function showReservationResults(reservationData = null) {
  let reservations;

  if (API_CONFIG?.HotelPms?.toUpperCase() == 'DEMO') {
    const mockReservations = [
      {
        reservationIdList: [
          { id: '163216', type: 'Reservation' },
          { id: '137061322', type: 'Confirmation' },
        ],
        sourceOfSale: { sourceType: 'PMS', sourceCode: 'DPHSS' },
        roomStay: {
          registrationNumber: { id: '', type: 'Reservation' },
          currentRoomInfo: { roomType: 'MTKS', roomOwnershipType: 'Regular' },
          roomRates: [
            {
              total: { amountBeforeTax: 2500000 },
              rates: {
                rate: [
                  {
                    base: {
                      amountBeforeTax: 2500000,
                      currencyCode: 'IDR',
                      baseAmount: 2500000,
                    },
                    shareDistributionInstruction: 'Full',
                    total: { amountBeforeTax: 2500000 },
                    start: '2025-08-05',
                    end: '2025-08-05',
                  },
                ],
              },
              guestCounts: { adults: 1, children: 0 },
              taxFreeGuestCounts: { adults: 0, children: 0 },
              roomType: 'MTKS',
              ratePlanCode: 'BFR',
              start: '2025-08-05',
              end: '2025-08-05',
              suppressRate: false,
              marketCode: 'DIR',
              marketCodeDescription: 'Discounted Rate',
              sourceCode: 'WEB',
              sourceCodeDescription: 'Brand Website',
              numberOfUnits: 1,
              pseudoRoom: false,
              roomTypeCharged: 'MTKS',
              houseUseOnly: false,
              complimentary: false,
              fixedRate: false,
              discountAllowed: true,
              bogoDiscount: false,
              allowAutoCheckIn: false,
            },
          ],
          guestCounts: { adults: 1, children: 0 },
          arrivalDate: '2025-08-05',
          departureDate: '2025-08-06',
          expectedTimes: {
            reservationExpectedArrivalTime: '2025-08-05',
            reservationExpectedDepartureTime: '2025-08-06',
          },
          guarantee: {
            guaranteeCode: 'COMP',
            shortDescription: 'Company Guaranteed',
          },
          total: { amountBeforeTax: 2500000 },
          totalPoints: { points: 0 },
          roomNumberLocked: false,
          printRate: true,
        },
        reservationGuests: [
          {
            profileInfo: {
              profileIdList: [{ id: '1207676', type: 'Profile' }],
              profile: {
                customer: {
                  personName: [
                    {
                      givenName: 'Blake',
                      surname: 'Shelton',
                      nameTitle: 'Mr',
                      nameType: 'Primary',
                    },
                  ],
                  language: 'E',
                },
                addresses: {
                  addressInfo: [
                    {
                      address: {
                        isValidated: false,
                        country: { displayCountryFlag: false },
                        language: 'E',
                        type: 'HOME',
                        primaryInd: true,
                      },
                      id: '1397370',
                      type: 'Address',
                    },
                  ],
                },
                telephones: {
                  telephoneInfo: [
                    {
                      telephone: {
                        phoneTechType: 'PHONE',
                        phoneUseType: 'MOBILE',
                        phoneNumber: '081770452444',
                        primaryInd: true,
                      },
                      id: '1714327',
                      type: 'Communication',
                    },
                  ],
                },
                emails: {
                  emailInfo: [
                    {
                      email: {
                        emailAddress: 'abeachalways@yahoo.com',
                        type: 'EMAIL',
                        primaryInd: true,
                      },
                      id: '1714329',
                      type: 'Email',
                    },
                  ],
                },
                profileType: 'Guest',
              },
            },
            arrivalTransport: { transportationReqd: false },
            departureTransport: { transportationReqd: false },
            primary: true,
          },
        ],
        reservationPackages: [
          {
            packageHeaderType: {
              primaryDetails: {
                description: 'Breakfast inclusion for Complimentary',
              },
              transactionDetails: {
                allowance: false,
                currency: 'IDR',
                postingType: 'D',
                calculationRule: 'A',
              },
              postingAttributes: {
                addToRate: false,
                printSeparateLine: false,
                postNextDay: false,
                forecastNextDay: false,
              },
            },
            scheduleList: [
              {
                consumptionDate: '2025-08-05',
                unitPrice: 0,
                totalQuantity: 1,
                computedResvPrice: 0,
                unitAllowance: 0,
                reservationDate: '2025-08-05',
                originalUnitPrice: 0,
                originalUnitAllowance: 0,
              },
            ],
            consumptionDetails: {
              defaultQuantity: 1,
              totalQuantity: 1,
              allowanceConsumed: false,
            },
            packageCode: 'BFCOMP',
            internalId: 106490,
            ratePlanCode: 'BFR',
            source: 'RateDetail',
          },
        ],
        cashiering: {
          billingPrivileges: {
            postingRestriction: true,
            postStayCharging: false,
            videoCheckout: false,
          },
          compAccounting: { compPostings: 'N' },
          reverseCheckInAllowed: false,
          reverseAdvanceCheckInAllowed: false,
          transactionsPosted: false,
        },
        extSystemSync: false,
        hotelId: 'DPHSS',
        roomStayReservation: true,
        reservationStatus: 'Reserved',
        computedReservationStatus: 'DueIn',
        walkIn: false,
        printRate: true,
        createDateTime: '2025-08-06 07:44:14.0',
        creatorId: 'JTAN@DPSPH',
        lastModifyDateTime: '2025-08-06 07:44:14.0',
        lastModifierId: 'JTAN@DPSPH',
        createBusinessDate: '2025-08-05',
        preRegistered: false,
        upgradeEligible: false,
        allowAutoCheckin: false,
        hasOpenFolio: false,
        allowMobileCheckout: false,
        allowMobileViewFolio: false,
        allowPreRegistration: false,
        optedForCommunication: false,
        backToBack: false,
        payeeSharer: false,
      },
      {
        reservationIdList: [
          { id: '200001', type: 'Reservation' },
          { id: '200002', type: 'Confirmation' },
        ],
        sourceOfSale: { sourceType: 'OTA', sourceCode: 'BOOKONLINE' },
        roomStay: {
          registrationNumber: { id: '', type: 'Reservation' },
          currentRoomInfo: { roomType: 'DELUXE', roomOwnershipType: 'Regular' },
          roomRates: [
            {
              total: { amountBeforeTax: 4500000 },
              rates: {
                rate: [
                  {
                    base: {
                      amountBeforeTax: 4500000,
                      currencyCode: 'IDR',
                      baseAmount: 4500000,
                    },
                    shareDistributionInstruction: 'Full',
                    total: { amountBeforeTax: 4500000 },
                    start: '2025-09-10',
                    end: '2025-09-12',
                  },
                ],
              },
              guestCounts: { adults: 2, children: 1 },
              taxFreeGuestCounts: { adults: 0, children: 0 },
              roomType: 'DELUXE',
              ratePlanCode: 'BFR',
              start: '2025-09-10',
              end: '2025-09-12',
              suppressRate: false,
              marketCode: 'DIR',
              marketCodeDescription: 'Direct Rate',
              sourceCode: 'WEB',
              sourceCodeDescription: 'Website Booking',
              numberOfUnits: 1,
              pseudoRoom: false,
              roomTypeCharged: 'DELUXE',
              houseUseOnly: false,
              complimentary: false,
              fixedRate: false,
              discountAllowed: true,
              bogoDiscount: false,
              allowAutoCheckIn: false,
            },
          ],
          guestCounts: { adults: 2, children: 1 },
          arrivalDate: '2025-09-10',
          departureDate: '2025-09-12',
          expectedTimes: {
            reservationExpectedArrivalTime: '2025-09-10',
            reservationExpectedDepartureTime: '2025-09-12',
          },
          guarantee: {
            guaranteeCode: 'CC',
            shortDescription: 'Credit Card Guaranteed',
          },
          total: { amountBeforeTax: 4500000 },
          totalPoints: { points: 0 },
          roomNumberLocked: false,
          printRate: true,
        },
        reservationGuests: [
          {
            profileInfo: {
              profileIdList: [{ id: '210001', type: 'Profile' }],
              profile: {
                customer: {
                  personName: [
                    {
                      givenName: 'Taylor',
                      surname: 'Swift',
                      nameTitle: 'Ms',
                      nameType: 'Primary',
                    },
                  ],
                  language: 'E',
                },
                addresses: {
                  addressInfo: [
                    {
                      address: {
                        isValidated: true,
                        country: { displayCountryFlag: true },
                        language: 'E',
                        type: 'HOME',
                        primaryInd: true,
                      },
                      id: '210002',
                      type: 'Address',
                    },
                  ],
                },
                telephones: {
                  telephoneInfo: [
                    {
                      telephone: {
                        phoneTechType: 'PHONE',
                        phoneUseType: 'MOBILE',
                        phoneNumber: '081234567890',
                        primaryInd: true,
                      },
                      id: '210003',
                      type: 'Communication',
                    },
                  ],
                },
                emails: {
                  emailInfo: [
                    {
                      email: {
                        emailAddress: 'taylor.swift@example.com',
                        type: 'EMAIL',
                        primaryInd: true,
                      },
                      id: '210004',
                      type: 'Email',
                    },
                  ],
                },
                profileType: 'Guest',
              },
            },
            arrivalTransport: { transportationReqd: false },
            departureTransport: { transportationReqd: false },
            primary: true,
          },
        ],
        reservationPackages: [
          {
            packageHeaderType: {
              primaryDetails: { description: 'Breakfast inclusion' },
              transactionDetails: {
                allowance: false,
                currency: 'IDR',
                postingType: 'D',
                calculationRule: 'A',
              },
              postingAttributes: {
                addToRate: false,
                printSeparateLine: false,
                postNextDay: false,
                forecastNextDay: false,
              },
            },
            scheduleList: [
              {
                consumptionDate: '2025-09-10',
                unitPrice: 0,
                totalQuantity: 3,
                computedResvPrice: 0,
                unitAllowance: 0,
                reservationDate: '2025-09-10',
                originalUnitPrice: 0,
                originalUnitAllowance: 0,
              },
            ],
            consumptionDetails: {
              defaultQuantity: 3,
              totalQuantity: 3,
              allowanceConsumed: false,
            },
            packageCode: 'BFDELUXE',
            internalId: 210500,
            ratePlanCode: 'BFR',
            source: 'RateDetail',
          },
        ],
        cashiering: {
          billingPrivileges: {
            postingRestriction: true,
            postStayCharging: false,
            videoCheckout: false,
          },
          compAccounting: { compPostings: 'N' },
          reverseCheckInAllowed: false,
          reverseAdvanceCheckInAllowed: false,
          transactionsPosted: false,
        },
        extSystemSync: false,
        hotelId: 'BOOKONLINE',
        roomStayReservation: true,
        reservationStatus: 'Confirmed',
        computedReservationStatus: 'DueIn',
        walkIn: false,
        printRate: true,
        createDateTime: '2025-09-01 08:15:30.0',
        creatorId: 'WEBUSER01',
        lastModifyDateTime: '2025-09-01 08:15:30.0',
        lastModifierId: 'WEBUSER01',
        createBusinessDate: '2025-09-01',
        preRegistered: false,
        upgradeEligible: false,
        allowAutoCheckin: false,
        hasOpenFolio: false,
        allowMobileCheckout: false,
        allowMobileViewFolio: false,
        allowPreRegistration: false,
        optedForCommunication: true,
        backToBack: false,
        payeeSharer: false,
      },
    ];

    elements.reservationResults.innerHTML = '';

    mockReservations.forEach((reservation, index) => {
      const reservationElement = createReservationElementFromApi(
        reservation,
        index
      );
      elements.reservationResults.appendChild(reservationElement);
    });
  } else {
    if (reservationData && reservationData.length > 0) {
      // Use actual API data
      reservations = reservationData;
      // debugLog(
      //   '📋',
      //   'Displaying API reservation data:',
      //   reservations.length + ' items'
      // );
    } else if (window.searchResults && window.searchResults.length > 0) {
      // Use stored search results
      reservations = window.searchResults;
      debugLog(
        '📋',
        'Using stored search results:',
        reservations.length + ' items'
      );
    }

    elements.reservationResults.innerHTML = '';

    reservations.forEach((reservation, index) => {
      const reservationElement = createReservationElementFromApi(
        reservation,
        index
      );
      elements.reservationResults.appendChild(reservationElement);
    });
  }

  showStep(2);
}

function createReservationElementFromApi(reservation, index) {
  console.log('Creating reservation element for:', reservation);
  const reservationIds = reservation.reservationIdList || [];

  const reservationId =
    reservationIds.find((id) => id.type === 'Reservation')?.id || `RES${index}`;
  const confirmationId =
    reservationIds.find((id) => id.type === 'Confirmation')?.id || '-';

  const arrivalDate = reservation.roomStay?.arrivalDate || '-';
  const departureDate = reservation.roomStay?.departureDate || '-';

  const reservationDiv = document.createElement('div');
  reservationDiv.className = 'reservation-item';
  reservationDiv.dataset.index = index;

  // Enhanced styling
  reservationDiv.style.cssText = `
    background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 20px;
    margin-bottom: 16px;
    cursor: pointer;
    transition: all 0.3s ease;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.04);
    position: relative;
    overflow: hidden;
  `;

  // Add hover and selection states
  const addHoverEffects = () => {
    reservationDiv.onmouseenter = () => {
      if (!reservationDiv.classList.contains('selected')) {
        reservationDiv.style.transform = 'translateY(-2px)';
        reservationDiv.style.boxShadow = '0 8px 25px rgba(0, 0, 0, 0.12)';
        reservationDiv.style.borderColor = '#3b82f6';
      }
    };

    reservationDiv.onmouseleave = () => {
      if (!reservationDiv.classList.contains('selected')) {
        reservationDiv.style.transform = 'translateY(0)';
        reservationDiv.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.04)';
        reservationDiv.style.borderColor = '#e2e8f0';
      }
    };
  };

  reservationDiv.onclick = () => {
    // Remove selection from other items
    document.querySelectorAll('.reservation-item').forEach((item) => {
      item.classList.remove('selected');
      item.style.background =
        'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)';
      item.style.borderColor = '#e2e8f0';
      item.style.transform = 'translateY(0)';
      item.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.04)';
    });

    // Add selection to clicked item
    reservationDiv.classList.add('selected');
    reservationDiv.style.background =
      'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)';
    reservationDiv.style.borderColor = '#3b82f6';
    reservationDiv.style.transform = 'translateY(-1px)';
    reservationDiv.style.boxShadow = '0 8px 25px rgba(59, 130, 246, 0.15)';

    selectReservation(reservationDiv, reservation);
  };

  // Status color mapping
  const getStatusColor = (status) => {
    const statusLower = (status || '').toLowerCase();
    switch (statusLower) {
      case 'confirmed':
        return { bg: '#dcfce7', text: '#166534', border: '#bbf7d0' };
      case 'checked-in':
        return { bg: '#dbeafe', text: '#1e40af', border: '#bfdbfe' };
      case 'checked-out':
        return { bg: '#f3f4f6', text: '#374151', border: '#d1d5db' };
      case 'cancelled':
        return { bg: '#fee2e2', text: '#dc2626', border: '#fecaca' };
      case 'pending':
        return { bg: '#fef3c7', text: '#d97706', border: '#fde68a' };
      default:
        return { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' };
    }
  };

  const statusColors = getStatusColor(reservation.reservationStatus);

  // Format dates
  const formatDate = (dateString) => {
    if (!dateString || dateString === '-') return '-';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  // Calculate stay duration
  const calculateStayDuration = (arrival, departure) => {
    if (!arrival || !departure || arrival === '-' || departure === '-')
      return '';
    try {
      const arrivalDate = new Date(arrival);
      const departureDate = new Date(departure);
      const diffTime = Math.abs(departureDate - arrivalDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays > 0 ? `${diffDays} night${diffDays > 1 ? 's' : ''}` : '';
    } catch {
      return '';
    }
  };

  const stayDuration = calculateStayDuration(arrivalDate, departureDate);

  reservationDiv.innerHTML = `
    <!-- Header with confirmation number -->
    <div style="
      display: flex; 
      justify-content: space-between; 
      align-items: center; 
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid #e2e8f0;
    ">
      <div style="display: flex; align-items: center; gap: 8px;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style="color: #3b82f6;">
          <path d="M19 3H5C3.89 3 3 3.89 3 5V19C3 20.11 3.89 21 5 21H19C20.11 21 21 20.11 21 19V5C21 3.89 20.11 3 19 3ZM19 19H5V5H19V19Z" fill="currentColor"/>
          <path d="M7 7H17V9H7V7ZM7 11H17V13H7V11ZM7 15H13V17H7V15Z" fill="currentColor"/>
        </svg>
        <span style="
          font-weight: 600; 
          font-size: 16px; 
          color: #1f2937;
        ">${confirmationId}</span>
      </div>
      <div style="
        background: ${statusColors.bg}; 
        color: ${statusColors.text}; 
        border: 1px solid ${statusColors.border};
        padding: 4px 12px; 
        border-radius: 20px; 
        font-size: 12px; 
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      ">
        ${reservation.reservationStatus || 'Unknown'}
      </div>
    </div>

    <!-- Guest Information -->
    <div style="
      display: flex; 
      align-items: center; 
      gap: 10px; 
      margin-bottom: 16px;
    ">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style="color: #6b7280; flex-shrink: 0;">
        <path d="M12 12C14.21 12 16 10.21 16 8C16 5.79 14.21 4 12 4C9.79 4 8 5.79 8 8C8 10.21 9.79 12 12 12ZM12 14C9.33 14 4 15.34 4 18V20H20V18C20 15.34 14.67 14 12 14Z" fill="currentColor"/>
      </svg>
      <div>
        <span style="
          font-weight: 600; 
          color: #374151; 
          font-size: 15px;
        ">
          ${
            reservation.reservationGuest
              ? `${reservation.reservationGuest.givenName || ''} ${
                  reservation.reservationGuest.surname || ''
                }`.trim()
              : 'Guest Name Not Available'
          }
        </span>
      </div>
    </div>

    <!-- Room and Dates Grid -->
    <div style="
      display: grid; 
      grid-template-columns: 1fr 1fr; 
      gap: 16px; 
      margin-bottom: 16px;
    ">
      <!-- Room Info -->
      <div style="
        background: #f8fafc; 
        padding: 12px; 
        border-radius: 8px; 
        border-left: 3px solid #3b82f6;
      ">
        <div style="
          display: flex; 
          align-items: center; 
          gap: 8px; 
          margin-bottom: 4px;
        ">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style="color: #6b7280;">
            <path d="M7 14C8.66 14 10 12.66 10 11C10 9.34 8.66 8 7 8C5.34 8 4 9.34 4 11C4 12.66 5.34 14 7 14ZM21 9V7L19 5V4C19 2.89 18.11 2 17 2H15C13.89 2 13 2.89 13 4V5L11 7V9H21ZM7 16C4.67 16 0 17.17 0 19.5V20C0 20.55 0.45 21 1 21H13C13.55 21 14 20.55 14 20V19.5C14 17.17 9.33 16 7 16Z" fill="currentColor"/>
          </svg>
          <span style="
            font-size: 12px; 
            color: #6b7280; 
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          ">Room</span>
        </div>
        <span style="
          font-weight: 600; 
          color: #374151; 
          font-size: 14px;
        ">${reservation.roomStay?.roomId || 'Not Assigned'}</span>
      </div>

      <!-- Stay Duration -->
      <div style="
        background: #f8fafc; 
        padding: 12px; 
        border-radius: 8px; 
        border-left: 3px solid #10b981;
      ">
        <div style="
          display: flex; 
          align-items: center; 
          gap: 8px; 
          margin-bottom: 4px;
        ">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style="color: #6b7280;">
            <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM13 17H11V11H13V17ZM13 9H11V7H13V9Z" fill="currentColor"/>
          </svg>
          <span style="
            font-size: 12px; 
            color: #6b7280; 
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          ">Duration</span>
        </div>
        <span style="
          font-weight: 600; 
          color: #374151; 
          font-size: 14px;
        ">${stayDuration || 'TBD'}</span>
      </div>
    </div>

    <!-- Dates Section -->
    <div style="
      display: flex; 
      justify-content: space-between; 
      align-items: center;
      background: linear-gradient(90deg, #f0f9ff 0%, #e0f2fe 100%);
      padding: 12px;
      border-radius: 8px;
      border: 1px solid #bae6fd;
    ">
      <div style="text-align: center; flex: 1;">
        <div style="
          font-size: 11px; 
          color: #0369a1; 
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 4px;
        ">Check-in</div>
        <div style="
          font-weight: 600; 
          color: #0c4a6e; 
          font-size: 14px;
        ">${formatDate(arrivalDate)}</div>
      </div>
      
      <div style="
        width: 24px; 
        height: 2px; 
        background: linear-gradient(90deg, #0ea5e9, #0284c7); 
        border-radius: 1px;
        position: relative;
      ">
        <div style="
          position: absolute;
          right: -4px;
          top: -3px;
          width: 0;
          height: 0;
          border-left: 4px solid #0284c7;
          border-top: 4px solid transparent;
          border-bottom: 4px solid transparent;
        "></div>
      </div>
      
      <div style="text-align: center; flex: 1;">
        <div style="
          font-size: 11px; 
          color: #0369a1; 
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 4px;
        ">Check-out</div>
        <div style="
          font-weight: 600; 
          color: #0c4a6e; 
          font-size: 14px;
        ">${formatDate(departureDate)}</div>
      </div>
    </div>

    <!-- Selection Indicator -->
    <div class="selection-indicator" style="
      position: absolute;
      top: 0;
      left: 0;
      width: 4px;
      height: 100%;
      background: #3b82f6;
      border-radius: 0 4px 4px 0;
      opacity: 0;
      transition: opacity 0.3s ease;
    "></div>
  `;

  addHoverEffects();

  return reservationDiv;
}

function displayReservationResults(reservations) {
  debugLog('📋', 'Displaying reservation results');

  const resultContainer = elements.reservationResults;

  if (!resultContainer) {
    debugLog('⚠️', 'Reservation results container not found');
    return;
  }

  // Clear previous results
  resultContainer.innerHTML = '';

  // Reset selection
  selectedReservation = null;
  if (elements.proceedToDocType) {
    elements.proceedToDocType.disabled = true;
  }

  // Show message if no reservations found
  if (!reservations || reservations.length === 0) {
    resultContainer.innerHTML =
      '<p class="no-results">No reservations found.</p>';
    return;
  }

  // Create reservation items
  reservations.forEach((reservation, index) => {
    const reservationId =
      reservation.reservationIdList?.[0]?.id || `RES${index}`;

    const reservationDiv = document.createElement('div');
    reservationDiv.className = 'reservation-item';
    reservationDiv.onclick = () =>
      selectReservation(reservationDiv, reservation);

    reservationDiv.innerHTML = `
      <h4>Reservation: ${reservationId}</h4>
      <p>Guest: ${
        reservation.reservationGuest
          ? `${reservation.reservationGuest.givenName || ''} ${
              reservation.reservationGuest.surname || ''
            }`
          : 'N/A'
      }</p>
      <p>Status: ${reservation.reservationStatus || '-'}</p>
      <p>Room: ${reservation.roomStay?.roomId || '-'}</p>
    `;

    resultContainer.appendChild(reservationDiv);
  });
}

function selectReservation(element, reservation) {
  // Remove previous selection
  document.querySelectorAll('.reservation-item').forEach((item) => {
    item.classList.remove('selected');
  });

  // Select current item
  element.classList.add('selected');
  selectedReservation = reservation;

  // Enable proceed button
  if (elements.proceedToDocType) {
    elements.proceedToDocType.disabled = false;
  }

  debugLog(
    '✅',
    'Reservation selected:',
    reservation.reservationIdList?.[0]?.id
  );
}

// Export functions if using modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    callReservationApi,
    findReservations,
    getToken,
    getAuthorization,
  };
}

// Simulate API call (replace with actual implementation)
async function simulateApiCall() {
  await simulateDelay(2000);

  elements.apiStatus.innerHTML =
    '<div class="spinner-small"></div><span>Reservations found!</span>';
  elements.apiStatus.className = 'processing-status success';

  await simulateDelay(500);
  closeApiPopup();
}

// Calculate frame position and dimensions
function getFrameDimensions() {
  const video = document.getElementById('cameraVideo');
  const scanFrame = document.getElementById('scanFrame');
  const videoRect = video.getBoundingClientRect();
  const frameRect = scanFrame.getBoundingClientRect();

  // Calculate relative position and size
  const relativeX = (frameRect.left - videoRect.left) / videoRect.width;
  const relativeY = (frameRect.top - videoRect.top) / videoRect.height;
  const relativeWidth = frameRect.width / videoRect.width;
  const relativeHeight = frameRect.height / videoRect.height;

  // Convert to actual video dimensions
  const actualX = relativeX * video.videoWidth;
  const actualY = relativeY * video.videoHeight;
  const actualWidth = relativeWidth * video.videoWidth;
  const actualHeight = relativeHeight * video.videoHeight;

  return {
    x: Math.max(0, actualX),
    y: Math.max(0, actualY),
    width: Math.min(actualWidth, video.videoWidth - actualX),
    height: Math.min(actualHeight, video.videoHeight - actualY),
  };
}

// Handle document capture with cropping
function captureDocument() {
  debugLog('📸', 'Capturing document image');

  if (!cameraStream) {
    debugLog('⚠️', 'No camera stream available');
    alert('Camera not available');
    return;
  }

  try {
    const video = document.getElementById('cameraVideo');
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    // Get frame dimensions
    const frameDimensions = getFrameDimensions();
    // debugLog('📐', 'Frame dimensions:', frameDimensions);

    // Set canvas dimensions to match the cropped area
    canvas.width = frameDimensions.width;
    canvas.height = frameDimensions.height;

    // debugLog('📐', 'Canvas dimensions:', canvas.width, 'x', canvas.height);

    // Draw cropped video frame to canvas
    context.drawImage(
      video,
      frameDimensions.x,
      frameDimensions.y,
      frameDimensions.width,
      frameDimensions.height,
      0,
      0,
      canvas.width,
      canvas.height
    );

    // const dataURL = canvas.toDataURL('image/jpeg');

    base64Image = canvas.toDataURL('image/jpeg', 0.9);

    // Show preview
    elements.capturedDocument.src = base64Image;
    // document.getElementById('selectedDocType').textContent =
    //   selectedDocumentType;
    elements.documentPreview.style.display = 'block';

    // Update controls
    elements.captureDocBtn.style.display = 'none';
    elements.processDocBtn.style.display = 'inline-flex';
    elements.stopCameraBtn.style.display = 'none';
    elements.retakeDocBtn.style.display = 'inline-flex';

    // Stop camera
    stopCamera();

    debugLog('✅', 'Document captured and cropped successfully');
  } catch (error) {
    debugLog('🚨', 'Document capture error:', error);
    alert('Document capture failed: ');
  }
}

// Handle retake
function retakeDocument() {
  debugLog('🔄', 'Retaking document photo');
  elements.documentPreview.style.display = 'none';
  elements.processDocBtn.style.display = 'none';
  elements.retakeDocBtn.style.display = 'none';
  startCamera();
}

function showDocumentDataPopup(data) {
  const overlay = document.getElementById('documentDataPopup');
  const tableBody = document.getElementById('docdataTableBody');

  // Clear existing rows
  tableBody.innerHTML = '';

  const relevantFields = [
    'surname',
    'given_name',
    'document_number',
    'birth_date',
    'sex',
    'expiry_date',
    'nationality_code',
  ];

  // Filter to only include relevant fields
  const filteredData = Object.fromEntries(
    Object.entries(data).filter(([key]) => relevantFields.includes(key))
  );

  // Add data rows
  for (const [field, value] of Object.entries(filteredData)) {
    const row = document.createElement('tr');
    row.className = 'docdata-table-row';
    row.innerHTML = `
      <td class="docdata-field-cell">${formatFieldName(field)}</td>
      <td class="docdata-value-cell">
        <input type="text" class="docdata-input-field" 
               data-field="${field}" value="${value || ''}" 
               placeholder="Enter value..." 
               style="text-transform: uppercase;">
      </td>
      <td class="docdata-actions-cell">
        <div class="docdata-action-buttons">
          <button type="button" class="docdata-edit-btn" title="Edit field" tabindex="-1">
            <svg viewBox="0 0 24 24" width="16" height="16">
              <path fill="currentColor" d="M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z"/>
            </svg>
          </button>
          <button type="button" class="docdata-clear-btn" title="Clear field" tabindex="-1">
            <svg viewBox="0 0 24 24" width="16" height="16">
              <path fill="currentColor" d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/>
            </svg>
          </button>
        </div>
      </td>
    `;
    tableBody.appendChild(row);
  }

  // Add event listeners
  document.querySelectorAll('.docdata-edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = btn
        .closest('.docdata-table-row')
        .querySelector('.docdata-input-field');
      input.focus();
      const value = input.value;
      input.setSelectionRange(value.length, value.length);
    });
  });

  document.querySelectorAll('.docdata-clear-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = btn
        .closest('.docdata-table-row')
        .querySelector('.docdata-input-field');
      input.value = '';
      input.focus();
    });
  });

  // Make inputs uppercase automatically
  document.querySelectorAll('.docdata-input-field').forEach((input) => {
    input.addEventListener('input', () => {
      input.value = input.value.toUpperCase();
    });
  });

  // Show the popup
  overlay.classList.add('active');
}

function isValidDate(value) {
  // Check format YYYY-MM-DD
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(value)) return false;

  // Parse components
  const [year, month, day] = value.split('-').map(Number);

  // Check valid month
  if (month < 1 || month > 12) return false;

  // Check valid day for that month
  const daysInMonth = new Date(year, month, 0).getDate(); // last day of the month
  if (day < 1 || day > daysInMonth) return false;

  return true;
}

function closeDocumentDataPopup() {
  document.getElementById('documentDataPopup').classList.remove('active');
}

// Format field names for display (keep existing function)
function formatFieldName(field) {
  return field
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

// Updated processDocument function (no changes needed)
async function processDocument() {
  if (!elements.capturedDocument.src) {
    alert('No document available');
    return;
  }

  try {
    // const extractedData = await extractDocumentData(
    //   elements.capturedDocument.src
    // );

    // if (isCompanionScan) {
    //   // Handle companion data
    //   handleCompanionData(
    //     await extractDocumentData(elements.capturedDocument.src)
    //   );
    // } else {
    // Original main guest processing
    await extractDocumentData(elements.capturedDocument.src);
    // }
  } catch (error) {
    debugLog('🚨', 'Extraction error:', error);
    // alert('Failed to extract document data');
  }
}

function showCompanionsList() {
  if (!elements.companionsList) return;

  elements.companionsList.innerHTML = '';

  companions.forEach((companion, index) => {
    const companionDiv = document.createElement('div');
    companionDiv.className = 'companion-item';
    companionDiv.innerHTML = `
      <div class="companion-info">
        <h4>${companion.type === 'share' ? 'Shared Guest' : 'Companion'} ${
      index + 1
    }</h4>
        <p>Name: ${companion.extractedData.given_name || ''} ${
      companion.extractedData.surname || ''
    }</p>
        <p>Document: ${companion.documentType}</p>
        <p>Number: ${companion.extractedData.document_number || 'N/A'}</p>
      </div>
      <div class="companion-actions">
        <button onclick="editCompanion(${index})" class="edit-companion-btn">Edit</button>
        <button onclick="removeCompanion(${index})" class="remove-companion-btn">Remove</button>
      </div>
    `;
    elements.companionsList.appendChild(companionDiv);
  });
}

function showCompanionManagement() {
  debugLog('🔧', 'Initializing companion controls');

  const showAddCompanion = API_CONFIG?.AddAccompany === true;
  const showAddShare = API_CONFIG?.AddShare === true;

  // Show/hide the Add Companion button based on config
  if (elements.addCompanionBtn) {
    elements.addCompanionBtn.style.display = showAddCompanion
      ? 'inline-flex'
      : 'none';
  }

  // Show/hide the Add Share button based on config
  if (elements.addShareBtn) {
    elements.addShareBtn.style.display = showAddShare ? 'inline-flex' : 'none';
  }

  debugLog(
    '✅',
    `Companion controls initialized - AddAccompany: ${showAddCompanion}, AddShare: ${showAddShare}`
  );

  // Only show popup if at least one option is available
  if (showAddCompanion || showAddShare) {
    updateCompanionList(); // Update the list before showing
    if (elements.companionPopup) {
      elements.companionPopup.style.display = 'flex';
    }
  } else {
    // If no companion options are available, complete directly
    handleComplete();
  }
}

function closeCompanionPopup() {
  debugLog('👥', 'Closing companion management popup');
  if (elements.companionPopup) {
    elements.companionPopup.style.display = 'none';
  }
}

function editCompanion(index) {
  debugLog('✏️', `Editing companion ${index + 1}`);
  const companion = companions[index];
  if (companion) {
    showCompanionDataPopup(companion.extractedData, index);
  }
}

function removeCompanion(index) {
  debugLog('🗑️', `Removing companion ${index + 1}`);
  if (
    confirm(
      `Are you sure you want to remove ${
        companions[index].type === 'share' ? 'shared guest' : 'companion'
      } ${index + 1}?`
    )
  ) {
    companions.splice(index, 1);
    showCompanionsList();
  }
}

// Extract document data from API (no changes needed to this function)
async function extractDocumentData(base64Image) {
  // debugLog('Starting document data extraction');
  // debugLog('Input base64Image length:', base64Image.length);

  try {
    // debugLog('Showing loading indicator');
    showLoading('Extracting document data...');

    // Remove the data URL prefix if present
    // debugLog('Processing base64 image data');
    const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');
    // debugLog('Processed base64Data length:', base64Data.length);

    // debugLog('Preparing API request');
    const requestPayload = {
      base64_image: base64Data,
      ignore_parse: false,
    };
    // debugLog('Request payload:', {
    //   ...requestPayload,
    //   base64_image: `${requestPayload.base64_image.substring(0, 30)}...`, // Log first 30 chars to avoid huge logs
    // });

    // debugLog('Sending request to API endpoint');
    const response = await fetch(`${API_CONFIG.Mrz_baseURL}/extract`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestPayload),
    });

    // debugLog('Received response, status:', response.status);
    if (!response.ok) {
      const errorBody = await response
        .text()
        .catch(() => 'Unable to read error body');
      throw new Error(
        `API request failed with status ${response.status}: ${response.statusText}`
      );
    }

    // debugLog('Parsing response JSON');
    const data = await response.json();
    // const data = {
    //   mrz_type: 'TD3',
    //   document_code: 'P',
    //   issuer_code: 'USA',
    //   surname: 'DOE',
    //   given_name: 'JOHN',
    //   document_number: 'X12345678',
    //   document_number_checkdigit: '7',
    //   nationality_code: 'USA',
    //   birth_date: '1991-01-01', // YYMMDD
    //   birth_date_checkdigit: '3',
    //   sex: 'M',
    //   expiry_date: '2028-01-01', // YYMMDD
    //   expiry_date_checkdigit: '9',
    //   optional_data: '12345678901234',
    //   final_checkdigit: '2',
    //   mrz_text:
    //     'P<USADOE<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<<\nX12345678<9USA9001017M301231123456789012342',
    //   status: 'SUCCESS',
    //   status_message: 'Extracted 8/8 fields. No warnings',
    //   extraction_rate: 1.0,
    //   extracted_relevant_count: 8,
    //   total_relevant_fields: 8,
    //   checksum_failures: [],
    // };

    debugLog('🔍', 'Extracted document data:', JSON.stringify(data, null, 2));

    // Check if extraction failed
    if (data.status === 'FAILURE') {
      debugLog('🚨', 'Extraction error:', 'No MRZ detected');
      alert(
        '⚠️ Document Extraction Failed\n\n' +
          'No MRZ detected. Please:\n' +
          '• Ensure proper lighting\n' +
          '• Capture the full document\n' +
          '• Hold the camera steady\n\n'
      );
      showStep(4); // Go back to capture step
      return;
    }

    // debugLog('Displaying extracted data');
    displayExtractedData(data);

    // debugLog('Data extraction completed successfully');
    debugLog('✅', 'Data extraction successful');
  } catch (error) {
    debugLog('🚨', 'Extraction error:', error);
    throw error;
  } finally {
    hideLoading();
  }
}

// Updated displayExtractedData function to use popup
function displayExtractedData(data) {
  showDocumentDataPopup(data);
}

// Format field names for display (keep existing function)
function formatFieldName(field) {
  return field
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

// Global reset function to restore app to initial state
// Enhanced resetAppState function to handle document scan cleanup
function resetAppState() {
  debugLog('🔄', 'Resetting application state');

  try {
    // Reset global variables
    capturedImageData = null;
    selectedReservation = null;
    isProcessingCapture = false;
    selectedDocumentType = null;

    companions = [];
    isCompanionScan = false;
    currentCompanionIndex = 0;

    // Clear any document scan related data
    if (typeof documentScanData !== 'undefined') {
      documentScanData = null;
    }
    if (typeof scannedDocumentImage !== 'undefined') {
      scannedDocumentImage = null;
    }

    // Reset main capture UI elements
    if (elements?.capturedImage) {
      elements.capturedImage.src = '';
      elements.capturedImage.style.display = 'none';
    }

    if (elements?.capturedDocument) {
      elements.capturedDocument.src = '';
      elements.documentPreview.style.display = 'none';
      elements.processDocBtn.style.display = 'none';
    }

    if (elements?.capturePreview) {
      const placeholder = elements.capturePreview.querySelector('.placeholder');
      if (placeholder) {
        placeholder.style.display = 'block';
      }
    }

    if (elements.companionPopup) {
      elements.companionPopup.style.display = 'none';
    }

    if (elements.continueToComplete) {
      elements.continueToComplete.style.display = 'none';
    }

    if (elements.companionsList) {
      elements.companionsList.innerHTML = '';
    }

    // Reset document scan UI elements
    const documentScanContainer = document.querySelector(
      '.document-scan-container'
    );
    if (documentScanContainer) {
      // Clear any background images or video streams
      documentScanContainer.style.backgroundImage = 'none';

      // Reset video elements if they exist
      const videoElement = documentScanContainer.querySelector('video');
      if (videoElement) {
        videoElement.srcObject = null;
        videoElement.src = '';
      }

      // Clear canvas elements
      const canvasElements = documentScanContainer.querySelectorAll('canvas');
      canvasElements.forEach((canvas) => {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      });

      // Reset any image elements in document scan
      const imageElements = documentScanContainer.querySelectorAll('img');
      imageElements.forEach((img) => {
        img.src = '';
        img.style.display = 'none';
      });
    }

    // Reset camera/document scan specific elements
    const cameraPreview = document.getElementById('cameraPreview');
    if (cameraPreview) {
      cameraPreview.src = '';
      cameraPreview.style.display = 'none';
    }

    const documentFrame = document.querySelector('.document-frame');
    if (documentFrame) {
      documentFrame.style.backgroundImage = 'none';
    }

    // Reset scan document specific elements
    const scanDocumentImage = document.getElementById('scanDocumentImage');
    if (scanDocumentImage) {
      scanDocumentImage.src = '';
      scanDocumentImage.style.display = 'none';
    }

    // Reset process buttons
    if (elements?.processBtn) {
      elements.processBtn.style.display = 'none';
    }

    const captureDocumentBtn = document.getElementById('captureDocumentBtn');
    if (captureDocumentBtn) {
      captureDocumentBtn.style.display = 'inline-flex';
      captureDocumentBtn.disabled = false;
    }

    const processDocumentBtn = document.getElementById('processDocumentBtn');
    if (processDocumentBtn) {
      processDocumentBtn.style.display = 'none';
      processDocumentBtn.disabled = false;
    }

    const retakePhotoBtn = document.getElementById('retakePhotoBtn');
    if (retakePhotoBtn) {
      retakePhotoBtn.style.display = 'none';
    }

    // Reset status elements
    if (elements?.ocrStatus) {
      elements.ocrStatus.innerHTML = '';
      elements.ocrStatus.className = 'processing-status';
    }

    const documentScanStatus = document.getElementById('documentScanStatus');
    if (documentScanStatus) {
      documentScanStatus.innerHTML = '';
      documentScanStatus.className = 'processing-status';
    }

    // Reset form inputs
    if (elements?.reservationNumber) {
      elements.reservationNumber.value = '';
      elements.reservationNumber.readOnly = true;
      elements.reservationNumber.placeholder =
        'Confirmation number will appear here';
    }

    const finalReservationElement = document.getElementById(
      'finalReservationNumber'
    );
    if (finalReservationElement) {
      finalReservationElement.value = '';
    }

    if (elements?.editReservationNumber) {
      elements.editReservationNumber.disabled = true;
    }

    // Stop any active camera streams
    stopCamera();

    // Close any open popups
    closeAllPopups();

    // Reset to step 1 (important: this should clear the document scan view)
    showStep(1);

    // Clear any form inputs
    clearAllFormInputs();

    // Clear browser cache for images (force reload)
    const allImages = document.querySelectorAll('img');
    allImages.forEach((img) => {
      if (img.src && img.src.startsWith('data:')) {
        img.src = '';
      }
    });

    debugLog('✅', 'Application state reset successfully');
  } catch (error) {
    debugLog('🚨', 'Error resetting app state:', error);
  }
}

// Enhanced function to ensure clean transition to document scan
function initializeDocumentScan() {
  debugLog('📄', 'Initializing document scan');

  try {
    // Clear any previous scan data
    if (typeof documentScanData !== 'undefined') {
      documentScanData = null;
    }

    // Clear previous images
    const scanDocumentImage = document.getElementById('scanDocumentImage');
    if (scanDocumentImage) {
      scanDocumentImage.src = '';
      scanDocumentImage.style.display = 'none';
    }

    // Reset document frame
    const documentFrame = document.querySelector('.document-frame');
    if (documentFrame) {
      documentFrame.style.backgroundImage = 'none';
    }

    // Clear any canvas overlays
    const canvasElements = document.querySelectorAll(
      '.document-scan-container canvas'
    );
    canvasElements.forEach((canvas) => {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    });

    debugLog('✅', 'Document scan initialized clean');
  } catch (error) {
    debugLog('🚨', 'Error initializing document scan:', error);
  }
}

// Call this when transitioning to document scan step
function showDocumentScanStep() {
  // First reset everything
  resetAppState();

  // Then initialize clean document scan
  initializeDocumentScan();

  // Show the document scan step
  showStep(2); // or whatever step number your document scan is
}

function closeAllPopups() {
  try {
    if (typeof closeOcrPopup === 'function') {
      closeOcrPopup();
    }
    if (typeof closeApiPopup === 'function') {
      closeApiPopup();
    }
    if (typeof closeDocumentDataPopup === 'function') {
      closeDocumentDataPopup();
    }
    if (typeof closeReservationResults === 'function') {
      closeReservationResults();
    }
  } catch (error) {
    debugLog('⚠️', 'Error closing popups:', error);
  }
}

function clearAllFormInputs() {
  try {
    // Clear all input fields in popups
    const inputs = document.querySelectorAll(
      '.docdata-popup-overlay input, .ocr-popup input, .api-popup input'
    );
    inputs.forEach((input) => {
      if (input) {
        input.value = '';
      }
    });

    // Clear any other form elements as needed
    const textareas = document.querySelectorAll('textarea');
    textareas.forEach((textarea) => {
      if (textarea) {
        textarea.value = '';
      }
    });
  } catch (error) {
    debugLog('⚠️', 'Error clearing form inputs:', error);
  }
}

// Updated saveUpdatedData function with proper reset
async function saveUpdatedData() {
  const inputs = document.querySelectorAll('.docdata-popup-overlay input');
  const updatedData = {};
  let valid = true;

  inputs.forEach((input) => {
    const field = input.dataset.field;
    const value = input.value.trim();

    // Remove previous error message if exists
    const existingError = input.nextElementSibling;
    if (existingError && existingError.classList.contains('input-error-msg')) {
      existingError.remove();
    }

    input.style.borderColor = ''; // reset border

    // Validate dates
    if ((field === 'birth_date' || field === 'expiry_date') && value) {
      if (!isValidDate(value)) {
        valid = false;
        input.style.borderColor = 'red';

        // Add inline error message
        const errorMsg = document.createElement('div');
        errorMsg.className = 'input-error-msg';
        errorMsg.style.color = 'red';
        errorMsg.style.fontSize = '12px';
        errorMsg.style.marginTop = '2px';
        errorMsg.textContent = 'Invalid date format. Use YYYY-MM-DD';
        input.insertAdjacentElement('afterend', errorMsg);
      }
    }

    updatedData[field] = value;
  });

  if (!valid) {
    // Focus first invalid input
    const firstInvalid = document.querySelector('.input-error-msg');
    if (firstInvalid) firstInvalid.previousElementSibling.focus();
    return; // stop saving if validation fails
  }

  debugLog('💾', 'Updated data:', JSON.stringify(updatedData, null, 2));

  const guestData = mapMrzToGuest(updatedData);
  const reservationData = selectedReservation;

  if (API_CONFIG?.HotelPms?.toUpperCase() == 'DEMO') {
    try {
      alert('Guest profile updated successfully!');
      if (isCompanionScan) {
        // Store companion data
        const companionData = {
          type: isCompanionScan === 'share' ? 'share' : 'companion',
          extractedData: guestData,
          processedAt: new Date().toISOString(),
        };
        companions.push(companionData);
      }
      closeDocumentDataPopup();
      showCompanionManagement();
    } catch (error) {
      debugLog('🚨', 'Error in demo save:', error);
      alert('Failed to complete the process');
    }
  } else {
    try {
      if (!reservationData) {
        throw new Error('No reservation data available');
      }

      if (isCompanionScan) {
        // Store companion data
        const companionData = {
          type: isCompanionScan === 'share' ? 'share' : 'companion',
          extractedData: guestData,
          processedAt: new Date().toISOString(),
        };
        companions.push(companionData);
      } else {
        const originalGuest = reservationData.reservationGuest;
        const updatedGuest = await updateGuestProfile(
          reservationData,
          originalGuest,
          guestData
        );
        alert('Guest profile updated successfully!');
      }

      closeDocumentDataPopup();
      showCompanionManagement();
    } catch (error) {
      debugLog('🚨', 'Error updating guest profile:', error);
      alert(
        'Failed to update guest profile: ' + (error?.message || 'Unknown error')
      );
    }
  }
}

function handleComplete() {
  debugLog('🎉', 'Process completed successfully');

  // Close and reset the window
  closeWindowAndReset();
}

async function closeWindowAndReset() {
  try {
    hideLoading();

    // Ensure app state is reset
    resetAppState();

    // Close the window completely
    await ipcRenderer.invoke('close-main-window');

    debugLog('🏠', 'Window closed and reset completed');
  } catch (error) {
    debugLog('🚨', 'Error closing window:', error);
    // Fallback: just reset the app state if window closing fails
    resetAppState();
  }
}

// Format field names for display
function formatFieldName(field) {
  return field
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

// // Enhanced saveUpdatedData function with PMS integration logic
// async function saveUpdatedData() {
//   // showLoading('Updating guest profile');
//   const inputs = document.querySelectorAll('.docdata-popup-overlay input');
//   const updatedData = {};

//   inputs.forEach((input) => {
//     updatedData[input.dataset.field] = input.value;
//   });

//   // showLoading('Updating profile and documents...'); // More accurate message

//   debugLog('💾', 'Updated data:', JSON.stringify(updatedData, null, 2));

//   if (API_CONFIG?.HotelPms?.toUpperCase() == 'DEMO') {
//     alert('Guest profile updated successfully!');
//     // hideLoading();
//     closeDocumentDataPopup();
//     handleComplete();
//   } else {
//     try {
//       // Convert extracted MRZ data to guest object
//       const guestData = mapMrzToGuest(updatedData);

//       // Get reservation data (this would come from your system)
//       const reservationData = selectedReservation;

//       // Get original guest data for comparison
//       const originalGuest = reservationData.reservationGuest;

//       // Update guest profile
//       const updatedGuest = await updateGuestProfile(
//         reservationData,
//         originalGuest,
//         guestData
//       );

//       alert('Guest profile updated successfully!');
//       closeDocumentDataPopup();
//       handleComplete();
//     } catch (error) {
//       debugLog('Error updating guest profile:', error);
//       alert('Failed to update guest profile');
//     }
//   }
// }

// Convert MRZ data to guest object format
function mapMrzToGuest(mrzData) {
  return {
    firstName: mrzData.given_name || '',
    lastName: mrzData.surname || '',
    nationality: mrzData.nationality_code || '',
    birthDate: mrzData.birth_date || '',
    gender: mrzData.sex || '',
    documents: [
      {
        docType: getDocumentType(mrzData.document_code),
        docNumber: mrzData.document_number || '',
        expiryDate: mrzData.expiry_date || '',
        issueCountry: mrzData.issuer_code || '',
        givenname: mrzData.given_name || '',
        surname: mrzData.surname || '',
        birthDate: mrzData.birth_date || '',
        nationality: mrzData.nationality_code || '',
        docFile: base64Image,
      },
    ],
  };
}

// Get document type based on MRZ document code
function getDocumentType(docCode) {
  const docTypeMap = {
    P: 'PASSPORT',
    I: 'ID_CARD',
    A: 'IDENTITY_CARD',
    C: 'IDENTITY_CARD',
    V: 'VISA',
  };
  return docTypeMap[docCode] || 'PASSPORT';
}

// Main update guest function (JavaScript version of Java updateGuest method)
async function updateGuestProfile(checkin, originalGuest, guestData) {
  debugLog(
    '💾',
    'Updated guest:',
    originalGuest?.givenName,
    originalGuest?.surname,
    '- Overwrite:',
    API_CONFIG.Ohip_overwrite
  );

  // Prepare the profile update request
  const updateRequest = {
    profileDetails: {
      profileType: 'GUEST',
      customer: {},
      emails: null,
      telephones: null,
      addresses: null,
    },
  };

  // Set profile ID if original guest exists
  if (originalGuest?.id) {
    updateRequest.profileIdList = [
      {
        id: originalGuest.id,
        type: 'Profile',
      },
    ];
  }

  // Update customer information
  const customer = updateRequest.profileDetails.customer;

  // Update name if forced or different
  if (API_CONFIG.Ohip_overwrite) {
    customer.personName = [
      {
        nameType: 'PRIMARY',
        givenName: guestData.firstName,
        surname: guestData.lastName,
      },
    ];
  }

  // Update gender
  if (API_CONFIG.Ohip_overwrite || !originalGuest || !originalGuest.gender) {
    customer.gender = convertGender(guestData.gender);
  }

  // Update birth date and nationality
  customer.birthDate = guestData.birthDate;
  customer.nationality = convertCountryCode(guestData.nationality);

  // Process documents
  if (guestData.documents && guestData.documents.length > 0) {
    const identifications = {
      identificationInfo: [],
    };

    // Process ID and Passport documents
    guestData.documents.forEach((doc) => {
      identifications.identificationInfo.push({
        identification: {
          idNumber: doc.docNumber,
          idType: convertDocType(doc.docType),
          expirationDate: doc.expiryDate,
          issuedCountry: convertCountryCode(doc.issueCountry),
          issueDate: doc.issueDate,
          registeredProperty: API_CONFIG.Ohip_hotelId,
          orderSequence: 1,
          primaryInd: true,
        },
      });

      // Add alternate name if document has different name
      if (!originalGuest?.alternateName && doc.givenname) {
        if (!customer.personName) customer.personName = [];
        customer.personName.push({
          givenName: doc.givenname,
          surname: doc.surname,
          nameType: 'ALTERNATE',
        });
      }

      // Use document data if customer data is missing
      if (!customer.birthDate) customer.birthDate = doc.birthDate;
      if (!customer.nationality)
        customer.nationality = convertCountryCode(doc.nationality);
    });

    if (identifications.identificationInfo.length > 0) {
      customer.identifications = identifications;
    }
  }

  // Set language
  customer.language = originalGuest?.language || getDefaultLanguage();

  // Update email if different
  if (
    guestData.email &&
    guestData.email.trim() &&
    originalGuest &&
    !guestData.email.toLowerCase().equals(originalGuest.email?.toLowerCase())
  ) {
    updateRequest.profileDetails.emails = {
      emailInfo: [
        {
          email: {
            emailAddress: guestData.email,
            primaryInd: true,
            orderSequence: 1,
            emailFormat: 'HTML',
            type: 'EMAIL',
          },
        },
      ],
    };
  }

  // Update mobile phone if different
  if (
    guestData.mobile &&
    guestData.mobile.trim() &&
    originalGuest &&
    !guestData.mobile.equals(originalGuest.mobile)
  ) {
    updateRequest.profileDetails.telephones = {
      telephoneInfo: [
        {
          telephone: {
            phoneNumber: guestData.mobile,
            phoneTechType: 'PHONE',
            phoneUseType: 'MOBILE',
          },
        },
      ],
    };
  }

  // Update address if different
  if (
    guestData.address &&
    guestData.address.trim() &&
    originalGuest &&
    !guestData.address.equals(originalGuest.address)
  ) {
    updateRequest.profileDetails.addresses = {
      addressInfo: [
        {
          address: {
            addressLine: [
              guestData.address,
              guestData.address1,
              guestData.address2,
            ].filter(Boolean),
            country: {
              code: convertCountryCode(guestData.country),
            },
            cityName: guestData.city,
            postalCode: guestData.zipcode,
            state: guestData.state,
          },
        },
      ],
    };
  }

  // Make the API call to update the profile
  try {
    const authorization = await getAuthorization();
    const response = await updateProfileAPI(
      originalGuest.id,
      authorization,
      updateRequest
    );
    // const response = "success"; // Simulated response for testing

    debugLog(
      '✅',
      'Profile update response:',
      JSON.stringify(response, null, 2)
    );

    // Upload document files if available
    if (shouldUploadDocuments()) {
      await processDocumentUploads(originalGuest, guestData);
    }

    return response;
  } catch (error) {
    debugLog('🚨', 'Failed to update guest profile:', error);
  }
}

// Upload ID document
async function postIdDocument(guestId, name, docFile) {
  // debugLog('Attaching ID document for', name, 'with profile ID', guestId);
  const fileUpload = createFileUpload(
    name,
    docFile,
    guestId,
    'Guest',
    'ID Document'
  );
  // debugLog('File upload object created:', JSON.stringify(fileUpload));
  try {
    const response = await uploadFileWithAuth(fileUpload);
    debugLog('✅', 'ID document attached successfully:', fileUpload.fileName);
    return true;
  } catch (error) {
    debugLog(
      '🚨',
      'Failed to attach ID document:',
      fileUpload?.fileName,
      error
    );

    return false;
  }
}

// Convert base64 string to Uint8Array
function base64ToUint8Array(base64) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Fixed getFileExtension function
function getFileExtension(docFile) {
  // If docFile is a base64 string, convert it to bytes
  let fileBytes;
  if (typeof docFile === 'string') {
    // Remove data URL prefix if present
    const base64Data = docFile.replace(/^data:image\/\w+;base64,/, '');
    fileBytes = base64ToUint8Array(base64Data);
  } else if (docFile instanceof Uint8Array || docFile instanceof ArrayBuffer) {
    fileBytes = docFile;
  } else {
    debugLog('🚨', 'Unsupported file format:', typeof docFile);
    return 'UNKNOWN';
  }

  if (!fileBytes || fileBytes.length < 8) {
    return 'UNKNOWN'; // Not enough bytes to determine format
  }

  // Check for JPEG signature (FF D8 FF)
  if (fileBytes[0] === 0xff && fileBytes[1] === 0xd8 && fileBytes[2] === 0xff) {
    return 'jpg';
  }
  // Check for PNG signature (89 50 4E 47 0D 0A 1A 0A)
  else if (
    fileBytes[0] === 0x89 &&
    fileBytes[1] === 0x50 &&
    fileBytes[2] === 0x4e &&
    fileBytes[3] === 0x47 &&
    fileBytes[4] === 0x0d &&
    fileBytes[5] === 0x0a &&
    fileBytes[6] === 0x1a &&
    fileBytes[7] === 0x0a
  ) {
    return 'png';
  }
  // Check for PDF signature (25 50 44 46 2D -> %PDF-)
  else if (
    fileBytes[0] === 0x25 &&
    fileBytes[1] === 0x50 &&
    fileBytes[2] === 0x44 &&
    fileBytes[3] === 0x46 &&
    fileBytes[4] === 0x2d
  ) {
    return 'pdf';
  } else {
    return 'UNKNOWN';
  }
}

// Updated createFileUpload function
function createFileUpload(name, docFile, linkId, linkType, description) {
  const timestamp = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15);
  const extension = getFileExtension(docFile);
  debugLog(
    '📤',
    `Creating file upload with name: ${name}_${timestamp}.${extension}`
  );

  return {
    fileAttachment: docFile, // Keep as base64 string for API
    fileName: `${name}_${timestamp}.${extension}`,
    linkId: linkId,
    linkType: linkType,
    userName: 'SCANNER_APP', // Replace with actual user name if available
    description: description,
    globalYN: 'N',
    overwriteExistingFileYN: 'N',
    hotelId: API_CONFIG.Ohip_hotelId,
  };
}

// Upload file with authentication
/**
 * Uploads a file attachment with authorization
 * @param {Object} fileToUpload - The file data to upload
 * @returns {Promise<Object>} The API response
 * @throws {Error} If the upload fails
 */
async function uploadFileWithAuth(fileToUpload) {
  const endpoint = `${API_CONFIG.Ohip_baseURL}/med/config/v1/fileAttachments`;
  const startTime = Date.now();

  try {
    // Log the request details (masking sensitive data)
    debugLog(
      '📤',
      'File Upload Request:',
      JSON.stringify({
        method: 'POST',
        url: endpoint,
        headers: {
          'Content-Type': 'application/json',
          authorization: 'Bearer *****', // Masked
          'x-app-key': API_CONFIG.Ohip_appKey,
          'x-hotelid': API_CONFIG.Ohip_hotelId,
        },
        payload: {
          ...fileToUpload,
          fileAttachment: fileToUpload.fileAttachment
            ? `<binary data (${fileToUpload.fileAttachment.length} bytes)>`
            : undefined,
        },
      })
    );

    // Get authorization token
    const authorization = await getAuthorization();

    // Make the API call
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: authorization,
        'x-app-key': API_CONFIG.Ohip_appKey,
        'x-hotelid': API_CONFIG.Ohip_hotelId,
      },
      body: JSON.stringify(fileToUpload),
    });

    const responseTime = Date.now() - startTime;
    const responseData = await response.json();

    // Log successful response
    debugLog(
      '✅',
      'File Upload Success:',
      JSON.stringify(responseData, null, 2)
    );

    if (!response.ok) {
      // Log error response
      debugLog(
        '❌',
        'File Upload Failed:',
        JSON.stringify({
          status: response.status,
          error: responseData,
          timeTaken: `${responseTime}ms`,
        })
      );
      throw new Error(`File upload failed with status ${response.status}`);
    }

    return responseData;
  } catch (error) {
    debugLog('🚨', 'File Upload Error:', {
      error: error.message,
      stack: error.stack,
      timeTaken: `${Date.now() - startTime}ms`,
    });
    throw error;
  }
}

// Helper functions
function convertGender(gender) {
  const genderMap = { M: 'Male', F: 'Female' };
  return genderMap[gender] || null;
}

function convertCountryCode(countryCode) {
  // This would contain your country code conversion logic
  return countryCode;
}

function convertDocType(docType) {
  const docTypeMap = {
    PASSPORT: 'PASSPORT',
    ID_CARD: 'NATIONAL_ID',
    IDENTITY_CARD: 'NATIONAL_ID',
  };
  return docTypeMap[docType] || 'PASSPORT';
}

function getDefaultLanguage() {
  return 'E'; // English
}

function shouldUploadDocuments() {
  return true; // Set based on your configuration
}

async function updateProfileAPI(profileId, authorization, request) {
  const url = `${API_CONFIG.Ohip_baseURL}/crm/v1/profiles/${profileId}`;

  debugLog(
    '📤 Update Profile API Request:',
    JSON.stringify({
      method: 'PUT',
      url,
      headers: {
        'Content-Type': 'application/json',
        authorization: 'Bearer *****',
        'x-app-key': API_CONFIG.Ohip_appKey,
        'x-hotelid': API_CONFIG.Ohip_hotelId,
      },
      body: request,
    })
  );

  // DEMO short-circuit
  if (API_CONFIG?.HotelPms?.toUpperCase() === 'DEMO') {
    const payload = {
      status: 'success',
      message: 'Mock profile updated successfully',
      profileId,
      request,
    };
    const mockResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => payload,
      text: async () => JSON.stringify(payload),
    };
    debugLog(
      '🧪',
      'DEMO MODE RESPONSE:',
      JSON.stringify(await mockResponse.json(), null, 2)
    );
    return mockResponse;
  }

  try {
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        authorization,
        'x-app-key': API_CONFIG.Ohip_appKey,
        'x-hotelid': API_CONFIG.Ohip_hotelId,
      },
      body: JSON.stringify(request),
    });

    const responseData = await response.json();
    debugLog(
      '📥 Update Profile API Response:',
      JSON.stringify(responseData, null, 2)
    );

    return responseData;
  } catch (error) {
    debugLog(
      '🚨 Update Profile API Request Failed:',
      JSON.stringify({ error: error.message, stack: error.stack })
    );
    throw error;
  }
}

async function registerProfileAPI(authorization, request) {
  const url = `${API_CONFIG.Ohip_baseURL}/crm/v1/guests`;

  debugLog(
    '📤',
    'Register Profile API Request:',
    JSON.stringify({
      method: 'POST',
      url,
      headers: {
        'Content-Type': 'application/json',
        authorization: 'Bearer *****',
        'x-app-key': API_CONFIG.Ohip_appKey,
        'x-hotelid': API_CONFIG.Ohip_hotelId,
      },
      body: request,
    })
  );

  // DEMO short-circuit
  if (API_CONFIG?.HotelPms?.toUpperCase() === 'DEMO') {
    const payload = {
      status: 'success',
      message: 'Mock profile registered successfully',
      profileId,
      request,
    };
    const mockResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => payload,
      text: async () => JSON.stringify(payload),
    };
    debugLog(
      '🧪',
      'DEMO MODE RESPONSE:',
      JSON.stringify(await mockResponse.json(), null, 2)
    );
    return mockResponse;
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization,
        'x-app-key': API_CONFIG.Ohip_appKey,
        'x-hotelid': API_CONFIG.Ohip_hotelId,
      },
      body: JSON.stringify(request),
    });

    const responseData = await response.json();
    debugLog(
      '📥',
      'Register Profile API Response:',
      JSON.stringify(responseData, null, 2)
    );

    return responseData;
  } catch (error) {
    debugLog(
      '🚨',
      'Register Profile API Request Failed:',
      JSON.stringify({ error: error.message, stack: error.stack })
    );
    throw error;
  }
}

async function addAccompanyGuest(
  authorization,
  guestProfiles,
  originalReservation
) {
  try {
    debugLog(
      '🔗',
      `Attempting to update guest list for Reservation: ${originalReservation.reservationIdList[0].id}`
    );

    // Build the PUT reservation request payload
    const request = {
      reservations: [
        {
          reservationIdList: [
            {
              id: originalReservation.reservationIdList[0].id,
              type: 'Reservation',
            },
          ],
          reservationGuests: [],
          eCoupons: null,
        },
      ],
    };

    const reservationGuests = [];
    const uniqueProfileIds = new Set();

    // Add primary guest first
    const primaryGuest = {
      profileInfo: {
        profileIdList: [
          {
            id: originalReservation.reservationGuest.id,
            type: 'Profile',
          },
        ],
      },
      primary: true,
    };
    reservationGuests.push(primaryGuest);
    uniqueProfileIds.add(originalReservation.reservationGuest.id);

    // Add companion guests (skip the first one since it's the primary)
    for (let i = 1; i < guestProfiles.length; i++) {
      const companion = guestProfiles[i];
      const extReference = companion.id;

      if (extReference && !uniqueProfileIds.has(extReference)) {
        const additionalGuest = {
          profileInfo: {
            profileIdList: [
              {
                id: extReference,
                type: 'Profile',
              },
            ],
          },
          primary: false,
        };
        reservationGuests.push(additionalGuest);
        uniqueProfileIds.add(extReference);
      }
    }

    // Set the reservation guests
    request.reservations[0].reservationGuests = reservationGuests;

    // API endpoint for updating reservation
    const updateUrl =
      API_CONFIG.Ohip_baseURL +
      `/rsv/v1/hotels/${API_CONFIG.Ohip_hotelId}/reservations/${originalReservation.reservationIdList[0].id}`;

    debugLog(
      '📤',
      'Update Reservation API Request:',
      JSON.stringify({
        method: 'PUT',
        url: updateUrl,
        headers: {
          'Content-Type': 'application/json',
          authorization: 'Bearer *****', // Masked for logging
          'x-app-key': API_CONFIG.Ohip_appKey,
          'x-hotelid': API_CONFIG.Ohip_hotelId,
        },
        body: request,
      })
    );

    const response = await fetch(updateUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        authorization: authorization,
        'x-app-key': API_CONFIG.Ohip_appKey,
        'x-hotelid': API_CONFIG.Ohip_hotelId,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      let errorText = '';
      try {
        errorText = JSON.stringify(await response.json());
      } catch (e) {
        errorText = 'Unable to parse error response';
      }
      debugLog(
        '🚨',
        `Update reservation failed: ${response.status} ${response.statusText} - ${errorText}`
      );
      throw new Error(
        `Failed to update reservation guest list: ${response.status} ${response.statusText} - ${errorText}`
      );
    } else {
      alert('Guest list successfully updated');
    }

    const result = await response.json();

    debugLog(
      '✅',
      `Guest list successfully updated for Reservation: ${originalReservation.reservationIdList[0].id}`
    );
    if (result.OK) return result;
  } catch (error) {
    debugLog('🚨', 'Error in addAccompanyGuest:', error);
    throw error;
  }
}

async function createShareResvAPI(authorization, request) {
  const url = `${API_CONFIG.Ohip_baseURL}/rsv/v1/hotels/${API_CONFIG.Ohip_hotelId}/reservations`;

  debugLog(
    '📤',
    'Create Share Reservation API Request:',
    JSON.stringify({
      method: 'POST',
      url,
      headers: {
        'Content-Type': 'application/json',
        authorization: 'Bearer *****',
        'x-app-key': API_CONFIG.Ohip_appKey,
        'x-hotelid': API_CONFIG.Ohip_hotelId,
      },
      body: request,
    })
  );

  // DEMO short-circuit
  if (API_CONFIG?.HotelPms?.toUpperCase() === 'DEMO') {
    const payload = {
      status: 'success',
      message: 'Mock share reservation created successfully',
      reservationId: 'MOCK-RESV-123',
      request,
    };
    const mockResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => payload,
      text: async () => JSON.stringify(payload),
    };
    debugLog(
      '🧪',
      'DEMO MODE RESPONSE:',
      JSON.stringify(await mockResponse.json(), null, 2)
    );
    return mockResponse;
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization,
        'x-app-key': API_CONFIG.Ohip_appKey,
        'x-hotelid': API_CONFIG.Ohip_hotelId,
      },
      body: JSON.stringify(request),
    });

    const responseData = await response.json();
    return responseData;
  } catch (error) {
    debugLog(
      '🚨 Create Share Reservation API Request Failed:',
      JSON.stringify({ error: error.message, stack: error.stack })
    );
    throw error;
  }
}

async function combineShareReservation(
  authorization,
  guestProfiles,
  originalReservation
) {
  debugLog(
    '🔗',
    `Attempting to share guest for Reservation: ${originalReservation.reservationIdList[0].id}`
  );
  const basicReservation = originalReservation.reservationIdList[0];
  const reservationId = basicReservation.id;

  const originalPaymentMethod = originalReservation.paymentMethod;

  const url = `${API_CONFIG.Ohip_baseURL}/rsv/v1/hotels/${API_CONFIG.Ohip_hotelId}/reservations/${reservationId}/shares`;

  const companion = guestProfiles[1];
  const extReference = companion.id;
  const request = {
    criteria: {
      hotelId: API_CONFIG.Ohip_hotelId,
      combineShareInstruction: {
        overrideMaxOccupancyCheck: true,
        distributionType: 'Entire',
      },
      newReservations: [
        {
          newSharerId: {
            id: extReference,
            type: 'Profile',
          },
          guestCounts: {
            adults: 1,
            children: 0,
          },
          timeSpan: {
            startDate: originalReservation.roomStay.arrivalDate,
            endDate: originalReservation.roomStay.departureDate,
          },
          reservationPaymentMethod: {
            paymentMethod: originalPaymentMethod,
          },
        },
      ],
    },
  };

  debugLog(
    '📤',
    'Combine Share Reservation API Request:',
    JSON.stringify({
      method: 'POST',
      url,
      headers: {
        'Content-Type': 'application/json',
        authorization: 'Bearer *****',
        'x-app-key': API_CONFIG.Ohip_appKey,
        'x-hotelid': API_CONFIG.Ohip_hotelId,
      },
      body: request,
    })
  );

  // DEMO short-circuit
  if (API_CONFIG?.HotelPms?.toUpperCase() === 'DEMO') {
    const payload = {
      status: 'success',
      message: 'Mock share reservations combined successfully',
      existingReservationId,
      shareToReservationId,
      request,
    };
    const mockResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => payload,
      text: async () => JSON.stringify(payload),
    };
    debugLog(
      '🧪',
      'DEMO MODE RESPONSE:',
      JSON.stringify(await mockResponse.json(), null, 2)
    );
    return mockResponse;
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization,
        'x-app-key': API_CONFIG.Ohip_appKey,
        'x-hotelid': API_CONFIG.Ohip_hotelId,
      },
      body: JSON.stringify(request),
    });

    const responseData = await response.json();
    debugLog(
      '🧪',
      'Combine Share Reservation Response:',
      JSON.stringify(responseData, null, 2)
    );
    return {
      ...response,
      json: async () => responseData,
      text: async () => JSON.stringify(responseData),
    };
  } catch (error) {
    debugLog(
      '🚨 Combine Share Reservation API Request Failed:',
      JSON.stringify({ error: error.message, stack: error.stack })
    );
    throw error;
  }
}

// Show loading overlay
function showLoading(message = 'Loading...') {
  // debugLog('⏳', 'Showing loading:', message);
  const overlay = document.getElementById('loadingOverlay');
  const text = document.getElementById('loadingText');
  if (overlay && text) {
    text.textContent = message;
    overlay.style.display = 'flex';
  }
}

// Hide loading overlay
function hideLoading() {
  // debugLog('✅', 'Hiding loading overlay');
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', init);

// Handle window errors
window.addEventListener('error', (event) => {
  debugLog('🚨', 'Window error:', event.error);
});

window.addEventListener('beforeunload', () => {
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
  }
});

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
  debugLog('🚨', 'Unhandled promise rejection:', event.reason);
});

// Example lastName lookup handler
async function handleLastNameLookup(lastName) {
  debugLog('🔍', 'Looking up by last name:', lastName);
  showLoading(`Searching for ${lastName}...`);

  try {
    // Implement your last name lookup logic here
    const results = await searchByLastName(lastName);

    if (results.length > 0) {
      // Show results in UI
      displaySearchResults(results);
    } else {
      alert(`No reservations found for ${lastName}`);
    }
  } catch (error) {
    debugLog('🚨', 'Last name search error:', error);
    alert('Search name error');
  } finally {
    hideLoading();
  }
}

function showOcrPopup() {
  elements.ocrPopup.classList.add('active');
  elements.reservationNumber.value = '';
  elements.editReservationNumber.disabled = true;
  elements.ocrStatus.innerHTML =
    '<div class="spinner-small"></div><span>Processing image...</span>';
}

function closeOcrPopup() {
  elements.ocrPopup.classList.remove('active');
}

function showApiPopup() {
  elements.apiPopup.classList.add('active');
  elements.finalReservationNumber.value = extractedReservationNumber;
  elements.apiStatus.innerHTML =
    '<div class="spinner-small"></div><span>Fetching reservation data...</span>';
  elements.retryApi.style.display = 'none';

  console.log(elements.apiPopup);
}

function closeApiPopup() {
  elements.apiPopup.classList.remove('active');
}

function editReservationNumber() {
  extractedReservationNumber = elements.reservationNumber.value;

  if (!extractedReservationNumber.trim()) {
    alert('Please enter a confirmation number');
    elements.reservationNumber.focus();
    return;
  }

  closeOcrPopup();

  // Update final reservation number and show API popup
  elements.finalReservationNumber.value = extractedReservationNumber;
  showApiPopup();

  // Start API call
  callReservationApi();
}

function simulateDelay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function startCamera() {
  showLoading('Starting camera...');

  // Clear any document scan related data
  if (typeof documentScanData !== 'undefined') {
    documentScanData = null;
  }
  if (typeof scannedDocumentImage !== 'undefined') {
    scannedDocumentImage = null;
  }

  // Reset main capture UI elements
  if (elements?.capturedImage) {
    elements.capturedImage.src = '';
    elements.capturedImage.style.display = 'none';
  }

  if (elements?.capturedDocument) {
    elements.capturedDocument.src = '';
    elements.documentPreview.style.display = 'none';
    elements.processDocBtn.style.display = 'none';
  }

  if (elements?.capturePreview) {
    const placeholder = elements.capturePreview.querySelector('.placeholder');
    if (placeholder) {
      placeholder.style.display = 'block';
    }
  }

  // If camera is already running, stop it first
  if (cameraStream) {
    stopCamera();
    return setTimeout(startCamera, 1000);
  }

  // Demo mode simulation for VM testing
  // if (API_CONFIG?.HotelPms?.toUpperCase() === 'DEMO') {
  //   simulateCamera();
  //   return;
  // }

  // Check if getUserMedia is supported
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    hideLoading();
    showError('Camera not supported on this device/browser');
    return;
  }

  navigator.mediaDevices
    .getUserMedia({
      video: {
        facingMode: 'environment',
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    })
    .then((stream) => {
      // Check if stream has video tracks
      if (!stream.getVideoTracks().length) {
        throw new Error('No video tracks available');
      }

      cameraStream = stream;
      elements.cameraVideo.srcObject = stream;

      // Wait for video to load before showing UI
      elements.cameraVideo.onloadedmetadata = () => {
        elements.cameraContainer.style.display = 'block';
        // elements.selectedDocType.textContent = selectedDocumentType.replace(
        //   '-',
        //   ' '
        // );
        elements.captureDocBtn.style.display = 'inline-flex';
        hideLoading();
      };

      // Handle video loading errors
      elements.cameraVideo.onerror = () => {
        console.log('Video element failed to load stream');
      };
    })
    .catch((err) => {
      hideLoading();
      handleCameraError(err);
    });
}

function simulateCamera() {
  console.log('DEMO MODE: Simulating camera for VM testing');

  // Create a canvas to simulate camera feed
  const canvas = document.createElement('canvas');
  canvas.width = 1920;
  canvas.height = 1080;
  const ctx = canvas.getContext('2d');

  // Create animated background to simulate live camera
  let frame = 0;
  function drawSimulatedFeed() {
    // Clear canvas
    ctx.fillStyle = '#2c3e50';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Add some animated elements to show it's "live"
    const time = Date.now() * 0.001;

    // Animated gradient background
    const gradient = ctx.createLinearGradient(
      0,
      0,
      canvas.width,
      canvas.height
    );
    gradient.addColorStop(0, `hsl(${(time * 10) % 360}, 50%, 20%)`);
    gradient.addColorStop(1, `hsl(${(time * 15 + 180) % 360}, 50%, 15%)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Add document simulation overlay
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fillRect(
      canvas.width * 0.1,
      canvas.height * 0.2,
      canvas.width * 0.8,
      canvas.height * 0.6
    );

    // Add text to simulate document
    ctx.fillStyle = '#333';
    ctx.font = '48px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(
      'SIMULATED DOCUMENT',
      canvas.width / 2,
      canvas.height / 2 - 100
    );
    ctx.fillText(
      selectedDocumentType.replace('-', ' ').toUpperCase(),
      canvas.width / 2,
      canvas.height / 2 - 20
    );

    // Add timestamp to show it's live
    ctx.font = '24px monospace';
    ctx.fillText(
      `Live Feed: ${new Date().toLocaleTimeString()}`,
      canvas.width / 2,
      canvas.height / 2 + 60
    );

    // Add moving elements to simulate camera movement
    ctx.fillStyle = `rgba(255, 255, 255, ${0.3 + 0.2 * Math.sin(time * 2)})`;
    ctx.fillRect(
      canvas.width * 0.05 + 20 * Math.sin(time),
      canvas.height * 0.05 + 10 * Math.cos(time * 1.5),
      100,
      100
    );

    frame++;
  }

  // Start animation
  const animationInterval = setInterval(drawSimulatedFeed, 100); // 10 FPS

  // Convert canvas to video stream
  const stream = canvas.captureStream(10); // 10 FPS
  cameraStream = stream;

  // Store interval reference for cleanup
  cameraStream.animationInterval = animationInterval;

  // Set up video element
  elements.cameraVideo.srcObject = stream;

  // Simulate loading time
  setTimeout(() => {
    elements.cameraContainer.style.display = 'block';
    // elements.selectedDocType.textContent = selectedDocumentType.replace(
    //   '-',
    //   ' '
    // );
    elements.captureDocBtn.style.display = 'inline-flex';
    hideLoading();

    console.log('DEMO MODE: Simulated camera started successfully');
  }, 1000);
}

function stopCamera() {
  if (cameraStream) {
    // Stop animation interval if it exists (for demo mode)
    if (cameraStream.animationInterval) {
      clearInterval(cameraStream.animationInterval);
    }

    // Stop all tracks
    cameraStream.getTracks().forEach((track) => {
      track.stop();
    });
    cameraStream = null;
  }

  // Clear video source
  if (elements.cameraVideo) {
    elements.cameraVideo.srcObject = null;
    elements.cameraVideo.src = '';
  }

  // Hide camera UI
  elements.cameraContainer.style.display = 'none';
  elements.captureDocBtn.style.display = 'none';
  // elements.stopCameraBtn.style.display = 'none';
  // elements.startCameraBtn.style.display = 'inline-flex';
}

function handleCameraError(error) {
  debugLog('🚨', 'Camera error:', error);

  // Clean up any existing stream
  if (cameraStream) {
    stopCamera();
  }

  let errorMessage = 'Camera error occurred';

  // Handle specific error types
  if (
    error.name === 'NotAllowedError' ||
    error.name === 'PermissionDeniedError'
  ) {
    errorMessage =
      'Camera permission denied. Please allow camera access and try again.';
  } else if (
    error.name === 'NotFoundError' ||
    error.name === 'DevicesNotFoundError'
  ) {
    errorMessage = 'No camera found on this device.';
  } else if (
    error.name === 'NotReadableError' ||
    error.name === 'TrackStartError'
  ) {
    errorMessage =
      'Camera is being used by another application. Please close other apps and try again.';
  } else if (
    error.name === 'OverconstrainedError' ||
    error.name === 'ConstraintNotSatisfiedError'
  ) {
    errorMessage =
      'Camera does not support the requested settings. Trying with basic settings...';
    retryWithBasicConstraints();
    return;
  } else if (error.name === 'NotSupportedError') {
    errorMessage = 'Camera not supported on this browser.';
  } else if (error.message === 'No video tracks available') {
    errorMessage =
      'Camera stream has no video. Please check your camera connection.';
  }

  showError(errorMessage);
}

function retryWithBasicConstraints() {
  showLoading('Retrying with basic camera settings...');

  navigator.mediaDevices
    .getUserMedia({ video: true })
    .then((stream) => {
      if (!stream.getVideoTracks().length) {
        throw new Error('No video tracks available');
      }

      cameraStream = stream;
      elements.cameraVideo.srcObject = stream;

      elements.cameraVideo.onloadedmetadata = () => {
        elements.cameraContainer.style.display = 'block';
        // elements.selectedDocType.textContent = selectedDocumentType.replace(
        //   '-',
        //   ' '
        // );
        elements.captureDocBtn.style.display = 'inline-flex';
        hideLoading();
      };
    })
    .catch((err) => {
      hideLoading();
      showError(
        'Unable to access camera even with basic settings: ' + err.message
      );
    });
}

async function processAllGuestsAndCompanions() {
  debugLog(
    '🔄',
    'Processing all guests and companions: ',
    JSON.stringify(companions.length, null, 2) // Truncate images before logging
  );
  showLoading('Processing guest information...');

  try {
    if (API_CONFIG?.HotelPms?.toUpperCase() == 'DEMO') {
      // for (let i = 0; i < companions.length; i++) {
      // const companion = companions[i];

      // Here you would call your API to process each companion
      await saveAllCompanions(companions, selectedReservation);
      // }
    } else {
      // Process companions via API
      // for (let i = 0; i < companions.length; i++) {
      //   const companion = companions[i];
      //   debugLog(
      //     '👥',
      //     `Processing ${companion.type} ${i + 1}:`,
      //     companion.extractedData.given_name,
      //     companion.extractedData.surname
      //   );

      // Here you would call your API to process each companion
      await saveAllCompanions(companions, selectedReservation);
      // }

      // alert(
      //   `Process completed successfully!\nMain Guest + ${companions.length} ${
      //     companions.length === 1 ? 'companion' : 'companions'
      //   } processed.`
      // );
    }
  } catch (error) {
    debugLog('🚨', 'Error processing companions:', error);
    // alert('Failed to process all guest information');
    throw error;
  }
}

function truncateCompanionImages(companions) {
  return companions.map((companion) => {
    const truncatedCompanion = { ...companion };
    if (
      truncatedCompanion &&
      truncatedCompanion.extractedData &&
      Array.isArray(truncatedCompanion.extractedData.documents) &&
      truncatedCompanion.extractedData.documents.length > 0 &&
      truncatedCompanion.extractedData.documents[0] &&
      typeof truncatedCompanion.extractedData.documents[0].docFile === 'string'
    ) {
      truncatedCompanion.extractedData.documents[0].docFile = truncateBase64(
        truncatedCompanion.extractedData.documents[0].docFile
      );
    }
    return truncatedCompanion;
  });
}

function startCompanionScan() {
  debugLog('👥', 'Starting companion scan');
  isCompanionScan = true;
  currentCompanionIndex = companions.length;

  // Close the companion popup first
  closeCompanionPopup();

  // Reset document type selection
  elements.documentTypeCards.forEach((c) => c.classList.remove('selected'));
  selectedDocumentType = 'Passport'; // Default
  elements.proceedToScan.disabled = true;

  showStep(3); // Go to document type selection
}

function startShareScan() {
  if (selectedReservation.sharedGuests.length > 0) {
    debugLog(
      '📡',
      `Shared guest Exists: ${JSON.stringify(selectedReservation.sharedGuests)}`
    );
    alert(
      `Cannot add sharer. Shared guest already exists: ${JSON.stringify(
        selectedReservation.sharedGuests[0].firstName
      )}`
    );
    return;
  }

  debugLog('🤝', 'Starting share scan');
  isCompanionScan = true;
  currentCompanionIndex = companions.length;

  // Close the companion popup first
  closeCompanionPopup();

  // Reset document type selection
  // elements.documentTypeCards.forEach((c) => c.classList.remove('selected'));
  selectedDocumentType = 'Passport'; // Default
  elements.proceedToScan.disabled = true;

  showStep(3); // Go to document type selection
}

function showCompanionDataPopup(data, companionIndex) {
  // Similar to showDocumentDataPopup but for companions
  const overlay =
    document.getElementById('companionDataPopup') || createCompanionDataPopup();
  const tableBody = document.getElementById('companionDataTableBody');

  // Update popup title
  const popupTitle = overlay.querySelector('.popup-title');
  if (popupTitle) {
    const companionType =
      companions[companionIndex]?.type === 'share'
        ? 'Shared Guest'
        : 'Companion';
    popupTitle.textContent = `${companionType} ${
      companionIndex + 1
    } Information`;
  }

  // Clear existing rows
  tableBody.innerHTML = '';

  const relevantFields = [
    'surname',
    'given_name',
    'document_number',
    'birth_date',
    'sex',
    'expiry_date',
    'nationality_code',
  ];

  // Filter to only include relevant fields
  const filteredData = Object.fromEntries(
    Object.entries(data).filter(([key]) => relevantFields.includes(key))
  );

  // Add data rows (similar to main document popup)
  for (const [field, value] of Object.entries(filteredData)) {
    const row = document.createElement('tr');
    row.className = 'docdata-table-row';
    row.innerHTML = `
      <td class="docdata-field-cell">${formatFieldName(field)}</td>
      <td class="docdata-value-cell">
        <input type="text" class="docdata-input-field" 
               data-field="${field}" data-companion-index="${companionIndex}"
               value="${value || ''}" placeholder="Enter value...">
      </td>
      <td class="docdata-actions-cell">
        <div class="docdata-action-buttons">
          <button class="docdata-edit-btn" title="Edit field">
            <svg viewBox="0 0 24 24" width="16" height="16">
              <path fill="currentColor" d="M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z"/>
            </svg>
          </button>
          <button class="docdata-clear-btn" title="Clear field">
            <svg viewBox="0 0 24 24" width="16" height="16">
              <path fill="currentColor" d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/>
            </svg>
          </button>
        </div>
      </td>
    `;
    tableBody.appendChild(row);
  }

  // Show the popup
  overlay.classList.add('active');
}

function createCompanionDataPopup() {
  const popup = document.createElement('div');
  popup.id = 'companionDataPopup';
  popup.className = 'docdata-popup-overlay';
  popup.innerHTML = `
    <div class="docdata-popup-content">
      <div class="docdata-popup-header">
        <h3 class="popup-title">Companion Information</h3>
        <button id="cancelCompanionData" class="docdata-close-btn">&times;</button>
      </div>
      <div class="docdata-popup-body">
        <div class="docdata-table-container">
          <table class="docdata-table">
            <thead>
              <tr>
                <th>Field</th>
                <th>Value</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="companionDataTableBody">
            </tbody>
          </table>
        </div>
      </div>
      <div class="docdata-popup-footer">
        <button id="cancelCompanionData2" class="docdata-cancel-btn">Cancel</button>
        <button id="saveCompanionData" class="docdata-save-btn">Save Companion</button>
      </div>
    </div>
  `;

  document.body.appendChild(popup);

  // Add event listeners
  document
    .getElementById('cancelCompanionData')
    .addEventListener('click', closeCompanionDataPopup);
  document
    .getElementById('cancelCompanionData2')
    .addEventListener('click', closeCompanionDataPopup);
  document
    .getElementById('saveCompanionData')
    .addEventListener('click', saveCompanionData);

  return popup;
}

// New function to update the companion list display
function updateCompanionList() {
  const companionListContainer = document.getElementById('companionList');

  if (!companionListContainer) {
    // Create companion list container if it doesn't exist
    createCompanionListContainer();
    return updateCompanionList();
  }

  // Clear existing list
  companionListContainer.innerHTML = '';

  if (companions.length === 0) {
    companionListContainer.innerHTML = `
      <div class="no-companions">
        <p>No companions added yet</p>
      </div>
    `;
    return;
  }

  // Create list header
  const listHeader = document.createElement('div');
  listHeader.className = 'companion-list-header';
  listHeader.innerHTML = `
    <h4>Added Companions (${companions.length})</h4>
  `;
  companionListContainer.appendChild(listHeader);

  // debugLog('👥', `Companions added: ${JSON.stringify(companions)}`);

  // Create companion items
  companions.forEach((companion, index) => {
    const surname = companion.extractedData?.lastName || 'Unknown';
    const givenName = companion.extractedData?.firstName || 'Unknown';
    const companionType =
      companion.type === 'share' ? 'Shared Guest' : 'Companion';

    const companionItem = document.createElement('div');
    companionItem.className = 'companion-item';
    companionItem.innerHTML = `
      <div class="companion-info">
        <div class="companion-name">${surname}, ${givenName}</div>
        <div class="companion-type">${companionType}</div>
      </div>
      <button class="companion-delete-btn" data-companion-index="${index}" title="Remove companion">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3,6 5,6 21,6"></polyline>
          <path d="M19,6V20a2,2 0 0,1-2,2H7a2,2 0 0,1-2-2V6M8,6V4a2,2 0 0,1,2-2h4a2,2 0 0,1,2,2V6"></path>
          <line x1="10" y1="11" x2="10" y2="17"></line>
          <line x1="14" y1="11" x2="14" y2="17"></line>
        </svg>
      </button>
    `;

    // Add delete event listener
    const deleteBtn = companionItem.querySelector('.companion-delete-btn');
    deleteBtn.addEventListener('click', (e) => {
      e.preventDefault();
      removeCompanion(index);
    });

    companionListContainer.appendChild(companionItem);
  });
}

// New function to create companion list container in the popup
function createCompanionListContainer() {
  const companionPopup = document.getElementById('companionPopup');
  const popupBody = companionPopup.querySelector('.popup-body');

  // Add companion list container after the companion-section
  const companionSection = popupBody.querySelector('.companion-section');

  const listContainer = document.createElement('div');
  listContainer.id = 'companionList';
  listContainer.className = 'companion-list-container';

  // Insert after companion section
  companionSection.parentNode.insertBefore(
    listContainer,
    companionSection.nextSibling
  );
}

// New function to remove a companion
function removeCompanion(index) {
  debugLog('👥', `Removing companion at index ${index}`);

  if (index >= 0 && index < companions.length) {
    const companion = companions[index];
    const name = `${companion.extractedData?.surname || 'Unknown'}, ${
      companion.extractedData?.given_name || 'Unknown'
    }`;

    if (confirm(`Are you sure you want to remove companion: ${name}?`)) {
      companions.splice(index, 1);
      updateCompanionList(); // Refresh the list
      debugLog(
        '✅',
        `Companion removed. Remaining companions: ${companions.length}`
      );
    }
  }
}

// New function to save companion data from individual popup
function saveCompanionData() {
  const inputs = document.querySelectorAll(
    '#companionDataPopup input[data-companion-index]'
  );

  if (inputs.length === 0) {
    debugLog('🚨', 'No companion data inputs found');
    return;
  }

  const companionIndex = inputs[0].dataset.companionIndex;
  const updatedData = {};

  inputs.forEach((input) => {
    updatedData[input.dataset.field] = input.value;
  });

  // Update the companion data
  if (companions[companionIndex]) {
    companions[companionIndex].extractedData = {
      ...companions[companionIndex].extractedData,
      ...updatedData,
    };

    debugLog(
      '✅',
      `Companion ${parseInt(companionIndex) + 1} data updated:`,
      updatedData
    );
  }

  // Close individual companion popup and show management popup
  closeCompanionDataPopup();
  showCompanionManagement();
}

// New function to close individual companion data popup
function closeCompanionDataPopup() {
  const popup = document.getElementById('companionDataPopup');
  if (popup) {
    popup.classList.remove('active');
  }
}

async function saveAllCompanions(companions, selectedReservation) {
  debugLog('💾', `Saving ${companions?.length || 0} companions`);

  // Validate companions parameter
  if (!Array.isArray(companions)) {
    debugLog('🚨', 'Error: companions is not an array', typeof companions);
    alert('Error: Invalid companion data format');
    return;
  }

  // If there are no companions, end the process
  if (companions.length === 0) {
    debugLog('ℹ️', 'No companions to save');
    closeCompanionPopup();
    handleComplete();
    return;
  }

  try {
    debugLog('📡', 'Sending companion data to API...');
    if (API_CONFIG.AddAccompany) {
      await addCompanionsToAPI(companions, selectedReservation);
    } else if (API_CONFIG.AddShare) {
      await shareCompanionsToAPI(companions, selectedReservation);
    }
    // alert(`${companions.length} companion(s) saved successfully!`);
  } catch (error) {
    debugLog('🚨', 'Error saving companions:', error);
    alert('Failed to save companions: ' + (error?.message || 'Unknown error'));
    return;
  }
}

async function createGuestProfiles(
  companionData,
  originalReservation,
  authorization
) {
  const guestProfiles = [];

  for (let i = 0; i < companionData.length; i++) {
    const companion = companionData[i];

    let birthDate = companion.extractedData?.birthDate || '';
    let nationality = companion.extractedData?.nationality || '';

    const identifications = {
      identificationInfo: [],
    };

    // Process companion documents
    if (
      companion.extractedData.documents &&
      companion.extractedData.documents.length > 0
    ) {
      companion.extractedData.documents.forEach((doc) => {
        identifications.identificationInfo.push({
          identification: {
            idNumber: doc.docNumber,
            idType: convertDocType(doc.docType),
            expirationDate: doc.expiryDate,
            issuedCountry: convertCountryCode(doc.issueCountry),
            issueDate: doc.issueDate,
            registeredProperty: API_CONFIG.Ohip_hotelId,
            orderSequence: 1,
            primaryInd: true,
          },
        });
      });
    }

    // Build personName array
    const personName = [
      {
        nameType: 'PRIMARY',
        givenName: companion.extractedData?.firstName || '',
        surname: companion.extractedData?.lastName || '',
      },
    ];

    debugLog(
      '📡',
      `Creating guest profile for:`,
      personName[0]?.givenName || 'Unknown',
      personName[0]?.surname || ''
    );

    // Build Guest Profile payload
    const guestProfileBody = {
      guestDetails: {
        customer: {
          personName,
          language: 'E',
          nationality,
          nationalityDescription: nationality,
          privateProfile: false,
          gender: companion.extractedData?.gender || '',
          birthDate,
          identifications,
        },
        profileType: 'GUEST',
        statusCode: 'ACTIVE',
        registeredProperty: originalReservation?.hotelId,
        markForHistory: false,
      },
    };

    try {
      const response = await registerProfileAPI(
        authorization,
        guestProfileBody
      );

      let result;
      if (
        response &&
        typeof response === 'object' &&
        !response.ok &&
        !response.status
      ) {
        result = response; // Already parsed
      } else {
        if (!response.ok) {
          let errorText = '';
          try {
            errorText = JSON.stringify(await response.json());
          } catch {
            errorText = 'Unable to parse error response';
          }
          debugLog(
            '🚨',
            `Register profile creation failed for companion ${i + 1}:`,
            errorText
          );
          throw new Error(
            `API request failed for companion ${i + 1}: ${response.status} ${
              response.statusText
            } - ${errorText}`
          );
        }
        result = await response.json();
      }

      const profileId = result?.links?.[0]?.href?.split('/').pop() || null;
      const newGuest = { id: profileId, ...companion.extractedData };

      debugLog(
        '✅',
        'Successfully created guest profile:',
        JSON.stringify(newGuest.id)
      );

      if (shouldUploadDocuments()) {
        await processDocumentUploads(newGuest, companion.extractedData);
      }

      guestProfiles.push(newGuest);

      await new Promise((resolve) => setTimeout(resolve, 100)); // avoid rate limiting
    } catch (error) {
      debugLog('🚨', 'Failed to create share reservation:', error);
      continue; // Continue with next companion
    }
  }

  return guestProfiles;
}

async function addCompanionsToAPI(companionData, originalReservation) {
  try {
    debugLog(
      '📡',
      `Registering ${companionData.length} profiles to reservations`
    );

    // debugLog('📡', 'Original reservation ID:', JSON.stringify(companionData));

    if (!originalReservation) {
      throw new Error('No reservation data found in selectedReservation');
    }

    // Get authorization once at the beginning
    const authorization = await getAuthorization();

    const guestProfiles = [originalReservation.profileInfo];
    const newGuestProfiles = await createGuestProfiles(
      companionData,
      originalReservation,
      authorization
    );
    guestProfiles.push(...newGuestProfiles);

    if (guestProfiles.length <= 1) {
      // Only original reservation exists
      throw new Error('No share reservations were created successfully');
    } else {
      // Now using the implemented addAccompanyGuest function
      await addAccompanyGuest(
        authorization,
        guestProfiles,
        originalReservation
      );
    }

    debugLog(
      '✅',
      `Successfully added ${
        guestProfiles.length - 1
      } companions to reservations` // Subtract 1 for original
    );

    alert('Successfully added companion reservations');

    handleComplete();

    return {
      success: true,
      createdReservations: guestProfiles,
      totalCreated: guestProfiles.length - 1, // Subtract 1 for original
      totalRequested: companionData.length,
    };
  } catch (error) {
    debugLog('🚨', 'Error in addCompanionsToAPI:', error);
    throw error;
  }
}

async function fetchDetailedReservation(reservationId, authorization) {
  try {
    debugLog('🔍', `Fetching detailed reservation for ID: ${reservationId}`);
    const url = `${API_CONFIG.Ohip_baseURL}/rsv/v1/hotels/${API_CONFIG.Ohip_hotelId}/reservations/${reservationId}?fetchInstructions=Reservation`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-hotelid': API_CONFIG.Ohip_hotelId,
        'x-app-key': API_CONFIG.Ohip_appKey,
        Authorization: authorization,
        operaEntId: API_CONFIG.Ohip_enterpriseId,
      },
    });

    if (!response.ok) {
      let errorText = '';
      try {
        errorText = JSON.stringify(await response.json());
      } catch (e) {
        errorText = 'Unable to parse error response';
      }
      debugLog('🚨', `Failed to fetch detailed reservation:`, errorText);
      throw new Error(
        `API request failed: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const detailedReservation = await response.json();
    debugLog(
      '✅',
      'Detailed reservation fetched:',
      JSON.stringify(detailedReservation, null, 2)
    );

    return detailedReservation;
  } catch (error) {
    debugLog('🚨', 'Error fetching detailed reservation:', error);
    throw error;
  }
}

// Updated shareCompanionsToAPI function to use the detailed reservation data
async function shareCompanionsToAPI(companionData, originalReservation) {
  try {
    debugLog(
      '📡',
      `Registering ${companionData.length} profiles to reservations`
    );

    // debugLog('📡', 'Original reservation ID:', JSON.stringify(companionData));

    if (!originalReservation) {
      throw new Error('No reservation data found in selectedReservation');
    }

    // Get authorization once at the beginning
    const authorization = await getAuthorization();
    const guestProfiles = [originalReservation.profileInfo];
    const newGuestProfiles = await createGuestProfiles(
      companionData,
      originalReservation,
      authorization
    );
    guestProfiles.push(...newGuestProfiles);

    if (guestProfiles.length <= 1) {
      // Only original reservation exists
      throw new Error('No guest were created successfully');
    } else {
      // Now using the implemented combineShareReservation function
      await combineShareReservation(
        authorization,
        guestProfiles,
        originalReservation
      );
    }

    const addedCount = guestProfiles.length - 1; // Subtract 1 for original

    debugLog(
      '✅',
      `Successfully created ${addedCount} shared reservation${
        addedCount !== 1 ? 's' : ''
      }`
    );

    alert(
      `Successfully created ${addedCount} shared reservation${
        addedCount !== 1 ? 's' : ''
      }`
    );

    handleComplete();

    return {
      success: true,
      createdReservations: guestProfiles,
      totalCreated: guestProfiles.length - 1, // Subtract 1 for original
      totalRequested: companionData.length,
    };
  } catch (error) {
    debugLog('🚨', 'Error in shareCompanionsToAPI:', error);
    throw error;
  }
}

// Fix: Helper function to safely decode base64
function safeBase64Decode(base64String) {
  try {
    // Remove data URL prefix if present
    const base64Data = base64String.replace(/^data:image\/[a-z]+;base64,/, '');

    // Validate base64 string
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    if (!base64Regex.test(base64Data)) {
      throw new Error('Invalid base64 format');
    }

    return atob(base64Data);
  } catch (error) {
    debugLog('🚨', 'Base64 decode error:', error);
    throw new Error('Failed to decode base64 document data');
  }
}

// Fix: Safe base64 to blob conversion
function base64ToBlob(base64Data, contentType = 'image/jpeg') {
  try {
    // Remove data URL prefix if present
    const cleanBase64 = base64Data.replace(/^data:image\/[a-z]+;base64,/, '');

    // Validate base64 format
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    if (!base64Regex.test(cleanBase64)) {
      throw new Error('Invalid base64 format');
    }

    // Add padding if needed
    const paddedBase64 =
      cleanBase64 + '='.repeat((4 - (cleanBase64.length % 4)) % 4);

    const byteCharacters = atob(paddedBase64);
    const byteNumbers = new Array(byteCharacters.length);

    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }

    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: contentType });
  } catch (error) {
    debugLog('🚨', 'Base64 to blob conversion error:', error);
    throw new Error('Failed to convert base64 to blob: ' + error.message);
  }
}

async function processDocumentUploads(originalGuest, guestData) {
  debugLog(
    '🔄',
    'Processing document uploads for guest:',
    originalGuest.firstName || originalGuest.givenName
  );

  // Check for documents in guestData (companion.extractedData)
  if (!guestData.documents || guestData.documents.length === 0) {
    debugLog(
      'ℹ️',
      'No documents to upload for guest:',
      originalGuest.firstName || originalGuest.givenName
    );
    return true;
  }

  const uploadPromises = guestData.documents.map(async (doc) => {
    if (doc.docFile) {
      try {
        // Use originalGuest properties for the filename since it has firstName/lastName
        const fileName = `${
          originalGuest.firstName || originalGuest.givenName
        }_${originalGuest.lastName || originalGuest.surname}`;

        const success = await postIdDocument(
          originalGuest.id,
          fileName,
          doc.docFile.replace(/^data:image\/\w+;base64,/, '')
        );
        return success;
      } catch (error) {
        debugLog('🚨', 'Failed to upload document:', error);
        return false;
      }
    }
    return true;
  });

  const results = await Promise.all(uploadPromises);
  return results.every((result) => result === true);
}

// Optional: Function to link share reservations (if your API supports it)
async function linkShareReservations(
  originalReservationId,
  shareReservationIds
) {
  // Some hotel systems have APIs to explicitly link share reservations
  // This would depend on your specific API capabilities
  debugLog(
    '🔗',
    `Linking share reservations to original ${originalReservationId}:`,
    shareReservationIds
  );

  // Implementation depends on your API's share linking capabilities
  // This might be a separate API call or part of the reservation update
}

function showError(message) {
  alert(message);
  debugLog('🚨', 'Camera error:', message);
}

function truncateBase64(base64String) {
  const maxLength = 100; // Max length for the displayed base64 string
  const truncated =
    base64String.length > maxLength
      ? base64String.slice(0, maxLength) + '...' + base64String.slice(-15)
      : base64String;
  return truncated;
}

window.addEventListener('beforeunload', () => {
  ipcRenderer.removeAllListeners('reset-app-state');
});

debugLog('📋', 'Renderer script loaded');
