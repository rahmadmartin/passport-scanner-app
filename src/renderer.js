const { ipcRenderer } = require('electron');
const configManager = require('./config-manager');
const axios = require('axios');
const { createInitialRendererState } = require('./renderer/app-state');
const { createDebugLogger } = require('./renderer/debug-log');
const { getRendererElements } = require('./renderer/dom-elements');
const {
  formatDateForInput,
  formatFieldName,
  isValidCountryCode,
  isValidDate,
  normalizeCountryCode,
  normalizeNationalityCode,
  sanitize,
  simulateDelay,
  toTitleCase,
  truncateBase64,
} = require('./renderer/formatters');
const {
  convertDocType,
  convertGender,
  getDefaultLanguage,
  mapMrzToGuest,
  shouldUploadDocuments,
} = require('./renderer/guest-mapper');
const { getFileExtension } = require('./renderer/file-utils');
const { demoReservations } = require('./renderer/demo-reservations');
const { createMrzScanner } = require('./renderer/mrz-scanner');
const {
  createOhipReservationClient,
} = require('./renderer/ohip-reservation-client');
const { createOhipProfileClient } = require('./renderer/ohip-profile-client');
const { createReservationRenderer } = require('./renderer/reservation-renderer');
const API_CONFIG = configManager.loadConfig();
const debugLog = createDebugLogger(ipcRenderer, console);
const elements = getRendererElements(document);
const initialState = createInitialRendererState();
const { createReservationElementFromApi } = createReservationRenderer({
  documentRef: document,
  onSelect: selectReservation,
});
const {
  getToken,
  getAuthorization,
  doFindReservation,
  findReservations,
} = createOhipReservationClient({
  config: API_CONFIG,
  axios,
  debugLog,
});
const {
  uploadFileWithAuth,
  updateProfileAPI,
  registerProfileAPI,
  addAccompanyGuest,
  createShareResvAPI,
  combineShareReservation,
} = createOhipProfileClient({
  config: API_CONFIG,
  debugLog,
  getAuthorization,
  fetchRef: fetch,
  alertRef: alert,
});

let capturedImageData = initialState.capturedImageData;
let cameraStream = initialState.cameraStream;
let selectedReservation = initialState.selectedReservation;
let selectedDocumentType = initialState.selectedDocumentType;
let base64Image = initialState.base64Image;
let extractedReservationNumber = initialState.extractedReservationNumber;
let isProcessingCapture = initialState.isProcessingCapture;
let currentStep = initialState.currentStep;
let currentCompanionIndex = initialState.currentCompanionIndex;
let companions = initialState.companions;
let isCompanionScan = initialState.isCompanionScan;

const mrzScanner = createMrzScanner({
  config: API_CONFIG,
  getSelectedDocumentType: () => selectedDocumentType,
  setBase64Image: (imageData) => {
    base64Image = imageData;
  },
  displayExtractedData,
  stopCamera: () => stopCamera(),
  documentRef: document,
  fetchRef: fetch,
  consoleRef: console,
});

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

if (typeof ipcRenderer !== 'undefined') {
  ipcRenderer.on('toggle-rtl', (event, isRtl) => {
    isRtlMode = isRtl;
    // document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
    updateControlsForRtl(isRtl);
  });
}

