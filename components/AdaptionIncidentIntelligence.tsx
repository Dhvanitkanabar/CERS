import React, { useState, useEffect } from 'react';
import {
  Brain, Sparkles, AlertCircle, CheckCircle2, AlertTriangle,
  RefreshCw, ShieldCheck, Clock, Layers, ArrowRight, Zap, Info, User, MapPin
} from 'lucide-react';
import { EmergencyIncident, AIAnalysisRecord } from '../types';
import { AdaptionClientService, ProviderHealthResponse } from '../services/adaptionClientService';

interface AdaptionIncidentIntelligenceProps {
  incident: EmergencyIncident;
  onAnalysisGenerated?: (analysis: AIAnalysisRecord) => void;
  className?: string;
}

export const AdaptionIncidentIntelligence: React.FC<AdaptionIncidentIntelligenceProps> = ({
  incident,
  onAnalysisGenerated,
  className = '',
}) => {
  const [analysis, setAnalysis] = useState<AIAnalysisRecord | null>(incident.aiIntelligence || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providerHealth, setProviderHealth] = useState<ProviderHealthResponse | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<'adaption' | 'gemini'>('adaption');

  // Load backend provider status & cached analysis on mount
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      // 1. Check backend health
      const health = await AdaptionClientService.checkHealth();
      if (mounted && health) {
        setProviderHealth(health);
      }

      // 2. If no analysis in prop, check if backend has stored analysis
      if (!analysis && incident.id) {
        const stored = await AdaptionClientService.getStoredAnalysis(incident.id);
        if (mounted && stored) {
          setAnalysis(stored);
        }
      }
    };

    init();
    return () => { mounted = false; };
  }, [incident.id]);

  const handleGenerateBrief = async () => {
    setLoading(true);
    setError(null);

    const record = await AdaptionClientService.generateIncidentBrief(incident, {
      provider: selectedProvider,
      allowFallback: true,
    });

    setLoading(false);

    if (record.status === 'failed') {
      setError(record.error || 'Failed to generate incident briefing.');
    } else {
      setAnalysis(record);
      if (onAnalysisGenerated) {
        onAnalysisGenerated(record);
      }
    }
  };

  const isAdaptionConfigured = providerHealth?.providers?.adaption?.configured;
  const currentModel = providerHealth?.providers?.adaption?.model || 'qwen3.5-397b';

  return (
    <div className={`bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden transition-all ${className}`}>
      {/* Header bar */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-5 md:p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300 shadow-inner">
            <Brain size={24} className="animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-black text-lg md:text-xl tracking-tight text-white flex items-center gap-2">
                Emergency Intelligence Brief
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wider uppercase bg-indigo-500/20 border border-indigo-400/30 text-indigo-200">
                Adaption Labs
              </span>
            </div>
            <p className="text-xs text-slate-300 font-medium">
              Operational triage & clinical briefing for human dispatchers
            </p>
          </div>
        </div>

        {/* Provider Status Pill & Controls */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700/60 text-xs">
            <span className={`w-2 h-2 rounded-full ${isAdaptionConfigured ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'}`} />
            <span className="font-semibold text-slate-200">
              {isAdaptionConfigured ? `Adaption (${currentModel})` : 'Adaption Ready'}
            </span>
          </div>

          <button
            onClick={handleGenerateBrief}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 active:scale-95 text-white rounded-xl text-xs font-bold transition-all shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                <span>Analyzing Incident...</span>
              </>
            ) : analysis ? (
              <>
                <RefreshCw size={14} />
                <span>Re-Analyze</span>
              </>
            ) : (
              <>
                <Sparkles size={14} className="text-amber-300" />
                <span>Generate AI Incident Brief</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Body */}
      <div className="p-5 md:p-6 space-y-6">
        {/* Error / Alert banner */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-red-700 text-sm animate-in fade-in">
            <AlertCircle size={20} className="shrink-0 mt-0.5 text-red-500" />
            <div className="flex-1">
              <p className="font-bold">Intelligence Generation Alert</p>
              <p className="text-xs text-red-600 mt-0.5 leading-relaxed">{error}</p>
              <div className="mt-3 flex items-center gap-3">
                <button
                  onClick={handleGenerateBrief}
                  className="px-3 py-1 bg-red-600 text-white text-xs font-bold rounded-lg hover:bg-red-700 transition-colors"
                >
                  Retry with Adaption Labs
                </button>
                <span className="text-[11px] text-red-500">
                  Ensure ADAPTION_API_KEY is configured in backend/.env
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Loading state skeleton */}
        {loading && (
          <div className="py-12 px-6 text-center space-y-4 animate-in fade-in duration-300">
            <div className="w-16 h-16 rounded-3xl bg-indigo-50 border border-indigo-100 flex items-center justify-center mx-auto text-indigo-600 shadow-sm animate-bounce">
              <Sparkles size={32} />
            </div>
            <div>
              <h4 className="font-black text-slate-800 text-lg">Contacting Adaption Labs AI Inference Gateway...</h4>
              <p className="text-slate-500 text-sm max-w-md mx-auto mt-1">
                Parsing incident metadata, cross-referencing symptom clusters, and structuring human-in-the-loop operational briefing.
              </p>
            </div>
            <div className="max-w-md mx-auto h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-600 rounded-full animate-[progress_1.5s_ease-in-out_infinite]" style={{ width: '70%' }} />
            </div>
          </div>
        )}

        {/* Empty state prompt */}
        {!loading && !analysis && !error && (
          <div className="py-10 px-6 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
            <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center mx-auto mb-3 text-slate-400">
              <Brain size={24} />
            </div>
            <h4 className="font-bold text-slate-700 text-base">No AI Brief Generated Yet</h4>
            <p className="text-slate-400 text-xs max-w-md mx-auto mt-1 mb-4">
              Click &quot;Generate AI Incident Brief&quot; above to synthesize caller reports, location data, and symptom reports via Adaption Labs.
            </p>
            <button
              onClick={handleGenerateBrief}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-md transition-all active:scale-95"
            >
              <Sparkles size={14} className="text-amber-300" />
              Generate Incident Brief Now
            </button>
          </div>
        )}

        {/* Render Result */}
        {!loading && analysis && (
          <div className="space-y-6 animate-in fade-in duration-400">
            {/* Top Operational Summary Card */}
            <div className="p-5 bg-indigo-50/60 border border-indigo-100 rounded-2xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-black uppercase tracking-wider text-indigo-700 flex items-center gap-1.5">
                  <Zap size={14} className="text-indigo-600" /> A. Incident Summary
                </span>
                {analysis.result.detectedLanguage && (
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200">
                    Language: {analysis.result.detectedLanguage}
                  </span>
                )}
              </div>
              <p className="text-sm font-semibold text-slate-800 leading-relaxed">
                {analysis.result.summary}
              </p>
            </div>

            {/* Extracted Information Chips */}
            <div>
              <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                <Info size={14} /> B. Extracted Emergency Information
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Category</span>
                  <span className="font-extrabold text-xs text-red-600 bg-red-50 border border-red-100 px-2 py-0.5 rounded-md inline-block">
                    {analysis.result.extractedInfo?.category || incident.type?.category || 'CRITICAL'}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Emergency Type</span>
                  <span className="font-bold text-xs text-slate-800 truncate block">
                    {analysis.result.extractedInfo?.emergencyType || incident.type?.name || 'General'}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Reported Vitals</span>
                  <span className="font-bold text-xs text-slate-700 truncate block">
                    {analysis.result.extractedInfo?.reportedVitals || 'Pending paramedic check'}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Estimated Victims</span>
                  <span className="font-bold text-xs text-slate-700 block">
                    {analysis.result.extractedInfo?.patientCount || '1'}
                  </span>
                </div>
              </div>

              {/* Symptoms chips */}
              {analysis.result.extractedInfo?.reportedSymptoms && analysis.result.extractedInfo.reportedSymptoms.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-bold uppercase text-slate-400 mr-1">Reported Symptoms:</span>
                  {analysis.result.extractedInfo.reportedSymptoms.map((sym, i) => (
                    <span key={i} className="px-2.5 py-1 bg-amber-50 border border-amber-200/80 text-amber-800 rounded-lg text-xs font-semibold">
                      {sym}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* C. Dispatcher Operational Briefing */}
            <div className="p-5 bg-slate-900 text-white rounded-2xl shadow-sm border border-slate-800 relative overflow-hidden">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <ShieldCheck size={16} /> C. Dispatcher & Paramedic Operational Brief
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Priority Action Note
                </span>
              </div>
              <p className="text-sm font-medium text-slate-100 leading-relaxed">
                {analysis.result.dispatcherBrief}
              </p>
            </div>

            {/* D & E Side-by-Side: Missing Information & Operational Considerations */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* D. Missing Information */}
              <div className="p-4 bg-amber-50/50 border border-amber-200/80 rounded-2xl">
                <h4 className="text-[11px] font-black uppercase tracking-wider text-amber-800 mb-2.5 flex items-center gap-1.5">
                  <AlertTriangle size={15} className="text-amber-600" /> D. Missing Critical Information
                </h4>
                {analysis.result.missingInfo && analysis.result.missingInfo.length > 0 ? (
                  <ul className="space-y-2">
                    {analysis.result.missingInfo.map((info, idx) => (
                      <li key={idx} className="text-xs font-medium text-slate-700 flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                        <span>{info}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-500 italic">No missing critical fields identified.</p>
                )}
              </div>

              {/* E. Suggested Operational Considerations */}
              <div className="p-4 bg-emerald-50/50 border border-emerald-200/80 rounded-2xl">
                <h4 className="text-[11px] font-black uppercase tracking-wider text-emerald-800 mb-2.5 flex items-center gap-1.5">
                  <CheckCircle2 size={15} className="text-emerald-600" /> E. Suggested Operational Considerations
                </h4>
                {analysis.result.operationalConsiderations && analysis.result.operationalConsiderations.length > 0 ? (
                  <ul className="space-y-2">
                    {analysis.result.operationalConsiderations.map((item, idx) => (
                      <li key={idx} className="text-xs font-medium text-slate-700 flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-500 italic">Standard protocol applies.</p>
                )}
              </div>
            </div>

            {/* Metadata Footer */}
            <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between text-[11px] text-slate-400 gap-2">
              <div className="flex items-center gap-3">
                <span className="font-semibold text-slate-600">
                  Provider: {analysis.provider === 'adaption' ? 'Adaption Labs' : 'Google Gemini (Fallback)'}
                </span>
                <span>•</span>
                <span>Model: {analysis.model}</span>
                {analysis.latencyMs && (
                  <>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Clock size={12} /> {analysis.latencyMs}ms
                    </span>
                  </>
                )}
                {analysis.fallbackUsed && (
                  <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-bold text-[10px]">
                    Fallback Active
                  </span>
                )}
              </div>
              <span className="text-slate-400">
                Generated: {new Date(analysis.timestamp).toLocaleTimeString()}
              </span>
            </div>
          </div>
        )}

        {/* Safety Disclaimer */}
        <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-[10px] text-slate-500 flex items-start gap-2 leading-relaxed">
          <ShieldCheck size={14} className="shrink-0 text-slate-400 mt-0.5" />
          <span>
            <strong>Safety Mandate:</strong> This emergency intelligence is an AI-assisted operational summary strictly intended to support authorized human dispatchers and hospital triage staff. The AI does not make autonomous dispatch decisions or diagnose conditions.
          </span>
        </div>
      </div>
    </div>
  );
};

export default AdaptionIncidentIntelligence;
