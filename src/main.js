const { app, BrowserWindow, ipcMain, screen, desktopCapturer } = require('electron');
const path = require('path');

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
  console.log('🎯 [MAIN] Screen capture request received');
  try {
    console.log('📱 [MAIN] Getting desktop capturer sources...');
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1920, height: 1080 }
    });
    
    console.log(`📱 [MAIN] Found ${sources.length} screen sources:`, sources.map(s => ({
      id: s.id,
      name: s.name,
      thumbnailSize: s.thumbnail ? `${s.thumbnail.getSize().width}x${s.thumbnail.getSize().height}` : 'No thumbnail'
    })));
    
    if (sources.length > 0) {
      const dataUrl = sources[0].thumbnail.toDataURL();
      console.log(`✅ [MAIN] Screen captured successfully. Data URL length: ${dataUrl.length} characters`);
      console.log(`🖼️ [MAIN] Image format: ${dataUrl.substring(0, 50)}...`);
      return dataUrl;
    }
    throw new Error('No screen sources found');
  } catch (error) {
    console.error('❌ [MAIN] Screen capture error:', error);
    throw error;
  }
});

ipcMain.handle('show-main-window', () => {
  console.log('🪟 [MAIN] Request to show main window');
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
    console.log('✅ [MAIN] Main window shown and focused');
  } else {
    console.log('❌ [MAIN] Main window not found');
  }
});

ipcMain.handle('hide-main-window', () => {
  console.log('🪟 [MAIN] Request to hide main window');
  if (mainWindow) {
    mainWindow.hide();
    console.log('✅ [MAIN] Main window hidden');
  } else {
    console.log('❌ [MAIN] Main window not found');
  }
});

ipcMain.handle('get-camera-sources', async () => {
  console.log('📷 [MAIN] Getting camera sources...');
  try {
    const sources = await desktopCapturer.getSources({
      types: ['camera']
    });
    console.log(`📷 [MAIN] Found ${sources.length} camera sources:`, sources.map(s => s.name));
    return sources;
  } catch (error) {
    console.error('❌ [MAIN] Camera sources error:', error);
    return [];
  }
});

ipcMain.on('quit-app', () => {
  console.log('🚪 [MAIN] Quit app request received');
  app.quit();
});