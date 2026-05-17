function getRendererElements(documentRef = document) {
  return {
    steps: documentRef.querySelectorAll('.step-section'),
    progressSteps: documentRef.querySelectorAll('.progress-step'),

    captureBtn: documentRef.getElementById('captureBtn'),
    processBtn: documentRef.getElementById('processBtn'),
    capturePreview: documentRef.getElementById('capturePreview'),
    capturedImage: documentRef.getElementById('capturedImage'),

    backToCapture: documentRef.getElementById('backToCapture'),
    reservationResults: documentRef.getElementById('reservationResults'),
    proceedToDocType: documentRef.getElementById('proceedToDocType'),

    backToReservation: documentRef.getElementById('backToReservation'),
    documentTypeCards: documentRef.querySelectorAll('.document-type-card'),
    proceedToScan: documentRef.getElementById('proceedToScan'),

    backToDocType: documentRef.getElementById('backToDocType'),
    startCameraBtn: documentRef.getElementById('startCameraBtn'),
    captureDocBtn: documentRef.getElementById('captureDocBtn'),
    processDocBtn: documentRef.getElementById('processDocBtn'),
    stopCameraBtn: documentRef.getElementById('stopCameraBtn'),
    retakeDocBtn: documentRef.getElementById('retakeDocBtn'),
    cameraContainer: documentRef.getElementById('cameraContainer'),
    cameraVideo: documentRef.getElementById('cameraVideo'),
    documentPreview: documentRef.getElementById('documentPreview'),
    capturedDocument: documentRef.getElementById('capturedDocument'),

    ocrPopup: documentRef.getElementById('ocrPopup'),
    apiPopup: documentRef.getElementById('apiPopup'),
    reservationNumber: documentRef.getElementById('reservationNumber'),
    finalReservationNumber: documentRef.getElementById(
      'finalReservationNumber',
    ),
    lastNameInput: documentRef.getElementById('lastNameInput'),
    ocrStatus: documentRef.getElementById('ocrStatus'),
    apiStatus: documentRef.getElementById('apiStatus'),
    cancelOcr: documentRef.getElementById('cancelOcr'),
    cancelApi: documentRef.getElementById('cancelApi'),
    editReservationNumber: documentRef.getElementById(
      'editReservationNumber',
    ),
    retryApi: documentRef.getElementById('retryApi'),
    documentDataPopup: documentRef.getElementById('documentDataPopup'),

    loadingOverlay: documentRef.getElementById('loadingOverlay'),
    loadingText: documentRef.getElementById('loadingText'),

    addCompanionBtn: documentRef.getElementById('addCompanionBtn'),
    addShareBtn: documentRef.getElementById('addShareBtn'),
    companionsList: documentRef.getElementById('companionsList'),
    continueToComplete: documentRef.getElementById('continueToComplete'),

    companionPopup: documentRef.getElementById('companionPopup'),
    skipCompanions: documentRef.getElementById('skipCompanions'),
    completeProcess: documentRef.getElementById('completeProcess'),

    minimizeBtn: documentRef.getElementById('minimizeBtn'),
    cancelDocumentData: documentRef.getElementById('cancelDocumentData'),
    saveDocumentData: documentRef.getElementById('saveDocumentData'),
  };
}

module.exports = { getRendererElements };
