const ai = require('./main/ai.js');

async function testAI() {
  console.log("Initializing AI Test...");
  const sendStatusUpdate = (status) => console.log(`[Status]: ${status}`);
  const sendToolEvent = (event) => console.log(`[Tool Event]:`, event);
  
  try {
    const response = await ai.sendMessage("Hello JARVIS, this is a backend test. Please respond with 'Test successful.'", sendStatusUpdate, sendToolEvent);
    console.log("[Final Response]:", response);
  } catch (err) {
    console.error("[Test Error]:", err);
  }
}

testAI();
