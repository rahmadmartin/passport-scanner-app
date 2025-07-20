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
let currentStream = null;
let selectedReservation = null;
let selectedDocumentType = "Passport"; // Default to Passport
let base64Image = null;
// Token management
let tokenData = {
    token: null,
    expiry: null
};

// const API_CONFIG = {
//     similarity: 0.5, // Name similarity threshold
//     isTest: false, // Set to true for test mode
//     hotelId: 'DPHSS', // Replace with your hotel ID
//     baseURL: 'https://mtcs1ua.hospitality-api.ap-singapore-1.ocs.oc-test.com', // Replace with your auth endpoint
//     appKey: 'fb493ddb-e179-4596-bc7a-7fd1f0461171',
//     authMethod: 'OCIM', // or 'PASSWORD'
//     enterpriseId: 'DPSPH', // Only for OCIM
//     user: '80fe2703f09e487fba77c55696e06ce0', // Only for password auth
//     password: '9cc740a4-e311-4353-8a9b-8ef857531771' // Only for password auth
// };

const API_CONFIG = configManager.loadConfig();

const apiClient = axios.create({
    baseURL: API_CONFIG.Ohip_baseURL,
    timeout: 30000,
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    }
});

// DOM Elements
const elements = {
    capturePreview: document.getElementById('capturePreview'),
    capturedImage: document.getElementById('capturedImage'),
    manualCaptureBtn: document.getElementById('manualCaptureBtn'),
    processOcrBtn: document.getElementById('processOcrBtn'),
    ocrResults: document.getElementById('ocrResults'),
    reservationNumber: document.getElementById('reservationNumber'),
    lastNameInput: document.getElementById('lastName'),
    fullOcrText: document.getElementById('fullOcrText'),
    callApiBtn: document.getElementById('callApiBtn'),
    step1: document.getElementById('step1'),
    step2: document.getElementById('step2'),
    step3: document.getElementById('step3'),
    proceedToScanBtn: document.getElementById('proceedToScanBtn'),
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
    minimizeBtn: document.getElementById('minimizeBtn'),
    documentType: document.getElementById('documentType'),
    scanFrame: document.getElementById('scanFrame'),
};


// Add this listener at the top of your file:
ipcRenderer.on('manual-lookup-data', (event, { reservationId, lastName }) => {
    logToFile('🎯 Received lookup data in main window:', { reservationId, lastName });
    
    // 1. Populate fields
    if (elements.reservationNumber) {
        elements.reservationNumber.value = reservationId || '';
    }
    
    if (elements.lastNameInput) {
        elements.lastNameInput.value = lastName || '';
    }

    logToFile('📋 Fields populated:', {
        reservationNumber: elements.reservationNumber.value,
        // lastName: elements.lastNameInput.value
    });

    // 2. Automatically trigger search if reservation ID exists
    if (reservationId || lastName) {
        handleApiCall();
    }
    // Add else-if for lastName search if needed
});

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
    elements.documentType.addEventListener('change', handleDocumentTypeChange);
    
    debugLog('✅', 'Event listeners setup complete');
}

// Handle screen capture from floating window
async function handleScreenCaptured(event, dataUrl) {
    debugLog('📸', 'Screen capture received from floating window');
    debugLog('📊', 'Data URL length:', dataUrl.length);
    
    try {
        // Display captured image
        capturedImageData = dataUrl;
        const imgElement = elements.capturedImage;
        
        // Load the image first to get its dimensions
        await new Promise((resolve) => {
            imgElement.onload = resolve;
            imgElement.src = dataUrl;
        });
        
        // Apply preview styling
        imgElement.style.display = 'block';
        imgElement.style.maxWidth = '100%';  // Will be constrained by the CSS max-width
        imgElement.style.maxHeight = '100%';
        imgElement.style.objectFit = 'contain';
        
        // Update UI
        elements.capturePreview.classList.add('has-image');
        elements.capturePreview.querySelector('.placeholder').style.display = 'none';
        elements.processOcrBtn.disabled = false;
        
        debugLog('✅', 'Screen capture displayed successfully as preview');

        await handleOcrProcess();

        
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
        // Hide floating window before capture
        await ipcRenderer.invoke('hide-floating-window');

        // Wait a short moment to ensure the window is hidden
        await new Promise(resolve => setTimeout(resolve, 200));

        const dataUrl = await ipcRenderer.invoke('capture-screen');
        debugLog('✅', 'Manual capture successful, data URL length:', dataUrl.length);
        
        await handleScreenCaptured(null, dataUrl);

        // Show floating window again
        await ipcRenderer.invoke('show-floating-window');
        hideLoading();

    } catch (error) {
        debugLog('🚨', 'Manual capture failed:', error);
        // Show floating window even if error
        await ipcRenderer.invoke('show-floating-window');
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
            // elements.fullOcrText.value = result.fullText;
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

            if (elements.reservationNumber.value == '') {
                debugLog('⚠️', 'No confirmation number found in the screen');
                alert('No confirmation number found in the screen. Please check the captured image.');
            }
            
        } else {
            debugLog('🚨', 'Read image processing failed:', result.error);
            alert('Read image processing failed: ' + result.error);
        }
        
    } catch (error) {
        debugLog('🚨', 'Read image processing error:', error);
        alert('Read image processing error: ' + error.message);
    } finally {
        hideLoading();
    }
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


