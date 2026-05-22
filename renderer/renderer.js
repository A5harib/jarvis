document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const btnMinimize = document.getElementById('btn-minimize');
  const btnClose = document.getElementById('btn-close');
  const btnPing = document.getElementById('btn-ping');
  const pingInput = document.getElementById('ping-message');
  const consoleLogs = document.getElementById('console-logs');
  const clockEl = document.getElementById('clock');
  const cpuStatEl = document.getElementById('cpu-stat');
  const latencyStatEl = document.getElementById('latency-stat');
  
  const chatStream = document.getElementById('chat-stream');
  const chatInput = document.getElementById('chat-input');
  const btnSendChat = document.getElementById('btn-send-chat');
  const statusLabel = document.getElementById('status-label');
  const statusDot = document.getElementById('status-dot');

  // Verify IPC API presence
  const isBridgeReady = typeof window.jarvisAPI !== 'undefined';

  // Configure marked for markdown parsing
  if (typeof marked !== 'undefined') {
    marked.setOptions({
      highlight: function(code, lang) {
        if (typeof hljs !== 'undefined' && lang && hljs.getLanguage(lang)) {
          return hljs.highlight(code, { language: lang }).value;
        }
        return code;
      },
      breaks: true,
      gfm: true
    });
  }

  // Window controls
  if (isBridgeReady) {
    if (btnMinimize) btnMinimize.addEventListener('click', () => window.jarvisAPI.sendWindowControl('minimize'));
    if (btnClose) btnClose.addEventListener('click', () => window.jarvisAPI.sendWindowControl('close'));

    // Listen for Tool Events to render them
    window.jarvisAPI.onToolEvent((data) => {
      if (data.type === 'call') {
        let argDisplay = data.args;
        try {
          const argsObj = typeof data.args === 'string' ? JSON.parse(data.args) : data.args;
          argDisplay = Object.values(argsObj).map(v => typeof v === 'string' ? v : JSON.stringify(v)).join(',\\n');
          argDisplay = argDisplay.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        } catch(e) { }

        const html = `<div class="chat-msg system" style="font-size: 11px; opacity: 0.8; margin-left: 20px; border-left: 2px solid var(--accent-orange); padding-left: 10px;">
          > Executing tool <b>${data.name}</b><br/>
          <pre style="white-space: pre-wrap; margin: 5px 0 0 0; font-family: monospace; color: hsla(38, 100%, 70%, 0.8);">${argDisplay}</pre>
        </div>`;
        chatStream.insertAdjacentHTML('beforeend', html);
        chatStream.scrollTop = chatStream.scrollHeight;
        
        // Trigger Toast for Memories
        if (data.name === 'save_memory') {
          try {
            const argsObj = JSON.parse(data.args);
            showToast(argsObj.memory_text);
          } catch(e) {
            showToast("New memory securely stored.");
          }
        }
      } else if (data.type === 'result') {
        let resStr = JSON.stringify(data.result);
        if (resStr.length > 200) resStr = resStr.substring(0, 200) + '...';
        const html = `<div class="chat-msg system" style="font-size: 11px; opacity: 0.8; margin-left: 20px; border-left: 2px solid var(--accent-orange); padding-left: 10px;">
          > Result: <code>${resStr.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</code>
        </div>`;
        chatStream.insertAdjacentHTML('beforeend', html);
        chatStream.scrollTop = chatStream.scrollHeight;
      }
    });
  }

  // Toast Notification System
  function showToast(message) {
    const toast = document.createElement('div');
    toast.innerHTML = `<strong style="color:#fff; letter-spacing:1px;">[SYSTEM] MEMORY UPDATED</strong><br/><br/>${message}`;
    
    Object.assign(toast.style, {
      position: 'fixed',
      top: '50px',
      right: '20px',
      background: 'hsla(30, 20%, 6%, 0.95)',
      color: 'hsl(38, 100%, 50%)',
      border: '1px solid hsla(38, 100%, 50%, 0.6)',
      padding: '15px 20px',
      borderRadius: '8px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.8), 0 0 10px hsla(38, 100%, 50%, 0.2)',
      zIndex: '9999',
      fontFamily: 'monospace',
      fontSize: '12px',
      maxWidth: '300px',
      opacity: '0',
      transform: 'translateX(50px)',
      transition: 'opacity 0.4s ease, transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
    });
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(0)';
    }, 50);
    
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(50px)';
      setTimeout(() => toast.remove(), 400);
    }, 6000);
  }

  // IPC Ping Test
  if (btnPing && isBridgeReady) {
    btnPing.addEventListener('click', async () => {
      const msg = pingInput.value || 'Ping';
      const start = performance.now();
      try {
        const res = await window.jarvisAPI.ping(msg);
        const latency = Math.round(performance.now() - start);
        latencyStatEl.textContent = `${latency}ms`;
        consoleLogs.innerHTML = `<div class="log-entry success">[SUCCESS] Ping: ${latency}ms</div>`;
      } catch (e) {
        consoleLogs.innerHTML = `<div class="log-entry error">[ERROR] ${e.message}</div>`;
      }
    });
  }

  // Chat Logic
  async function handleSendChat() {
    const text = chatInput.value.trim();
    if (!text || !isBridgeReady) return;

    // Append User Message
    appendChatMessage('user', text);
    chatInput.value = '';
    
    // Set Status
    statusLabel.textContent = "PROCESSING...";
    statusDot.classList.add('pulsing');
    
    // Add a temporary typing indicator for AI
    const typingId = `msg-${Date.now()}`;
    const typingHtml = `<div class="chat-msg ai" id="${typingId}">[JARVIS is thinking...]</div>`;
    chatStream.insertAdjacentHTML('beforeend', typingHtml);
    chatStream.scrollTop = chatStream.scrollHeight;

    try {
      // Listen for status updates
      window.jarvisAPI.onChatStatus((statusText) => {
        const thinkingEl = document.getElementById(typingId);
        if (thinkingEl) thinkingEl.innerText = `[${statusText}]`;
        statusLabel.textContent = "EXECUTING TOOL";
      });

      // Send to AI Backend
      const response = await window.jarvisAPI.sendChatMessage(text);
      
      // Remove typing indicator
      const thinkingEl = document.getElementById(typingId);
      if (thinkingEl) thinkingEl.remove();

      if (response.error) {
        appendChatMessage('system', `[ERROR] ${response.error}`);
      } else {
        appendChatMessage('ai', response.text, true);
      }
    } catch (e) {
      document.getElementById(typingId)?.remove();
      appendChatMessage('system', `[CRITICAL ERROR] ${e.message}`);
    } finally {
      statusLabel.textContent = "AWAITING INPUT";
      statusDot.classList.remove('pulsing');
    }
  }

  function appendChatMessage(role, content, isMarkdown = false) {
    const div = document.createElement('div');
    div.className = `chat-msg ${role}`;
    
    if (isMarkdown && typeof marked !== 'undefined') {
      div.innerHTML = marked.parse(content);
    } else {
      div.textContent = content;
    }
    
    chatStream.appendChild(div);
    chatStream.scrollTop = chatStream.scrollHeight;
  }

  // Enter to send
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendChat();
    }
  });
  
  if (btnSendChat) {
    btnSendChat.addEventListener('click', handleSendChat);
  }

  // Clocks and Telemetry
  setInterval(() => {
    document.getElementById('clock').textContent = new Date().toLocaleTimeString();
  }, 1000);
  setInterval(() => {
    const simulatedLoad = Math.floor(Math.random() * 8) + 6;
    cpuStatEl.textContent = `${simulatedLoad}%`;
  }, 3000);

  // API Status Check
  const apiStatusEl = document.getElementById('api-status-stat');
  async function checkApiConnection() {
    if (!isBridgeReady) {
      if (apiStatusEl) apiStatusEl.textContent = "NO BRIDGE";
      return;
    }
    if (apiStatusEl) {
      apiStatusEl.textContent = "CHECKING...";
      apiStatusEl.style.color = "var(--text-dim)";
      apiStatusEl.style.textShadow = "none";
    }
    
    try {
      const res = await window.jarvisAPI.checkApiStatus();
      if (apiStatusEl) {
        if (res.status === 'online') {
          apiStatusEl.textContent = "ONLINE";
          apiStatusEl.style.color = "hsl(120, 100%, 50%)"; // Neon green
          apiStatusEl.style.textShadow = "0 0 8px hsl(120, 100%, 40%)";
          apiStatusEl.title = "Groq API is responding. Click to re-test.";
        } else {
          apiStatusEl.textContent = "ERROR";
          apiStatusEl.style.color = "hsl(0, 100%, 50%)"; // Neon red
          apiStatusEl.style.textShadow = "0 0 8px hsl(0, 100%, 40%)";
          apiStatusEl.title = `API Error: ${res.error}. Click to retry.`;
        }
      }
    } catch (e) {
      if (apiStatusEl) {
        apiStatusEl.textContent = "ERROR";
        apiStatusEl.style.color = "hsl(0, 100%, 50%)";
        apiStatusEl.style.textShadow = "0 0 8px hsl(0, 100%, 40%)";
        apiStatusEl.title = `Critical Error: ${e.message}. Click to retry.`;
      }
    }
  }

  if (apiStatusEl) {
    apiStatusEl.addEventListener('click', checkApiConnection);
  }
  
  // Run check initially and then every 30 seconds
  checkApiConnection();
  setInterval(checkApiConnection, 30000);
});
