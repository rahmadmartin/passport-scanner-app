const MRZ_MIN_EXTRACTION_RATE = 0.5;
const MRZ_REQUIRED_FRAMES = 1;
const MRZ_COUNTDOWN_MS = 2000;
const MRZ_POLL_INTERVAL_MS = 800;
const MRZ_CAPTURE_WATCHDOG_MS = 6000;
const CIRCUMFERENCE = 163.4;

const MRZ_STATE = Object.freeze({
  IDLE: 'idle',
  SCANNING: 'scanning',
  LOCKED: 'locked',
  COUNTDOWN: 'countdown',
  CAPTURED: 'captured',
  ERROR: 'error',
});

function createMrzScanner({
  config,
  getSelectedDocumentType,
  setBase64Image,
  displayExtractedData,
  stopCamera,
  documentRef = document,
  fetchRef = fetch,
  consoleRef = console,
}) {
  let mrzState = MRZ_STATE.IDLE;
  let mrzAlignedFrames = 0;
  let mrzDetectionLoop = null;
  let mrzCountdownRaf = null;
  let mrzCountdownStart = 0;
  let mrzApiPending = false;
  let mrzConsecutiveFails = 0;
  let mrzCaptureWatchdog = null;
  let mrzAbortController = null;

  function setMrzState(nextState, payload = null) {
    if (mrzState === nextState) return;

    consoleRef.log(`MRZ: ${mrzState} -> ${nextState}`);

    cleanupState(mrzState);
    mrzState = nextState;

    switch (nextState) {
      case MRZ_STATE.IDLE:
        setDetected(false);
        break;
      case MRZ_STATE.SCANNING:
        mrzAlignedFrames = 0;
        mrzConsecutiveFails = 0;
        setDetected(false);
        startPolling();
        break;
      case MRZ_STATE.LOCKED:
        stopPolling();
        setDetected(true);
        setMrzState(MRZ_STATE.COUNTDOWN, payload);
        break;
      case MRZ_STATE.COUNTDOWN:
        startCountdown(payload);
        break;
      case MRZ_STATE.CAPTURED:
        startCaptureWatchdog();
        triggerAutoCapture(payload);
        break;
      case MRZ_STATE.ERROR:
        setDetected(false);
        setText('mrzStatusText', 'MRZ service unreachable');
        break;
    }
  }

  function cleanupState(prevState) {
    switch (prevState) {
      case MRZ_STATE.SCANNING:
        stopPolling();
        abortPendingRequest();
        break;
      case MRZ_STATE.COUNTDOWN:
        stopCountdown();
        break;
      case MRZ_STATE.CAPTURED:
        stopCaptureWatchdog();
        break;
    }
  }

  function startPolling() {
    if (mrzDetectionLoop) return;
    mrzDetectionLoop = setInterval(pollMlApi, MRZ_POLL_INTERVAL_MS);
  }

  function stopPolling() {
    if (!mrzDetectionLoop) return;
    clearInterval(mrzDetectionLoop);
    mrzDetectionLoop = null;
  }

  function abortPendingRequest() {
    if (mrzAbortController) {
      mrzAbortController.abort();
      mrzAbortController = null;
    }
    mrzApiPending = false;
  }

  function start() {
    if (getSelectedDocumentType() !== 'passport') return;

    show('mrzZone');
    show('mrzStatusBar');
    hide('scanInstruction');

    setText('mrzStatusText', 'Align passport MRZ with zone');
    setDashOffset(CIRCUMFERENCE);
    setText('countdownText', '3');

    setText('mrzBar1', generateMRZLine1());
    setText('mrzBar2', generateMRZLine2());

    setMrzState(MRZ_STATE.SCANNING);
    pollMlApi();
  }

  function stop() {
    setMrzState(MRZ_STATE.IDLE);

    hide('mrzZone');
    hide('mrzStatusBar');
    hide('captureCountdown');
    show('scanInstruction');
    setText('scanInstruction', 'Position document within the frame');
  }

  function resetAfterPopup(restartCamera) {
    mrzAlignedFrames = 0;
    mrzConsecutiveFails = 0;

    setMrzState(MRZ_STATE.IDLE);
    setDetected(false);
    setDashOffset(CIRCUMFERENCE);
    setText('mrzStatusText', 'Align passport MRZ with zone');

    if (typeof restartCamera === 'function') {
      restartCamera();
    }
  }

  async function pollMlApi() {
    if (mrzState !== MRZ_STATE.SCANNING) return;
    if (mrzApiPending) return;

    const video = documentRef.getElementById('cameraVideo');
    const cameraAvailable =
      video && video.readyState >= 2 && video.videoWidth > 0;

    if (!cameraAvailable) {
      consoleRef.warn('MRZ: Camera not available, using mock data');
      setBase64Image(
        'data:image/jpeg;base64,' +
          '/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxAQEBAQEA8PDw8PDw8PDw8PDw8PDw8PFREWFhURFRUYHSggGBolHRUVITEhJSkrLi4uFx8zODMtNygtLisBCgoKDg0OGxAQGi0fHyUtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLf/AABEIAAEAAQMBIgACEQEDEQH/xAAXAAEBAQEAAAAAAAAAAAAAAAABAgAD/8QAFhABAQEAAAAAAAAAAAAAAAAAAAER/9oADAMBAAIQAxAAAAH/AP/EABQQAQAAAAAAAAAAAAAAAAAAACD/2gAIAQEAAQUCcf/EABQRAQAAAAAAAAAAAAAAAAAAACD/2gAIAQMBAT8BJ//EABQRAQAAAAAAAAAAAAAAAAAAACD/2gAIAQIBAT8BJ//EABQQAQAAAAAAAAAAAAAAAAAAACD/2gAIAQEABj8Cf//Z',
      );
      handleApiResult(createMockMrzData());
      return;
    }

    const vW = video.videoWidth;
    const vH = video.videoHeight;
    const fX = Math.floor(vW * 0.15);
    const fY = Math.floor(vH * 0.15);
    const fW = Math.floor(vW * 0.7);
    const fH = Math.floor(vH * 0.7);

    const canvas = documentRef.getElementById('mrzAnalysisCanvas');
    if (!canvas) return;

    const scale = Math.min(1, 640 / fW);
    canvas.width = Math.round(fW * scale);
    canvas.height = Math.round(fH * scale);

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(video, fX, fY, fW, fH, 0, 0, canvas.width, canvas.height);

    const base64Image = canvas.toDataURL('image/jpeg', 0.9);
    setBase64Image(base64Image);

    mrzApiPending = true;
    mrzAbortController = new AbortController();

    try {
      const response = await fetchRef(`${config.Mrz_baseURL}/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base64_image: base64Image.split(',')[1],
          ignore_parse: false,
          type: 'passport',
        }),
        signal: mrzAbortController.signal,
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();

      mrzApiPending = false;
      handleApiResult(data);
    } catch (err) {
      mrzApiPending = false;
      if (err.name !== 'AbortError') handleApiError(err);
    }
  }

  function handleApiResult(data) {
    if (mrzState !== MRZ_STATE.SCANNING) return;

    mrzConsecutiveFails = 0;

    const rate =
      typeof data.extraction_rate === 'number' ? data.extraction_rate : 0;
    const isSuccess =
      data.status === 'SUCCESS' && rate >= MRZ_MIN_EXTRACTION_RATE;

    if (isSuccess) {
      mrzAlignedFrames++;
    } else {
      mrzAlignedFrames = Math.max(0, mrzAlignedFrames - 2);
    }

    if (mrzAlignedFrames >= MRZ_REQUIRED_FRAMES) {
      setMrzState(MRZ_STATE.LOCKED, data);
      return;
    }

    setText(
      'mrzStatusText',
      isSuccess ? 'MRZ found - align closer' : getAlignmentHint(data),
    );
  }

  function handleApiError() {
    if (mrzState !== MRZ_STATE.SCANNING) return;

    mrzConsecutiveFails++;
    if (mrzConsecutiveFails >= 3) {
      setMrzState(MRZ_STATE.ERROR);
    }
  }

  function startCountdown(data) {
    mrzCountdownStart = performance.now();
    show('captureCountdown');
    requestCountdownFrame(data);
  }

  function stopCountdown() {
    if (mrzCountdownRaf) cancelAnimationFrame(mrzCountdownRaf);
    mrzCountdownRaf = null;
    hide('captureCountdown');
    setDashOffset(CIRCUMFERENCE);
    setText('countdownText', '3');
  }

  function requestCountdownFrame(data) {
    mrzCountdownRaf = requestAnimationFrame(() => tickCountdown(data));
  }

  function tickCountdown(data) {
    if (mrzState !== MRZ_STATE.COUNTDOWN) return;

    const elapsed = performance.now() - mrzCountdownStart;
    const progress = Math.min(elapsed / MRZ_COUNTDOWN_MS, 1);

    setDashOffset(CIRCUMFERENCE * (1 - progress));
    setText(
      'countdownText',
      progress >= 1
        ? '3'
        : String(Math.ceil((MRZ_COUNTDOWN_MS - elapsed) / 1000)),
    );

    if (progress >= 1) {
      setMrzState(MRZ_STATE.CAPTURED, data);
      return;
    }

    requestCountdownFrame(data);
  }

  function startCaptureWatchdog() {
    stopCaptureWatchdog();
    mrzCaptureWatchdog = setTimeout(() => {
      consoleRef.warn('MRZ watchdog triggered - resetting.');
      setMrzState(MRZ_STATE.IDLE);
    }, MRZ_CAPTURE_WATCHDOG_MS);
  }

  function stopCaptureWatchdog() {
    if (mrzCaptureWatchdog) {
      clearTimeout(mrzCaptureWatchdog);
      mrzCaptureWatchdog = null;
    }
  }

  function triggerAutoCapture(data) {
    const flash = documentRef.getElementById('captureFlash');
    if (flash) {
      flash.classList.add('active');
      setTimeout(() => flash.classList.remove('active'), 100);
    }

    setTimeout(() => {
      hide('captureCountdown');
      displayExtractedData(data);
      stopCamera();
      stopCaptureWatchdog();
    }, 120);
  }

  function setDetected(on) {
    [
      'frameBorder',
      'cTL',
      'cTR',
      'cBL',
      'cBR',
      'mrzZone',
      'mrzLaser',
      'mrzBar1',
      'mrzBar2',
      'mrzLabel',
      'mrzStatusBar',
      'mrzStatusDot',
    ].forEach((id) => {
      const el = documentRef.getElementById(id);
      if (!el) return;
      if (on) {
        el.classList.add('mrz-detected');
      } else {
        el.classList.remove('mrz-detected');
      }
    });
  }

  function show(id) {
    const el = documentRef.getElementById(id);
    if (el) el.style.display = '';
  }

  function hide(id) {
    const el = documentRef.getElementById(id);
    if (el) el.style.display = 'none';
  }

  function setText(id, text) {
    const el = documentRef.getElementById(id);
    if (el) el.textContent = text;
  }

  function setDashOffset(value) {
    const el = documentRef.getElementById('countdownProgress');
    if (el) el.style.strokeDashoffset = value;
  }

  return { start, stop, resetAfterPopup };
}

function createMockMrzData() {
  return {
    mrz_type: 'TD3',
    document_code: 'P',
    issuer_code: 'AUS',
    surname: 'DOE',
    given_name: 'JOHN',
    document_number: 'X12345678',
    document_number_checkdigit: '7',
    nationality_code: 'IDN',
    birth_date: '1991-01-01',
    birth_date_checkdigit: '3',
    sex: 'M',
    expiry_date: '2028-01-01',
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
}

function getAlignmentHint(data) {
  if (!data || data.status === 'FAILURE') {
    return 'Align passport MRZ with zone';
  }

  if (typeof data.extraction_rate === 'number') {
    return `MRZ confidence ${Math.round(data.extraction_rate * 100)}%`;
  }

  return 'Hold steady';
}

function generateMRZLine1() {
  return 'P' + '<'.repeat(43);
}

function generateMRZLine2() {
  return '<'.repeat(44);
}

module.exports = { createMrzScanner };