function updateControlsForRtl(isRtl) {
  const controls = document.querySelector('.controls-rtl'); // you renamed
  if (!controls) return;

  const leftControls = controls.querySelector('.controls-left');
  const rightControls = controls.querySelector('.controls-right');

  if (isRtl) {
    // Mirror layout: Capture (outermost left), then Process
    if (elements.captureDocBtn) {
      leftControls.insertBefore(
        elements.captureDocBtn,
        leftControls.firstChild,
      );
    }
    if (elements.processDocBtn) {
      // append AFTER capture, so order is [Capture, Process]
      leftControls.appendChild(elements.processDocBtn);
    }

    // Back button → right edge
    if (elements.backToDocType) {
      rightControls.innerHTML = ''; // clear any leftovers
      rightControls.appendChild(elements.backToDocType);
    }
  } else {
    // Restore LTR: Back → left, Process + Capture → right
    if (elements.backToDocType) {
      leftControls.innerHTML = '';
      leftControls.appendChild(elements.backToDocType);
    }

    if (rightControls) {
      rightControls.innerHTML = '';
      if (elements.processDocBtn) {
        rightControls.appendChild(elements.processDocBtn);
      }
      if (elements.captureDocBtn) {
        rightControls.appendChild(elements.captureDocBtn);
      }
    }
  }

  // Feedback animation
  controls.style.transform = 'scale(0.98)';
  setTimeout(() => (controls.style.transform = 'scale(1)'), 150);
}

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

  // const captureBtn = document.getElementById('captureDocBtn');
  // if (captureBtn) {
  //   captureBtn.addEventListener('mouseenter', () => {
  //     captureBtn.style.transform = 'translateY(-2px) scale(1.05)';
  //   });

  //   captureBtn.addEventListener('mouseleave', () => {
  //     captureBtn.style.transform = 'translateY(0) scale(1)';
  //   });

  //   captureBtn.addEventListener('mousedown', () => {
  //     captureBtn.style.transform = 'translateY(0) scale(0.98)';
  //   });

  //   captureBtn.addEventListener('mouseup', () => {
  //     captureBtn.style.transform = 'translateY(-2px) scale(1.05)';
  //   });
  // }

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
  elements.proceedToDocType.addEventListener('click', () => {
    selectDocumentType(elements.documentTypeCards[0]);
    showStep(3);
  });

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
    editReservationNumber,
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
      processAllGuestsAndCompanions,
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
          dataUrl.length,
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
            dataUrl,
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
      'Invalid image format. Please try capturing the screen again.',
    );
    return;
  }

  // Check for empty string or zero-length data
  if (typeof capturedImageData === 'string' && capturedImageData.length === 0) {
    debugLog('⚠️', 'Empty image data string');
    showUserFriendlyError(
      'No image data found. Please capture the screen again.',
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
      'The captured image is too large to process. Please try capturing a smaller area of the screen.',
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
        'Processing failed in demo mode. Please try again.',
      );
    }
  } else {
    try {
      debugLog('📤', 'Sending OCR request to main process');
      debugLog('📊', 'Image data type:', typeof capturedImageData);
      debugLog(
        '📏',
        'Image data length:',
        capturedImageData?.length || 'undefined',
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

      // debugLog('📥', 'OCR result received:', result);

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
          result.confidence || 'No confidence data',
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
          'finalReservationNumber',
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

  // console.log('Selected document type:', selectedDocumentType);

  // If companion scan, update the document type accordingly
  if (isCompanionScan) {
    selectedDocumentType = selectedDocumentType;
  }
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
      reservationNum ? `Reservation: ${reservationNum}` : `Name: ${lastName}`,
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
      false,
    );

    debugLog(
      '📥',
      'Reservations found:',
      JSON.stringify(response.totalResults),
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

// Update the showReservationResults function to work with your data structure
function showReservationResults(reservationData = null) {
  let reservations;

  if (API_CONFIG?.HotelPms?.toUpperCase() == 'DEMO') {
    const mockReservations = demoReservations;

    elements.reservationResults.innerHTML = '';

    mockReservations.forEach((reservation, index) => {
      const reservationElement = createReservationElementFromApi(
        reservation,
        index,
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
        reservations.length + ' items',
      );
    }

    elements.reservationResults.innerHTML = '';

    reservations.forEach((reservation, index) => {
      const reservationElement = createReservationElementFromApi(
        reservation,
        index,
      );
      elements.reservationResults.appendChild(reservationElement);
    });
  }

  showStep(2);
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
    reservation.reservationIdList?.[0]?.id,
  );
}

// Export functions if using modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    callReservationApi,
    findReservations,
    getToken,
    getAuthorization,
    debugLog,
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
      canvas.height,
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

    // debugLog('📐', 'Cropped image dimensions:', base64Image);

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

  // Improved logical order for hotel staff
  const relevantFields = [
    'surname',
    'given_name',
    'sex',
    'birth_date',
    'nationality_code',
    'document_number',
    'issuer_code',
    'expiry_date',
  ];

  // Filter and order the data
  const filteredData = relevantFields.reduce((acc, key) => {
    if (data[key] !== undefined) acc[key] = data[key];
    return acc;
  }, {});

  const dateFields = ['birth_date', 'expiry_date'];

  for (const [field, value] of Object.entries(filteredData)) {
    const row = document.createElement('tr');
    row.className = 'docdata-table-row';

    let inputHTML;

    if (dateFields.includes(field)) {
      inputHTML = `
        <input type="date" class="docdata-input-field"
               data-field="${field}"
               value="${formatDateForInput(value)}"
               placeholder="YYYY-MM-DD">
      `;
    } else if (field === 'sex') {
      const maleSelected = value === 'M' ? 'selected' : '';
      const femaleSelected = value === 'F' ? 'selected' : '';
      inputHTML = `
        <select class="docdata-input-field" data-field="${field}">
          <option value="">-- Select --</option>
          <option value="M" ${maleSelected}>Male</option>
          <option value="F" ${femaleSelected}>Female</option>
        </select>
      `;
    } else {
      inputHTML = `
        <input type="text" class="docdata-input-field"
               data-field="${field}" value="${value || ''}"
               placeholder="Enter value...">
      `;
    }

    row.innerHTML = `
      <td class="docdata-field-cell">${formatFieldName(field)}</td>
      <td class="docdata-value-cell">${inputHTML}</td>
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

  // Scope to overlay — fixes global selector bug
  // Fix cursor reset: restore position after uppercase, blur listener outside input handler
  overlay.querySelectorAll(
    '.docdata-input-field[data-field="nationality_code"], .docdata-input-field[data-field="issuer_code"]',
  ).forEach((input) => {
    input.addEventListener('input', () => {
      const cursor = input.selectionStart;
      const value = input.value.toUpperCase(); // no trim here, trim on blur only
      if (input.value !== value) {
        input.value = value;
        input.setSelectionRange(cursor, cursor); // restore cursor position
      }
      // Remove any old error
      const oldMsg = input.parentElement.querySelector('.input-error-msg');
      if (oldMsg) oldMsg.remove();
      input.style.borderColor = '';
    });

    // Blur listener outside input handler — fixes stacking bug
    input.addEventListener('blur', () => {
      input.value = input.value.trim().toUpperCase();
    });
  });

  // Scope edit buttons to overlay — fixes global selector bug
  overlay.querySelectorAll('.docdata-edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = btn
        .closest('.docdata-table-row')
        .querySelector('.docdata-input-field');
      input.focus();
      if (input.type === 'text')
        input.setSelectionRange(input.value.length, input.value.length);
    });
  });

  // Scope clear buttons to overlay — fixes global selector bug
  overlay.querySelectorAll('.docdata-clear-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = btn
        .closest('.docdata-table-row')
        .querySelector('.docdata-input-field');
      input.value = '';
      input.focus();
    });
  });

  // Close button — onclick overwrites itself safely, no stacking
  const closeBtn = document.getElementById('cancelDocumentData');
  if (closeBtn) {
    closeBtn.onclick = () => {
      overlay.classList.remove('active');
      _resetMrzAfterPopup();
    };
  }

  // Overlay click — remove previous listener before adding to prevent stacking
  if (overlay._overlayClickHandler) {
    overlay.removeEventListener('click', overlay._overlayClickHandler);
  }
  overlay._overlayClickHandler = (e) => {
    if (e.target === overlay) {
      overlay.classList.remove('active');
      _resetMrzAfterPopup();
    }
  };
  overlay.addEventListener('click', overlay._overlayClickHandler);

  // Show the popup
  overlay.classList.add('active');
}

function _resetMrzAfterPopup() {
  mrzScanner.resetAfterPopup(() => startCamera());
}

function closeDocumentDataPopup() {
  document.getElementById('documentDataPopup').classList.remove('active');
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
    `Companion controls initialized - AddAccompany: ${showAddCompanion}, AddShare: ${showAddShare}`,
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

// Extract document data from API (no changes needed to this function)
async function extractDocumentData(base64Image) {
  // debugLog('Starting document data extraction');
  // debugLog('Input base64Image length:', base64Image.length);

  if (API_CONFIG?.HotelPms === 'DEMO') {
    debugLog('⚠️', 'Demo mode - using simulated data');
    await simulateDelay(1500); // Simulate network delay
    const data = {
      mrz_type: 'TD3',
      document_code: 'P',
      issuer_code: 'ZZZ',
      surname: 'DOE',
      given_name: 'JOHN',
      document_number: 'X12345678',
      document_number_checkdigit: '7',
      nationality_code: 'XXX',
      birth_date: '1991-01-01', // YYMMDD
      birth_date_checkdigit: '3',
      sex: 'M',
      expiry_date: '2028-01-01', // YYMMDD
      expiry_date_checkdigit: '9',
      optional_data: '12345678901234',
      final_checkdigit: '2',
      mrz_text:
        'P<USADOE<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<<\nX12345678<9USA9001017M301231123456789012342',
      status: 'SUCCESS',
      status_message: 'Extracted 8/8 fields. No warnings',
      extraction_rate: 1.0,
      extracted_relevant_count: 8,
      total_relevant_fields: 8,
      checksum_failures: [],
    };
    displayExtractedData(data);
    return;
  }

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
      type: selectedDocumentType.toLowerCase(),
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
        `API request failed with status ${response.status}: ${response.statusText}`,
      );
    }

    // debugLog('Parsing response JSON');
    const data = await response.json();

    debugLog('🔍', 'Extracted document data:', JSON.stringify(data, null, 2));

    // Check if extraction failed
    if (data.status === 'FAILURE') {
      debugLog('🚨', 'Extraction error:', 'No MRZ detected');
      alert(
        '⚠️ Document Extraction Failed\n\n' +
          'No MRZ detected. Please:\n' +
          '• Ensure proper lighting\n' +
          '• Capture the full document\n' +
          '• Hold the camera steady\n\n',
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
    alert('Document extraction failed: ' + 'Failed to connect to MRZ service');
    throw error;
  } finally {
    hideLoading();
  }
}

// Updated displayExtractedData function to use popup
async function displayExtractedData(data) {
  // Normalize upfront (safe even if undefined/null)
  data.nationality_code = normalizeNationalityCode(data.nationality_code);
  data.issuer_code = normalizeNationalityCode(data.issuer_code);

  // Convert names to title case
  data.surname = toTitleCase(data.surname);
  data.given_name = toTitleCase(data.given_name);

  if (selectedDocumentType.toLowerCase() === 'passport') {
    showDocumentDataPopup(data);
  } else {
    if (shouldUploadDocuments()) {
      const originalGuest = selectedReservation.reservationGuest;

      const guestData = mapMrzToGuest({
        ...data,
        nationality_code: data.nationality_code,
        issuer_code: data.issuer_code,
      }, base64Image);

      const upload = await processDocumentUploads(originalGuest, guestData);
      if (upload) {
        alert('Document uploaded successfully');
        showCompanionManagement();
      }
    }
  }
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
      '.document-scan-container',
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
      'finalReservationNumber',
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
      '.document-scan-container canvas',
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
      '.docdata-popup-overlay input, .ocr-popup input, .api-popup input',
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
  // Scoped to documentDataPopup only — prevents picking up companion popup inputs
  const inputs = document.querySelectorAll(
    '#documentDataPopup input[data-field], #documentDataPopup select[data-field]',
  );
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

    input.style.borderColor = '';

    // Validate dates
    if (field === 'birth_date' || field === 'expiry_date') {
      if (!value || !isValidDate(value)) {
        valid = false;
        input.style.borderColor = 'red';
        const errorMsg = document.createElement('div');
        errorMsg.className = 'input-error-msg';
        errorMsg.style.color = 'red';
        errorMsg.style.fontSize = '12px';
        errorMsg.style.marginTop = '2px';
        errorMsg.textContent = 'Invalid date.';
        input.insertAdjacentElement('afterend', errorMsg);
      }
    }

    if (field === 'nationality_code' || field === 'issuer_code') {
      const isValid = validateCountryCode(field, value, input);
      if (!isValid) valid = false;
    }

    updatedData[field] = value;
  });

  if (!valid) {
    const firstInvalid = document.querySelector('.input-error-msg');
    if (firstInvalid) firstInvalid.previousElementSibling.focus();
    return;
  }

  debugLog('💾', 'Updated data:', JSON.stringify(updatedData, null, 2));

  const guestData = mapMrzToGuest(updatedData, base64Image);
  const reservationData = selectedReservation;

  if (API_CONFIG?.HotelPms?.toUpperCase() == 'DEMO') {
    try {
      alert('Guest profile updated successfully!');
      if (isCompanionScan) {
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
          guestData,
        );
        alert('Guest profile updated successfully!');
      }

      closeDocumentDataPopup();
      showCompanionManagement();
    } catch (error) {
      debugLog('🚨', 'Error updating guest profile:', error);
      alert(
        'Failed to update guest profile: ' +
          (error?.message || 'Unknown error'),
      );
    }
  }
}

function validateCountryCode(field, value, input) {
  input.style.borderColor = '';

  // Fix: search in the correct parent (the tr row, not the td)
  const oldMsg = input.closest('.docdata-table-row').querySelector('.input-error-msg');
  if (oldMsg) oldMsg.remove();

  const useIso2 =
    field === 'nationality_code'
      ? API_CONFIG?.UseIso2Nationality !== false
      : API_CONFIG?.UseIso2Country !== false;

  const { valid, normalized } = isValidCountryCode(value, useIso2);

  if (!valid) {
    input.style.borderColor = 'red';
    const msg = document.createElement('div');
    msg.className = 'input-error-msg';
    msg.style.color = 'red';
    msg.style.fontSize = '12px';
    msg.style.marginTop = '2px';
    msg.textContent = `Invalid ${formatFieldName(field)}. Use ${
      useIso2 ? 'ISO 2-letter' : 'ISO 3-letter'
    } format.`;
    input.insertAdjacentElement('afterend', msg);
    return false;
  }

  input.value = normalized;
  input.style.borderColor = '#28a745';
  return true;
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

// Main update guest function (JavaScript version of Java updateGuest method)
async function updateGuestProfile(
  checkin,
  originalGuest,
  guestData,
) {
  debugLog(
    '💾',
    'Updating guest:',
    originalGuest?.givenName,
    originalGuest?.surname,
    '- Overwrite:',
    API_CONFIG.Ohip_overwrite,
  );

  debugLog(
    '📦',
    'updateGuestProfile INPUT:',
    JSON.stringify(
      {
        checkin,
        originalGuest,
        guestData,
      },
      null,
      2,
    ),
  );

  try {
    // ---------------------------------------------------------------------
    // SOURCE OBJECTS
    // ---------------------------------------------------------------------

    const reservationGuest =
      checkin?.reservationGuest || {};

    // ---------------------------------------------------------------------
    // CREATE CLEAN OHIP PAYLOAD
    // ONLY USE FIELDS ALLOWED BY CUSTOMER SCHEMA
    // ---------------------------------------------------------------------

    const customer = {
      personName: [],
    };

    // ---------------------------------------------------------------------
    // PROFILE TYPE
    // ---------------------------------------------------------------------

    const updateRequest = {
      profileIdList: [],
      profileDetails: {
        profileType: 'GUEST',

        customer,

        emails: null,

        telephones: null,

        addresses: {
          addressInfo: [],
        },
      },
    };

    if (originalGuest?.id) {
      updateRequest.profileIdList.push({
        id: originalGuest.id,
        type: 'Profile',
      });
    }

    // ---------------------------------------------------------------------
    // PERSON NAME
    // ---------------------------------------------------------------------

    const primaryName = {
      nameType: 'PRIMARY',

      givenName:
        (
          API_CONFIG.Ohip_overwrite &&
          guestData.firstName
        )
          ? guestData.firstName
          : (
              originalGuest?.givenName ||
              reservationGuest?.givenName
            ),

      middleName:
        originalGuest?.middleName ||
        reservationGuest?.middleName,

      surname:
        (
          API_CONFIG.Ohip_overwrite &&
          guestData.lastName
        )
          ? guestData.lastName
          : (
              originalGuest?.surname ||
              reservationGuest?.surname
            ),

      nameTitle:
        originalGuest?.nameTitle ||
        reservationGuest?.nameTitle,
    };

    customer.personName.push(
      primaryName,
    );

    // ---------------------------------------------------------------------
    // GENDER
    // ---------------------------------------------------------------------

    if (
      guestData.gender &&
      (
        API_CONFIG.Ohip_overwrite ||
        !originalGuest?.gender
      )
    ) {
      customer.gender =
        convertGender(
          guestData.gender,
        );
    } else if (
      originalGuest?.gender
    ) {
      customer.gender =
        originalGuest.gender;
    }

    // ---------------------------------------------------------------------
    // BIRTH DATE
    // ---------------------------------------------------------------------

    if (
      guestData.birthDate &&
      (
        API_CONFIG.Ohip_overwrite ||
        !originalGuest?.birthDate
      )
    ) {
      customer.birthDate =
        guestData.birthDate;
    } else if (
      originalGuest?.birthDate
    ) {
      customer.birthDate =
        originalGuest.birthDate;
    }

    // ---------------------------------------------------------------------
    // NATIONALITY
    // KEEP YOUR CONFIG-BASED NORMALIZATION
    // ---------------------------------------------------------------------

    if (
      guestData.nationality &&
      (
        API_CONFIG.Ohip_overwrite ||
        !originalGuest?.nationality
      )
    ) {
      customer.nationality =
        normalizeCountryCode(
          guestData.nationality,
        );
    } else if (
      originalGuest?.nationality
    ) {
      customer.nationality =
        originalGuest.nationality;
    }

    // ---------------------------------------------------------------------
    // LANGUAGE
    // ---------------------------------------------------------------------

    customer.language =
      guestData.language ||
      originalGuest?.language ||
      reservationGuest?.language ||
      getDefaultLanguage();

    // ---------------------------------------------------------------------
    // VIP
    // MAP RESERVATION VIP -> CUSTOMER VIP
    // ---------------------------------------------------------------------

    const existingVip =
      originalGuest?.vip ||
      reservationGuest?.vip;

    if (existingVip) {
      customer.vipStatus =
        Number(
          existingVip.vipCode ||
          existingVip.vipStatus,
        );

      customer.vipDescription =
        existingVip.vipDescription ||
        null;
    }

    // ---------------------------------------------------------------------
    // IDENTIFICATIONS
    // ---------------------------------------------------------------------

    if (
      guestData.documents &&
      guestData.documents.length > 0
    ) {
      customer.identifications = {
        identificationInfo: [],
      };

      guestData.documents.forEach(
        (doc, index) => {
          customer.identifications.identificationInfo.push(
            {
              identification: {
                idNumber:
                  doc.docNumber,

                idType:
                  convertDocType(
                    doc.docType,
                  ),

                expirationDate:
                  doc.expiryDate ||
                  null,

                issuedCountry:
                  normalizeCountryCode(
                    doc.issueCountry,
                  ) ||
                  normalizeCountryCode(
                    doc.nationality,
                  ) ||
                  normalizeCountryCode(
                    guestData.nationality,
                  ),

                registeredProperty:
                  API_CONFIG.Ohip_hotelId,

                orderSequence:
                  index + 1,

                primaryInd:
                  index === 0,
              },
            },
          );

          // ---------------------------------------------------------------
          // ADD ALTERNATE NAME
          // ---------------------------------------------------------------

          if (
            doc.givenname &&
            doc.surname &&
            (
              doc.givenname !==
                primaryName.givenName ||
              doc.surname !==
                primaryName.surname
            )
          ) {
            customer.personName.push({
              givenName:
                doc.givenname,

              surname:
                doc.surname,

              nameType:
                'ALTERNATE',
            });
          }

          // ---------------------------------------------------------------
          // FILL MISSING VALUES
          // ---------------------------------------------------------------

          if (
            !customer.birthDate &&
            doc.birthDate
          ) {
            customer.birthDate =
              doc.birthDate;
          }

          if (
            !customer.nationality &&
            doc.nationality
          ) {
            customer.nationality =
              normalizeCountryCode(
                doc.nationality,
              );
          }
        },
      );
    }

    // ---------------------------------------------------------------------
    // EMAILS
    // ONLY CREATE OBJECT IF DATA EXISTS
    // ---------------------------------------------------------------------

    if (
      guestData.email &&
      guestData.email.trim()
    ) {
      updateRequest.profileDetails.emails = {
        emailInfo: [
          {
            email: {
              emailAddress:
                guestData.email,

              primaryInd: true,

              orderSequence: 1,

              emailFormat: 'HTML',

              type: 'EMAIL',
            },
          },
        ],
      };
    }

    // ---------------------------------------------------------------------
    // TELEPHONES
    // ONLY CREATE OBJECT IF DATA EXISTS
    // ---------------------------------------------------------------------

    if (
      guestData.mobile &&
      guestData.mobile.trim()
    ) {
      updateRequest.profileDetails.telephones = {
        telephoneInfo: [
          {
            telephone: {
              phoneNumber:
                guestData.mobile,

              phoneTechType:
                'PHONE',

              phoneUseType:
                'MOBILE',
            },
          },
        ],
      };
    }

    // ---------------------------------------------------------------------
    // ADDRESS
    // ALWAYS SEND VALID ADDRESS STRUCTURE
    // ---------------------------------------------------------------------

    updateRequest.profileDetails.addresses.addressInfo.push(
      {
        address: {
          addressLine: [
            guestData.address,
            guestData.address1,
            guestData.address2,
          ].filter(Boolean),

          cityName:
            guestData.city ||
            null,

          postalCode:
            guestData.zipcode ||
            null,

          state:
            guestData.state ||
            null,

          country: {
            code:
              normalizeCountryCode(
                guestData.country ||
                  guestData.nationality,
              ) ||
              null,
          },
        },
      },
    );

    // ---------------------------------------------------------------------
    // CLEANUP
    // REMOVE ONLY UNDEFINED
    // ---------------------------------------------------------------------

    const cleanObject = (obj) => {
      if (Array.isArray(obj)) {
        return obj.map(cleanObject);
      }

      if (
        obj &&
        typeof obj === 'object'
      ) {
        Object.keys(obj).forEach(
          (key) => {
            obj[key] = cleanObject(
              obj[key],
            );

            if (
              obj[key] ===
              undefined
            ) {
              delete obj[key];
            }
          },
        );
      }

      return obj;
    };

    cleanObject(updateRequest);

    // ---------------------------------------------------------------------
    // DEBUG FINAL PAYLOAD
    // ---------------------------------------------------------------------

    debugLog(
      '📤',
      'OHIP UPDATE REQUEST:',
      JSON.stringify(
        updateRequest,
        null,
        2,
      ),
    );

    // ---------------------------------------------------------------------
    // API CALL
    // ---------------------------------------------------------------------

    const authorization =
      await getAuthorization();

    const response =
      await updateProfileAPI(
        originalGuest.id,
        authorization,
        updateRequest,
      );

    // ---------------------------------------------------------------------
    // DOCUMENT UPLOADS
    // ---------------------------------------------------------------------

    if (shouldUploadDocuments()) {
      await processDocumentUploads(
        originalGuest,
        guestData,
      );
    }

    debugLog(
      '✅',
      'Guest profile updated successfully',
    );

    return response;
  } catch (error) {
    debugLog(
      '🚨',
      'Failed to update guest profile:',
      error,
    );

    throw error;
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
    selectedDocumentType === 'passport' ? 'Passport' : 'ID Document',
  );
  // debugLog('File upload object created:', JSON.stringify(fileUpload));
  try {
    const response = await uploadFileWithAuth(fileUpload);
    debugLog('✅', 'Document attached successfully:', fileUpload.fileName);
    return true;
  } catch (error) {
    debugLog(
      '🚨',
      'Failed to attach ID document:',
      fileUpload?.fileName,
      error,
    );

    return false;
  }
}

// Updated createFileUpload function
function createFileUpload(name, docFile, linkId, linkType, description) {
  const timestamp = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15);
  const extension = getFileExtension(docFile, debugLog);

  const safeName = sanitize(name);

  debugLog(
    '📤',
    `Creating file upload with name: ${safeName}_${timestamp}.${extension}`
  );

  return {
    fileAttachment: docFile,
    fileName: `${safeName}_${timestamp}.${extension}`,
    linkId,
    linkType,
    userName: 'SCANNER_APP',
    description,
    globalYN: 'N',
    overwriteExistingFileYN: 'N',
    hotelId: API_CONFIG.Ohip_hotelId,
  };
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

  // console.log(elements.apiPopup);
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

function startCamera() {
  showLoading('Starting camera...');

  elements.cameraVideo.addEventListener(
    'playing',
    () => {
      if (
        selectedDocumentType === 'passport' &&
        API_CONFIG.EnableMrzAutoCapture === true
      ) {
        mrzScanner.start();
      }
    },
    { once: true },
  );

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
  navigator.mediaDevices.getUserMedia({ video: {} })
    .then()
    .catch((err) => {
      hideLoading();
      // ── Same fallback on permission denied or device error ──
      if (selectedDocumentType === 'passport' && API_CONFIG.EnableMrzAutoCapture === true) {
        console.warn('startCamera: Camera unavailable, starting MRZ detection in mock mode');
        elements.cameraContainer.style.display = 'block';
        elements.captureDocBtn.style.display = 'inline-flex';
        mrzScanner.start();
      } else {
        handleCameraError(err);
      }
    });

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
      canvas.height,
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
      canvas.height * 0.6,
    );

    // Add text to simulate document
    ctx.fillStyle = '#333';
    ctx.font = '48px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(
      'SIMULATED DOCUMENT',
      canvas.width / 2,
      canvas.height / 2 - 100,
    );
    ctx.fillText(
      selectedDocumentType.replace('-', ' ').toUpperCase(),
      canvas.width / 2,
      canvas.height / 2 - 20,
    );

    // Add timestamp to show it's live
    ctx.font = '24px monospace';
    ctx.fillText(
      `Live Feed: ${new Date().toLocaleTimeString()}`,
      canvas.width / 2,
      canvas.height / 2 + 60,
    );

    // Add moving elements to simulate camera movement
    ctx.fillStyle = `rgba(255, 255, 255, ${0.3 + 0.2 * Math.sin(time * 2)})`;
    ctx.fillRect(
      canvas.width * 0.05 + 20 * Math.sin(time),
      canvas.height * 0.05 + 10 * Math.cos(time * 1.5),
      100,
      100,
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

  mrzScanner.stop();

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
        'Unable to access camera even with basic settings: ' + err.message,
      );
    });
}

async function processAllGuestsAndCompanions() {
  debugLog(
    '🔄',
    'Processing all guests and companions: ',
    JSON.stringify(companions.length, null, 2), // Truncate images before logging
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
        truncatedCompanion.extractedData.documents[0].docFile,
      );
    }
    return truncatedCompanion;
  });
}

function startCompanionScan() {
  debugLog('👥', 'Starting companion scan');
  isCompanionScan = 'companion';
  currentCompanionIndex = companions.length;

  // Close the companion popup first
  closeCompanionPopup();

  // Reset document type selection
  elements.documentTypeCards.forEach((c) => c.classList.remove('selected'));
  elements.documentTypeCards[1].style.display = 'none';
  elements.documentTypeCards[2].style.display = 'none';
  selectedDocumentType = 'passport'; // Default
  elements.proceedToScan.disabled = true;

  showStep(3); // Go to document type selection
}

function startShareScan() {
  // Check if max sharers limit is reached
  const maxSharers = API_CONFIG?.MaxSharers ?? 3; // Default to 3 if not specified

  if (companions.length >= maxSharers - 1) {
    debugLog(
      '📡',
      `Maximum sharers reached: ${companions.length + 1}/${maxSharers}`,
    );
    alert(
      `Cannot add sharer. Maximum number of sharers (${maxSharers}) has been reached.`,
    );
    return;
  }

  // Optional: Check if shared guests already exist in reservation
  // if (
  //   selectedReservation.sharedGuests &&
  //   selectedReservation.sharedGuests.length > 0
  // ) {
  //   debugLog(
  //     '📡',
  //     `Shared guest exists: ${JSON.stringify(selectedReservation.sharedGuests)}`
  //   );
  //   alert(
  //     `Cannot add sharer. Shared guest already exists: ${
  //       selectedReservation.sharedGuests[0].firstName
  //     }`
  //   );
  //   return;
  // }

  debugLog('🤝', 'Starting share scan');
  isCompanionScan = 'share';
  currentCompanionIndex = companions.length;

  // Close the companion popup first
  closeCompanionPopup();

  // Reset document type selection
  elements.documentTypeCards.forEach((c) => c.classList.remove('selected'));
  elements.documentTypeCards[1].style.display = 'none';
  elements.documentTypeCards[2].style.display = 'none';
  selectedDocumentType = 'passport'; // Default
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
    'issuer_code',
  ];

  // Filter to only include relevant fields
  const filteredData = Object.fromEntries(
    Object.entries(data).filter(([key]) => relevantFields.includes(key)),
  );

  // Date fields that should use datepicker
  const dateFields = ['birth_date', 'expiry_date'];

  // Add data rows (similar to main document popup)
  for (const [field, value] of Object.entries(filteredData)) {
    const row = document.createElement('tr');
    row.className = 'docdata-table-row';

    let inputHTML;

    if (dateFields.includes(field)) {
      // Create datepicker for date fields
      inputHTML = `
        <input type="date" class="docdata-input-field" 
               data-field="${field}" data-companion-index="${companionIndex}"
               value="${formatDateForInput(value)}" placeholder="YYYY-MM-DD">
      `;
    } else if (field === 'sex') {
      // Create dropdown for sex field
      const maleSelected = value === 'M' ? 'selected' : '';
      const femaleSelected = value === 'F' ? 'selected' : '';
      inputHTML = `
        <select class="docdata-input-field"
                data-field="${field}" data-companion-index="${companionIndex}">
          <option value="">-- Select --</option>
          <option value="M" ${maleSelected}>Male</option>
          <option value="F" ${femaleSelected}>Female</option>
        </select>
      `;
    } else {
      // Regular text input
      inputHTML = `
        <input type="text" class="docdata-input-field" 
               data-field="${field}" data-companion-index="${companionIndex}"
               value="${value || ''}" placeholder="Enter value...">
      `;
    }

    row.innerHTML = `
      <td class="docdata-field-cell">${formatFieldName(field)}</td>
      <td class="docdata-value-cell">
        ${inputHTML}
      </td>
      <td class="docdata-actions-cell">
        <div class="docdata-action-buttons">
          <button type="button" class="docdata-edit-btn" title="Edit field">
            <svg viewBox="0 0 24 24" width="16" height="16">
              <path fill="currentColor" d="M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z"/>
            </svg>
          </button>
          <button type="button" class="docdata-clear-btn" title="Clear field">
            <svg viewBox="0 0 24 24" width="16" height="16">
              <path fill="currentColor" d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/>
            </svg>
          </button>
        </div>
      </td>
    `;
    tableBody.appendChild(row);
  }

  overlay.querySelectorAll('.docdata-edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = btn
        .closest('.docdata-table-row')
        .querySelector('.docdata-input-field');
      input.focus();
      if (input.type === 'text') {
        input.setSelectionRange(input.value.length, input.value.length);
      }
    });
  });

  overlay.querySelectorAll('.docdata-clear-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = btn
        .closest('.docdata-table-row')
        .querySelector('.docdata-input-field');
      input.value = '';
      input.focus();
    });
  });

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
  const maxSharers = API_CONFIG?.MaxSharers ?? 3; // Total guests including primary
  const maxCompanions = maxSharers - 1;

  listHeader.className = 'companion-list-header';
  listHeader.innerHTML = `
  <h4>Added Guests (${companions.length}/${maxCompanions})</h4>
  <p><small>You can add up to ${maxCompanions} additional guests.</small></p>
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
    companionSection.nextSibling,
  );
}

// New function to remove a companion
function removeCompanion(index) {
  debugLog('👥', `Removing companion at index ${index}`);

  if (index >= 0 && index < companions.length) {
    const companion = companions[index];
    const name = `${companion.extractedData?.firstName || 'Unknown'}, ${
      companion.extractedData?.lastName || 'Unknown'
    }`;

    if (confirm(`Are you sure you want to remove companion: ${name}?`)) {
      companions.splice(index, 1);
      updateCompanionList(); // Refresh the list
      debugLog(
        '✅',
        `Companion removed. Remaining companions: ${companions.length}`,
      );
    }
  }
}

// New function to save companion data from individual popup
function saveCompanionData() {
  const inputs = document.querySelectorAll(
    '#companionDataPopup input[data-companion-index], #companionDataPopup select[data-companion-index]',
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
      updatedData,
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
    closeCompanionPopup();
    handleComplete();
    return;
    // alert(`${companions.length} companion(s) saved successfully!`);
  } catch (error) {
    debugLog('🚨', 'Error saving companions:', error);
    alert('Failed to save companions: ' + (error?.message || 'Unknown error'));
    showCompanionManagement();
    hideLoading();
    return;
  }
}

async function createGuestProfiles(
  companionData,
  originalReservation,
  authorization,
) {
  const guestProfiles = [];

  for (let i = 0; i < companionData.length; i++) {
    const companion = companionData[i];

    let birthDate = companion.extractedData?.birthDate || null;
    let nationality = companion.extractedData?.nationality || '';

    const identifications = { identificationInfo: [] };

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
            issuedCountry:
              normalizeCountryCode(doc.issuer_code) ||
              normalizeCountryCode(doc.nationality) ||
              normalizeCountryCode(guestData.nationality),
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

    // 🏠 Build addresses (country only, but expandable)
    const addresses = {
      addressInfo: [
        {
          address: {
            isValidated: false,
            addressLine: [
              companion.extractedData?.addressLine1 || '',
              companion.extractedData?.addressLine2 || '',
              '',
              '',
            ],
            cityName: companion.extractedData?.city || '',
            postalCode: companion.extractedData?.postalCode || '',
            state: companion.extractedData?.state || '',
            country: {
              value:
                normalizeCountryCode(companion.extractedData?.country) ||
                normalizeCountryCode(companion.extractedData?.nationality) ||
                null,
            },
            language: 'E',
            type: 'BUSINESS',
            primaryInd: false,
          },
        },
      ],
    };

    debugLog(
      '📡',
      `Creating guest profile for:`,
      personName[0]?.givenName || 'Unknown',
      personName[0]?.surname || '',
    );

    // 🧱 Build Guest Profile payload
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
        addresses, // ← 🏠 include address block here
        profileType: 'GUEST',
        statusCode: 'ACTIVE',
        registeredProperty: originalReservation?.hotelId,
        markForHistory: false,
      },
    };

    try {
      const response = await registerProfileAPI(
        authorization,
        guestProfileBody,
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
            errorText,
          );
          throw new Error(
            `API request failed for companion ${i + 1}: ${response.status} ${
              response.statusText
            } - ${errorText}`,
          );
        }
        result = await response.json();
      }

      const profileId = result?.links?.[0]?.href?.split('/').pop() || null;
      const newGuest = { id: profileId, ...companion.extractedData };

      debugLog(
        '✅',
        'Successfully created guest profile:',
        JSON.stringify(newGuest.id),
      );

      if (shouldUploadDocuments()) {
        await processDocumentUploads(newGuest, companion.extractedData);
      }

      guestProfiles.push(newGuest);

      await new Promise((resolve) => setTimeout(resolve, 100)); // avoid rate limiting
    } catch (error) {
      debugLog('🚨', 'Failed to create share reservation:', error);
      continue;
    }
  }

  return guestProfiles;
}

async function addCompanionsToAPI(companionData, originalReservation) {
  try {
    debugLog(
      '📡',
      `Registering ${companionData.length} profiles to reservations`,
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
      authorization,
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
        originalReservation,
      );
    }

    debugLog(
      '✅',
      `Successfully added ${
        guestProfiles.length - 1
      } companions to reservations`, // Subtract 1 for original
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
        `API request failed: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    const detailedReservation = await response.json();
    debugLog(
      '✅',
      'Detailed reservation fetched:',
      JSON.stringify(detailedReservation, null, 2),
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
      `Registering ${companionData.length} profiles to reservations`,
    );

    if (!originalReservation) {
      throw new Error('No reservation data found in selectedReservation');
    }

    // Get authorization once at the beginning
    const authorization = await getAuthorization();
    const guestProfiles = [originalReservation.profileInfo];
    const newGuestProfiles = await createGuestProfiles(
      companionData,
      originalReservation,
      authorization,
    );
    guestProfiles.push(...newGuestProfiles);

    if (guestProfiles.length <= 1) {
      // Only original reservation exists
      throw new Error('no guests were created successfully.');
    }

    // Loop through each new guest profile and combine with original reservation
    const combineResults = [];
    for (let i = 1; i < guestProfiles.length; i++) {
      try {
        debugLog(
          '🔗',
          `Combining reservation ${i} of ${guestProfiles.length - 1}`,
        );

        const result = await combineShareReservation(
          authorization,
          [originalReservation.profileInfo, guestProfiles[i]], // Original + current guest
          originalReservation,
        );

        combineResults.push({
          success: true,
          profile: guestProfiles[i],
          result,
        });
        debugLog('✅', `Successfully combined reservation for guest ${i}`);
      } catch (error) {
        debugLog('⚠️', `Failed to combine reservation for guest ${i}:`, error);
        combineResults.push({
          success: false,
          profile: guestProfiles[i],
          error,
        });
      }
    }

    // Check how many succeeded
    const successCount = combineResults.filter((r) => r.success).length;
    const failCount = combineResults.filter((r) => !r.success).length;

    if (successCount === 0) {
      throw new Error('Failed to create any shared reservations');
    }

    debugLog(
      '✅',
      `Successfully created ${successCount} shared reservation${
        successCount !== 1 ? 's' : ''
      }${failCount > 0 ? ` (${failCount} failed)` : ''}`,
    );

    alert(
      `Successfully created ${successCount} shared reservation${
        successCount !== 1 ? 's' : ''
      }${failCount > 0 ? `\n${failCount} failed to create` : ''}`,
    );

    return {
      success: true,
      createdReservations: guestProfiles,
      combineResults,
      totalCreated: successCount,
      totalFailed: failCount,
      totalRequested: companionData.length,
    };
  } catch (error) {
    debugLog('🚨', 'Error in shareCompanionsToAPI:', error);
    throw error;
  }
}

async function processDocumentUploads(originalGuest, guestData) {
  debugLog(
    '🔄',
    'Processing document uploads for guest:',
    originalGuest.firstName || originalGuest.givenName,
  );

  // Check for documents in guestData (companion.extractedData)
  if (!guestData.documents || guestData.documents.length === 0) {
    debugLog(
      'ℹ️',
      'No documents to upload for guest:',
      originalGuest.firstName || originalGuest.givenName,
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
        doc.docFile.replace(/^data:image\/\w+;base64,/, ''),
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
  shareReservationIds,
) {
  // Some hotel systems have APIs to explicitly link share reservations
  // This would depend on your specific API capabilities
  debugLog(
    '🔗',
    `Linking share reservations to original ${originalReservationId}:`,
    shareReservationIds,
  );

  // Implementation depends on your API's share linking capabilities
  // This might be a separate API call or part of the reservation update
}

function showError(message) {
  alert(message);
  debugLog('🚨', 'Camera error:', message);
}

window.addEventListener('beforeunload', () => {
  ipcRenderer.removeAllListeners('reset-app-state');
});

ipcRenderer.invoke('app-version').then(version => {
  debugLog('📋', `Renderer script V ${version} loaded`);
});
