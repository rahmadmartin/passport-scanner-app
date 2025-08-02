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
  selectedDocType: document.getElementById('selectedDocType'),

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

  debugLog('✅', 'Event listeners setup complete');
}

// Handle screen capture from floating window
async function handleScreenCaptured(event, dataUrl) {
  // Prevent duplicate processing
  if (isProcessingCapture) {
    console.log('⚠️ Already processing capture, ignoring duplicate');
    return;
  }

  isProcessingCapture = true;

  try {
    debugLog('📸', 'Screen capture received from floating window');
    debugLog('📊', 'Data URL length:', dataUrl.length);

    showStep(1);

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
async function captureScreen() {
  debugLog('📸', 'Manual capture initiated');
  showLoading('Capturing screen...');

  // closeWindowAndReset();

  if (API_CONFIG?.HotelPms?.toUpperCase() == 'DEMO') {
    try {
      showLoading('Capturing screen...');

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
      // Hide floating window before capture
      await ipcRenderer.invoke('hide-floating-window');

      // Wait a short moment to ensure the window is hidden
      await new Promise((resolve) => setTimeout(resolve, 750));

      const dataUrl = await ipcRenderer.invoke('capture-screen');
      debugLog(
        '✅',
        'Manual capture successful, data URL length:',
        dataUrl.length
      );

      // Show floating window again
      await ipcRenderer.invoke('show-floating-window');
      await ipcRenderer.invoke('show-main-window');
      hideLoading();
      await handleScreenCaptured(null, dataUrl);
    } catch (error) {
      debugLog('🚨', 'Manual capture failed:', error);
      // Show floating window even if error
      await ipcRenderer.invoke('show-floating-window');
      hideLoading();
      alert('Screen capture failed');
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
    alert('Invalid image data format. Please capture a screen again.');
    return;
  }

  // Check for empty string or zero-length data
  if (typeof capturedImageData === 'string' && capturedImageData.length === 0) {
    debugLog('⚠️', 'Empty image data string');
    alert('Image data is empty. Please capture a screen again.');
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
      alert('Processing failed. Please try again.');
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
            '<span>Text extracted successfully!</span>';
          elements.ocrStatus.className = 'processing-status success';
        }

        if (elements?.editReservationNumber) {
          elements.editReservationNumber.disabled = false;
        }

        debugLog(
          '🔍',
          'Extracted screenshot data:',
          JSON.stringify(result, null, 2)
        );

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

        // Update OCR status to show error with null safety
        if (elements?.ocrStatus) {
          elements.ocrStatus.innerHTML =
            '<span>OCR processing failed: ' + errorMessage + '</span>';
          elements.ocrStatus.className = 'processing-status error';
        }

        if (elements?.editReservationNumber) {
          elements.editReservationNumber.disabled = false;
        }

        if (elements?.reservationNumber) {
          elements.reservationNumber.focus();
          elements.reservationNumber.placeholder =
            'Enter confirmation number manually';
        }
      }
    } catch (error) {
      const errorMessage = error?.message || 'Unknown error occurred';
      debugLog('🚨', 'Read image processing error:', errorMessage);

      // Update OCR status to show error with null safety
      if (elements?.ocrStatus) {
        elements.ocrStatus.innerHTML =
          '<span>Processing error: ' + errorMessage + '</span>';
        elements.ocrStatus.className = 'processing-status error';
      }

      if (elements?.editReservationNumber) {
        elements.editReservationNumber.disabled = false;
      }

      if (elements?.reservationNumber) {
        elements.reservationNumber.focus();
        elements.reservationNumber.placeholder =
          'Enter confirmation number manually';
      }

      // Close popups on error
      if (typeof closeOcrPopup === 'function') {
        closeOcrPopup();
      }
      if (typeof closeApiPopup === 'function') {
        closeApiPopup();
      }
    }
  }
}

