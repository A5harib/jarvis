const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const ai = require("./ai");
const http = require("http");
const fs = require("fs");

let mainWindow;
let localServer;

function startLocalServer(callback) {
  localServer = http.createServer((req, res) => {
    const cleanUrl = req.url.split('?')[0].split('#')[0];
    const relativePath = cleanUrl === '/' ? 'renderer/index.html' : cleanUrl;
    const filePath = path.join(__dirname, '..', relativePath);
    
    const resolvedPath = path.resolve(filePath);
    const projectRoot = path.resolve(path.join(__dirname, '..'));
    
    if (!resolvedPath.startsWith(projectRoot)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    
    fs.readFile(resolvedPath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }
      
      let contentType = 'text/plain';
      const ext = path.extname(resolvedPath).toLowerCase();
      if (ext === '.html') contentType = 'text/html';
      else if (ext === '.js' || ext === '.cjs') contentType = 'application/javascript';
      else if (ext === '.css') contentType = 'text/css';
      else if (ext === '.svg') contentType = 'image/svg+xml';
      else if (ext === '.png') contentType = 'image/png';
      else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
      else if (ext === '.webp') contentType = 'image/webp';
      else if (ext === '.json') contentType = 'application/json';
      
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    });
  });
  
  localServer.listen(0, '127.0.0.1', () => {
    const port = localServer.address().port;
    console.log(`[Main Process] Local static server listening on http://127.0.0.1:${port}`);
    callback(port);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 750,
    frame: false, // Frameless window for futuristic HUD design
    transparent: true, // Transparent window for overlays
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true, // Secure context isolation
      nodeIntegration: false, // Secure: disable nodeIntegration in renderer
    },
  });

  // Maximize by default
  mainWindow.maximize();

  // Open DevTools in a detached window (useful for debugging, can be commented out or triggered via keyboard)
  // mainWindow.webContents.openDevTools({ mode: 'detach' });

  // Start local server to serve files over http:// to support Puter SDK
  startLocalServer((port) => {
    mainWindow.loadURL(`http://127.0.0.1:${port}/renderer/index.html`);
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
    if (localServer) {
      localServer.close();
    }
  });
}

// IPC Handlers for Window Controls (required for frameless window)
ipcMain.on("window-control", (event, action) => {
  if (!mainWindow) return;
  switch (action) {
    case "close":
      mainWindow.close();
      break;
    case "minimize":
      mainWindow.minimize();
      break;
    case "maximize":
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
      break;
  }
});

// IPC Handler for JARVIS Diagnostics/Ping test
ipcMain.handle("jarvis-ping", async (event, message) => {
  console.log(`[Main Process] Received ping message: "${message}"`);
  return {
    status: "online",
    timestamp: new Date().toLocaleTimeString(),
    reply: `JARVIS Core: Connection secured. Received: "${message}". Systems operational.`,
  };
});

// IPC Handler for AI Chat
ipcMain.handle("chat-message", async (event, message) => {
  console.log(`[Main] Chat request: ${message}`);
  const sendStatusUpdate = (statusText) => {
    event.sender.send("chat-status", statusText);
  };
  const sendToolEvent = (data) => {
    event.sender.send("tool-event", data);
  };
  return await ai.sendMessage(message, sendStatusUpdate, sendToolEvent);
});

// IPC Handler for Groq API status check
ipcMain.handle("check-api-status", async () => {
  console.log("[Main Process] Received api status check request");
  return await ai.checkApiStatus();
});

// IPC Handler for AI engine toggle
ipcMain.handle("set-ai-engine", async (event, engine) => {
  console.log(
    `[Main Process] Received request to switch AI engine to: ${engine}`,
  );
  return ai.setEngine(engine);
});

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
