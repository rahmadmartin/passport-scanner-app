const { app, BrowserWindow, ipcMain, screen, desktopCapturer } = require('electron');
const path = require('path');
const Tesseract = require('tesseract.js');

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
  const { width, height } = primaryDisplay.workAreaSize;

  floatingWindow = new BrowserWindow({
    width: 400,
    height: 80,
    x: width - 420,
    y: 20,
    alwaysOnTop: true,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    }
  });

  floatingWindow.loadFile('src/floating.html');
  
  // Make window draggable
  floatingWindow.setIgnoreMouseEvents(false);
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
  console.log('🔍 OCR Handler called in main process');
  console.log('📸 Image data URL length:', imageDataUrl.length);
  
  try {
    // Convert data URL to buffer
    const base64Data = imageDataUrl.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    console.log('🔄 Converted to buffer, size:', buffer.length);
    
    console.log('🚀 Starting Tesseract OCR...');
    const { data: { text, confidence, words } } = await Tesseract.recognize(
      buffer,
      'eng',
      {
        logger: m => console.log('📊 Tesseract:', m)
      }
    );
    
    console.log('✅ OCR completed successfully');
    console.log('📝 Full text:', text);
    console.log('🎯 Confidence:', confidence);
    console.log('📊 Words count:', words.length);
    
    // Extract potential reservation information
    const reservationData = extractReservationData(text);
    console.log('🔍 Extracted reservation data:', reservationData);
    
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
  console.log('🔍 Extracting reservation data from text...');
  
  const result = {
    name: '',
    firstName: '',
    confirmationNumber: '',
    room: ''
  };
  
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  console.log('📋 Text lines:', lines);
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase();
    const originalLine = lines[i];
    
    // Look for confirmation number patterns
    if (line.includes('confirmation') || line.includes('conf')) {
      console.log('🎫 Found confirmation line:', originalLine);
      // Look for patterns like numbers/letters after confirmation
      const confMatch = originalLine.match(/\b([A-Z0-9]{4,})\b/g);
      if (confMatch) {
        result.confirmationNumber = confMatch[confMatch.length - 1];
        console.log('✅ Extracted confirmation number:', result.confirmationNumber);
      }
    }
    
    // Look for room patterns
    if (line.includes('room')) {
      console.log('🏠 Found room line:', originalLine);
      const roomMatch = originalLine.match(/\b(\d{3,4}|[A-Z]\d+)\b/g);
      if (roomMatch) {
        result.room = roomMatch[roomMatch.length - 1];
        console.log('✅ Extracted room:', result.room);
      }
    }
    
    // Look for name patterns (typically near "name" or "first name")
    if (line.includes('name') && !line.includes('confirmation')) {
      console.log('👤 Found name line:', originalLine);
      // Try to extract name from next line or same line
      const nameMatch = originalLine.match(/name[:\s]*([a-zA-Z\s]+)/i);
      if (nameMatch) {
        if (line.includes('first')) {
          result.firstName = nameMatch[1].trim();
          console.log('✅ Extracted first name:', result.firstName);
        } else {
          result.name = nameMatch[1].trim();
          console.log('✅ Extracted name:', result.name);
        }
      }
    }
  }
  
  return result;
}

// Handle communication between floating and main window
ipcMain.handle('send-to-main-window', (event, channel, data) => {
  console.log('📡 Forwarding message to main window:', channel, data ? 'with data' : 'no data');
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
});