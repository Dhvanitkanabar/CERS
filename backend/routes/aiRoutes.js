import express from 'express';
import { aiProviderManager } from '../services/aiProviderManager.js';
import { adaptionService } from '../services/adaptionService.js';
import IncidentAnalysisRepository from '../models/AIIncidentAnalysis.js';

const router = express.Router();

/**
 * Basic in-memory rate limiter for AI generation requests
 * Limit: 30 requests per minute per IP
 */
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 30;

const rateLimiter = (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  const clientData = rateLimitMap.get(ip) || { count: 0, resetTime: now + RATE_LIMIT_WINDOW_MS };

  if (now > clientData.resetTime) {
    clientData.count = 1;
    clientData.resetTime = now + RATE_LIMIT_WINDOW_MS;
  } else {
    clientData.count++;
  }

  rateLimitMap.set(ip, clientData);

  if (clientData.count > MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({
      success: false,
      error: 'Rate limit exceeded for AI generation. Please wait before making more requests.',
      retryAfterSeconds: Math.ceil((clientData.resetTime - now) / 1000),
    });
  }

  next();
};

/**
 * GET /api/ai/health
 * Returns provider statuses and connection health
 */
router.get('/health', async (req, res) => {
  try {
    const status = await aiProviderManager.getProvidersStatus();
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      providers: status,
      mongoConnected: await IncidentAnalysisRepository.isConnected(),
    });
  } catch (err) {
    res.status(500).json({ status: 'unhealthy', error: err.message });
  }
});

/**
 * POST /api/ai/incident-brief
 * Generates an operational incident intelligence briefing using Adaption Labs
 */
router.post('/incident-brief', rateLimiter, async (req, res) => {
  try {
    const { incident, provider, allowFallback } = req.body;

    if (!incident) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: incident object is required.',
      });
    }

    // Input sanitization and size check
    const incidentData = {
      incidentId: String(incident.id || incident.incidentId || `INC-${Date.now()}`),
      emergencyType: incident.type || incident.emergencyType || 'General Emergency',
      category: incident.type?.category || incident.category || 'CRITICAL',
      location: incident.location || { address: 'Location coordinates on file' },
      userProfile: incident.userProfile || {},
      description: String(incident.description || incident.symptoms || incident.log?.[0]?.message || '').substring(0, 4000),
      timestamp: incident.timestamp || new Date().toISOString(),
      respondedHospitalsCount: incident.respondedHospitals ? Object.keys(incident.respondedHospitals).length : 0,
    };

    const aiResult = await aiProviderManager.generateIncidentIntelligence(incidentData, {
      provider,
      allowFallback,
    });

    if (aiResult.success) {
      // Persist to MongoDB / storage
      await IncidentAnalysisRepository.saveAnalysis({
        incidentId: incidentData.incidentId,
        provider: aiResult.provider,
        model: aiResult.model,
        summary: aiResult.result.summary,
        extractedInfo: aiResult.result.extractedInfo,
        dispatcherBrief: aiResult.result.dispatcherBrief,
        missingInfo: aiResult.result.missingInfo,
        operationalConsiderations: aiResult.result.operationalConsiderations,
        detectedLanguage: aiResult.result.detectedLanguage,
        confidenceScore: aiResult.result.confidenceScore,
        latencyMs: aiResult.latencyMs,
        fallbackUsed: aiResult.fallbackUsed,
        status: 'completed',
        createdAt: new Date(),
      });
    }

    const httpStatus = aiResult.success ? 200 : (aiResult.statusCode || (aiResult.status === 'missing_credentials' ? 401 : 500));
    return res.status(httpStatus).json(aiResult);
  } catch (err) {
    console.error('API Error in /incident-brief:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error processing emergency intelligence request.',
    });
  }
});

/**
 * GET /api/ai/incident-analysis/:incidentId
 * Retrieves past analysis for an incident
 */
