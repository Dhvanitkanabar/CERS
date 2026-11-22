import mongoose from 'mongoose';
import { config } from '../config/env.js';

// In-memory store fallback for environments without an active MongoDB connection
const memoryStore = new Map();

const AIIncidentAnalysisSchema = new mongoose.Schema({
  incidentId: {
    type: String,
    required: true,
    index: true,
  },
  provider: {
    type: String,
    enum: ['adaption', 'gemini'],
    required: true,
  },
  model: {
    type: String,
    required: true,
  },
  summary: {
    type: String,
    required: true,
  },
  extractedInfo: {
    category: String,
    emergencyType: String,
    reportedSymptoms: [String],
    locationAddress: String,
    callerName: String,
    patientCount: String,
    reportedVitals: String,
    environmentalHazards: [String],
  },
  dispatcherBrief: {
    type: String,
    required: true,
  },
  missingInfo: {
    type: [String],
    default: [],
  },
  operationalConsiderations: {
    type: [String],
    default: [],
  },
  detectedLanguage: {
    type: String,
    default: 'English',
  },
  confidenceScore: {
    type: Number,
    default: 1.0,
  },
  status: {
    type: String,
    enum: ['completed', 'failed', 'pending'],
    default: 'completed',
  },
  latencyMs: {
    type: Number,
  },
  fallbackUsed: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

let MongooseModel = null;
try {
  MongooseModel = mongoose.model('AIIncidentAnalysis', AIIncidentAnalysisSchema);
} catch (e) {
  // If already compiled
  MongooseModel = mongoose.models.AIIncidentAnalysis;
}

export class IncidentAnalysisRepository {
  static async isConnected() {
    return mongoose.connection.readyState === 1;
  }

  static async initConnection() {
    if (!config.mongodb.uri) {
      console.log('ℹ️ MongoDB URI not configured. Using high-performance in-memory incident analysis store.');
      return false;
    }

    try {
      await mongoose.connect(config.mongodb.uri, {
        serverSelectionTimeoutMS: 5000,
      });
      console.log('✅ Connected to MongoDB successfully.');
      return true;
    } catch (err) {
      console.warn(`⚠️ MongoDB connection skipped (${err.message}). Using in-memory incident analysis store.`);
      return false;
    }
  }

  static async saveAnalysis(data) {
    const record = {
      ...data,
      createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
    };

    // Store in-memory
    memoryStore.set(data.incidentId, record);

    // If MongoDB is connected, also save to MongoDB collection
    if (await this.isConnected()) {
      try {
        const doc = new MongooseModel(record);
        await doc.save();
      } catch (err) {
        console.error('Failed to save to MongoDB:', err.message);
      }
    }

    return record;
  }

  static async getAnalysisByIncidentId(incidentId) {
    if (await this.isConnected()) {
      try {
        const doc = await MongooseModel.findOne({ incidentId }).sort({ createdAt: -1 });
        if (doc) return doc.toObject();
      } catch (err) {
        console.error('Failed to query MongoDB:', err.message);
      }
    }

    return memoryStore.get(incidentId) || null;
  }

  static async getAllAnalyses(limit = 20) {
    if (await this.isConnected()) {
      try {
        const docs = await MongooseModel.find().sort({ createdAt: -1 }).limit(limit);
        return docs.map(d => d.toObject());
      } catch (err) {
        console.error('Failed to query MongoDB:', err.message);
      }
    }

    return Array.from(memoryStore.values()).slice(-limit).reverse();
  }
}

export default IncidentAnalysisRepository;
