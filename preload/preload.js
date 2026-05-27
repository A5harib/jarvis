const { contextBridge, ipcRenderer } = require('electron');

// Securely expose specific IPC channels to the renderer process without exposing all of ipcRenderer.
contextBridge.exposeInMainWorld('jarvisAPI', {
  /**
   * Send window controls (close, minimize, maximize)
   * @param {string} action 
   */
  sendWindowControl: (action) => {
    const validActions = ['close', 'minimize', 'maximize'];
    if (validActions.includes(action)) {
      ipcRenderer.send('window-control', action);
    }
  },

  /**
   * Send a diagnostics ping request to the main process
   * @param {string} message 
   * @returns {Promise<object>}
   */
  ping: async (message) => {
    return await ipcRenderer.invoke('jarvis-ping', message);
  },

  /**
   * Send a chat message to the AI
   */
  sendChatMessage: async (message) => {
    return await ipcRenderer.invoke('chat-message', message);
  },

  /**
   * Listen for real-time status updates from the AI tool calls
   */
  onChatStatus: (callback) => {
    ipcRenderer.on('chat-status', (event, statusText) => callback(statusText));
  },

  /**
   * Listen for structured tool execution events
   */
  onToolEvent: (callback) => {
    ipcRenderer.on('tool-event', (event, data) => callback(data));
  },

  /**
   * Check if Groq API is responding
   */
  checkApiStatus: async () => {
    return await ipcRenderer.invoke('check-api-status');
  },

  /**
   * Switch the active AI engine (groq or local)
   */
  setAiEngine: async (engine) => {
    return await ipcRenderer.invoke('set-ai-engine', engine);
  }
});
console.log('[Preload] Secure API bridge loaded successfully.');
