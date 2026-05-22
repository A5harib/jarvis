const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const ai = require('./ai');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 750,
    frame: false,             // Frameless window for futuristic HUD design
    transparent: true,        // Transparent window for overlays
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true, // Secure context isolation
      nodeIntegration: false  // Secure: disable nodeIntegration in renderer
    }
  });

  // Load the frontend UI
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // Open DevTools in a detached window (useful for debugging, can be commented out or triggered via keyboard)
  // mainWindow.webContents.openDevTools({ mode: 'detach' });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC Handlers for Window Controls (required for frameless window)
ipcMain.on('window-control', (event, action) => {
  if (!mainWindow) return;
  switch (action) {
    case 'close':
      mainWindow.close();
      break;
    case 'minimize':
      mainWindow.minimize();
      break;
    case 'maximize':
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
      break;
  }
});

// IPC Handler for JARVIS Diagnostics/Ping test
ipcMain.handle('jarvis-ping', async (event, message) => {
  console.log(`[Main Process] Received ping message: "${message}"`);
  return {
    status: 'online',
    timestamp: new Date().toLocaleTimeString(),
    reply: `JARVIS Core: Connection secured. Received: "${message}". Systems operational.`
  };
});

// IPC Handler for AI Chat
ipcMain.handle('chat-message', async (event, message) => {
  console.log(`[Main] Chat request: ${message}`);
  const sendStatusUpdate = (statusText) => {
    event.sender.send('chat-status', statusText);
  };
  return await ai.sendMessage(message, sendStatusUpdate);
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
