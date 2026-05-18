const assert = require('assert');
const Module = require('module');
const path = require('path');

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
    this.readOnly = false;
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

  insertBefore(child) {
    this.children.unshift(child);
    return child;
  }

  addEventListener(eventName, callback) {
    this.listeners[eventName] = callback;
  }

  removeEventListener(eventName) {
    delete this.listeners[eventName];
  }

  focus() {
    this.focused = true;
  }

  getContext() {
    return {
      drawImage: () => {},
      fillRect: () => {},
      fillText: () => {},
    };
  }

  toDataURL() {
    return 'data:image/jpeg;base64,dGVzdA==';
  }

  getBoundingClientRect() {
    return { left: 0, top: 0, width: 100, height: 100 };
  }
}

function createDocumentStub() {
  const elements = new Map();
  const listeners = {};

  function getElementById(id) {
    if (!elements.has(id)) {
      elements.set(id, new TestElement('div', id));
    }
    return elements.get(id);
  }

  return {
    body: new TestElement('body', 'body'),
    elements,
    listeners,
    createElement: (tagName) => new TestElement(tagName),
    getElementById,
    querySelector: (selector) => {
      if (selector === '.controls-rtl') {
        const controls = getElementById('controls-rtl');
        controls.querySelector = (childSelector) =>
          getElementById(childSelector.replace('.', ''));
        return controls;
      }
      if (selector.startsWith('#')) return getElementById(selector.slice(1));
      return getElementById(selector.replace(/[^a-zA-Z0-9_-]/g, ''));
    },
    querySelectorAll: (selector) => {
      if (selector === '.document-type-card') {
        const passport = getElementById('passport-card');
        passport.dataset.type = 'passport';
        passport.className = 'document-type-card';
        return [passport];
      }

      return Array.from(elements.values()).filter((element) =>
        element.classList.contains(selector.replace('.', '')),
      );
    },
    addEventListener: (eventName, callback) => {
      listeners[eventName] = callback;
    },
  };
}

function assertEqual(actual, expected, label) {
  assert.strictEqual(actual, expected, label);
  console.log('PASS', label);
}

async function runTests() {
  const rendererPath = path.resolve(__dirname, '../renderer.js');
  const originalLoad = Module._load;
  const originalDocument = global.document;
  const originalWindow = global.window;
  const originalFetch = global.fetch;
  const originalAlert = global.alert;

  const ipcListeners = {};
  const ipcInvocations = [];
  const ipcSentMessages = [];
  const electronMock = {
    ipcRenderer: {
      on: (channel, callback) => {
        ipcListeners[channel] = callback;
      },
      send: (...args) => {
        ipcSentMessages.push(args);
      },
      invoke: async (channel, ...args) => {
        ipcInvocations.push([channel, ...args]);
        return '1.2.3-test';
      },
      removeAllListeners: (channel) => {
        delete ipcListeners[channel];
      },
    },
  };

  const documentStub = createDocumentStub();
  const windowListeners = {};
  global.document = documentStub;
  global.window = {
    addEventListener: (eventName, callback) => {
      windowListeners[eventName] = callback;
    },
    searchResults: [],
  };
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({}),
    text: async () => '{}',
  });
  global.alert = () => {};

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'electron') {
      return electronMock;
    }

    if (request === 'axios') {
      return {
        get: async () => ({ data: { reservations: { totalResults: 0 } } }),
        post: async () => ({
          data: {
            access_token: 'mock-token',
            token_type: 'Bearer',
            expires_in: 3600,
          },
        }),
      };
    }

    if (request.endsWith('config-manager') || request.endsWith('config-manager.js')) {
      return {
        loadConfig: () => ({
          HotelPms: 'DEMO',
          Ohip_baseURL: 'https://example.test',
          Ohip_appKey: 'app-key',
          Ohip_hotelId: 'HOTEL',
        }),
      };
    }

    return originalLoad.apply(this, arguments);
  };

  delete require.cache[rendererPath];

  try {
    const renderer = require(rendererPath);
    await Promise.resolve();

    assertEqual(typeof renderer.callReservationApi, 'function', 'renderer.js exports callReservationApi');
    assertEqual(typeof renderer.findReservations, 'function', 'renderer.js exports findReservations');
    assertEqual(typeof renderer.getToken, 'function', 'renderer.js exports getToken');
    assertEqual(typeof renderer.getAuthorization, 'function', 'renderer.js exports getAuthorization');
    assertEqual(typeof renderer.debugLog, 'function', 'renderer.js exports debugLog');

    assertEqual(
      typeof documentStub.listeners.DOMContentLoaded,
      'function',
      'renderer.js registers DOMContentLoaded initialization',
    );
    assertEqual(typeof windowListeners.error, 'function', 'renderer.js registers window error handler');
    assertEqual(
      typeof windowListeners.unhandledrejection,
      'function',
      'renderer.js registers unhandled rejection handler',
    );
    assertEqual(typeof windowListeners.beforeunload, 'function', 'renderer.js registers beforeunload cleanup');

    assertEqual(
      typeof ipcListeners['manual-lookup-data'],
      'function',
      'renderer.js registers manual lookup IPC listener',
    );
    assertEqual(
      typeof ipcListeners['toggle-rtl'],
      'function',
      'renderer.js registers RTL IPC listener',
    );
    assertEqual(
      typeof ipcListeners['reset-app-state'],
      'function',
      'renderer.js registers reset IPC listener',
    );

    assertEqual(
      ipcInvocations.some(([channel]) => channel === 'app-version'),
      true,
      'renderer.js requests app version on load',
    );
    assertEqual(
      await renderer.getAuthorization(),
      'Bearer DEMO-MOCK-TOKEN-12345',
      'renderer.js exposes configured reservation authorization helper',
    );
    assertEqual(
      ipcSentMessages.some(([channel]) => channel === 'log-message'),
      true,
      'renderer.js debug logger sends IPC log messages',
    );
  } finally {
    delete require.cache[rendererPath];
    Module._load = originalLoad;
    global.document = originalDocument;
    global.window = originalWindow;
    global.fetch = originalFetch;
    global.alert = originalAlert;
  }
}

if (require.main === module) {
  runTests().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { runTests };
