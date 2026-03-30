const {
  app,
  BrowserWindow,
  ipcMain,
  screen,
  desktopCapturer,
  nativeImage,
  Menu,
} = require('electron');
const path = require('path');
const fs = require('fs');
const { logToFile, initializeLogger } = require('./logger');

// ===== STARTUP TIME TRACKING =====
let appStartTime = Date.now();
let startupMetrics = {
  appStartTime: appStartTime,
  milestones: [],
};

function recordMilestone(label) {
  const now = Date.now();
  const elapsed = now - appStartTime;
  startupMetrics.milestones.push({
    label,
    timestamp: now,
    elapsedMs: elapsed,
  });
  console.log(`⏱️ [STARTUP] ${label} - ${elapsed / 1000}s`);
  debugLog('⏱️', `Milestone: ${label} - ${elapsed / 1000}s`);
}

function saveStartupMetrics() {
  const totalMs =
    startupMetrics.milestones[startupMetrics.milestones.length - 1]
      ?.elapsedMs || 0;
  const totalSec = (totalMs / 1000).toFixed(2);
  debugLog('📊', `Startup complete in ${totalSec}s`);
}

// Record app start immediately
recordMilestone('app-process-started');
// ===== END STARTUP TIME TRACKING =====

const template = [
  {
    label: 'View',
    submenu: [
      {
        label: 'Right to Left',
        type: 'checkbox',
        click: (menuItem, browserWindow) => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('toggle-rtl', menuItem.checked);
          }

          if (floatingWindow && !floatingWindow.isDestroyed()) {
            floatingWindow.webContents.send('toggle-rtl', menuItem.checked);
          }

          isRtlMode = menuItem.checked;
          repositionFloatingWindow();
        },
      },
    ],
  },
];

const menu = Menu.buildFromTemplate(template);
Menu.setApplicationMenu(menu);

let mainWindow;
let floatingWindow;

let isRtlMode = false;

