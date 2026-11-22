import { adaptionService } from './adaptionService.js';
import { geminiService } from './geminiService.js';
import { config } from '../config/env.js';

/**
 * Intelligent AI Provider Manager
 * Supports Adaption Labs as primary provider, with Gemini as alternative/fallback.
 * Records the exact provider and model that generated each result.
 */
export class AIProviderManager {
  constructor() {
    this.defaultProvider = config.defaultProvider; // 'adaption' | 'gemini' | 'auto'
  }

  /**
   * Get provider health status
   */
  async getProvidersStatus() {
    return {
      adaption: {
        configured: adaptionService.isConfigured(),
        model: adaptionService.model,
        endpoint: adaptionService.apiBaseUrl,
        providerName: 'Adaption Labs',
      },
      gemini: {
        configured: geminiService.isConfigured(),
        model: geminiService.modelName,
        providerName: 'Google Gemini',
      },
      activeDefault: this.defaultProvider,
    };
  }

  /**
   * Generate emergency incident intelligence with provider routing and fallback
   * @param {Object} incidentData - Details of the reported emergency
   * @param {Object} options - Options including target provider
   */
  async generateIncidentIntelligence(incidentData, options = {}) {
    const requestedProvider = options.provider || this.defaultProvider || 'auto';
    const allowFallback = options.allowFallback !== false;

    // 1. Explicitly requested Gemini
    if (requestedProvider === 'gemini') {
      const geminiResult = await geminiService.generateIncidentIntelligence(incidentData);
      return {
        ...geminiResult,
        requestedProvider: 'gemini',
        fallbackUsed: false,
      };
    }

    // 2. Explicitly requested Adaption Labs (no fallback if allowFallback = false)
    if (requestedProvider === 'adaption' && !allowFallback) {
      const adaptionResult = await adaptionService.generateIncidentIntelligence(incidentData);
      return {
        ...adaptionResult,
        requestedProvider: 'adaption',
        fallbackUsed: false,
      };
    }

    // 3. Default / Auto Mode: Try Adaption Labs first
    const adaptionResult = await adaptionService.generateIncidentIntelligence(incidentData);

    if (adaptionResult.success) {
      return {
        ...adaptionResult,
        requestedProvider: requestedProvider,
        fallbackUsed: false,
      };
    }

    // If Adaption Labs fails or is not configured, check if we should fallback to Gemini
    if (allowFallback && geminiService.isConfigured()) {
      console.warn(`[AIProviderManager] Adaption Labs call failed (${adaptionResult.error}). Falling back to Gemini...`);
      const fallbackResult = await geminiService.generateIncidentIntelligence(incidentData);

      if (fallbackResult.success) {
        return {
          ...fallbackResult,
          requestedProvider: requestedProvider,
          fallbackUsed: true,
          adaptionFailureReason: adaptionResult.error,
        };
      }
    }

    // Return the Adaption result with detailed error diagnostics if fallback is unavailable or also failed
    return {
      ...adaptionResult,
      requestedProvider: requestedProvider,
      fallbackUsed: false,
    };
  }
}

export const aiProviderManager = new AIProviderManager();
