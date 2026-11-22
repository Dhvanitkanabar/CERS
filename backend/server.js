import express from 'express';
import cors from 'cors';
import { config, validateConfig } from './config/env.js';
import aiRoutes from './routes/aiRoutes.js';
import IncidentAnalysisRepository from './models/AIIncidentAnalysis.js';

const app = express();

// Security and middleware
app.use(cors({
  origin: '*', // Allow all origins for dev / mobile / web; configure specific origins in production
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Health Check
app.get('/health', (req, res) => {
  res.json({
    service: 'CERS+ Emergency Intelligence API',
    status: 'online',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// Mount AI Routes
app.use('/api/ai', aiRoutes);

// Global 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.originalUrl,
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[CERS Backend Error]', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: config.nodeEnv === 'development' ? err.message : 'An unexpected error occurred.',
  });
});

// Server Startup
const startServer = async () => {
  const { valid, issues } = validateConfig();
  if (!valid) {
    console.warn('\n⚠️  --- Adaption Labs Configuration Notice ---');
    issues.forEach(issue => console.warn(`   • ${issue}`));
    console.warn('   The server will start with Gemini fallback and offline simulation capabilities.\n');
  }

  // Connect to MongoDB if URI is present
  await IncidentAnalysisRepository.initConnection();

  const server = app.listen(config.port, '0.0.0.0', () => {
    console.log(`\n🚑 CERS+ Emergency Intelligence Backend running on http://0.0.0.0:${config.port}`);
    console.log(`   • Adaption Labs Model: ${config.adaption.model}`);
    console.log(`   • Adaption Status: ${config.adaption.apiKey ? '🔑 Key Present' : '⏳ Awaiting API Key'}`);
    console.log(`   • Default Provider: ${config.defaultProvider}\n`);
  });

  return server;
};

// Export app for testing and serverless deployment
export { app, startServer };

// If executed directly
if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  startServer();
}
