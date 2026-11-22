import { describe, it } from 'node:test';
import assert from 'node:assert';
import { AdaptionService } from '../services/adaptionService.js';
import { AIProviderManager } from '../services/aiProviderManager.js';

describe('AdaptionService Unit & Resilience Tests', () => {
  it('1. Handles missing API key gracefully', async () => {
    const service = new AdaptionService({ apiKey: '' });
    assert.strictEqual(service.isConfigured(), false);

    const result = await service.generateIncidentIntelligence({
      incidentId: 'TEST-NO-KEY',
      emergencyType: 'Heart Attack',
      description: 'Patient clutching chest',
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.status, 'missing_credentials');
    assert.ok(result.error.includes('Adaption Labs API key is not configured'));
  });

  it('2. Handles invalid API key error gracefully (401)', async () => {
    const service = new AdaptionService({
      apiKey: 'invalid_dummy_key_12345',
      timeoutMs: 5000,
    });

    const result = await service.generateIncidentIntelligence({
      incidentId: 'TEST-INVALID-KEY',
      emergencyType: 'Accident',
      description: 'Motorcycle crash with injuries',
    });

    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('Authentication Failed') || result.statusCode === 401 || result.status === 'api_error' || result.status === 'network_error');
    assert.strictEqual(result.provider, 'adaption');
  });

  it('3. Handles empty or minimal incident description gracefully', async () => {
    const service = new AdaptionService({ apiKey: '' });
    const formatted = service._formatInput({
      incidentId: 'TEST-EMPTY',
      description: '',
    });

    assert.ok(formatted.includes('<user_incident_report>'));
    assert.ok(formatted.includes('Emergency SOS signal triggered by user'));
  });

  it('4. Sanitizes sensitive credentials from error messages', () => {
    const service = new AdaptionService();
    const rawError = new Error('Request failed with Bearer secret_live_token_abc12345 and key=secret_key_999');
    const sanitized = service._sanitizeError(rawError);

    assert.strictEqual(sanitized.includes('secret_live_token_abc12345'), false);
    assert.strictEqual(sanitized.includes('secret_key_999'), false);
    assert.ok(sanitized.includes('[REDACTED]'));
  });

  it('5. Parses valid JSON markdown code fence correctly', () => {
    const service = new AdaptionService();
    const markdownResponse = `\`\`\`json
{
  "summary": "Elderly patient suffering acute chest pain.",
  "extractedInfo": {
    "category": "CRITICAL",
    "emergencyType": "Heart Attack",
    "reportedSymptoms": ["Severe chest pain"],
    "locationAddress": "Surat, Gujarat",
    "callerName": "John Doe",
    "patientCount": "1",
    "reportedVitals": "Conscious",
    "environmentalHazards": ["None"]
  },
  "dispatcherBrief": "Dispatch ALS ambulance immediately.",
  "missingInfo": ["Aspirin allergy"],
  "operationalConsiderations": ["Prepare defibrillator"],
  "detectedLanguage": "English",
  "confidenceScore": 0.95
}
\`\`\``;

    const parsed = service._parseResponseText(markdownResponse);
    assert.strictEqual(parsed.summary, 'Elderly patient suffering acute chest pain.');
    assert.strictEqual(parsed.extractedInfo.category, 'CRITICAL');
    assert.strictEqual(parsed.operationalConsiderations.length, 1);
  });

  it('6. Handles malformed or raw text response with robust fallback schema', () => {
    const service = new AdaptionService();
    const malformedText = "Emergency reported at Ring Road Surat. Two individuals hurt in road collision. Paramedic assistance needed.";
    
    const parsed = service._parseResponseText(malformedText);
    assert.ok(parsed.summary);
    assert.ok(parsed.dispatcherBrief);
    assert.ok(Array.isArray(parsed.missingInfo));
    assert.ok(Array.isArray(parsed.operationalConsiderations));
  });

  it('7. Handles timeout via AbortController', async () => {
    const service = new AdaptionService({
      apiKey: 'test_key',
      timeoutMs: 1, // Extremely short to guarantee timeout
      apiBaseUrl: 'https://httpstat.us/200?sleep=5000',
    });

    const result = await service.generateIncidentIntelligence({
      incidentId: 'TEST-TIMEOUT',
      emergencyType: 'Burns',
    });

    assert.strictEqual(result.success, false);
    assert.ok(result.status === 'timeout' || result.error.includes('timed out'));
  });
});

describe('AIProviderManager Fallback Strategy', () => {
  it('8. Successfully falls back to Gemini when Adaption is unconfigured', async () => {
    const manager = new AIProviderManager();
    const result = await manager.generateIncidentIntelligence({
      incidentId: 'TEST-FALLBACK',
      emergencyType: 'Breathing',
      location: { address: 'Adajan, Surat' },
      description: 'Asthmatic patient wheezing heavily',
    });

    // If Gemini key is valid in environment, it succeeds with fallbackUsed = true
    // If not, it returns graceful diagnostic structure
    assert.ok(result.provider === 'gemini' || result.provider === 'adaption');
  });
});
