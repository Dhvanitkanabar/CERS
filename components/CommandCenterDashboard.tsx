import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebaseConfig';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import {
   Radio, Clock, CheckCircle, XCircle, Ambulance, Activity, ShieldAlert,
   Brain, ChevronDown, ChevronUp, Sparkles
} from 'lucide-react';
import { EmergencyIncident } from '../types';
import AdaptionIncidentIntelligence from './AdaptionIncidentIntelligence';

interface CommandCenterDashboardProps {
   onAccept?: (incident: any) => void;
   onReject?: (incidentId: string) => void;
   onViewAi?: (incident: any) => void;
   currentHospitalId?: string;
}

export const CommandCenterDashboard: React.FC<CommandCenterDashboardProps> = ({
   onAccept,
   onReject,
   onViewAi,
   currentHospitalId,
}) => {
   const [incidents, setIncidents] = useState<EmergencyIncident[]>([]);
   const [expandedAiIds, setExpandedAiIds] = useState<Record<string, boolean>>({});

   // ⏱️ Live clock for 5-minute auto-expiry filtering
   const [now, setNow] = useState<number>(Date.now());
   useEffect(() => {
      const t = setInterval(() => setNow(Date.now()), 1000);
      return () => clearInterval(t);
   }, []);

   const activeIncidents = useMemo(() => {
      return incidents.filter(inc => {
         if (['resolved', 'rejected'].includes(inc.status)) return false;
         // 5-minute auto-expiry for unassigned emergencies
         if (!inc.assignedHospitalId && inc.status === 'active') {
            const age = now - new Date(inc.timestamp).getTime();
            if (age > 5 * 60 * 1000 || isNaN(age)) return false;
         }
         return true;
      });
   }, [incidents, now]);

   const toggleAi = (id: string) => {
      setExpandedAiIds(prev => ({ ...prev, [id]: !prev[id] }));
   };

   useEffect(() => {
      // Listen to ALL emergencies for command center
      const q = query(
         collection(db, "emergencies"),
         orderBy("timestamp", "desc")
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
         const data = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
         })) as EmergencyIncident[];

         setIncidents(data);
      });

      return () => unsubscribe();
   }, []);

   const getStatusColor = (status: string) => {
      switch (status) {
         case 'active': return 'bg-red-100 text-red-700 border-red-200';
         case 'assigned': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
         case 'dispatched': return 'bg-blue-100 text-blue-700 border-blue-200';
         case 'arrived': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
         case 'resolved': return 'bg-slate-100 text-slate-700 border-slate-200';
         default: return 'bg-gray-100 text-gray-700 border-gray-200';
      }
   };

   const getResponseBadge = (status: string) => {
      switch (status) {
         case 'pending': return <span className="px-2 py-1 text-[10px] font-bold rounded-md bg-yellow-100 text-yellow-700 border border-yellow-200 flex items-center gap-1"><Clock size={10} /> Pending</span>;
         case 'accepted': return <span className="px-2 py-1 text-[10px] font-bold rounded-md bg-green-100 text-green-700 border border-green-200 flex items-center gap-1"><CheckCircle size={10} /> Accepted</span>;
         case 'rejected': return <span className="px-2 py-1 text-[10px] font-bold rounded-md bg-red-100 text-red-700 border border-red-200 flex items-center gap-1"><XCircle size={10} /> Rejected</span>;
         default: return null;
      }
   }

   return (
      <div className="animate-in fade-in duration-500">
         <div className="mb-8 flex items-center justify-between bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
            <div>
               <h1 className="text-2xl font-black flex items-center gap-3 text-slate-800">
                  <ShieldAlert className="text-red-600" size={28} /> Network Command Center
               </h1>
               <p className="text-slate-500 font-medium text-sm mt-1">Live monitoring of hospital responses & emergency dispatching</p>
            </div>
            <div className="flex items-center gap-2 text-xs font-bold text-red-500 bg-red-50 px-4 py-2 rounded-xl border border-red-100">
               <Radio size={14} className="animate-pulse" /> Live Broadcast Active
            </div>
         </div>

         <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500 relative">
            {activeIncidents.length === 0 ? (
               <div className="text-center py-20 bg-white rounded-[40px] border-2 border-dashed border-slate-200 shadow-sm">
                  <Activity className="mx-auto text-slate-200 mb-4" size={64} />
                  <p className="text-slate-400 font-medium text-lg">No active emergency broadcasts within the 5-minute active window.</p>
               </div>
            ) : (
               activeIncidents.map(incident => (
                  <div key={incident.id} className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                     {/* Header Section */}
                     <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-slate-50/50">
                        <div className="flex items-center gap-4">
                           <div className={`p-4 rounded-xl flex items-center justify-center ${incident.status === 'active' ? 'bg-red-100/50' : 'bg-slate-100'}`}>
                              <Activity className={incident.status === 'active' ? 'text-red-500 animate-pulse' : 'text-slate-500'} size={24} />
                           </div>
                           <div>
                              <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                                 #{incident.id.slice(-6).toUpperCase()}
                                 <span className="text-slate-400 text-sm font-normal">• {incident.type?.name || 'Emergency'}</span>
                              </h3>
                              {incident.assignedHospitalId ? (
                                 <p className="text-sm text-slate-600 font-medium">
                                    {incident.userProfile?.name || 'Emergency Patient'}
                                    <span className="text-red-700 font-black ml-2 px-2 py-0.5 rounded-lg bg-red-50 border border-red-200 text-xs inline-flex items-center gap-1">
                                       🩸 Blood: {incident.userProfile?.medicalInfo?.bloodGroup || 'O+'}
                                    </span>
                                    <span className="mx-1 text-slate-300">•</span>
                                    <span className="text-slate-500">{incident.location?.address}</span>
                                 </p>
                              ) : (
                                 <p className="text-sm text-slate-500 flex flex-wrap items-center gap-2 mt-0.5">
                                    <span className="text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 text-xs inline-flex items-center gap-1">
                                       🔒 Patient Profile Protected
                                    </span>
                                    <span>{incident.location?.address}</span>
                                 </p>
                              )}
                           </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                           <div className="flex items-center gap-2">
                              {incident.status === 'active' && !incident.assignedHospitalId && onAccept && (
                                 <div className="flex items-center gap-1.5 mr-1">
                                    {onReject && (
                                       <button
                                          onClick={() => onReject(incident.id)}
                                          className="px-3 py-1.5 bg-slate-100 hover:bg-red-50 text-slate-500 hover:text-red-600 rounded-xl text-xs font-bold transition-all border border-slate-200"
                                       >
                                          Reject
                                       </button>
                                    )}
                                    <button
                                       onClick={() => onAccept(incident)}
                                       className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black shadow-md shadow-red-200 active:scale-95 transition-all flex items-center gap-1.5"
                                    >
                                       <Ambulance size={14} />
                                       <span>Accept SOS</span>
                                    </button>
                                 </div>
                              )}
                              <button
                                 onClick={() => toggleAi(incident.id)}
                                 className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${expandedAiIds[incident.id]
                                       ? 'bg-indigo-600 text-white shadow-sm'
                                       : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200'
                                    }`}
                              >
                                 <Brain size={14} />
                                 <span>Adaption AI Brief</span>
                                 {expandedAiIds[incident.id] ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                              </button>
                              <span className={`px-4 py-1.5 rounded-xl text-xs font-black uppercase tracking-widest border ${getStatusColor(incident.status)}`}>
                                 {incident.status}
                              </span>
                           </div>
                           <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1">
                              <Clock size={10} /> {new Date(incident.timestamp).toLocaleTimeString()}
                           </span>
                        </div>
                     </div>

                     {/* Responses & Live Dispatch Status */}
                     <div className="p-6">
                        {(() => {
                           const realResponses = Object.entries(incident.respondedHospitals || {}).filter(
                             ([_, res]: any) => res?.status === 'accepted' || res?.status === 'rejected'
                           );

                           if (realResponses.length > 0) {
                             return (
                               <div className="mb-4">
                                 <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Hospital Dispatch Responses</h4>
                                 <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                   {realResponses.map(([hospitalId, response]: any) => (
                                     <div key={hospitalId} className={`p-3.5 rounded-2xl border transition-all ${
                                       response.status === 'accepted' ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50/40 border-red-100'
                                     }`}>
                                       <div className="flex justify-between items-center">
                                         <span className="font-bold text-slate-800 text-xs">Hospital #{hospitalId.slice(0, 6).toUpperCase()}</span>
                                         {getResponseBadge(response.status)}
                                       </div>
                                       <div className="text-[10px] text-slate-400 mt-1">
                                         Logged: {new Date(response.timestamp).toLocaleTimeString()}
                                       </div>
                                     </div>
                                   ))}
                                 </div>
                               </div>
                             );
                           }

                           if (!incident.assignedHospitalId) {
                             return (
                               <div className="p-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200 flex items-center justify-between text-xs text-slate-500 mb-2">
                                 <span className="flex items-center gap-2 font-medium">
                                   <Radio size={14} className="text-red-500 animate-pulse" />
                                   Live broadcast transmitting to emergency network • Awaiting hospital acceptance
                                 </span>
                                 <span className="font-bold bg-amber-50 text-amber-700 px-2.5 py-1 rounded-md border border-amber-200">
                                   Broadcasting
                                 </span>
                               </div>
                             );
                           }

                           return null;
                        })()}
                     </div>

                     {/* Adaption Labs AI Intelligence Section */}
                     {expandedAiIds[incident.id] && (
                        <div className="p-6 pt-0 border-t border-slate-100 animate-in fade-in duration-300">
                           <AdaptionIncidentIntelligence incident={incident} />
                        </div>
                     )}
                  </div>
               ))
            )}
         </div>
      </div>
   );
};

export default CommandCenterDashboard;
