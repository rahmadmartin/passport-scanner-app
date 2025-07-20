const { app, BrowserWindow, ipcMain, screen, desktopCapturer } = require('electron');
const path = require('path');
const Tesseract = require('tesseract.js');
const { logToFile } = require('./logger');

let mainWindow;
let floatingWindow;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    show: false
  });

  mainWindow.loadFile('src/index.html');
  
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

function createFloatingWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth } = primaryDisplay.workAreaSize;

  // Define default dimensions
  const expandedWidth = 700;
  const expandedHeight = 60;
  const collapsedWidth = 60;
  const collapsedHeight = 60;

  // Position window with some margin from right/top
  const marginRight = 20;
  const marginTop = 20;

  floatingWindow = new BrowserWindow({
    width: expandedWidth,
    height: expandedHeight,
    x: screenWidth - expandedWidth - marginRight,
    y: marginTop,
    alwaysOnTop: true,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    backgroundColor: '#00000000' // Transparent background
  });

  floatingWindow.loadFile('src/floating.html');

  ipcMain.on('set-draggable-region', (event, shouldDrag) => {
    floatingWindow.setIgnoreMouseEvents(false);
  });

  ipcMain.handle('resize-floating-window', (event, newWidth, newHeight) => {
    if (floatingWindow) {
      const x = screenWidth - newWidth - marginRight;
      const y = marginTop;

      floatingWindow.setSize(newWidth, newHeight);
      floatingWindow.setPosition(x, y);
    }
  });
}


app.whenReady().then(() => {
  createMainWindow();
  createFloatingWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
      createFloatingWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers
ipcMain.handle('capture-screen', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1920, height: 1080 }
    });
    
    if (sources.length > 0) {
      return sources[0].thumbnail.toDataURL();
    }
    throw new Error('No screen sources found');
  } catch (error) {
    console.error('Screen capture error:', error);
    throw error;
  }
});

ipcMain.handle('show-main-window', () => {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
});

ipcMain.handle('hide-main-window', () => {
  if (mainWindow) {
    mainWindow.hide();
  }
});

ipcMain.handle('get-camera-sources', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['camera']
    });
    return sources;
  } catch (error) {
    console.error('Camera sources error:', error);
    return [];
  }
});

ipcMain.on('quit-app', () => {
  app.quit();
});

// Add OCR processing handler
ipcMain.handle('process-ocr', async (event, imageDataUrl) => {
  logToFile('🔍 OCR Handler called in main process');
  logToFile('📸 Image data URL length:', imageDataUrl.length);
  
  try {
    // Convert data URL to buffer
    const base64Data = imageDataUrl.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    logToFile('🔄 Converted to buffer, size:', buffer.length);
    
    logToFile('🚀 Starting Tesseract OCR...');
    const { data: { text, confidence, words } } = await Tesseract.recognize(
      buffer,
      'eng',
      {
        logger: m => logToFile('📊 Tesseract:', m)
      }
    );
    
    logToFile('✅ OCR completed successfully');
    logToFile('📝 Full text:', text);
    logToFile('🎯 Confidence:', confidence);
    logToFile('📊 Words count:', words.length);
    
    // Extract potential reservation information
    const reservationData = extractReservationData(text);
    logToFile('🔍 Extracted reservation data:', reservationData);
    
    return {
      success: true,
      fullText: text,
      confidence: confidence,
      words: words,
      reservationData: reservationData
    };
    
  } catch (error) {
    console.error('🚨 OCR Error:', error);
    return {
      success: false,
      error: error.message,
      fullText: '',
      confidence: 0,
      words: [],
      reservationData: {}
    };
  }
});

// Function to extract reservation data from OCR text
function extractReservationData(text) {
  logToFile('🔍 Extracting reservation data from text...');
  
  const result = {
    name: '',
    firstName: '',
    confirmationNumber: '',
    room: ''
  };
  
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  logToFile('📋 Text lines:', lines);
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase();
    const originalLine = lines[i];
    
    // Look for confirmation number patterns
    if (line.includes('confirmation') || line.includes('conf') || line.includes('first')) {
      logToFile('🎫 Found confirmation line:', originalLine);
      // Look for patterns like numbers/letters after confirmation
      const confMatch = originalLine.match(/\b([A-Z0-9]{4,})\b/g);
      if (confMatch) {
        result.confirmationNumber = confMatch[confMatch.length - 1];
        logToFile('✅ Extracted confirmation number:', result.confirmationNumber);
      }
    }
    
    // Look for room patterns
    if (line.includes('room')) {
      logToFile('🏠 Found room line:', originalLine);
      const roomMatch = originalLine.match(/\b(\d{3,4}|[A-Z]\d+)\b/g);
      if (roomMatch) {
        result.room = roomMatch[roomMatch.length - 1];
        logToFile('✅ Extracted room:', result.room);
      }
    }
    
    // Look for name patterns (typically near "name" or "first name")
    if (line.includes('name') && !line.includes('confirmation')) {
      logToFile('👤 Found name line:', originalLine);
      // Try to extract name from next line or same line
      const nameMatch = originalLine.match(/name[:\s]*([a-zA-Z\s]+)/i);
      if (nameMatch) {
        if (line.includes('first')) {
          result.firstName = nameMatch[1].trim();
          logToFile('✅ Extracted first name:', result.firstName);
        } else {
          result.name = nameMatch[1].trim();
          logToFile('✅ Extracted name:', result.name);
        }
      }
    }
  }
  
  return result;
}

// Handle communication between floating and main window
ipcMain.handle('send-to-main-window', (event, channel, data) => {
  logToFile('📡 Forwarding message to main window:', channel, data ? 'with data' : 'no data');
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
});

ipcMain.handle('handle-manual-lookup', async (event, { reservationId, lastName }) => {
    logToFile('📦 Received lookup data:', { reservationId, lastName });
    
    // 1. Ensure main window exists and is ready
    if (!mainWindow || mainWindow.isDestroyed()) {
        throw new Error('Main window not available');
    }
    
    // 2. Send data to main window's renderer
    mainWindow.webContents.send('manual-lookup-data', {
        reservationId,
        lastName
    });
    
    // 3. Return success response
    return { success: true, message: 'Data forwarded to main window' };
});

ipcMain.handle('hide-floating-window', () => {
  if (floatingWindow) floatingWindow.hide();
});

ipcMain.handle('show-floating-window', () => {
  if (floatingWindow) floatingWindow.show();
});
