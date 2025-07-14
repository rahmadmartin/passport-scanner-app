const { ipcRenderer } = require('electron');
const axios = require('axios');


// Debug logging helper
function debugLog(emoji, message, data = null) {
    console.log(`${emoji} [RENDERER] ${message}`, data || '');
}

// Global variables
let capturedImageData = null;
let currentStream = null;
let selectedDocumentType = null;
// Token management
let tokenData = {
    token: null,
    expiry: null
};

const API_CONFIG = {
    similarity: 0.5, // Name similarity threshold
    isTest: false, // Set to true for test mode
    hotelId: 'DPHSS', // Replace with your hotel ID
    baseURL: 'https://mtcs1ua.hospitality-api.ap-singapore-1.ocs.oc-test.com', // Replace with your auth endpoint
    appKey: 'fb493ddb-e179-4596-bc7a-7fd1f0461171',
    authMethod: 'OCIM', // or 'PASSWORD'
    enterpriseId: 'DPSPH', // Only for OCIM
    user: '80fe2703f09e487fba77c55696e06ce0', // Only for password auth
    password: '9cc740a4-e311-4353-8a9b-8ef857531771' // Only for password auth
};

const apiClient = axios.create({
    baseURL: API_CONFIG.baseURL,
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


// Add this listener at the top of your file:
ipcRenderer.on('manual-lookup-data', (event, { reservationId, lastName }) => {
    console.log('🎯 Received lookup data in main window:', { reservationId, lastName });
    
    // 1. Populate fields
    if (elements.reservationNumber) {
        elements.reservationNumber.value = reservationId || '';
    }
    
    if (elements.lastNameInput) {
        elements.lastNameInput.value = lastName || '';
    }

    console.log('📋 Fields populated:', {
        reservationNumber: elements.reservationNumber.value,
        lastName: elements.lastNameInput.value
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


async function getToken() {
    debugLog('🔑', 'Checking token status...');
    
    // Check if we have a valid token
    if (tokenData.token && tokenData.expiry && new Date() < new Date(tokenData.expiry.getTime() - 60000)) {
        debugLog('✅', 'Using cached token');
        return tokenData;
    }
    
    debugLog('🔄', 'Requesting new token...');
    
    const isOCIM = API_CONFIG.authMethod.toUpperCase() === 'OCIM';
    
    try {
        // Prepare form data for URL-encoded request
        const params = new URLSearchParams();
        params.append('grant_type', isOCIM ? 'client_credentials' : 'password');
        
        if (isOCIM) {
            params.append('operaEntId', API_CONFIG.enterpriseId);
            params.append('scope', 'urn:opc:hgbu:ws:__myscopes__');
        } else {
            params.append('username', API_CONFIG.user);
            params.append('password', API_CONFIG.password);
        }
        
        // Prepare headers
        const headers = {
            'Content-Type': 'application/x-www-form-urlencoded',
            'x-app-key': API_CONFIG.appKey
        };
        
        if (isOCIM) {
            headers['enterpriseId'] = API_CONFIG.enterpriseId;
            // Generate Basic auth header from username and password
            const basicAuthString = Buffer.from(`${API_CONFIG.user}:${API_CONFIG.password}`).toString('base64');
            headers['Authorization'] = `Basic ${basicAuthString}`;
        }
        
        console.log('🔍 Token request headers:', JSON.stringify(headers, null, 2));
        console.log('🔍 Token request params:', params.toString());
        
        const response = await axios.post(
            `${API_CONFIG.baseURL}/oauth/v1/tokens`,
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
        let reservationList = null;
        if (reservationId && reservationId.trim() !== '' && reservationId !== '*') {
            reservationList = [reservationId];
        }

        let searchParams = {
            reservationIds: null,
            confirmationNumberList: reservationList,
            externalReferenceIds: reservationList,
            customReference: null,
            lastName: lastName,
            room: room,
            arrivalStartDate: arrival,
            departureStartDate: departure,
            arrivalEndDate: arrivalEnd,
            departureEndDate: departureEnd,
            disposition: disposition
        };

        // debugLog('🔍', 'First search attempt with params:', searchParams);
        let searchResponse = await findReservations(searchParams);

        debugLog('🔍', `First search found JSONStringify ${JSON.stringify(searchResponse.totalResults)} reservations`);


        // debugLog('🔍', `First search found JSONStringify ${JSON.stringify(searchResponse.data)} reservations`);

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

        console.log('🔍 Second search found reservations:', JSON.stringify(searchResponse.totalResults));

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
            requestBody.surName = searchParams.lastName;
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
            'x-hotelid': API_CONFIG.hotelId,
            'x-app-key': API_CONFIG.appKey,
            'Authorization': authorization
        };
        
        const baseUrl = `${API_CONFIG.baseURL}/rsv/v1/hotels/${API_CONFIG.hotelId}/reservations`;
        
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
        
        // console.log('🔍 Reservation search headers:', JSON.stringify(headers, null, 2));
        // console.log('🔍 Reservation search params:', JSON.stringify(requestBody, null, 2));
        
        const response = await axios.get(baseUrl, { headers, params: requestBody });

        /* The above code is making an asynchronous GET request using the axios library in JavaScript.
        It is sending a request to the `baseUrl` with specified headers and request parameters
        contained in the `requestBody`. The response from the request is stored in the `response`
        variable. */
        // console.log('🔍 Reservation search response:', JSON.stringify(response.data, null, 2));
        console.log('🔍 Complete URL:', completeUrl);

        console.log('🔍 Reservation search response:', JSON.stringify(response.data.reservations.totalResults, null, 2));


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
        alert('Please provide either reservation number or last name');
        return;
    }
    
    showLoading(reservationNum ? 'Calling API...' : `Searching for ${lastName}...`);
    
    try {
        console.log('🔄', 'Making request with:', 
                 reservationNum ? `Reservation: ${reservationNum}` : `Name: ${lastName}`);
        
        // Prepare search parameters
        const searchParams = {};
        
        if (reservationNum) {
            // Check if it's a test mode wildcard
            if (API_CONFIG.isTest && reservationNum === '*') {
                searchParams.reservationIds = null;
            } else {
                searchParams.reservationIds = [reservationNum];
                searchParams.confirmationIds = [reservationNum];
                searchParams.externalReferenceIds = [reservationNum];
                searchParams.customReference = reservationNum;
            }
        }
        
        if (lastName) {
            searchParams.lastName = lastName;
        }
        
        // Add date filters if needed (uncomment and modify as needed)
        // if (!API_CONFIG.isTest) {
        //     searchParams.arrivalStartDate = 'YYYY-MM-DD';
        //     searchParams.departureEndDate = 'YYYY-MM-DD';
        // }
        
        // Perform the search
        const response = await doFindReservation(reservationNum, lastName, null, [], null, null, null, null, false);

        console.log('📥', 'Reservations found:', JSON.stringify(response.totalResults));

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
    
    // This is a basic implementation - customize based on your UI needs
    const resultContainer = document.getElementById('reservation-results');
    if (resultContainer) {
        resultContainer.innerHTML = '';
        
        reservations.forEach(reservation => {
            const reservationDiv = document.createElement('div');
            reservationDiv.className = 'reservation-item';
            reservationDiv.innerHTML = `
                <h3>Reservation: ${reservation.confirmation_id || reservation.id}</h3>
                <p>Guest: ${reservation.guest ? `${reservation.guest.first_name} ${reservation.guest.last_name}` : 'N/A'}</p>
                <p>Status: ${reservation.status || 'Unknown'}</p>
                <p>Room: ${reservation.room_number || 'TBD'}</p>
            `;
            resultContainer.appendChild(reservationDiv);
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