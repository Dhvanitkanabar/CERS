import { EmergencyIncident, AIAnalysisRecord } from '../types';

// Detect API base URL: custom env var, or empty string (relative URL through Vite proxy / same-origin)
const getApiBaseUrl = (): string => {
  // @ts-ignore
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) {
    // @ts-ignore
    return import.meta.env.VITE_API_BASE_URL.replace(/\/$/, '');
  }
  return '';
};

export interface ProviderHealthResponse {
  status: string;
  timestamp: string;
  providers: {
    adaption: {
      configured: boolean;
      model: string;
      endpoint: string;
      providerName: string;
    };
    gemini: {
      configured: boolean;
      model: string;
      providerName: string;
    };
    activeDefault: string;
  };
  mongoConnected: boolean;
}

export class AdaptionClientService {
  private static baseUrl = getApiBaseUrl();

  /**
   * Check backend AI providers health and readiness
   */
  static async checkHealth(): Promise<ProviderHealthResponse | null> {
    try {
      const res = await fetch(`${this.baseUrl}/api/ai/health`, {
        headers: { 'Accept': 'application/json' },
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      console.warn('Backend AI health check unavailable:', err);
      return null;
    }
  }

  /**
   * Request real AI Incident Briefing from the secure backend
   */
  static async generateIncidentBrief(
    incident: EmergencyIncident,
    options: { provider?: 'adaption' | 'gemini'; allowFallback?: boolean } = {}
  ): Promise<AIAnalysisRecord> {
    const startTime = Date.now();

    try {
      const res = await fetch(`${this.baseUrl}/api/ai/incident-brief`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          incident,
          provider: options.provider || 'adaption',
          allowFallback: options.allowFallback !== false,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || `Server responded with status ${res.status}`);
      }

      return {
        incidentId: incident.id,
        provider: data.provider || 'adaption',
        model: data.model || 'qwen3.5-397b',
        result: data.result,
        status: 'completed',
        timestamp: data.timestamp || new Date().toISOString(),
        latencyMs: data.latencyMs || Date.now() - startTime,
        fallbackUsed: data.fallbackUsed || false,
      };
    } catch (err: any) {
      console.error('Error generating AI incident brief:', err);
      return {
        incidentId: incident.id,
        provider: 'adaption',
        model: 'unknown',
        result: {
          summary: 'Unable to contact Adaption Labs AI backend.',
          extractedInfo: {
            category: incident.type?.category || 'CRITICAL',
            emergencyType: incident.type?.name || 'Emergency',
            reportedSymptoms: [],
          },
          dispatcherBrief: 'Please review on-scene dispatcher protocols manually.',
          missingInfo: [],
          operationalConsiderations: [],
        },
        status: 'failed',
        error: err.message || 'Unknown network error',
        timestamp: new Date().toISOString(),
        latencyMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Retrieve historical AI analysis from backend storage
   */
  static async getStoredAnalysis(incidentId: string): Promise<AIAnalysisRecord | null> {
    try {
      const res = await fetch(`${this.baseUrl}/api/ai/incident-analysis/${incidentId}`);
      if (!res.ok) return null;
      const json = await res.json();
      return json.data || null;
    } catch {
      return null;
    }
  }
}
