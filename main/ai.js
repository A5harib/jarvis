require('dotenv').config();
const { GoogleGenerativeAI, FunctionDeclaration, SchemaType } = require("@google/generative-ai");
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-2.5-flash";

let chatSession = null;

// Define Tools
const executeBashDeclaration = {
  name: "execute_bash",
  description: "Execute a shell/powershell command on the host OS. Returns stdout and stderr.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      command: {
        type: SchemaType.STRING,
        description: "The shell command to execute."
      }
    },
    required: ["command"],
  },
};

const webSearchDeclaration = {
  name: "web_search",
  description: "Search the web for a query.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      query: {
        type: SchemaType.STRING,
        description: "The search query."
      }
    },
    required: ["query"],
  },
};

const tools = [{
  functionDeclarations: [executeBashDeclaration, webSearchDeclaration],
}];

// Initialize Gemini Client
function initAI() {
  if (!API_KEY || API_KEY === 'YOUR_API_KEY_HERE') {
    throw new Error("Invalid or missing GEMINI_API_KEY in .env file");
  }
  
  const genAI = new GoogleGenerativeAI(API_KEY);
  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    tools: tools,
    systemInstruction: {
      role: "system",
      parts: [{text: "You are JARVIS, an advanced AI assistant embedded within an Electron OS application. You have access to local system tools like bash execution and web search. Be helpful, concise, and use a futuristic, professional tone."}]
    }
  });

  chatSession = model.startChat({
    history: [],
  });
  console.log(`[AI] Initialized Gemini model: ${MODEL_NAME}`);
}

// Tool Implementation Logic
async function handleToolCall(functionCall, sendStatusUpdate) {
  const name = functionCall.name;
  const args = functionCall.args;
  
  sendStatusUpdate(`JARVIS is executing tool: ${name}...`);

  try {
    if (name === 'execute_bash') {
      const command = args.command;
      console.log(`[Tool] execute_bash: ${command}`);
      const { stdout, stderr } = await execPromise(command);
      return {
        result: stdout || "Command executed successfully (no output).",
        error: stderr || null
      };
    } 
    else if (name === 'web_search') {
      const query = args.query;
      console.log(`[Tool] web_search: ${query}`);
      // Simple mock for testing without an external API key (duckduckgo or similar)
      return {
        result: `Mock search results for '${query}': 1. This is a test result. 2. Web search tool is functioning.`
      };
    }
    
    return { error: `Tool ${name} not found.` };
  } catch (error) {
    return { error: error.message };
  }
}

// Send Message Flow
async function sendMessage(text, sendStatusUpdate) {
  if (!chatSession) {
    try {
      initAI();
    } catch (e) {
      return { error: e.message };
    }
  }

  try {
    let result = await chatSession.sendMessage(text);
    let response = result.response;
    
    // Check if a tool was called
    while (response.functionCalls && response.functionCalls().length > 0) {
      const functionCalls = response.functionCalls();
      const functionResponses = [];
      
      for (const call of functionCalls) {
        const apiResponse = await handleToolCall(call, sendStatusUpdate);
        functionResponses.push({
          functionResponse: {
            name: call.name,
            response: apiResponse
          }
        });
      }
      
      // Send the tool results back to the model
      sendStatusUpdate(`Analyzing tool results...`);
      result = await chatSession.sendMessage(functionResponses);
      response = result.response;
    }
    
    return { text: response.text() };
  } catch (error) {
    console.error("[AI] Error sending message:", error);
    return { error: error.message };
  }
}

module.exports = {
  sendMessage,
  initAI
};