async function getToken() {
    debugLog('🔑', 'Checking token status...');
    
    // Check if we have a valid token
    if (tokenData.token && tokenData.expiry && new Date() < new Date(tokenData.expiry.getTime() - 60000)) {
        debugLog('✅', 'Using cached token');
        return tokenData;
    }
    
    debugLog('🔄', 'Requesting new token...');
    
    const isOCIM = API_CONFIG.Ohip_authMethod.toUpperCase() === 'OCIM';
    
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
            'x-app-key': API_CONFIG.Ohip_appKey
        };
        
        if (isOCIM) {
            headers['enterpriseId'] = API_CONFIG.Ohip_enterpriseId;
            // Generate Basic auth header from username and password
            const basicAuthString = Buffer.from(`${API_CONFIG.Ohip_user}:${API_CONFIG.Ohip_password}`).toString('base64');
            headers['Authorization'] = `Basic ${basicAuthString}`;
        }
        
        logToFile('🔍 Token request headers:', JSON.stringify(headers, null, 2));
        logToFile('🔍 Token request params:', params.toString());
        
        const response = await axios.post(
            `${API_CONFIG.Ohip_baseURL}/oauth/v1/tokens`,
            params,
            { headers }
        );
        
        if (response.data && response.data.access_token) {
            tokenData.token = response.data;
            tokenData.expiry = new Date(Date.now() + (response.data.expires_in * 1000));
            
            // Log token details for debugging (similar to Java implementation)
            try {
                const tokenParts = response.data.access_token.split('.');
                if (tokenParts.length === 3) {
                    const header = JSON.parse(atob(tokenParts[0].replace(/-/g, '+').replace(/_/g, '/')));
                    const payload = JSON.parse(atob(tokenParts[1].replace(/-/g, '+').replace(/_/g, '/')));
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
        debugLog('🚨', 'Token request failed:', error.response?.data || error.message);
        throw new Error(`Authentication failed: ${error.response?.data?.error || error.message}`);
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

async function doFindReservation(reservationId, lastName, room, disposition, arrival, departure, arrivalEnd, departureEnd, full) {
    debugLog('🔍', 'doFindReservation called with params:', {
        reservationId, lastName, room, disposition, arrival, departure, arrivalEnd, departureEnd, full
    });

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
            disposition: disposition
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
                disposition: disposition
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

        logToFile('🔍 Second search found reservations:', JSON.stringify(searchResponse.totalResults));

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
    debugLog('🔍', 'Finding reservations with params:', searchParams);
    
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
        if (searchParams.confirmationNumberList && searchParams.confirmationNumberList.length > 0) {
            requestBody.confirmationNumberList = searchParams.confirmationNumberList;
        }
        if (searchParams.externalReferenceIds && searchParams.externalReferenceIds.length > 0) {
            requestBody.externalReferenceIds = searchParams.externalReferenceIds;
        }
        if (searchParams.customReference && searchParams.customReference.trim() !== '') {
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
            'Authorization': authorization
        };

        const baseUrl = `${API_CONFIG.Ohip_baseURL}/rsv/v1/hotels/${API_CONFIG.Ohip_hotelId}/reservations`;
        
        // Create URLSearchParams to build the query string
        const urlParams = new URLSearchParams();
        Object.entries(requestBody).forEach(([key, value]) => {
            if (value !== null && value !== undefined) {
                if (Array.isArray(value)) {
                    value.forEach(item => urlParams.append(key, item));
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
        logToFile('🔍 Complete URL:', completeUrl);

        logToFile('🔍 Reservation search response:', JSON.stringify(response.data.reservations.totalResults, null, 2));


        if (response.data.reservations.totalResults > 0) {
            return response.data;
        } else {
            debugLog('⚠️', 'No reservations found in response');
            return {
                reservations: [],
                totalResults: 0,
                totalPages: 0,
                hasMore: false
            };
        }
    } catch (error) {
        debugLog('🚨', 'Reservation search failed:', error.response?.data || error.message);
        if (error.response?.status === 401) {
            // Token might be expired, clear it and retry once
            tokenData.token = null;
            tokenData.expiry = null;
            throw new Error('Authentication failed. Please try again.');
        }
        throw new Error(`Reservation search failed: ${error.response?.data?.message || error.message}`);
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
async function handleApiCall() {
    debugLog('📡', 'API call initiated');
    
    // Get values from both fields
    const reservationNum = elements.reservationNumber.value.trim();
    const lastName = elements.lastNameInput?.value.trim();
    
    if (!reservationNum && !lastName) {
        debugLog('⚠️', 'No search criteria provided');
        alert('Please provide either confirmation number or last name');
        return;
    }
    
    showLoading(reservationNum ? 'Calling API...' : `Searching for ${lastName}...`);
    
    try {
        logToFile('🔄', 'Making request with:', 
                 reservationNum ? `Reservation: ${reservationNum}` : `Name: ${lastName}`);
        
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
        const response = await doFindReservation(reservationNum, lastName, null, [], null, null, null, null, false);

        logToFile('📥', 'Reservations found:', JSON.stringify(response.totalResults));

        if (response.totalResults > 0) {
            debugLog('✅', 'Request successful');
            
            // Store the results for use in step 2
            window.searchResults = response.reservationInfo;
            
            elements.step1.style.display = 'none';
            elements.step2.style.display = 'block';
            
            // Display results (you can customize this part)
            displayReservationResults(response.reservationInfo);
        } else {
            throw new Error('No reservations found matching your criteria');
        }
    } catch (error) {
        debugLog('🚨', 'Request error:', error);
        alert(`Error: ${error.message}`);
    } finally {
        hideLoading();
    }
}


function displayReservationResults(reservations) {
    debugLog('📋', 'Displaying reservation results');
    
    const resultContainer = document.getElementById('reservationData');
    const proceedBtn = document.getElementById('proceedToScanBtn');
    
    if (resultContainer) {
        // Clear previous results
        resultContainer.innerHTML = '';
        
        // Reset selection
        selectedReservation = null;
        proceedBtn.disabled = true;
        
        // Show message if no reservations found
        if (!reservations || reservations.length === 0) {
            resultContainer.innerHTML = '<p class="no-results">No reservations found.</p>';
            return;
        }
        
        // Create title based on number of results
        const title = document.createElement('h4');
        title.textContent = reservations.length > 1 
            ? `Found ${reservations.length} reservations. Please select one:` 
            : 'Found reservation:';
        resultContainer.appendChild(title);
        
        // Create a form for radio buttons
        const form = document.createElement('form');
        form.id = 'reservationSelectionForm';
        
        // Create reservation items with radio buttons
        reservations.forEach((reservation, index) => {
            const reservationId = reservation.reservationIdList[0].id;
            const radioId = `reservation-${reservationId}`;
            
            const reservationDiv = document.createElement('div');
            reservationDiv.className = 'reservation-item';
            reservationDiv.innerHTML = `
                <input type="radio" 
                       id="${radioId}" 
                       name="selectedReservation" 
                       value="${index}"
                       class="reservation-radio">
                <label for="${radioId}" class="reservation-info">
                    <h4>Reservation: ${reservationId}</h4>
                    <p>Guest: ${reservation.reservationGuest ? `${reservation.reservationGuest.givenName} ${reservation.reservationGuest.surname}` : 'N/A'}</p>
                    <p>Status: ${reservation.reservationStatus || '-'}</p>
                    <p>Room: ${reservation.roomStay.roomId || '-'}</p>
                </label>
            `;
            
            form.appendChild(reservationDiv);
        });
        
        resultContainer.appendChild(form);
        
        // Add change handler for radio buttons
        const radioButtons = document.querySelectorAll('.reservation-radio');
        radioButtons.forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (e.target.checked) {
                    selectedReservation = reservations[parseInt(e.target.value)];
                    proceedBtn.disabled = false;
                }
            });
        });
        
        // Add handler for proceed button
        elements.proceedToScanBtn?.addEventListener('click', () => {
            if (selectedReservation) {
                debugLog('➡️', 'Proceeding with selected reservation:', 
                JSON.stringify({
                    reservationId: selectedReservation.reservationIdList[0].id,
                    guestName: `${selectedReservation.reservationGuest.givenName} ${selectedReservation.reservationGuest.surname}`,
                    roomId: selectedReservation.roomStay.roomId,
                    startDate: selectedReservation.roomStay.originalTimeSpan.startDate
                }, null, 2));                // Hide step 2 and show step 3
                elements.step2.style.display = 'none';
                elements.step3.style.display = 'block';
                // Here you would call whatever function needs the selected reservation
                // For example: proceedToDocumentScan(selectedReservation);
            }
        });
    }
}

// Export functions if using modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        handleApiCall,
        findReservations,
        getToken,
        getAuthorization
    };
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
function handleDocumentTypeChange() {
    selectedDocumentType = elements.documentType.value;
    elements.selectedDocType.textContent = elements.documentType.options[elements.documentType.selectedIndex].text;
    debugLog('📄', 'Document type selected:', selectedDocumentType);
}

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
                        facingMode: 'environment',
                        width: { ideal: 1920 },
                        height: { ideal: 1080 }
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

        // Calculate frame position and dimensions
        function getFrameDimensions() {
            const video = elements.cameraVideo;
            const scanFrame = elements.scanFrame;
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
                height: Math.min(actualHeight, video.videoHeight - actualY)
            };
        }

        // Handle document capture with cropping
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

                // Get frame dimensions
                const frameDimensions = getFrameDimensions();
                debugLog('📐', 'Frame dimensions:', frameDimensions);

                // Set canvas dimensions to match the cropped area
                canvas.width = frameDimensions.width;
                canvas.height = frameDimensions.height;

                debugLog('📐', 'Canvas dimensions:', canvas.width, 'x', canvas.height);

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

                // Convert to base64 with higher quality
                base64Image = canvas.toDataURL('image/jpeg', 0.9);
                debugLog('📊', 'Base64 image length:', base64Image.length);

                // Display captured document
                elements.capturedDocument.src = base64Image;
                elements.fileSize.textContent = Math.round(base64Image.length / 1024) + ' KB';
                elements.base64Status.textContent = 'Ready';
                elements.documentPreview.style.display = 'block';

                // Stop camera
                handleStopCamera();

                debugLog('✅', 'Document captured and cropped successfully');

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
    logToFile('[extractDocumentData] Starting document data extraction');
    logToFile('[extractDocumentData] Input base64Image length:', base64Image.length);
    
    try {
        logToFile('[extractDocumentData] Showing loading indicator');
        showLoading('Extracting document data...');
        
        // Remove the data URL prefix if present
        logToFile('[extractDocumentData] Processing base64 image data');
        const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');
        logToFile('[extractDocumentData] Processed base64Data length:', base64Data.length);
        
        logToFile('[extractDocumentData] Preparing API request');
        const requestPayload = {
            base64_image: base64Data,
            ignore_parse: false
        };
        logToFile('[extractDocumentData] Request payload:', {
            ...requestPayload,
            base64_image: `${requestPayload.base64_image.substring(0, 30)}...` // Log first 30 chars to avoid huge logs
        });
        
        logToFile('[extractDocumentData] Sending request to API endpoint');
        const response = await fetch(`${API_CONFIG.Mrz_baseURL}/extract`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestPayload)
        });
        
        logToFile('[extractDocumentData] Received response, status:', response.status);
        if (!response.ok) {
            const errorBody = await response.text().catch(() => 'Unable to read error body');
            console.error('[extractDocumentData] API request failed:', {
                status: response.status,
                statusText: response.statusText,
                errorBody: errorBody
            });
            throw new Error(`API request failed with status ${response.status}: ${response.statusText}`);
        }
        
        logToFile('[extractDocumentData] Parsing response JSON');
        const data = await response.json();
        // const data = {
        //     "mrz_type": "TD3",
        //     "document_code": "P",
        //     "issuer_code": "GBR",
        //     "surname": "PUDARSAN",
        //     "given_name": "HENERT",
        //     "document_number": "707797979",
        //     "document_number_checkdigit": "2",
        //     "nationality_code": "GBR",
        //     "birth_date": "1995-05-20",
        //     "sex": "F",
        //     "expiry_date": "2017-04-22",
        //     "optional_data": "",
        //     "mrz_text": "P<GBRPUDARSAN<<HENERT<<<<<<<<<<<<<<<<<<<<<<<\n7077979792GBR9505209M1704224<<<<<<<<<<<<<<00",
        //     "status": "SUCCESS"
        // };
        logToFile('[extractDocumentData] Extracted data:', JSON.stringify(data, null, 2));
        // logToFile('[extractDocumentData] Extracted data (truncated):', {
        //     ...data,
        //     // Truncate long values for logging
        //     ...Object.fromEntries(
        //         Object.entries(data).map(([key, val]) => 
        //             [key, typeof val === 'string' && val.length > 50 ? `${val.substring(0, 50)}...` : val]
        //     )
        // )});
        
        logToFile('[extractDocumentData] Displaying extracted data');
        displayExtractedData(data);
        
        logToFile('[extractDocumentData] Data extraction completed successfully');
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
        logToFile('[extractDocumentData] Hiding loading indicator');
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
    elements.step3.style.display = 'none';
    elements.ocrResults.style.display = 'none';
    elements.documentPreview.style.display = 'none';
    
    // Clear data and hide extracted data container
    const extractedDataContainer = document.getElementById('extractedDataContainer');
    if (extractedDataContainer) {
        // extractedDataContainer.style.display = 'none';
        // Alternatively, if you want to completely remove it:
        /* The above code is setting the display property of the element with the id
        "extractedDataContainer" to 'none', which will hide the element on the webpage. */
        extractedDataContainer.remove();
    }
    
    capturedImageData = null;
    selectedDocumentType = null;
    elements.capturedImage.style.display = 'none';
    elements.capturePreview.classList.remove('has-image');
    elements.capturePreview.querySelector('.placeholder').style.display = 'block';
    elements.processOcrBtn.disabled = true;
    
    debugLog('🔄', 'Application reset to initial state');
}

