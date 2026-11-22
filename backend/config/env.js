import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from backend directory or project root
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '5001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Adaption Labs API Configuration
  adaption: {
    apiKey: process.env.ADAPTION_API_KEY || '',
    model: process.env.ADAPTION_MODEL || 'deepseek-v4-flash',
    apiBaseUrl: process.env.ADAPTION_API_BASE_URL || 'https://api.prod.adaptionlabs.ai/api/v1',
    timeoutMs: parseInt(process.env.ADAPTION_TIMEOUT_MS || '35000', 10),
  },

  // Gemini Fallback Configuration
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || 'AIzaSyCLFHS0iq15OzWFKJcOOlD925NhKyu3mOc',
    model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
  },

  // Database Configuration
  mongodb: {
    uri: process.env.MONGODB_URI || '',
  },

  // AI Provider Selection: 'adaption' | 'gemini' | 'auto'
  defaultProvider: process.env.DEFAULT_AI_PROVIDER || 'auto',
};

export const validateConfig = () => {
  const issues = [];
  if (!config.adaption.apiKey) {
    issues.push('ADAPTION_API_KEY is not set. Real Adaption Labs inference requires an active API key.');
  }
  return {
    valid: issues.length === 0,
    issues,
  };
};
