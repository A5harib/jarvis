require('dotenv').config();
const Groq = require("groq-sdk");
const { OpenAI } = require("openai");
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.GROQ_API_KEY;
const MODEL_NAME = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434/v1";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5-coder:7b";

let groq = null;
let openai = null;
let activeEngine = 'groq'; // Default engine
let messages = [];

// Define Tools in Groq/OpenAI format
const tools = [
  {
    type: "function",
    function: {
      name: "execute_bash",
      description: "Execute a shell/powershell command on the host OS. Returns stdout and stderr.",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "The shell command to execute."
          }
        },
        required: ["command"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the web for a query.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query."
          }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "save_memory",
      description: "Save an important piece of information to long-term memory. Use this to remember user preferences, important facts, or context.",
      parameters: {
        type: "object",
        properties: {
          memory_text: {
            type: "string",
            description: "The text to save to memory."
          }
        },
        required: ["memory_text"]
      }
    }
  },
  {
    type: "function",
    function:{
      name:"access_memories",
      description:"Accesses all stored memories",
      parameters:{
        type:"object",
        properties:{
          query: {
            type:"string",
            description:"The query to search for in the memories."
          }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "write_to_file",
      description: "Write complete content to a file, overwriting it if it exists. Use this instead of bash for creating or editing files to avoid JSON escaping issues.",
      parameters: {
        type: "object",
        properties: {
          filepath: {
            type: "string",
            description: "Absolute path to the file."
          },
          content: {
            type: "string",
            description: "The full content to write to the file."
          }
        },
        required: ["filepath", "content"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the full text content of a file.",
      parameters: {
        type: "object",
        properties: {
          filepath: {
            type: "string",
            description: "Absolute path to the file."
          }
        },
        required: ["filepath"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_dashboard",
      description: "Push an intelligence brief, news headlines, or extracted facts to the UI dashboard.",
      parameters: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: { type: "string" },
            description: "List of brief headlines or facts to display."
          }
        },
        required: ["items"]
      }
    }
  }
];

// Initialize AI Clients
function initAI() {
  if (!API_KEY || API_KEY.includes('YOUR_API_KEY')) {
    console.warn("Missing GROQ_API_KEY. Groq engine may not work.");
  } else {
    groq = new Groq({ apiKey: API_KEY });
    console.log(`[AI] Initialized Groq model: ${MODEL_NAME}`);
  }
  
  openai = new OpenAI({
    baseURL: OLLAMA_BASE_URL,
    apiKey: 'ollama', // Required by SDK, ignored by Ollama
  });
  console.log(`[AI] Initialized Ollama model: ${OLLAMA_MODEL}`);
  
  const baseSystemPrompt = "You are JARVIS, an advanced AI assistant embedded within an Electron OS application. You have access to local system tools like bash execution, file editing, and web search. Be helpful, concise, and use a futuristic, professional tone. IMPORTANT: When using execute_bash, you MUST use non-interactive flags (e.g., --yes, -y). DO NOT use execute_bash to write or read file contents (especially code), as it causes JSON escaping errors. ALWAYS use the native write_to_file and read_file tools instead.";

  messages = [
    {
      role: "system",
      content: baseSystemPrompt
    }
  ];
}

function setEngine(engine) {
  if (engine === 'groq' || engine === 'local') {
    activeEngine = engine;
    console.log(`[AI] Engine switched to: ${activeEngine}`);
    return { success: true, engine: activeEngine };
  }
  return { success: false, error: 'Invalid engine' };
}

// Tool Implementation Logic
async function handleToolCall(toolCall, sendStatusUpdate) {
  const name = toolCall.function.name;
  const args = JSON.parse(toolCall.function.arguments);
  
  sendStatusUpdate(`JARVIS is executing tool: ${name}...`);

  try {
    if (name === 'execute_bash') {
      const command = args.command;
      console.log(`[Tool] execute_bash: ${command}`);
      const { stdout, stderr } = await execPromise(command, { timeout: 30000 });
      return {
        result: stdout || "Command executed successfully (no output).",
        error: stderr || null
      };
    } 
    else if (name === 'web_search') {
      const query = args.query;
      console.log(`[Tool] web_search: ${query}`);
      try {
        const response = await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`);
        const xml = await response.text();
        
        const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
        let results = [];
        for (let i = 0; i < Math.min(items.length, 5); i++) {
           const titleMatch = items[i].match(/<title>(.*?)<\/title>/);
           if (titleMatch) {
              let title = titleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/, '$1');
              results.push(`${i+1}. ${title}`);
           }
        }
        
        if (results.length > 0) {
          return { result: results.join('\n') };
        } else {
          return { result: `No results found for '${query}'.` };
        }
      } catch (err) {
        return { error: `Web search failed: ${err.message}` };
      }
    }
    else if (name === 'save_memory') {
      const memory_text = args.memory_text;
      console.log(`[Tool] save_memory: ${memory_text}`);
      const memoryFile = path.join(__dirname, '..', 'memories.txt');
      fs.appendFileSync(memoryFile, `[${new Date().toISOString()}] ${memory_text}\n`);
      return { result: "Memory saved successfully." };
    }
    else if (name === 'access_memories') {
      console.log(`[Tool] access_memories: ${args.query}`);
      const memoryFile = path.join(__dirname, '..', 'memories.txt');
      if (fs.existsSync(memoryFile)) {
        return { result: fs.readFileSync(memoryFile, 'utf8') };
      }
      return { result: "No memories stored yet." };
    }
    else if (name === 'write_to_file') {
      const filepath = args.filepath;
      const content = args.content;
      console.log(`[Tool] write_to_file: ${filepath}`);
      // Ensure directory exists
      const dir = path.dirname(filepath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filepath, content, 'utf8');
      return { result: `Successfully wrote content to ${filepath}` };
    }
    else if (name === 'read_file') {
      const filepath = args.filepath;
      console.log(`[Tool] read_file: ${filepath}`);
      if (fs.existsSync(filepath)) {
        return { result: fs.readFileSync(filepath, 'utf8') };
      }
      return { error: `File not found: ${filepath}` };
    }
    else if (name === 'update_dashboard') {
      console.log(`[Tool] update_dashboard: ${args.items.length} items`);
      return { result: "Dashboard updated successfully." };
    }
    
    return { error: `Tool ${name} not found.` };
  } catch (error) {
    return { error: error.message };
  }
}

// Send Message Flow
async function sendMessage(text, sendStatusUpdate, sendToolEvent) {
  if (!groq && !openai) {
    try {
      initAI();
    } catch (e) {
      return { error: e.message };
    }
  }

  messages.push({ role: "user", content: text });

  try {
    const logFile = path.join(__dirname, '..', 'responses.txt');
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] USER:\n${text}\n\n`);
  } catch (err) {}

  try {
    let completion;
    
    if (activeEngine === 'local') {
      completion = await openai.chat.completions.create({
        messages: messages,
        model: OLLAMA_MODEL,
        tools: tools,
        tool_choice: "auto",
      });
    } else {
      completion = await groq.chat.completions.create({
        messages: messages,
        model: MODEL_NAME,
        tools: tools,
        tool_choice: "auto",
      });
    }

    let responseMessage = completion.choices[0].message;

    // Fallback parser for local models that output tool calls as plaintext JSON
    function ensureToolCalls(msg) {
      if (activeEngine === 'local' && msg.content) {
        try {
          let text = msg.content.trim();
          if (text.startsWith('```json')) text = text.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
          const parsed = JSON.parse(text);
          if (parsed.name && parsed.arguments) {
            if (!msg.tool_calls) msg.tool_calls = [];
            msg.tool_calls.push({
              id: 'call_' + Math.random().toString(36).substring(7),
              type: 'function',
              function: {
                name: parsed.name,
                arguments: typeof parsed.arguments === 'string' ? parsed.arguments : JSON.stringify(parsed.arguments)
              }
            });
            msg.content = ""; // Hide raw JSON from output
          }
        } catch(e) {}
      }
    }

    ensureToolCalls(responseMessage);
    messages.push(responseMessage);
    
    // Check if a tool was called
    while (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
      for (const toolCall of responseMessage.tool_calls) {
        if (sendToolEvent) {
          sendToolEvent({ type: 'call', name: toolCall.function.name, args: toolCall.function.arguments });
        }
        
        try {
          const logFile = path.join(__dirname, '..', 'responses.txt');
          fs.appendFileSync(logFile, `[${new Date().toISOString()}] TOOL CALL: ${toolCall.function.name}\nARGS: ${toolCall.function.arguments}\n\n`);
        } catch (err) {}
        
        const toolResult = await handleToolCall(toolCall, sendStatusUpdate);
        
        if (sendToolEvent) {
          sendToolEvent({ type: 'result', name: toolCall.function.name, result: toolResult });
        }
        
        try {
          const logFile = path.join(__dirname, '..', 'responses.txt');
          fs.appendFileSync(logFile, `[${new Date().toISOString()}] TOOL RESULT: ${JSON.stringify(toolResult)}\n\n`);
        } catch (err) {}
        
        messages.push({
          tool_call_id: toolCall.id,
          role: "tool",
          name: toolCall.function.name,
          content: JSON.stringify(toolResult)
        });
      }
      
      // Send the tool results back to the model
      sendStatusUpdate(`Analyzing tool results...`);
      if (activeEngine === 'local') {
        completion = await openai.chat.completions.create({
          messages: messages,
          model: OLLAMA_MODEL,
          tools: tools,
          tool_choice: "auto",
        });
      } else {
        completion = await groq.chat.completions.create({
          messages: messages,
          model: MODEL_NAME,
          tools: tools,
          tool_choice: "auto",
        });
      }
      responseMessage = completion.choices[0].message;
      ensureToolCalls(responseMessage);
      messages.push(responseMessage);
    }
    
    const responseText = responseMessage.content;
    if (responseText) {
      try {
        const logFile = path.join(__dirname, '..', 'responses.txt');
        fs.appendFileSync(logFile, `[${new Date().toISOString()}] AI:\n${responseText}\n\n`);
      } catch (err) {
        console.error("Failed to write to responses.txt", err);
      }
    }
    
    return { text: responseText };
  } catch (error) {
    console.error("[AI] Error sending message:", error);
    return { error: error.message };
  }
}

// Check API Status
async function checkApiStatus() {
  if (!groq && !openai) {
    try {
      initAI();
    } catch (e) {
      return { status: 'offline', error: e.message };
    }
  }
  try {
    if (activeEngine === 'local') {
      await openai.models.list();
    } else {
      await groq.models.list();
    }
    return { status: 'online' };
  } catch (error) {
    return { status: 'offline', error: error.message };
  }
}

module.exports = {
  sendMessage,
  initAI,
  checkApiStatus,
  setEngine
};
