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
const { logToFile } = require('./logger');

const template = [
  {
    label: 'View',
    submenu: [
      {
        label: 'Right to Left',
        type: 'checkbox',
        click: (menuItem, browserWindow) => {
          // Send to main window if it exists
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('toggle-rtl', menuItem.checked);
          }

          // Send to floating window if it exists
          if (floatingWindow && !floatingWindow.isDestroyed()) {
            floatingWindow.webContents.send('toggle-rtl', menuItem.checked);
          }

          // Update RTL state and reposition floating window
          isRtlMode = menuItem.checked;
          repositionFloatingWindow();
        },
      },
      // { type: 'separator' },
      // { role: 'reload' },
      // { role: 'toggledevtools' },
      // { type: 'separator' },
      // { role: 'resetzoom' },
      // { role: 'zoomin' },
      // { role: 'zoomout' },
      // { type: 'separator' },
      // { role: 'togglefullscreen' },
    ],
  },
];

const menu = Menu.buildFromTemplate(template);
Menu.setApplicationMenu(menu);

let mainWindow;
let floatingWindow;

let isRtlMode = false;

// app.enableSandbox(); // Enable sandbox for all windows

// Debug logging helper
function debugLog(emoji, message, data = null) {
  logToFile(`${emoji} [MAIN] ${message}`, data || '');
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // Another instance is already running, quit this one
  app.quit();
} else {
  // This is the first instance
  app.on('second-instance', () => {
    // Someone tried to run a second instance - focus our windows instead
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
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth } = primaryDisplay.workAreaSize;

    const expandedWidth = 750;
    const expandedHeight = 60;
    const marginSide = 20;
    const marginTop = 20;

    // Use RTL-aware positioning
    const x = isRtlMode ? marginSide : screenWidth - expandedWidth - marginSide;

    const icon = nativeImage.createFromPath(
      path.join(__dirname, 'assets/icons/icon.png')
    );

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
      show: true,
      icon: path.join(__dirname, 'assets/icons/icon.ico'),
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        enableRemoteModule: true,
      },
      backgroundColor: '#00000000',
    });

    floatingWindow.once('ready-to-show', () => {
      floatingWindow.show();
    });

    if (process.platform === 'darwin') {
      app.dock.setIcon(icon);
    }

    floatingWindow.loadFile('src/floating.html');
  }

  function createMainWindow() {
    // Main window is created but not shown by default
    mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      icon: path.join(__dirname, 'assets/icons/icon.ico'), // Add this line
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        enableRemoteModule: true,
      },
      show: false,
    });

    mainWindow.loadFile('src/index.html');

    // if (process.argv.includes('--dev')) {
    // mainWindow.webContents.openDevTools();
    // }

    mainWindow.on('closed', () => {
      mainWindow = null;
    });

    return mainWindow;
  }

  // Modified app ready handler
  app.whenReady().then(() => {
    // Only create floating window initially
    createFloatingWindow();

    // Optional: Add a small delay before showing floating window
    setTimeout(() => {
      if (floatingWindow && !floatingWindow.isDestroyed()) {
        floatingWindow.show();
      }
    }, 100);

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
    // Reposition floating window immediately
    if (floatingWindow && !floatingWindow.isDestroyed()) {
      repositionFloatingWindow();
    }
  });

  ipcMain.handle('reset-main-window-state', async () => {
    try {
      debugLog('🔄', 'Main process: Resetting main window state');

      // Send reset command to main window
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

      // Recreate main window (you'll need to adjust this based on your createMainWindow function)
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

  // IPC Handlers
  ipcMain.handle('capture-screen', async () => {
    try {
      debugLog('📸', 'Screen capture requested');

      // Give extra time for windows to hide on Windows
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

      // Wait for window to be fully shown
      mainWindow.once('show', () => {
        setTimeout(resolve, 50);
      });

      // Fallback timeout
      setTimeout(resolve, 200);
    });
  });

  ipcMain.handle('hide-main-window', async () => {
    return new Promise((resolve) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.hide();
        // Wait for hide animation to complete
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

  // Add OCR processing handler
  ipcMain.handle('process-ocr', async (event, imageDataUrl) => {
    debugLog('🔍', 'OCR Handler called in main process');
    const Tesseract = require('tesseract.js');

    // logToFile('📸 Image data URL length:', imageDataUrl.length);

    try {
      // Convert data URL to buffer
      const base64Data = imageDataUrl.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      // logToFile('🔄 Converted to buffer, size:', buffer.length);

      logToFile('🚀', 'Starting Tesseract OCR...');
      const {
        data: { text, confidence, words },
      } = await Tesseract.recognize(buffer, 'eng', {
        // logger: (m) => logToFile('📊 Tesseract:', JSON.stringify(m, null, 2)),
      });

      // logToFile('✅ OCR completed successfully');
      logToFile('📝', 'Full text:', text);
      // logToFile('🎯 Confidence:', confidence);
      // logToFile('📊 Words count:', words.length);

      // Extract potential reservation information
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
      // Position on left side
      x = marginSide;
    } else {
      // Position on right side (default)
      x = screenWidth - windowWidth - marginSide;
    }

    floatingWindow.setPosition(x, marginTop);
  }

  // Function to extract reservation data from OCR text
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
    // logToFile('📋' Text lines:', lines);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].toLowerCase();
      const originalLine = lines[i];

      // Look for confirmation number patterns
      if (
        line.includes('confirmation') ||
        line.includes('conf') ||
        line.includes('first')
      ) {
        logToFile('🎫', 'Found confirmation line:', originalLine);
        // Look for patterns like numbers/letters after confirmation
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

      // // Look for room patterns
      // if (line.includes('room')) {
      //   logToFile('🏠 Found room line:', originalLine);
      //   const roomMatch = originalLine.match(/\b(\d{3,4}|[A-Z]\d+)\b/g);
      //   if (roomMatch) {
      //     result.room = roomMatch[roomMatch.length - 1];
      //     logToFile('✅ Extracted room:', result.room);
      //   }
      // }

      // Look for name patterns (typically near "name" or "first name")
      // if (line.includes('name') && !line.includes('confirmation')) {
      //   logToFile('👤 Found name line:', originalLine);
      //   // Try to extract name from next line or same line
      //   const nameMatch = originalLine.match(/name[:\s]*([a-zA-Z\s]+)/i);
      //   if (nameMatch) {
      //     if (line.includes('first')) {
      //       result.firstName = nameMatch[1].trim();
      //       logToFile('✅ Extracted first name:', result.firstName);
      //     } else {
      //       result.name = nameMatch[1].trim();
      //       logToFile('✅ Extracted name:', result.name);
      //     }
      //   }
      // }
    }

    return result;
  }

  // Handle communication between floating and main window
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
      // If window doesn't exist or is destroyed, create a new one
      if (!mainWindow || mainWindow.isDestroyed()) {
        mainWindow = createMainWindow();
      }

      // Ensure the window is ready before sending data
      if (mainWindow.webContents.isLoading()) {
        await new Promise((resolve) => {
          mainWindow.webContents.once('did-finish-load', resolve);
        });
      }

      // Add a small delay to ensure renderer is fully initialized
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Send data to main window's renderer
      mainWindow.webContents.send('manual-lookup-data', {
        reservationId,
        lastName,
      });

      return { success: true, message: 'Data forwarded to main window' };
    }
  );

  // ipcMain.handle(
  //   'handle-manual-lookup',
  //   async (event, { reservationId, lastName }) => {
  //     // If window doesn't exist or is destroyed, create a new one
  //     if (!mainWindow || mainWindow.isDestroyed()) {
  //       mainWindow = createMainWindow();
  //     }

  //     // Send data to main window's renderer
  //     mainWindow.webContents.send('manual-lookup-data', {
  //       reservationId,
  //       lastName,
  //     });

  //     return { success: true, message: 'Data forwarded to main window' };
  //   }
  // );

  ipcMain.handle('hide-floating-window', async () => {
    return new Promise((resolve) => {
      if (floatingWindow && !floatingWindow.isDestroyed()) {
        floatingWindow.hide();
        // Wait for hide animation to complete
        setTimeout(resolve, 100);
      } else {
        resolve();
      }
    });
  });

  ipcMain.handle('show-floating-window', () => {
    if (floatingWindow && !floatingWindow.isDestroyed()) {
      // Force the window back to correct size before showing
      const [currentWidth, currentHeight] = floatingWindow.getSize();
      if (currentWidth !== 750 || currentHeight !== 60) {
        floatingWindow.setResizable(true);
        floatingWindow.setSize(750, 60);
        floatingWindow.setResizable(false);
      }
      floatingWindow.show();
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
}
