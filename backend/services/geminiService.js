import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config/env.js';

export class GeminiService {
  constructor(customConfig = {}) {
    this.apiKey = customConfig.apiKey ?? config.gemini.apiKey;
    this.modelName = customConfig.model ?? config.gemini.model;
    this.client = this.apiKey ? new GoogleGenerativeAI(this.apiKey) : null;
  }

  isConfigured() {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  _buildSystemInstructions() {
    return `You are the CERS+ Emergency Response Intelligence Engine (Gemini Fallback Provider).
Generate a structured JSON operational briefing for emergency dispatchers based on the provided emergency incident data.

SAFETY RULES:
1. NEVER hallucinate or invent patient information.
2. Differentiate reported facts from advisory considerations.
3. No medical diagnoses or treatment prescriptions.
4. Dispatch decisions remain exclusively with human operators.
5. All considerations are advisory and non-binding.

OUTPUT FORMAT: Return ONLY valid parseable JSON:
{
  "summary": "Short 2-3 sentence summary",
  "extractedInfo": {
    "category": "CRITICAL | URGENT | MODERATE | UNSPECIFIED",
    "emergencyType": "Emergency type name",
    "reportedSymptoms": ["symptom 1", "..."],
    "locationAddress": "Reported address",
    "callerName": "Patient or caller name",
    "patientCount": "Number of patients or 'Unknown'",
    "reportedVitals": "Reported vitals or 'Not reported'",
    "environmentalHazards": ["Any reported hazards"]
  },
  "dispatcherBrief": "Concise operational briefing for dispatchers and paramedics",
  "missingInfo": ["Critical information not yet supplied"],
  "operationalConsiderations": ["Non-binding advisory recommendations"],
  "detectedLanguage": "English | Hindi | Gujarati | Other",
  "confidenceScore": 0.90
}`;
  }

  async generateIncidentIntelligence(incidentData) {
    const startTime = Date.now();

    if (!this.isConfigured() || !this.client) {
      return {
        success: false,
        error: 'Gemini API key is not configured in the backend environment.',
        provider: 'gemini',
        model: this.modelName,
        latencyMs: Date.now() - startTime,
        status: 'missing_credentials',
      };
    }

    try {
      const model = this.client.getGenerativeModel({
        model: this.modelName,
        systemInstruction: this._buildSystemInstructions(),
        generationConfig: {
          responseMimeType: 'application/json',
        },
      });

      const prompt = `EMERGENCY INCIDENT:
Type: ${typeof incidentData.emergencyType === 'object' ? incidentData.emergencyType?.name : incidentData.emergencyType}
Location: ${incidentData.location?.address || 'Unknown'}
Patient: ${incidentData.userProfile?.name || 'Anonymous'}
Symptoms/Report: ${incidentData.description || 'SOS button triggered'}`;

      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const parsed = JSON.parse(text);

      return {
        success: true,
        provider: 'gemini',
        model: this.modelName,
        result: parsed,
        rawOutput: text,
        latencyMs: Date.now() - startTime,
        status: 'completed',
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      return {
        success: false,
        error: `Gemini API error: ${err.message}`,
        provider: 'gemini',
        model: this.modelName,
        latencyMs: Date.now() - startTime,
        status: 'api_error',
      };
    }
  }
}

export const geminiService = new GeminiService();