// Display extracted data in editable fields with enhanced UI/UX
function displayExtractedData(data) {
  const relevantFields = [
    'surname',
    'given_name',
    'document_number',
    'birth_date',
    'sex',
    'expiry_date',
    'nationality_code'
  ];

  // Filter to only include relevant fields
  const filteredData = Object.fromEntries(
    Object.entries(data).filter(([key]) => relevantFields.includes(key))
  );

  // The rest of your function stays the same, just use `filteredData` instead of `data`
  const resultsContainer = document.getElementById('extractedDataContainer') || createResultsContainer();
  resultsContainer.style.display = 'block';
  resultsContainer.innerHTML = '';

  // Add title
  const title = document.createElement('div');
  title.className = 'extracted-data-header';
  title.innerHTML = `
    <svg class="document-icon" viewBox="0 0 24 24" width="24" height="24">
      <path fill="currentColor" d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
    </svg>
    <h3>Extracted Document Data</h3>
  `;
  resultsContainer.appendChild(title);

  const table = document.createElement('table');
  table.className = 'extracted-data-table';

  const headerRow = document.createElement('tr');
  headerRow.innerHTML = `
    <th class="field-column">Field</th>
    <th class="value-column">Value</th>
    <th class="actions-column">Actions</th>
  `;
  table.appendChild(headerRow);

  for (const [field, value] of Object.entries(filteredData)) {
    const row = document.createElement('tr');
    row.className = 'data-row';

    const fieldCell = document.createElement('td');
    fieldCell.className = 'field-name';
    fieldCell.textContent = formatFieldName(field);
    row.appendChild(fieldCell);

    const valueCell = document.createElement('td');
    const inputContainer = document.createElement('div');
    inputContainer.className = 'input-container';

    const input = document.createElement('input');
    input.type = 'text';
    input.value = value || '';
    input.dataset.field = field;
    input.placeholder = 'Enter value...';

    inputContainer.appendChild(input);
    valueCell.appendChild(inputContainer);
    row.appendChild(valueCell);

    const actionsCell = document.createElement('td');
    actionsCell.className = 'actions-cell';

    const buttonGroup = document.createElement('div');
    buttonGroup.className = 'button-group';

    const editButton = document.createElement('button');
    editButton.className = 'icon-button edit-btn';
    editButton.title = 'Edit field';
    editButton.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18">
      <path fill="currentColor" d="M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z" />
    </svg>`;
    editButton.onclick = () => {
      input.focus();
      input.select();
    };

    const clearButton = document.createElement('button');
    clearButton.className = 'icon-button clear-btn';
    clearButton.title = 'Clear field';
    clearButton.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18">
      <path fill="currentColor" d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z" />
    </svg>`;
    clearButton.onclick = () => {
      input.value = '';
      input.focus();
    };

    buttonGroup.appendChild(editButton);
    buttonGroup.appendChild(clearButton);
    actionsCell.appendChild(buttonGroup);
    row.appendChild(actionsCell);

    table.appendChild(row);
  }

  resultsContainer.appendChild(table);

  const buttonContainer = document.createElement('div');
  buttonContainer.className = 'action-buttons';

  const cancelButton = document.createElement('button');
  cancelButton.className = 'secondary-button';
  cancelButton.textContent = 'Cancel';
  cancelButton.onclick = () => {
    resultsContainer.style.display = 'none';
  };

  const saveButton = document.createElement('button');
  saveButton.className = 'primary-button';
  saveButton.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18">
    <path fill="currentColor" d="M15,9H5V5H15M12,19A3,3 0 0,1 9,16A3,3 0 0,1 12,13A3,3 0 0,1 15,16A3,3 0 0,1 12,19M17,3H5C3.89,3 3,3.9 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V7L17,3Z" />
  </svg> Save Changes`;
  saveButton.onclick = () => saveUpdatedData();

  buttonContainer.appendChild(cancelButton);
  buttonContainer.appendChild(saveButton);
  resultsContainer.appendChild(buttonContainer);

  // Add animation
  setTimeout(() => {
    resultsContainer.style.opacity = '1';
    resultsContainer.style.transform = 'translateY(0)';
  }, 10);
}


// Format field names for display
function formatFieldName(field) {
  return field
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^./, str => str.toUpperCase())
    .trim();
}

// Create the results container if it doesn't exist
function createResultsContainer() {
  const container = document.createElement('div');
  container.id = 'extractedDataContainer';
  container.className = 'extracted-data-container';
  
  // Initial styles for animation
  container.style.opacity = '0';
  container.style.transform = 'translateY(20px)';
  container.style.transition = 'all 0.3s ease';
  
  document.body.appendChild(container);
  return container;
}

// Enhanced saveUpdatedData function with PMS integration logic
async function saveUpdatedData() {
    const inputs = document.querySelectorAll('#extractedDataContainer input');
    const updatedData = {};
    
    inputs.forEach(input => {
        updatedData[input.dataset.field] = input.value;
    });
    
    debugLog('💾', 'Updated data:', updatedData);
    
    try {
        // Convert extracted MRZ data to guest object
        const guestData = mapMrzToGuest(updatedData);
        
        // Get reservation data (this would come from your system)
        const reservationData = selectedReservation;
        
        // Get original guest data for comparison
        const originalGuest = reservationData.reservationGuest;
        
        // Update guest profile
        const updatedGuest = await updateGuestProfile(reservationData, originalGuest, guestData, false);
        
        alert('Guest profile updated successfully!');
        handleComplete(); // Reset the UI after saving
    } catch (error) {
        console.error('Error updating guest profile:', error);
        alert('Failed to update guest profile: ' + error.message);
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
        documents: [{
            docType: getDocumentType(mrzData.document_code),
            docNumber: mrzData.document_number || '',
            expiryDate: mrzData.expiry_date || '',
            issueCountry: mrzData.issuer_code || '',
            givenname: mrzData.given_name || '',
            surname: mrzData.surname || '',
            birthDate: mrzData.birth_date || '',
            nationality: mrzData.nationality_code || '',
            docFile: base64Image 
        }]
    };
}

// Get document type based on MRZ document code
function getDocumentType(docCode) {
    const docTypeMap = {
        'P': 'PASSPORT',
        'I': 'ID_CARD',
        'A': 'IDENTITY_CARD',
        'C': 'IDENTITY_CARD',
        'V': 'VISA'
    };
    return docTypeMap[docCode] || 'PASSPORT';
}

// Main update guest function (JavaScript version of Java updateGuest method)
async function updateGuestProfile(checkin, originalGuest, guestData) {
    logToFile('Update guest:', originalGuest?.givenName, originalGuest?.surname, '- Overwrite:', API_CONFIG.Ohip_overwrite);

    
    // Prepare the profile update request
    const updateRequest = {
        profileDetails: {
            profileType: 'GUEST',
            customer: {},
            emails: null,
            telephones: null,
            addresses: null
        }
    };
    
    // Set profile ID if original guest exists
    if (originalGuest?.id) {
        updateRequest.profileIdList = [{
            id: originalGuest.id,
            type: 'Profile'
        }];
    }
        
    // Update customer information
    const customer = updateRequest.profileDetails.customer;
    
    // Update name if forced or different
    if (API_CONFIG.Ohip_overwrite || !originalGuest || 
        originalGuest.firstName !== guestData.firstName || 
        originalGuest.lastName !== guestData.lastName) {
        
        customer.personName = [{
            nameType: 'PRIMARY',
            givenName: guestData.firstName,
            surname: guestData.lastName
        }];
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
            identificationInfo: []
        };
        
        // Process ID and Passport documents
        guestData.documents
            .filter(d => d.docType !== 'REG_CARD' && d.docType !== 'IMMIGRATION_CARD')
            .forEach(doc => {
                identifications.identificationInfo.push({
                    identification: {
                        idNumber: doc.docNumber,
                        idType: convertDocType(doc.docType),
                        expirationDate: doc.expiryDate,
                        issuedCountry: convertCountryCode(doc.issueCountry),
                        issueDate: doc.issueDate,
                        registeredProperty: API_CONFIG.Ohip_hotelId,
                        orderSequence: 1,
                        primaryInd: true
                    }
                });
                
                // Add alternate name if document has different name
                if (!originalGuest?.alternateName && doc.givenname) {
                    if (!customer.personName) customer.personName = [];
                    customer.personName.push({
                        givenName: doc.givenname,
                        surname: doc.surname,
                        nameType: 'ALTERNATE'
                    });
                }
                
                // Use document data if customer data is missing
                if (!customer.birthDate) customer.birthDate = doc.birthDate;
                if (!customer.nationality) customer.nationality = convertCountryCode(doc.nationality);
            });
        
        if (identifications.identificationInfo.length > 0) {
            customer.identifications = identifications;
        }
    }
    
    // Set language
    customer.language = originalGuest?.language || getDefaultLanguage();
    
    // Update email if different
    if (guestData.email && guestData.email.trim() && originalGuest &&
        !guestData.email.toLowerCase().equals(originalGuest.email?.toLowerCase())) {
        
        updateRequest.profileDetails.emails = {
            emailInfo: [{
                email: {
                    emailAddress: guestData.email,
                    primaryInd: true,
                    orderSequence: 1,
                    emailFormat: 'HTML',
                    type: 'EMAIL'
                }
            }]
        };
    }
    
    // Update mobile phone if different
    if (guestData.mobile && guestData.mobile.trim() && originalGuest &&
        !guestData.mobile.equals(originalGuest.mobile)) {
        
        updateRequest.profileDetails.telephones = {
            telephoneInfo: [{
                telephone: {
                    phoneNumber: guestData.mobile,
                    phoneTechType: 'PHONE',
                    phoneUseType: 'MOBILE'
                }
            }]
        };
    }
    
    // Update address if different
    if (guestData.address && guestData.address.trim() && originalGuest &&
        !guestData.address.equals(originalGuest.address)) {
        
        updateRequest.profileDetails.addresses = {
            addressInfo: [{
                address: {
                    addressLine: [guestData.address, guestData.address1, guestData.address2].filter(Boolean),
                    country: {
                        code: convertCountryCode(guestData.country)
                    },
                    cityName: guestData.city,
                    postalCode: guestData.zipcode,
                    state: guestData.state
                }
            }]
        };
    }
    
    // Make the API call to update the profile
    try {
        const authorization = await getAuthorization();
        const response = await updateProfileAPI(originalGuest.id, authorization, updateRequest);
        // const response = "success"; // Simulated response for testing   

        
        logToFile('Profile update response:', JSON.stringify(response, null, 2));
        logToFile('Successfully updated guest profile for:', originalGuest.givenName, originalGuest.surname);

                // Upload document files if available
        if (shouldUploadDocuments()) {
            await processDocumentUploads(checkin, originalGuest, guestData);
        }

        return response;
    } catch (error) {
        console.error('Failed to update guest profile:', error);
        throw error;
    }
}

// Document upload processing
async function processDocumentUploads(checkin, originalGuest, guestData) {
    logToFile('Processing document uploads for guest:', JSON.stringify(guestData));
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
                console.error('Failed to upload document:', error);
                return false;
            }
        }
        return true;
    });
    
    const results = await Promise.all(uploadPromises);
    return results.every(result => result === true);
}

// Upload ID document
async function postIdDocument(guestId, name, docFile) {
    logToFile('Attaching ID document for', name, 'with profile ID', guestId);
    const fileUpload = createFileUpload(name, docFile, guestId, 'Guest', 'ID Document');
    logToFile('File upload object created:', JSON.stringify(fileUpload));
    try {
        const response = await uploadFileWithAuth(fileUpload);
        logToFile('ID document attached successfully:', fileUpload.fileName);
        return true;
    } catch (error) {
        console.error('Failed to attach ID document:', fileUpload?.fileName, error);
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
        console.error('Unsupported file format:', typeof docFile);
        return 'UNKNOWN';
    }

    if (!fileBytes || fileBytes.length < 8) {
        return 'UNKNOWN'; // Not enough bytes to determine format
    }

    // Check for JPEG signature (FF D8 FF)
    if (fileBytes[0] === 0xFF && fileBytes[1] === 0xD8 && fileBytes[2] === 0xFF) {
        return 'jpg';
    }
    // Check for PNG signature (89 50 4E 47 0D 0A 1A 0A)
    else if (fileBytes[0] === 0x89 && 
             fileBytes[1] === 0x50 &&
             fileBytes[2] === 0x4E && 
             fileBytes[3] === 0x47 &&
             fileBytes[4] === 0x0D && 
             fileBytes[5] === 0x0A &&
             fileBytes[6] === 0x1A && 
             fileBytes[7] === 0x0A) {
        return 'png';
    }
    // Check for PDF signature (25 50 44 46 2D -> %PDF-)
    else if (fileBytes[0] === 0x25 && 
             fileBytes[1] === 0x50 &&
             fileBytes[2] === 0x44 && 
             fileBytes[3] === 0x46 &&
             fileBytes[4] === 0x2D) {
        return 'pdf';
    } else {
        return 'UNKNOWN';
    }
}

// Updated createFileUpload function
function createFileUpload(name, docFile, linkId, linkType, description) {
    const timestamp = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15);
    const extension = getFileExtension(docFile);
    logToFile('Creating file upload with name:', name, 'and extension:', extension);
    
    return {
        fileAttachment: docFile, // Keep as base64 string for API
        fileName: `${name}_${timestamp}.${extension}`,
        linkId: linkId,
        linkType: linkType,
        userName: 'TEST_USER', // Replace with actual user name if available
        description: description,
        globalYN: 'N',
        overwriteExistingFileYN: 'N',
        hotelId: API_CONFIG.Ohip_hotelId
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
        logToFile('📤 File Upload Request:', JSON.stringify({
            method: 'POST',
            url: endpoint,
            headers: {
                'Content-Type': 'application/json',
                'authorization': 'Bearer *****', // Masked
                'x-app-key': API_CONFIG.Ohip_appKey,
                'x-hotelid': API_CONFIG.Ohip_hotelId
            },
            payload: {
                ...fileToUpload,
                fileAttachment: fileToUpload.fileAttachment 
                    ? `<binary data (${fileToUpload.fileAttachment.length} bytes)>` 
                    : undefined
            }
        }));

        // Get authorization token
        const authorization = await getAuthorization();
        
        // Make the API call
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'authorization': authorization,
                'x-app-key': API_CONFIG.Ohip_appKey,
                'x-hotelid': API_CONFIG.Ohip_hotelId
            },
            body: JSON.stringify(fileToUpload)
        });

        const responseTime = Date.now() - startTime;
        const responseData = await response.json();

        // Log successful response
        logToFile('✅ File Upload Success:', {
            status: response.status,
            timeTaken: `${responseTime}ms`,
            response: responseData
        });

        if (!response.ok) {
            // Log error response
            console.error('❌ File Upload Failed:', {
                status: response.status,
                error: responseData,
                timeTaken: `${responseTime}ms`
            });
            throw new Error(`File upload failed with status ${response.status}`);
        }

        return responseData;

    } catch (error) {
        console.error('🚨 File Upload Error:', {
            error: error.message,
            stack: error.stack,
            timeTaken: `${Date.now() - startTime}ms`
        });
        throw error;
    }
}

// Helper functions
function convertGender(gender) {
    const genderMap = { 'M': 'Male', 'F': 'Female' };
    return genderMap[gender] || null;
}

function convertCountryCode(countryCode) {
    // This would contain your country code conversion logic
    return countryCode;
}

function convertDocType(docType) {
    const docTypeMap = {
        'PASSPORT': 'PASSPORT',
        'ID_CARD': 'NATIONAL_ID',
        'IDENTITY_CARD': 'NATIONAL_ID'
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
    logToFile('📤 API Request:', JSON.stringify({
        method: 'PUT',
        url: url,
        headers: {
            'Content-Type': 'application/json',
            'authorization': 'Bearer *****', // Masked for security
            'x-app-key': API_CONFIG.Ohip_appKey,
            'x-hotelid': API_CONFIG.Ohip_hotelId
        },
        body: request
    }));

    try {
        const startTime = Date.now();
        const response = await fetch(url, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'authorization': authorization,
                'x-app-key': API_CONFIG.Ohip_appKey,
                'x-hotelid': API_CONFIG.Ohip_hotelId
            },
            body: JSON.stringify(request)
        });

        const responseTime = Date.now() - startTime;
        const responseData = await response.json();

        // Log the successful response
        logToFile('📥 API Response:', {
            status: response.status,
            statusText: response.statusText,
            responseTime: `${responseTime}ms`,
            data: responseData
        });

        if (!response.ok) {
            // Log error response separately
            console.error('❌ API Error:', {
                status: response.status,
                statusText: response.statusText,
                error: responseData
            });
            throw new Error(`API request failed with status ${response.status}: ${response.statusText}`);
        }

        return responseData;
    } catch (error) {
        console.error('🚨 API Request Failed:', JSON.stringify({
            error: error.message,
            stack: error.stack
        }));
        throw error;
    }
}


// Show loading overlay
function showLoading(message = 'Loading...') {
  debugLog('⏳', 'Showing loading:', message);
  const overlay = document.getElementById('loadingOverlay');
  const text = document.getElementById('loadingText');
  if (overlay && text) {
    text.textContent = message;
    overlay.style.display = 'flex';
  }
}

// Hide loading overlay
function hideLoading() {
  debugLog('✅', 'Hiding loading overlay');
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
    alert('Search error: ' + error.message);
  } finally {
    hideLoading();
  }
}

debugLog('📋', 'Renderer script loaded');