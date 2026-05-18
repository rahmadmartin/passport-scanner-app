const assert = require('assert');

const { createInitialRendererState } = require('../renderer/app-state');
const { createDebugLogger } = require('../renderer/debug-log');
const { demoReservations } = require('../renderer/demo-reservations');
const { getRendererElements } = require('../renderer/dom-elements');
const {
  base64ToBlob,
  base64ToUint8Array,
  getFileExtension,
  safeBase64Decode,
} = require('../renderer/file-utils');
const {
  convertDocType,
  convertGender,
  getDefaultLanguage,
  getDocumentType,
  mapMrzToGuest,
  shouldUploadDocuments,
} = require('../renderer/guest-mapper');
const { createMrzScanner } = require('../renderer/mrz-scanner');
const { createOhipProfileClient } = require('../renderer/ohip-profile-client');
const {
  createOhipReservationClient,
} = require('../renderer/ohip-reservation-client');
const { createReservationRenderer } = require('../renderer/reservation-renderer');

class TestClassList {
  constructor() {
    this.values = new Set();
  }

  add(value) {
    this.values.add(value);
  }

  remove(value) {
    this.values.delete(value);
  }

  contains(value) {
    return this.values.has(value);
  }
}

class TestElement {
  constructor(tagName = 'div', id = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.classList = new TestClassList();
    this.listeners = {};
    this._className = '';
    this.innerHTML = '';
    this.textContent = '';
    this.value = '';
    this.disabled = false;
  }

  set className(value) {
    this._className = value;
    this.classList = new TestClassList();
    value
      .split(/\s+/)
      .filter(Boolean)
      .forEach((className) => this.classList.add(className));
  }