async function simulateOcr() {
  await simulateDelay(2000);

  // Extract mock reservation number
  extractedReservationNumber = 'ABC123456';
  elements.reservationNumber.value = extractedReservationNumber;
  elements.editReservationNumber.disabled = false;

  elements.ocrStatus.innerHTML =
    '<div class="spinner-small"></div><span>Text extracted successfully!</span>';
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
  const token = await getToken();
  return `${token.token.token_type} ${token.token.access_token}`;
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
        number: 'ABC123456',
        guestName: 'John Doe',
        checkIn: '2024-03-15',
        checkOut: '2024-03-18',
        roomType: 'Deluxe Suite',
        status: 'confirmed',
      },
      {
        number: 'ABC123457',
        guestName: 'John Smith',
        checkIn: '2024-03-16',
        checkOut: '2024-03-19',
        roomType: 'Standard Room',
        status: 'pending',
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
    document.getElementById('capturedDocument').src = base64Image;
    document.getElementById('selectedDocType').textContent =
      selectedDocumentType;
    document.getElementById('documentPreview').style.display = 'block';

    // Update controls
    document.getElementById('captureDocBtn').style.display = 'none';
    document.getElementById('processDocBtn').style.display = 'inline-flex';
    document.getElementById('stopCameraBtn').style.display = 'none';
    document.getElementById('retakeDocBtn').style.display = 'inline-flex';

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
    'issue_date',
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
               placeholder="Enter value...">
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

  // Add event listeners
  document.querySelectorAll('.docdata-edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = btn
        .closest('.docdata-table-row')
        .querySelector('.docdata-input-field');
      input.focus();
      input.select();
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

  // Show the popup
  overlay.classList.add('active');
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

  if (API_CONFIG?.HotelPms?.toUpperCase() == 'DEMO') {
    try {
      showLoading('Processing document...');

      // Simulate document processing
      await simulateDelay(3000);

      hideLoading();

      // Mock data for demonstration
      const mockDocumentData = {
        surname: 'SMITH',
        given_name: 'JOHN',
        document_number: '123456789',
        birth_date: '1985-05-15',
        sex: 'M',
        expiry_date: '2030-12-31',
        nationality_code: 'USA',
        // These fields will be filtered out as they're not in relevantFields
        issue_date: '2020-01-01',
        issuing_country: 'United States',
        mrz: 'P_123455434',
      };

      // Show the popup with mock data
      showDocumentDataPopup(mockDocumentData);
    } catch (error) {
      debugLog('🚨', 'Error in demo mode:', error);
      hideLoading();
      alert('Error processing document in demo mode');
    }
  } else {
    try {
      await extractDocumentData(elements.capturedDocument.src);
    } catch (error) {
      debugLog('🚨', 'Extraction error:', error);
      alert('Failed to extract document data');
    }
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

    debugLog('🔍', 'Extracted document data:', JSON.stringify(data, null, 2));

    // Check if extraction failed
    if (
      data.status === 'FAILURE' &&
      data.status_message === 'No MRZ detected'
    ) {
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

// Handle complete process
function handleComplete() {
  debugLog('🎉', 'Process completed successfully');
  closeWindowAndReset();
}

async function closeWindowAndReset() {
  // Close the window completely
  await ipcRenderer.invoke('close-main-window');

  // When you need to show the window again:
  // await ipcRenderer.invoke('recreate-main-window');
  // showStep(1);
}
// Format field names for display
function formatFieldName(field) {
  return field
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

// Enhanced saveUpdatedData function with PMS integration logic
async function saveUpdatedData() {
  // showLoading('Updating guest profile');
  const inputs = document.querySelectorAll('.docdata-popup-overlay input');
  const updatedData = {};

  inputs.forEach((input) => {
    updatedData[input.dataset.field] = input.value;
  });

  // showLoading('Updating profile and documents...'); // More accurate message

  debugLog('💾', 'Updated data:', JSON.stringify(updatedData, null, 2));

  if (API_CONFIG?.HotelPms?.toUpperCase() == 'DEMO') {
    alert('Guest profile updated successfully!');
    // hideLoading();
    closeDocumentDataPopup();
    handleComplete();
  } else {
    try {
      // Convert extracted MRZ data to guest object
      const guestData = mapMrzToGuest(updatedData);

      // Get reservation data (this would come from your system)
      const reservationData = selectedReservation;

      // Get original guest data for comparison
      const originalGuest = reservationData.reservationGuest;

      // Update guest profile
      const updatedGuest = await updateGuestProfile(
        reservationData,
        originalGuest,
        guestData
      );

      alert('Guest profile updated successfully!');
      closeDocumentDataPopup();
      handleComplete();
    } catch (error) {
      debugLog('Error updating guest profile:', error);
      alert('Failed to update guest profile');
    }
  }
}

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
    guestData.documents
      .filter(
        (d) => d.docType !== 'REG_CARD' && d.docType !== 'IMMIGRATION_CARD'
      )
      .forEach((doc) => {
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
      await processDocumentUploads(checkin, originalGuest, guestData);
    }

    return response;
  } catch (error) {
    debugLog('🚨', 'Failed to update guest profile:', error);
  }
}

// Document upload processing
async function processDocumentUploads(checkin, originalGuest, guestData) {
  debugLog(
    '🔄',
    'Processing document uploads for guest:',
    JSON.stringify(guestData.lastName)
  );

  if (!guestData.documents || guestData.documents.length === 0) {
    return true;
  }

  const uploadPromises = guestData.documents.map(async (doc) => {
    if (doc.docFile) {
      try {
        const success = await postIdDocument(
          originalGuest.id,
          `${guestData.firstName}_${guestData.lastName}`,
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

// Upload ID document
async function postIdDocument(guestId, name, docFile) {
  debugLog('Attaching ID document for', name, 'with profile ID', guestId);
  const fileUpload = createFileUpload(
    name,
    docFile,
    guestId,
    'Guest',
    'ID Document'
  );
  debugLog('File upload object created:', JSON.stringify(fileUpload));
  try {
    const response = await uploadFileWithAuth(fileUpload);
    debugLog('ID document attached successfully:', fileUpload.fileName);
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
    'Creating file upload with name:',
    name,
    'and extension:',
    extension
  );

  return {
    fileAttachment: docFile, // Keep as base64 string for API
    fileName: `${name}_${timestamp}.${extension}`,
    linkId: linkId,
    linkType: linkType,
    userName: 'TEST_USER', // Replace with actual user name if available
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
      '📤 File Upload Request:',
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
    debugLog('✅', 'File Upload Success:', {
      status: response.status,
      timeTaken: `${responseTime}ms`,
      response: responseData,
    });

    if (!response.ok) {
      // Log error response
      debugLog('❌', 'File Upload Failed:', {
        status: response.status,
        error: responseData,
        timeTaken: `${responseTime}ms`,
      });
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

/**
 * Updates a guest profile via the API
 * @param {string} profileId - The ID of the profile to update
 * @param {string} authorization - Authorization token
 * @param {Object} request - The request payload
 * @returns {Promise<Object>} The API response
 * @throws {Error} If the API request fails
 */
async function updateProfileAPI(profileId, authorization, request) {
  const url = `${API_CONFIG.Ohip_baseURL}/crm/v1/profiles/${profileId}`;

  // Log the request details
  debugLog(
    '📤 API Request:',
    JSON.stringify({
      method: 'PUT',
      url: url,
      headers: {
        'Content-Type': 'application/json',
        authorization: 'Bearer *****', // Masked for security
        'x-app-key': API_CONFIG.Ohip_appKey,
        'x-hotelid': API_CONFIG.Ohip_hotelId,
      },
      body: request,
    })
  );

  try {
    const startTime = Date.now();
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        authorization: authorization,
        'x-app-key': API_CONFIG.Ohip_appKey,
        'x-hotelid': API_CONFIG.Ohip_hotelId,
      },
      body: JSON.stringify(request),
    });

    const responseTime = Date.now() - startTime;
    const responseData = await response.json();

    // Log the successful response
    debugLog('📥', 'API Response:', JSON.stringify(responseData, null, 2));

    if (!response.ok) {
      // Log error response separately
      throw new Error(
        `API request failed with status ${response.status}: ${response.statusText}`
      );
    }

    return responseData;
  } catch (error) {
    debugLog(
      '🚨',
      'API Request Failed:',
      JSON.stringify({
        error: error.message,
        stack: error.stack,
      })
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
        elements.selectedDocType.textContent = selectedDocumentType.replace(
          '-',
          ' '
        );
        elements.captureDocBtn.style.display = 'inline-flex';
        hideLoading();
      };

      // Handle video loading errors
      elements.cameraVideo.onerror = () => {
        throw new Error('Video element failed to load stream');
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
    elements.selectedDocType.textContent = selectedDocumentType.replace(
      '-',
      ' '
    );
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
  }

  // Hide camera UI
  elements.cameraContainer.style.display = 'none';
  elements.captureDocBtn.style.display = 'none';
  // elements.stopCameraBtn.style.display = 'none';
  // elements.startCameraBtn.style.display = 'inline-flex';
}

function handleCameraError(error) {
  console.error('Camera error:', error);

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
        elements.selectedDocType.textContent = selectedDocumentType.replace(
          '-',
          ' '
        );
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

function showError(message) {
  alert(message);
  console.error('Camera Error:', message);
}

debugLog('📋', 'Renderer script loaded');
