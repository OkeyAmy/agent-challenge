import { createGoogleGenerativeAI } from "@ai-sdk/google";
import dotenv from "dotenv";
import { createOllama } from "ollama-ai-provider";

// Load environment variables once at the beginning
dotenv.config();

// Export all your environment variables
// Defaults to Ollama qwen2.5:1.5b
// https://ollama.com/library/qwen2.5
export const modelName = process.env.MODEL_NAME_AT_ENDPOINT ?? "qwen2.5:1.5b";
export const baseURL = process.env.API_BASE_URL ?? "https://25odqdkvdgy8es6rxsbngzxkvpqgsbhpxwah8fcrsa9a.node.k8s.prd.nos.ci/api";

// Function to check if Ollama is available
async function isOllamaAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${baseURL}/api/`, { 
      method: 'GET',
      signal: AbortSignal.timeout(3000) // 3 second timeout
    });
    return response.ok;
  } catch (error) {
    console.warn(`Ollama not available at ${baseURL}, falling back to Gemini`);
    return false;
  }
}

// Create model with fallback logic
async function createModelWithFallback() {
  const ollamaAvailable = await isOllamaAvailable();
  
  if (ollamaAvailable) {
    console.log(`Using Ollama model: ${modelName} at ${baseURL}`);
    return createOllama({ baseURL }).chat(modelName, {
      simulateStreaming: true,
    });
  } else {
    console.log(`Using Gemini model: gemini-2.0-flash`);
    const google = createGoogleGenerativeAI({
      apiKey: process.env.GOOGLE_API_KEY,
    });
    return google('gemini-2.0-flash');
  }
}

// Create and export the model instance
export const model = await createModelWithFallback();

console.log(`ModelName: ${modelName}\nbaseURL: ${baseURL}`);