function debugLog(emoji, message, data = null) {
  logToFile(`${emoji} [MAIN] ${message}`, data || '');
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (floatingWindow) {
      if (floatingWindow.isMinimized()) floatingWindow.restore();
      floatingWindow.focus();
    }
    if (mainWindow && mainWindow.isVisible()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  function createFloatingWindow() {
    recordMilestone('floating-window-creation-started');

    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth } = primaryDisplay.workAreaSize;

    const expandedWidth = 750;
    const expandedHeight = 60;
    const marginSide = 20;
    const marginTop = 20;

    const x = isRtlMode ? marginSide : screenWidth - expandedWidth - marginSide;

    // Platform-specific icon loading
    let icon;
    try {
      const iconPath =
        process.platform === 'darwin'
          ? path.join(__dirname, 'assets/icons/icon.png')
          : path.join(__dirname, 'assets/icons/icon.ico');
      if (fs.existsSync(iconPath)) {
        icon = nativeImage.createFromPath(iconPath);
      }
    } catch (err) {
      console.warn('Icon loading failed:', err.message);
    }

    floatingWindow = new BrowserWindow({
      width: expandedWidth,
      height: expandedHeight,
      x: x,
      y: marginTop,
      minWidth: expandedWidth,
      maxWidth: expandedWidth,
      minHeight: expandedHeight,
      maxHeight: expandedHeight,
      alwaysOnTop: true,
      frame: false,
      transparent: true,
      resizable: false,
      skipTaskbar: true,
      show: false,
      icon: path.join(__dirname, 'assets/icons/icon.ico'),
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        enableRemoteModule: true,
      },
      backgroundColor: '#00000000',
    });

    floatingWindow.once('ready-to-show', () => {
      recordMilestone('floating-window-ready-to-show');
      floatingWindow.show();
    });

    floatingWindow.webContents.once('did-finish-load', () => {
      recordMilestone('floating-window-did-finish-load');
    });

    if (process.platform === 'darwin') {
      app.dock.setIcon(icon);
    }

    floatingWindow.loadFile('src/floating.html');
  }

  function createMainWindow() {
    recordMilestone('main-window-creation-started');

    mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      icon: path.join(__dirname, 'assets/icons/icon.ico'),
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        enableRemoteModule: true,
      },
      show: false,
    });

    mainWindow.webContents.once('did-finish-load', () => {
      recordMilestone('main-window-did-finish-load');
    });

    mainWindow.loadFile('src/index.html');

    mainWindow.on('closed', () => {
      mainWindow = null;
    });

    return mainWindow;
  }

  app.whenReady().then(async () => {
    recordMilestone('app-when-ready');

    await initializeLogger();
    recordMilestone('logger-initialized');

    createFloatingWindow();
    recordMilestone('floating-window-created');

    setTimeout(() => {
      if (floatingWindow && !floatingWindow.isDestroyed()) {
        floatingWindow.show();
        recordMilestone('floating-window-shown');
      }
    }, 100);

    // Log startup metrics after windows are shown
    setTimeout(saveStartupMetrics, 600);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createFloatingWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  ipcMain.handle('set-rtl-mode', (event, isRtl) => {
    isRtlMode = isRtl;
    if (floatingWindow && !floatingWindow.isDestroyed()) {
      repositionFloatingWindow();
    }
  });

  ipcMain.handle('get-startup-metrics', async () => {
    return startupMetrics;
  });

  ipcMain.handle('reset-main-window-state', async () => {
    try {
      debugLog('🔄', 'Main process: Resetting main window state');

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('reset-app-state');
        debugLog('✅', 'Reset command sent to main window');
        return { success: true };
      } else {
        debugLog('⚠️', 'Main window not available for reset');
        return { success: false, error: 'Main window not available' };
      }
    } catch (error) {
      debugLog('🚨', 'Error resetting main window state:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('recreate-main-window', async () => {
    try {
      debugLog('🏗️', 'Recreating main window');

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.close();
      }

      createMainWindow();

      return { success: true };
    } catch (error) {
      debugLog('🚨', 'Error recreating main window:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('close-main-window', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.destroy();
      mainWindow = null;
    }
  });

  ipcMain.handle('capture-screen', async () => {
    try {
      debugLog('📸', 'Screen capture requested');

      await new Promise((resolve) => setTimeout(resolve, 750));

      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 1920, height: 1080 },
      });

      if (sources.length > 0) {
        debugLog('✅', 'Screen captured successfully');
        return sources[0].thumbnail.toDataURL();
      }
      throw new Error('No screen sources found');
    } catch (error) {
      debugLog('🚨', 'Screen capture error:', error);
      throw error;
    }
  });

  ipcMain.handle('show-main-window', async () => {
    return new Promise((resolve) => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        mainWindow = createMainWindow();
      }

      mainWindow.show();
      mainWindow.focus();

      mainWindow.once('show', () => {
        setTimeout(resolve, 50);
      });

      setTimeout(resolve, 200);
    });
  });

  ipcMain.handle('hide-main-window', async () => {
    return new Promise((resolve) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.hide();
        setTimeout(resolve, 100);
      } else {
        resolve();
      }
    });
  });

  ipcMain.handle('get-camera-sources', async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['camera'],
      });
      return sources;
    } catch (error) {
      debugLog('🚨', 'Camera sources error:', error);
      return [];
    }
  });

  ipcMain.on('quit-app', () => {
    app.quit();
  });

  ipcMain.handle('process-ocr', async (event, imageDataUrl) => {
    debugLog('🔍', 'OCR Handler called in main process');
    const Tesseract = require('tesseract.js');

    try {
      const base64Data = imageDataUrl.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');

      logToFile('🚀', 'Starting Tesseract OCR...');
      const {
        data: { text, confidence, words },
      } = await Tesseract.recognize(buffer, 'eng', {});

      logToFile('📝', 'Full text:', text);

      const reservationData = extractReservationData(text);
      logToFile('🔍', 'Extracted reservation data:', reservationData);

      return {
        success: true,
        fullText: text,
        confidence: confidence,
        words: words,
        reservationData: reservationData,
      };
    } catch (error) {
      debugLog('🚨', 'OCR Error:', error);
      return {
        success: false,
        error: error.message,
        fullText: '',
        confidence: 0,
        words: [],
        reservationData: {},
      };
    }
  });

  function repositionFloatingWindow() {
    if (!floatingWindow || floatingWindow.isDestroyed()) return;

    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth } = primaryDisplay.workAreaSize;
    const [windowWidth, windowHeight] = floatingWindow.getSize();
    const marginSide = 20;
    const marginTop = 20;

    let x;
    if (isRtlMode) {
      x = marginSide;
    } else {
      x = screenWidth - windowWidth - marginSide;
    }

    floatingWindow.setPosition(x, marginTop);
  }

  function extractReservationData(text) {
    logToFile('🔍', 'Extracting reservation data from text...');

    const result = {
      name: '',
      firstName: '',
      confirmationNumber: '',
      room: '',
    };

    const lines = text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].toLowerCase();
      const originalLine = lines[i];

      if (
        line.includes('confirmation') ||
        line.includes('conf') ||
        line.includes('first')
      ) {
        logToFile('🎫', 'Found confirmation line:', originalLine);
        const confMatch = originalLine.match(/\b([A-Z0-9]{4,})\b/g);
        if (confMatch) {
          result.confirmationNumber = confMatch[confMatch.length - 1];
          logToFile(
            '✅',
            'Extracted confirmation number:',
            result.confirmationNumber
          );
        }
      }
    }

    return result;
  }

  ipcMain.handle('send-to-main-window', (event, channel, data) => {
    debugLog(
      '📡',
      'Forwarding message to main window:',
      channel,
      data ? 'with data' : 'no data'
    );
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, data);
    }
  });

  ipcMain.handle(
    'handle-manual-lookup',
    async (event, { reservationId, lastName }) => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        mainWindow = createMainWindow();
      }

      if (mainWindow.webContents.isLoading()) {
        await new Promise((resolve) => {
          mainWindow.webContents.once('did-finish-load', resolve);
        });
      }

      await new Promise((resolve) => setTimeout(resolve, 100));

      mainWindow.webContents.send('manual-lookup-data', {
        reservationId,
        lastName,
      });

      return { success: true, message: 'Data forwarded to main window' };
    }
  );

  ipcMain.handle('hide-floating-window', async () => {
    return new Promise((resolve) => {
      if (floatingWindow && !floatingWindow.isDestroyed()) {
        floatingWindow.hide();
        setTimeout(resolve, 100);
      } else {
        resolve();
      }
    });
  });

  ipcMain.handle('show-floating-window', () => {
    if (floatingWindow && !floatingWindow.isDestroyed()) {
      const [currentWidth, currentHeight] = floatingWindow.getSize();
      if (currentWidth !== 750 || currentHeight !== 60) {
        floatingWindow.setResizable(true);
        floatingWindow.setSize(750, 60);
        floatingWindow.setResizable(false);
      }
      floatingWindow.show();
    }
  });

  ipcMain.on('log-message', (event, message, data) => {
    if (data) {
      logToFile(message, data);
    } else {
      logToFile(message);
    }
  });

  ipcMain.on('set-draggable-region', (event, shouldDrag) => {
    floatingWindow.setIgnoreMouseEvents(false);
  });

  ipcMain.handle('resize-floating-window', (event, newWidth, newHeight) => {
    if (floatingWindow) {
      const display = screen.getPrimaryDisplay();
      const { x: screenX, y: screenY, width: screenWidth } = display.workArea;
      const marginSide = 20;
      const marginTop = 20;

      let x;
      if (isRtlMode) {
        x = screenX + marginSide;
      } else {
        x = screenX + screenWidth - newWidth - marginSide;
      }

      const y = screenY + marginTop;

      if (floatingWindow.isMinimized()) {
        floatingWindow.restore();
      }
      floatingWindow.setResizable(true);
      floatingWindow.setSize(newWidth, newHeight);
      floatingWindow.setPosition(x, y);
      floatingWindow.setResizable(false);
      floatingWindow.show();
    }
  });

  if (process.argv.includes('--dev')) {
    const { runTests } = require('./tests/sanitize.test.js');
    runTests();
  }
}