router.get('/incident-analysis/:incidentId', async (req, res) => {
  try {
    const { incidentId } = req.params;
    const analysis = await IncidentAnalysisRepository.getAnalysisByIncidentId(incidentId);

    if (!analysis) {
      return res.status(404).json({
        success: false,
        error: `No stored AI analysis found for incident ID: ${incidentId}`,
      });
    }

    res.json({
      success: true,
      data: analysis,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/ai/test-inference
 * Test endpoint to verify Adaption Labs credentials and live response
 */
router.post('/test-inference', async (req, res) => {
  try {
    const { customInput } = req.body;
    const testIncident = {
      incidentId: `TEST-${Date.now()}`,
      emergencyType: 'Heart Attack',
      category: 'CRITICAL',
      location: { address: 'Ring Road, Surat, Gujarat' },
      userProfile: { name: 'Test Caller', medicalInfo: { bloodGroup: 'B+' } },
      description: customInput || 'Elderly patient complaining of sudden crushing chest pain and shortness of breath.',
      timestamp: new Date().toISOString(),
    };

    const result = await adaptionService.generateIncidentIntelligence(testIncident);
    res.status(result.success ? 200 : (result.statusCode || 500)).json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/ai/dataset/sample
 * Sample anonymized emergency dataset for Adaption Labs Adaptive Data / AutoScientist
 */
router.get('/dataset/sample', (req, res) => {
  const sampleRecords = [
    {
      instruction: "Extract emergency operational details and generate a non-binding dispatcher briefing.",
      input: "EMERGENCY: Type: Heart Attack. Location: Ring Road, Surat. Caller: Ramesh Patel. Symptoms: Severe retrosternal pain, sweating profusely, duration 20 mins. Medical history: Hypertension. Conscious and breathing.",
      output: JSON.stringify({
        summary: "60-year-old male experiencing acute chest pain with diaphoresis in Surat. Patient is conscious and breathing with prior history of hypertension.",
        extractedInfo: {
          category: "CRITICAL",
          emergencyType: "Heart Attack",
          reportedSymptoms: ["Severe retrosternal chest pain", "Profuse sweating"],
          locationAddress: "Ring Road, Surat",
          callerName: "Ramesh Patel",
          patientCount: "1",
          reportedVitals: "Conscious, breathing",
          environmentalHazards: ["None reported"]
        },
        dispatcherBrief: "Dispatch ALS unit with 12-lead ECG and AED. Instruct patient to sit still, loosen tight collar, and avoid exertion.",
        missingInfo: ["Exact building or landmark on Ring Road", "Aspirin allergy status"],
        operationalConsiderations: ["Alert nearest cardiac care unit for possible STEMI activation", "Confirm vehicle access on busy Ring Road"],
        detectedLanguage: "English"
      }, null, 2)
    },
    {
      instruction: "Extract emergency operational details and generate a non-binding dispatcher briefing.",
      input: "EMERGENCY: Type: Accident. Location: Near Udhna Darwaja, Surat. Multiple vehicles. Two victims on asphalt. One bleeding from head, second alert with arm deformity.",
      output: JSON.stringify({
        summary: "Multi-vehicle traffic collision near Udhna Darwaja with two casualties. One patient with head trauma and active bleeding; second patient conscious with suspected arm fracture.",
        extractedInfo: {
          category: "CRITICAL",
          emergencyType: "Accident",
          reportedSymptoms: ["Head trauma with active hemorrhage", "Deformed upper extremity"],
          locationAddress: "Near Udhna Darwaja, Surat",
          callerName: "Passerby",
          patientCount: "2",
          reportedVitals: "1 responsive, 1 status uncertain",
          environmentalHazards: ["Road traffic hazard", "Debris on road"]
        },
        dispatcherBrief: "Dispatch dual-ambulance trauma response. Advise caller not to move victims unless immediate fire/traffic risk exists. Request traffic police assist.",
        missingInfo: ["Exact state of consciousness of bleeding victim", "Fuel leaks or fire risk at scene"],
        operationalConsiderations: ["Notify trauma center for multiple incoming trauma victims", "Equip cervical collars and spinal immobilization boards"],
        detectedLanguage: "English"
      }, null, 2)
    }
  ];

  res.json({
    totalSamples: sampleRecords.length,
    format: "JSONL / SFT Prompt-Completion format for Adaption Labs Adaptive Data",
    data: sampleRecords,
  });
});

export default router;
