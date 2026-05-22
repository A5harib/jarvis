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
});