  get className() {
    return this._className;
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  addEventListener(eventName, callback) {
    this.listeners[eventName] = callback;
  }

  getBoundingClientRect() {
    return { left: 0, top: 0, width: 100, height: 100 };
  }
}

function createDocumentStub() {
  const elements = new Map();

  return {
    body: new TestElement('body', 'body'),
    created: [],
    elements,
    createElement(tagName) {
      const element = new TestElement(tagName);
      this.created.push(element);
      return element;
    },
    getElementById(id) {
      if (!elements.has(id)) {
        elements.set(id, new TestElement('div', id));
      }
      return elements.get(id);
    },
    querySelector(selector) {
      if (selector.startsWith('#')) return this.getElementById(selector.slice(1));
      return this.getElementById(selector.replace(/[^a-zA-Z0-9_-]/g, ''));
    },
    querySelectorAll(selector) {
      return Array.from(elements.values()).filter((element) =>
        element.classList.contains(selector.replace('.', '')),
      );
    },
  };
}

function createJsonResponse(payload, ok = true, status = 200) {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}

function assertEqual(actual, expected, label) {
  assert.strictEqual(actual, expected, label);
  console.log('PASS', label);
}

function assertDeepEqual(actual, expected, label) {
  assert.deepStrictEqual(actual, expected, label);
  console.log('PASS', label);
}

async function runTests() {
  const state = createInitialRendererState();
  assertDeepEqual(
    state,
    {
      capturedImageData: null,
      cameraStream: null,
      selectedReservation: null,
      selectedDocumentType: 'passport',
      base64Image: null,
      extractedReservationNumber: '',
      isProcessingCapture: false,
      currentStep: 1,
      currentCompanionIndex: 0,
      companions: [],
      isCompanionScan: false,
    },
    'app-state creates the expected initial renderer state',
  );

  const sentLogs = [];
  const consoleLogs = [];
  const debugLog = createDebugLogger(
    { send: (...args) => sentLogs.push(args) },
    { log: (...args) => consoleLogs.push(args) },
  );
  debugLog('T', 'message', { ok: true });
  assertDeepEqual(
    sentLogs[0],
    ['log-message', 'T [RENDERER] message', { ok: true }],
    'debug-log sends formatted log messages over IPC',
  );
  assertDeepEqual(
    consoleLogs[0],
    ['T [RENDERER] message', { ok: true }],
    'debug-log mirrors formatted log messages to console',
  );

  assert.ok(Array.isArray(demoReservations), 'demo-reservations exports an array');
  assert.ok(demoReservations.length > 0, 'demo-reservations includes demo data');
  assert.ok(
    demoReservations[0].reservationIdList?.some((id) => id.type === 'Reservation'),
    'demo-reservations includes reservation IDs',
  );
  console.log('PASS demo-reservations exports usable reservation fixtures');

  const domCalls = [];
  const documentForElements = {
    querySelectorAll: (selector) => {
      domCalls.push(['querySelectorAll', selector]);
      return [`all:${selector}`];
    },
    getElementById: (id) => {
      domCalls.push(['getElementById', id]);
      return `id:${id}`;
    },
  };
  const elements = getRendererElements(documentForElements);
  assertDeepEqual(elements.steps, ['all:.step-section'], 'dom-elements reads step sections');
  assertEqual(elements.captureBtn, 'id:captureBtn', 'dom-elements reads capture button');
  assertEqual(
    elements.finalReservationNumber,
    'id:finalReservationNumber',
    'dom-elements reads final reservation number input',
  );

  const pngBase64 = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]).toString('base64');
  assertEqual(
    base64ToUint8Array(Buffer.from('abc').toString('base64'))[1],
    'b'.charCodeAt(0),
    'file-utils converts base64 to Uint8Array',
  );
  assertEqual(
    getFileExtension(`data:image/png;base64,${pngBase64}`),
    'png',
    'file-utils detects PNG data URLs',
  );
  assertEqual(
    getFileExtension(new Uint8Array([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0])),
    'jpg',
    'file-utils detects JPG byte arrays',
  );
  assertEqual(
    getFileExtension(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0, 0, 0])),
    'pdf',
    'file-utils detects PDF byte arrays',
  );
  assertEqual(safeBase64Decode(Buffer.from('hello').toString('base64')), 'hello', 'file-utils safely decodes base64');
  assertEqual((await base64ToBlob(Buffer.from('x').toString('base64')).text()), 'x', 'file-utils converts base64 to Blob');
  assert.throws(
    () => safeBase64Decode('not valid base64!'),
    /Failed to decode base64 document data/,
    'file-utils rejects invalid base64',
  );
  console.log('PASS file-utils rejects invalid base64');

  assertEqual(getDocumentType('P'), 'PASSPORT', 'guest-mapper maps passport document codes');
  assertEqual(getDocumentType('I'), 'ID_CARD', 'guest-mapper maps ID document codes');
  assertEqual(getDocumentType('X'), 'PASSPORT', 'guest-mapper falls back to passport document type');
  assertEqual(convertGender('M'), 'Male', 'guest-mapper converts male gender');
  assertEqual(convertGender('F'), 'Female', 'guest-mapper converts female gender');
  assertEqual(convertGender('X'), null, 'guest-mapper returns null for unknown gender');
  assertEqual(convertDocType('ID_CARD'), 'NATIONAL_ID', 'guest-mapper converts ID card doc type');
  assertEqual(convertDocType('UNKNOWN'), 'PASSPORT', 'guest-mapper falls back to passport API doc type');
  assertEqual(getDefaultLanguage(), 'E', 'guest-mapper returns default language');
  assertEqual(shouldUploadDocuments(), true, 'guest-mapper enables document uploads');
  assertDeepEqual(
    mapMrzToGuest(
      {
        given_name: 'Jane',
        surname: 'Doe',
        nationality_code: 'IDN',
        birth_date: '1990-01-01',
        sex: 'F',
        document_code: 'P',
        document_number: 'A123',
        expiry_date: '2030-01-01',
        issuer_code: 'IDN',
      },
      'doc-data',
    ),
    {
      firstName: 'Jane',
      lastName: 'Doe',
      nationality: 'IDN',
      birthDate: '1990-01-01',
      gender: 'F',
      documents: [
        {
          docType: 'PASSPORT',
          docNumber: 'A123',
          expiryDate: '2030-01-01',
          issueCountry: 'IDN',
          givenname: 'Jane',
          surname: 'Doe',
          birthDate: '1990-01-01',
          nationality: 'IDN',
          docFile: 'doc-data',
        },
      ],
    },
    'guest-mapper maps MRZ data to guest payload shape',
  );

  const reservationDocument = createDocumentStub();
  const reservation = {
    reservationIdList: [
      { id: 'R1', type: 'Reservation' },
      { id: 'C1', type: 'Confirmation' },
    ],
    reservationGuest: { givenName: 'Jane', surname: 'Doe' },
    reservationStatus: 'Confirmed',
    roomStay: {
      roomId: '101',
      arrivalDate: '2026-05-18',
      departureDate: '2026-05-20',
    },
  };
  let selectedReservation = null;
  const renderer = createReservationRenderer({
    documentRef: reservationDocument,
    onSelect: (element, selected) => {
      selectedReservation = { element, selected };
    },
  });
  const reservationElement = renderer.createReservationElementFromApi(reservation, 2);
  assertEqual(reservationElement.dataset.index, 2, 'reservation-renderer stores item index');
  assert.ok(
    reservationElement.innerHTML.includes('C1') &&
      reservationElement.innerHTML.includes('Jane Doe') &&
      reservationElement.innerHTML.includes('2 nights'),
    'reservation-renderer renders confirmation, guest name, and duration',
  );
  reservationElement.onclick();
  assertEqual(reservationElement.classList.contains('selected'), true, 'reservation-renderer marks clicked item selected');
  assertEqual(selectedReservation.selected, reservation, 'reservation-renderer calls selection callback');

  const reservationLogs = [];
  const axiosCalls = [];
  const axios = {
    post: async (url, params, options) => {
      axiosCalls.push({ method: 'post', url, params: params.toString(), options });
      return {
        data: {
          access_token: 'not-a-jwt',
          token_type: 'Bearer',
          expires_in: 3600,
        },
      };
    },
    get: async (url, options) => {
      axiosCalls.push({ method: 'get', url, options });
      return {
        data: {
          totalResults: 1,
          reservations: { totalResults: 1, reservationInfo: [{ id: 'R1' }] },
        },
      };
    },
  };
  const reservationClient = createOhipReservationClient({
    config: {
      Ohip_baseURL: 'https://example.test',
      Ohip_appKey: 'app-key',
      Ohip_hotelId: 'HOTEL',
      Ohip_user: 'user',
      Ohip_password: 'pass',
    },
    axios,
    debugLog: (...args) => reservationLogs.push(args),
  });
  const auth = await reservationClient.getAuthorization();
  assertEqual(auth, 'Bearer not-a-jwt', 'ohip-reservation-client builds authorization header from token');
  const cachedAuth = await reservationClient.getAuthorization();
  assertEqual(cachedAuth, 'Bearer not-a-jwt', 'ohip-reservation-client reuses cached token');
  assertEqual(
    axiosCalls.filter((call) => call.method === 'post').length,
    1,
    'ohip-reservation-client only requests one token while cached',
  );
  await reservationClient.findReservations({
    confirmationNumberList: 'CONF1',
    lastName: 'Doe',
    disposition: ['DueIn'],
  });
  const searchCall = axiosCalls.find((call) => call.method === 'get');
  assertDeepEqual(
    searchCall.options.params,
    {
      limit: 100,
      offset: 0,
      confirmationNumberList: 'CONF1',
      surname: 'Doe',
      statuses: ['DueIn'],
    },
    'ohip-reservation-client maps search params to OHIP request params',
  );

  const demoReservationClient = createOhipReservationClient({
    config: { HotelPms: 'DEMO' },
    axios: {},
    debugLog: () => {},
  });
  assertEqual(
    await demoReservationClient.getAuthorization(),
    'Bearer DEMO-MOCK-TOKEN-12345',
    'ohip-reservation-client returns mock auth in demo mode',
  );

  const fetchCalls = [];
  const profileClient = createOhipProfileClient({
    config: {
      Ohip_baseURL: 'https://example.test',
      Ohip_appKey: 'app-key',
      Ohip_hotelId: 'HOTEL',
    },
    debugLog: () => {},
    getAuthorization: async () => 'Bearer token',
    fetchRef: async (url, options) => {
      fetchCalls.push({ url, options });
      return createJsonResponse({ OK: true, profileId: 'P2' });
    },
    alertRef: () => {},
  });
  const uploadResult = await profileClient.uploadFileWithAuth({
    fileName: 'id.jpg',
    fileAttachment: 'abc',
  });
  assertDeepEqual(uploadResult, { OK: true, profileId: 'P2' }, 'ohip-profile-client returns upload response data');
  assertEqual(fetchCalls[0].options.method, 'POST', 'ohip-profile-client uploads files with POST');
  assertEqual(fetchCalls[0].options.headers.authorization, 'Bearer token', 'ohip-profile-client uploads with auth header');

  const registerResult = await profileClient.registerProfileAPI('Bearer provided', {
    profile: true,
  });
  assertDeepEqual(registerResult, { OK: true, profileId: 'P2' }, 'ohip-profile-client registers profile and returns response data');

  const addResult = await profileClient.addAccompanyGuest(
    'Bearer provided',
    [{ id: 'P1' }, { id: 'P2' }, { id: 'P2' }],
    {
      reservationIdList: [{ id: 'R1' }],
      reservationGuest: { id: 'P1' },
    },
  );
  assertDeepEqual(addResult, { OK: true, profileId: 'P2' }, 'ohip-profile-client adds companion guests');
  const addPayload = JSON.parse(fetchCalls[2].options.body);
  assertEqual(
    addPayload.reservations[0].reservationGuests.length,
    2,
    'ohip-profile-client avoids duplicate companion profile IDs',
  );

  await profileClient.createShareResvAPI('Bearer provided', { share: true });
  assertEqual(fetchCalls[3].options.method, 'POST', 'ohip-profile-client creates share reservations with POST');

  const combined = await profileClient.combineShareReservation(
    'Bearer provided',
    [{ id: 'P1' }, { id: 'P2' }],
    {
      reservationIdList: [{ id: 'R1' }],
      paymentMethod: 'CA',
      roomStay: { arrivalDate: '2026-05-18', departureDate: '2026-05-20' },
    },
  );
  assertDeepEqual(await combined.json(), { OK: true, profileId: 'P2' }, 'ohip-profile-client combines share reservations');

  const mrzDocument = createDocumentStub();
  const originalRequestAnimationFrame = global.requestAnimationFrame;
  const originalCancelAnimationFrame = global.cancelAnimationFrame;
  global.requestAnimationFrame = () => 1;
  global.cancelAnimationFrame = () => {};
  const classIds = [
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
    'scanInstruction',
    'countdownProgress',
    'countdownText',
    'captureCountdown',
    'cameraVideo',
  ];
  classIds.forEach((id) => mrzDocument.getElementById(id));
  const base64Images = [];
  const scanner = createMrzScanner({
    config: { Mrz_baseURL: 'https://mrz.test' },
    getSelectedDocumentType: () => 'passport',
    setBase64Image: (value) => base64Images.push(value),
    displayExtractedData: () => {},
    stopCamera: () => {},
    documentRef: mrzDocument,
    fetchRef: async () => createJsonResponse({ status: 'SUCCESS', extraction_rate: 1 }),
    consoleRef: { log: () => {}, warn: () => {} },
  });
  try {
    scanner.start();
    assertEqual(mrzDocument.getElementById('mrzZone').style.display, '', 'mrz-scanner shows MRZ zone on start');
    assertEqual(
      mrzDocument.getElementById('scanInstruction').style.display,
      'none',
      'mrz-scanner hides scan instruction on start',
    );
    assert.ok(base64Images[0].startsWith('data:image/jpeg;base64,'), 'mrz-scanner uses mock image when camera is unavailable');
    console.log('PASS mrz-scanner uses mock image when camera is unavailable');
    scanner.stop();
    assertEqual(mrzDocument.getElementById('mrzZone').style.display, 'none', 'mrz-scanner hides MRZ zone on stop');

    let restarted = false;
    scanner.resetAfterPopup(() => {
      restarted = true;
    });
    assertEqual(restarted, true, 'mrz-scanner restart callback runs after popup reset');
  } finally {
    if (originalRequestAnimationFrame) {
      global.requestAnimationFrame = originalRequestAnimationFrame;
    } else {
      delete global.requestAnimationFrame;
    }

    if (originalCancelAnimationFrame) {
      global.cancelAnimationFrame = originalCancelAnimationFrame;
    } else {
      delete global.cancelAnimationFrame;
    }
  }
}

if (require.main === module) {
  runTests().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { runTests };
