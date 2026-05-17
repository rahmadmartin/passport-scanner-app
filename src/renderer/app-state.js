function createInitialRendererState() {
  return {
    capturedImageData: null,
    cameraStream: null,
    selectedReservation: null,
    selectedDocumentType: 'passport',
    base64Image: null,
    extractedReservationNumber: '',
    isProcessingCapture: false,
    currentStep: 1,
    currentCompanionIndex: 0,
    tokenData: {
      token: null,
      expiry: null,
    },
    companions: [],
    isCompanionScan: false,
  };
}

module.exports = { createInitialRendererState };
