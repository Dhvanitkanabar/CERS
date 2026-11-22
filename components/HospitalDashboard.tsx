// @ts-nocheck
import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid
} from 'recharts';
import {
  Activity, Users, Clock, AlertTriangle, MapPin, Radio, Shield,
  Video, Phone, Loader2, Ambulance, CheckCircle, Filter, Download,
  Plus, Inbox, LayoutDashboard, ClipboardList, Package, UserCheck,
  LogOut, Search, XCircle, TrendingUp, Heart, MessageSquare, Menu, X,
  Brain, ChevronLeft, ChevronRight, PhoneCall, Sparkles, Droplets,
  Lock, Unlock, HardDrive
} from "lucide-react";

import { useEmergencySystem } from '../contexts/EmergencyContext';
import { HospitalProfile } from '../types';
import { CommandCenterDashboard } from './CommandCenterDashboard';
import { HospitalCommunicationCenter } from './HospitalCommunicationCenter';
import { calculateAmbulanceETA } from '../services/MapService';
import AdaptionIncidentIntelligence from './AdaptionIncidentIntelligence';
import { VideoStorageService } from '../services/videoStorageService';

interface HospitalDashboardProps {
  onLogout?: () => void;
}

type DashboardView = 'overview' | 'cases' | 'resources' | 'staff' | 'analytics' | 'communication';

const HospitalDashboard: React.FC<HospitalDashboardProps> = ({ onLogout }) => {
  // --- 1. HOOKS ---
  const {
    activeEmergencies,
    logoutUser,
    currentUser,
    assignHospital,
    updateEmergencyStatus,
    updateAmbulanceLocation,
    resolveEmergency,
    rejectEmergencyRequest
  } = useEmergencySystem();

  const hospital = currentUser as HospitalProfile;
  const [currentView, setCurrentView] = useState<DashboardView>('overview');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const audioContextRef = useRef<AudioContext | null>(null);
  const prevIncidentIds = useRef<Set<string>>(new Set());
  const [resourceCounts, setResourceCounts] = useState({ staff: 0, beds: 0, fleet: 0 });
  const [staffDetails, setStaffDetails] = useState<{ name: string, dept: string }[]>([]);
  const [assigningIncident, setAssigningIncident] = useState<any | null>(null);
  const [assignmentForm, setAssignmentForm] = useState({ doctor: '' });
  const [dischargingIncident, setDischargingIncident] = useState<any | null>(null);
  const [viewingVideo, setViewingVideo] = useState<any | null>(null); // holds the incident whose video is being viewed
  const [activePlayableVideo, setActivePlayableVideo] = useState<{ url: string; filename?: string; timestamp?: string } | null>(null);
  const [isVideoLoading, setIsVideoLoading] = useState(false);
  const [viewingAiIncident, setViewingAiIncident] = useState<any | null>(null); // holds the incident whose Adaption AI intelligence is being viewed
  
  // ⏱️ Real-time clock ticks every second for precise 5-minute auto-expiry
  const [now, setNow] = useState<number>(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Conflict guard: If another hospital accepts an incident while assigning, auto-close modal
  useEffect(() => {
    if (assigningIncident) {
      const live = activeEmergencies.find(e => e.id === assigningIncident.id);
      if (live && live.assignedHospitalId && live.assignedHospitalId !== hospital?.id) {
        alert("⚠️ This emergency has just been accepted by another hospital. Dispatch locked.");
        setAssigningIncident(null);
        setAssignmentForm({ doctor: '' });
      }
    }
  }, [activeEmergencies, assigningIncident, hospital?.id]);

  // Helper: Live 5-minute countdown calculator (MM:SS)
  const getRemainingTime = (timestamp: string) => {
    const created = new Date(timestamp).getTime();
    const remainingMs = Math.max(0, 5 * 60 * 1000 - (now - created));
    const totalSec = Math.floor(remainingMs / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
  };

  // Resolve playable video from laptop storage whenever viewingVideo changes
  useEffect(() => {
    if (!viewingVideo) {
      setActivePlayableVideo(null);
      return;
    }
    let isMounted = true;
    setIsVideoLoading(true);
    VideoStorageService.getPlayableVideo(viewingVideo.videoEvidence, viewingVideo.id)
      .then((res) => {
        if (isMounted) {
          setActivePlayableVideo(res);
          setIsVideoLoading(false);
        }
      })
      .catch((err) => {
        console.warn("Evidence video lookup error:", err);
        if (isMounted) setIsVideoLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [viewingVideo]);

  // Medical privacy & details helper: extracts patient data with appropriate defaults
  const getPatientDetails = (incident: any) => {
    const user = incident?.userProfile || {};
    const med = user.medicalInfo || {};
    const contacts = (user.emergencyContacts && user.emergencyContacts.length > 0)
      ? user.emergencyContacts
      : [];

    const bloodGroup = med.bloodGroup || user.bloodGroup || 'O+ (RH Positive)';
    const primaryContact = contacts[0] || {
      name: 'Guardian / Emergency Contact',
      phone: user.phone || '+91 98765 43210',
      relation: 'Family Guardian'
    };

    const patientName = user.name || 'Emergency Patient';
    const patientPhone = user.phone || '9999999999';
    const allergies = med.allergies || 'No known allergies reported';
    const conditions = med.conditions || 'None reported';
    const medications = med.medications || 'None reported';

    return {
      bloodGroup,
      primaryContact,
      patientName,
      patientPhone,
      allergies,
      conditions,
      medications,
      allContacts: contacts.length > 0 ? contacts : [primaryContact]
    };
  };

  const FIVE_MINUTES_MS = 5 * 60 * 1000;

  const liveIncidents = useMemo(() => {
    return activeEmergencies.filter(e => {
      // 1. Must have active medical lifecycle status
      const isLive = ['active', 'assigned', 'dispatched', 'arrived'].includes(e.status);
      if (!isLive) return false;

      // 2. Hide if hospital explicitly rejected it
      const hasRejected = hospital?.id && e.respondedHospitals?.[hospital.id]?.status === 'rejected';
      if (hasRejected) return false;

      // 3. 🚨 MUTUAL EXCLUSION: If accepted by ANOTHER hospital, IMMEDIATELY GONE from this dashboard!
      if (e.assignedHospitalId && e.assignedHospitalId !== hospital?.id) {
        return false;
      }

      // 4. ⏱️ 5-MINUTE AUTO-EXPIRY FOR UNASSIGNED INCOMING SOS:
      // If no hospital accepts the emergency within 5 minutes (300s), it automatically expires and disappears!
      if (!e.assignedHospitalId) {
        const createdTime = new Date(e.timestamp).getTime();
        const age = now - createdTime;
        if (isNaN(age) || age > FIVE_MINUTES_MS) {
          return false; // Expired!
        }
      }

      // 5. If assigned to THIS hospital, keep it active until resolved
      return true;
    });
  }, [activeEmergencies, hospital?.id, now]);

  const filteredIncidents = useMemo(() => {
    return liveIncidents.filter(inc =>
      (inc.userProfile?.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (inc.type?.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (inc.location?.address || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      inc.id.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [liveIncidents, searchQuery]);

  // 🚨 TOP PRIORITY SOS EMERGENCY SELECTION:
  // Rule: Newest incoming SOS within 5 mins always takes top priority (replaces any previous one).
  // If 5 mins pass without a new emergency, the current unassigned emergency auto-expires and is gone.
  const topPriorityEmergency = useMemo(() => {
    // 1. Look for unassigned emergencies within the 5-minute window
    const unassignedActive = liveIncidents.filter(e => e.status === 'active' && !e.assignedHospitalId);
    if (unassignedActive.length > 0) {
      // Sort newest first: any NEW incoming emergency immediately replaces the previous one!
      unassignedActive.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      return unassignedActive[0];
    }

    // 2. If no fresh unassigned SOS, show the active case currently handled by THIS hospital
    const myActive = liveIncidents.filter(e => e.assignedHospitalId === hospital?.id && ['assigned', 'dispatched'].includes(e.status));
    if (myActive.length > 0) {
      myActive.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      return myActive[0];
    }

    return null;
  }, [liveIncidents, hospital?.id, now]);

  // --- 3. DYNAMIC ANALYTICS (REPLACED DUMMY DATA) ---
  const incidentClassification = useMemo(() => {
    const counts = { Cardiac: 0, Accident: 0, Respiratory: 0, Other: 0 };
    activeEmergencies.forEach(e => {
      const typeName = e.type?.name?.toLowerCase() || '';
      if (typeName.includes('heart') || typeName.includes('cardiac')) counts.Cardiac++;
      else if (typeName.includes('accident') || typeName.includes('bleeding')) counts.Accident++;
      else if (typeName.includes('breathing') || typeName.includes('respiratory')) counts.Respiratory++;
      else counts.Other++;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [activeEmergencies]);

  const liveStatusTrend = useMemo(() => {
    return [
      { name: 'Active', count: activeEmergencies.filter(e => e.status === 'active').length },
      { name: 'Assigned', count: activeEmergencies.filter(e => e.status === 'assigned' || e.status === 'enroute').length },
      { name: 'Dispatched', count: activeEmergencies.filter(e => e.status === 'dispatched').length },
      { name: 'Arrived', count: activeEmergencies.filter(e => e.status === 'arrived').length },
    ];
  }, [activeEmergencies]);

  const COLORS = ['#4F46E5', '#EF4444', '#10B981', '#F59E0B'];

  // --- 4. ALERT SYSTEM ---
  useEffect(() => {
    const currentIds = new Set(liveIncidents.map(e => e.id));
    let hasNew = false;
    currentIds.forEach(id => { if (!prevIncidentIds.current.has(id)) hasNew = true; });

    if (hasNew) {
      playAlertSound();
      if (Notification.permission === "granted") {
        new Notification("🚨 NEW SOS RECEIVED", { body: "Emergency signal detected." });
      }
    }
    prevIncidentIds.current = currentIds;
  }, [liveIncidents]);

  // 🚑 AMBULANCE LIVE TRACKING LOGIC
  useEffect(() => {
    if (!hospital?.id) return;

    // 1. Find the FIRST assigned emergency that this hospital is handling
    const myActiveEmergency = activeEmergencies.find(
      e => e.assignedHospitalId === hospital.id && ['assigned', 'dispatched', 'enroute'].includes(e.status)
    );

    if (!myActiveEmergency) return;

    console.log(`🚑 Tracking Active: Syncing coordinates for Case #${myActiveEmergency.id}`);

    // Update immediately once
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        updateAmbulanceLocation(myActiveEmergency.id, pos.coords.latitude, pos.coords.longitude);
      },
      (err) => console.error("Ambulance Initial GPS Error:", err),
      { enableHighAccuracy: true }
    );

    // 2. Start watching position
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        console.log(`🚑 Ambulance Movement: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
        updateAmbulanceLocation(myActiveEmergency.id, latitude, longitude);
      },
      (err) => console.error("Ambulance Watch GPS Error:", err),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
      console.log("🚑 Tracking Stopped.");
    };
  }, [activeEmergencies, hospital?.id, updateAmbulanceLocation]);



  // Inside HospitalDashboard before the return statement
  const busyResources = useMemo(() => {
    // Count incidents that have been accepted by THIS hospital
    const currentAssignments = activeEmergencies.filter(
      e => e.assignedHospitalId === hospital?.id && e.status !== 'resolved'
    );

    return {
      ambulances: currentAssignments.length,
      staff: currentAssignments.length // Assuming 1 doctor per active case
    };
  }, [activeEmergencies, hospital?.id]);

  // Calculate current availability
  const availableAmbulances = Math.max(0, (hospital?.resources?.ambulances || 0) - busyResources.ambulances);
  const availableStaff = Math.max(0, (hospital?.resources?.doctors || 0) - busyResources.staff);


  // 1. Ensure this state is at the top of your component
  const [shiftHistory, setShiftHistory] = useState<any[]>([]);

  // 2. The Assignment Handler
  const handleAccept = async (incident: any) => {
    setLoadingAction(incident.id);

    // 🟢 Automation: Calculate ETA instantly
    let calculatedEta = "8 mins (Est.)";

    const hostLocation = hospital?.location || { lat: 21.1702, lng: 72.8311 }; // Surat Fallback

    if (hostLocation && incident.location) {
      try {
        console.log("🛣️ AI Automation: Checking real-time traffic...");
        calculatedEta = await calculateAmbulanceETA(hostLocation, incident.location);
      } catch (err) {
        console.warn("⚠️ AI ETA Failed, using fallback:", err);
      }
    }

    // Immediately trigger the assignment with the calculated ETA
    setAssigningIncident({ ...incident, autoEta: calculatedEta });
    setLoadingAction(null);
  };

  // 3. Confirm Assignment (Saving the manual textbox name)
  const confirmAssignment = async () => {
    if (!assigningIncident) return;
    setLoadingAction(assigningIncident.id);

    try {
      const typedDoctorName = assignmentForm.doctor || "On-Duty Medical Team";

      // 🟢 CRITICAL: Use the auto-calculated ETA from state
      const finalEta = assigningIncident.autoEta || "8 mins";

      // Physically attach the name to the local object for the report
      assigningIncident.assignedDoctor = typedDoctorName;

      const success = await assignHospital(assigningIncident.id, hospital.id, finalEta, {
        assignedDoctor: typedDoctorName,
        hospitalLocation: hospital.location
      });

      if (!success) {
        alert("This emergency request has already been accepted by another hospital.");
      }

      // ✅ Succesful Assignment: Reset UI immediately
      setAssigningIncident(null);
      setAssignmentForm({ doctor: '' });
    } catch (error: any) {
      console.error("Assignment Failed:", error);
      alert(`Assignment Failed: ${error.message || "Unknown error"}. Ensure your profile is complete.`);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleReject = async (incidentId: string) => {
    if (!hospital?.id) return;
    await rejectEmergencyRequest(incidentId, hospital.id);
  };

  // --- ACTION HANDLERS ---

  // 1. Trigger the branded confirmation modal
  const initiateEndEmergency = (incident: any) => {
    setDischargingIncident(incident);
  };

  // 2. Final logic executed when "Confirm Discharge" is clicked in your custom UI
  const confirmDischarge = async () => {
    if (!dischargingIncident) return;
    setLoadingAction(dischargingIncident.id);

    // Capture doctor name immediately for the report archive
    const doctorName = dischargingIncident.assignedDoctor || assignmentForm.doctor || 'On-Duty Officer';

    setShiftHistory(prev => [...prev, {
      ...dischargingIncident,
      assignedDoctor: doctorName,
      status: 'resolved'
    }]);

    await resolveEmergency(dischargingIncident.id);

    // Cleanup
    setDischargingIncident(null);
    setLoadingAction(null);
    setAssignmentForm({ doctor: '' });
  };

  if (!currentUser || currentUser.role !== 'hospital') return null;

  // --- 5. ACTION HANDLERS ---
  const playAlertSound = () => {
    try {
      if (!audioContextRef.current) audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioContextRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + 0.4);
    } catch { }
  };

  const handleLogout = () => { logoutUser(); onLogout?.(); };

  // --- 6. RENDER HELPERS ---
  const StatCard = ({ title, value, icon: Icon, trend, color }: any) => (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between">
      <div>
        <p className="text-gray-500 text-sm font-medium">{title}</p>
        <h3 className="text-2xl font-bold mt-1">{value}</h3>
        {trend && <p className="text-xs text-green-500 flex items-center gap-1 mt-2"><TrendingUp size={12} /> {trend}</p>}
      </div>
      <div className={`p-4 rounded-xl ${color} bg-opacity-10 text-${color.split('-')[1]}-600`}>
        <Icon size={24} />
      </div>
    </div>
  );

  const generateShiftReport = () => {
    // Combine live and archived cases so nothing is missing
    const allShiftIncidents = [...activeEmergencies, ...shiftHistory];

    const reportWindow = window.open('', '_blank');
    if (reportWindow) {
      reportWindow.document.write(`
      <html>
        <head>
          <title>CERS+ Official Shift Handover</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
            body { font-family: 'Inter', sans-serif; padding: 60px; color: #1e293b; line-height: 1.5; background: #fff; }
            .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 5px solid #4f46e5; padding-bottom: 30px; margin-bottom: 50px; }
            .logo-icon { background: #ef4444; color: white; padding: 12px; border-radius: 14px; font-weight: 900; font-size: 20px; text-align: center; width: 30px; }
            .logo-text { font-size: 34px; font-weight: 900; color: #1e1b4b; letter-spacing: -1.5px; }
            .section-title { font-size: 13px; font-weight: 900; text-transform: uppercase; color: #4f46e5; margin: 40px 0 15px 0; display: flex; align-items: center; gap: 10px; }
            .section-title::after { content: ""; flex: 1; height: 1px; background: #e2e8f0; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; border-radius: 12px; overflow: hidden; border: 1px solid #f1f5f9; }
            th { text-align: left; background: #f8fafc; padding: 16px; font-size: 11px; color: #64748b; text-transform: uppercase; }
            td { padding: 16px; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #334155; }
            .status-chip { padding: 4px 10px; border-radius: 6px; font-size: 10px; font-weight: 900; }
            .footer-grid { margin-top: 100px; text-align: right; }
            .signature-box { border-top: 2px solid #1e293b; padding-top: 15px; display: inline-block; width: 300px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div style="display: flex; align-items: center; gap: 15px;">
              <div class="logo-icon">✚</div>
              <div>
                <div class="logo-text">CERS+ <span style="font-size: 12px; color: #6366f1; font-weight: 400;">PRO</span></div>
                <div style="font-size: 11px; color: #94a3b8; font-weight: 600;">DAILY EMERGENCY LOGGING SYSTEM</div>
              </div>
            </div>
            <div style="text-align: right;">
              <h2 style="font-size: 26px; font-weight: 800; color: #1e293b; margin: 0;">${hospital?.name || 'City General Hospital'}</h2>
              <div style="font-size: 11px; color: #64748b; margin-top: 5px;">SHIFT REPORT • ${new Date().toLocaleDateString()}</div>
            </div>
          </div>

          <div class="section-title">Case Outcomes & Medical Assignments</div>
          <table>
            <thead>
              <tr>
                <th>Incident ID</th>
                <th>Emergency Type / Patient</th>
                <th>Assigned Officer (Manual Entry)</th>
                <th>Location Details</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${allShiftIncidents.map(inc => `
                <tr>
                  <td style="font-family: monospace; font-weight: 700; color: #64748b;">#${inc.id.slice(-6).toUpperCase()}</td>
                  <td>
                    <div style="font-weight: 800; color: #1e293b;">${inc.type?.name || 'Critical SOS'}</div>
                    <div style="font-size: 11px; color: #94a3b8;">Ref: ${inc.userProfile?.name || 'Anonymous Patient'}</div>
                  </td>
                  <td style="font-weight: 700; color: #4f46e5;">
                    ${inc.assignedDoctor || 'On-Duty Officer'}
                  </td>
                  <td style="font-size: 12px;">${inc.location?.address || 'Surat, Gujarat, India'}</td>
                  <td>
                    <span class="status-chip" style="background: ${inc.status === 'resolved' ? '#ecfdf5' : '#fff7ed'}; color: ${inc.status === 'resolved' ? '#059669' : '#c2410c'};">
                      ${inc.status.toUpperCase()}
                    </span>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="footer-grid">
            <div class="signature-box">
              <div style="font-size: 12px; font-weight: 800; color: #1e293b;">Signature of Chief Medical Officer</div>
              <div style="font-size: 10px; color: #94a3b8; font-weight: 400; margin-top: 4px;">Digitally Authenticated via CERS+ Shift Protocol</div>
              <div style="margin-top: 15px; font-family: 'Courier New', monospace; font-size: 10px; color: #cbd5e1;">CERT-ID: ${Math.random().toString(36).substr(2, 9).toUpperCase()}</div>
            </div>
          </div>
          
          <script>window.onload = () => { window.print(); window.close(); }</script>
        </body>
      </html>
    `);
      reportWindow.document.close();
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans relative">
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
      <aside className={`fixed inset-y-0 left-0 z-50 w-72 bg-indigo-950 text-white flex flex-col shadow-2xl transform transition-transform duration-300 lg:relative lg:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-8">
          <div className="flex items-center gap-3 mb-8">
            <div className="p-2 bg-red-500 rounded-lg"><Activity size={24} /></div>
            <h1 className="font-black text-2xl tracking-tight">CERS+ <span className="text-xs font-normal text-indigo-300">PRO</span></h1>
          </div>
          <nav className="space-y-2">
            {[
              { id: 'overview', icon: LayoutDashboard, label: 'Command Center' },
              { id: 'communication', icon: MessageSquare, label: 'Comms Network' },
              { id: 'cases', icon: ClipboardList, label: 'Active SOS' },
              { id: 'resources', icon: Ambulance, label: 'Fleet & Beds' },
              { id: 'staff', icon: UserCheck, label: 'Medical Staff' },
              { id: 'analytics', icon: TrendingUp, label: 'Data Insights' },
            ].map(item => (
              <button
                key={item.id}
                onClick={() => { setCurrentView(item.id as DashboardView); setIsSidebarOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${currentView === item.id ? 'bg-indigo-600 shadow-lg' : 'hover:bg-indigo-900/50 text-indigo-200'}`}
              >
                <item.icon size={20} /> {item.label}
              </button>
            ))}
          </nav>
        </div>

        {/* 🟢 Unified Bottom Section: Removes the gap between buttons */}
        <div className="mt-auto p-6 border-t border-indigo-900/50 space-y-4">
          <button
            onClick={generateShiftReport}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 transition-all border border-emerald-500/20"
          >
            <Download size={20} /> <span className="text-sm font-bold">Download Report</span>
          </button>

          <button
            onClick={handleLogout}
            className="flex items-center gap-3 text-red-400 hover:text-red-300 px-4 py-2 w-full transition-colors group"
          >
            <LogOut size={20} className="group-hover:-translate-x-1 transition-transform" />
            <span className="font-bold">Sign Out</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto w-full">
        <header className="bg-white border-b border-gray-100 p-4 md:p-6 flex justify-between items-center sticky top-0 z-10 backdrop-blur-md bg-white/80">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 -ml-2 text-gray-500 hover:bg-slate-100 rounded-lg lg:hidden"
            >
              <Menu size={24} />
            </button>
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-gray-800 truncate max-w-[150px] sm:max-w-none">{hospital?.name || 'Emergency Center'}</h2>
              <div className="flex items-center gap-2 text-xs md:text-sm text-green-500"><Radio size={12} className="animate-pulse" /> System Online</div>
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text" placeholder="Search..."
                className="pl-10 pr-4 py-2 bg-gray-100 border-none rounded-xl w-32 md:w-64 focus:ring-2 ring-indigo-500 transition-all text-sm"
                value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </header>

        <div className="p-4 md:p-8 space-y-8">
          {/* 🚨 TOP PRIORITY SOS EMERGENCY HERO BANNER */}
          {topPriorityEmergency && (
            <div className="bg-gradient-to-r from-red-600 via-rose-600 to-red-700 text-white rounded-3xl p-6 md:p-8 shadow-2xl shadow-red-500/25 border-2 border-red-300/40 relative overflow-hidden animate-in slide-in-from-top-4 duration-500">
              <div className="absolute -right-16 -top-16 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none" />

              {/* Priority Header */}
              <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b border-white/20">
                <div className="flex items-center gap-3">
                  <span className="relative flex h-3.5 w-3.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-85"></span>
                    <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-amber-300 shadow-md"></span>
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-black tracking-widest uppercase bg-white/20 px-3 py-1 rounded-full border border-white/30 text-amber-200">
                        🚨 PRIORITY 1: LIVE SOS EMERGENCY
                      </span>
                      <span className="text-xs font-bold text-white/90 uppercase tracking-wider">
                        {topPriorityEmergency.status === 'active' ? 'IMMEDIATE DISPATCH REQUIRED' : 'ASSIGNED TO THIS HOSPITAL'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* ⏱️ Live 5-Minute Auto-Expiry Countdown & Timestamp */}
                <div className="flex items-center gap-2.5 text-xs">
                  {!topPriorityEmergency.assignedHospitalId ? (
                    <div className="flex items-center gap-2 bg-black/35 px-3.5 py-1.5 rounded-xl border border-amber-400/40 text-amber-200 font-mono font-bold shadow-sm">
                      <Clock size={14} className="text-amber-300 animate-spin" />
                      <span>Auto-Expires in {getRemainingTime(topPriorityEmergency.timestamp)}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 bg-black/35 px-3.5 py-1.5 rounded-xl border border-emerald-400/40 text-emerald-300 font-bold shadow-sm">
                      <CheckCircle size={14} className="text-emerald-400" />
                      <span>Accepted • Active Dispatch</span>
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 text-white/90 font-semibold bg-white/10 px-3 py-1.5 rounded-xl border border-white/10">
                    <Clock size={14} />
                    <span>{new Date(topPriorityEmergency.timestamp).toLocaleTimeString()}</span>
                  </div>
                </div>
              </div>

              {/* Patient & Incident Info */}
              {(() => {
                const isTopAccepted = topPriorityEmergency.assignedHospitalId === hospital?.id;
                const topPatient = getPatientDetails(topPriorityEmergency);
                const topHasEvidence = !!topPriorityEmergency.videoEvidence || (typeof window !== 'undefined' && (!!localStorage.getItem('cers_evidence_id_' + topPriorityEmergency.id) || !!localStorage.getItem('cers_evidence_' + topPriorityEmergency.id)));

                return (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
                    <div className="lg:col-span-2 space-y-4">
                      <div className="flex flex-wrap items-baseline gap-3">
                        <h2 className="text-3xl md:text-4xl font-black tracking-tight text-white">
                          #{topPriorityEmergency.id.slice(-6).toUpperCase()}
                        </h2>
                        <span className="text-lg md:text-xl font-bold text-amber-300">
                          • {topPriorityEmergency.type?.name || 'Emergency'}
                        </span>
                        <span className="text-xs font-black uppercase px-2.5 py-1 rounded-md bg-white text-red-700 shadow-sm">
                          {topPriorityEmergency.type?.category || 'CRITICAL'}
                        </span>
                        {isTopAccepted && (
                          <span className="text-xs font-black uppercase px-2.5 py-1 rounded-md bg-emerald-500 text-white shadow-sm flex items-center gap-1">
                            <CheckCircle size={12} /> CASE ACCEPTED
                          </span>
                        )}
                      </div>

                      {/* BEFORE ACCEPTING: REDACTED MEDICAL PRIVACY VIEW */}
                      {!isTopAccepted ? (
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-3 text-sm text-white/95">
                            <div className="flex items-center gap-2 font-bold bg-black/30 border border-white/20 px-3.5 py-1.5 rounded-xl text-amber-200">
                              <Lock size={15} className="text-amber-300" />
                              <span>Patient Identity: Confidential (Triage Mode)</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs font-bold bg-black/30 border border-white/20 px-3.5 py-1.5 rounded-xl text-amber-200">
                              <Droplets size={14} className="text-red-400" />
                              <span>Blood Group: 🔒 Locked</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs font-bold bg-black/30 border border-white/20 px-3.5 py-1.5 rounded-xl text-amber-200">
                              <PhoneCall size={14} className="text-amber-300" />
                              <span>Emergency Contact: 🔒 Locked</span>
                            </div>
                          </div>
                          <p className="text-xs text-amber-100/80 bg-black/20 p-2.5 rounded-xl border border-white/10 flex items-center gap-2">
                            <Shield size={14} className="text-amber-300 shrink-0" />
                            <span>Confidentiality Protocol: Patient Blood Group, Guardian Emergency Contact & medical history unlock immediately upon hospital acceptance.</span>
                          </p>
                        </div>
                      ) : (
                        /* AFTER ACCEPTING: FULL PATIENT MEDICAL DOSSIER UNLOCKED */
                        <div className="space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {/* 🩸 BLOOD GROUP */}
                            <div className="flex items-center gap-3.5 bg-red-950/90 border-2 border-red-300/80 p-3.5 rounded-2xl shadow-lg">
                              <div className="w-12 h-12 rounded-xl bg-red-600 flex items-center justify-center text-white shrink-0 shadow-md">
                                <Droplets size={24} className="fill-white animate-pulse" />
                              </div>
                              <div>
                                <span className="text-[10px] font-black uppercase tracking-widest text-red-200 block">Patient Blood Group</span>
                                <span className="text-2xl font-black text-white tracking-wide">{topPatient.bloodGroup}</span>
                              </div>
                            </div>

                            {/* 📞 EMERGENCY CONTACT */}
                            <div className="flex items-center justify-between gap-3 bg-black/35 border border-white/20 p-3 rounded-2xl">
                              <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-amber-400/20 text-amber-300 rounded-xl">
                                  <PhoneCall size={20} />
                                </div>
                                <div>
                                  <span className="text-[10px] font-black uppercase text-amber-300 tracking-wider block">Guardian Emergency Contact</span>
                                  <span className="text-sm font-bold text-white block">{topPatient.primaryContact.name} ({topPatient.primaryContact.relation})</span>
                                  <span className="text-xs text-amber-200 font-mono">{topPatient.primaryContact.phone}</span>
                                </div>
                              </div>
                              <a
                                href={`tel:${topPatient.primaryContact.phone}`}
                                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black shadow-md flex items-center gap-1.5 transition-all shrink-0"
                              >
                                <Phone size={14} /> Call
                              </a>
                            </div>
                          </div>

                          {/* Full Patient Details Bar */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-black/25 p-3 rounded-2xl border border-white/10">
                            <div>
                              <span className="text-white/60 block text-[10px] font-bold uppercase">Patient Name</span>
                              <span className="font-bold text-white truncate block">{topPatient.patientName}</span>
                            </div>
                            <div>
                              <span className="text-white/60 block text-[10px] font-bold uppercase">Patient Phone</span>
                              <a href={`tel:${topPatient.patientPhone}`} className="font-bold text-amber-200 hover:underline">{topPatient.patientPhone}</a>
                            </div>
                            <div>
                              <span className="text-white/60 block text-[10px] font-bold uppercase">Known Allergies</span>
                              <span className="font-medium text-white/90 truncate block">{topPatient.allergies}</span>
                            </div>
                            <div>
                              <span className="text-white/60 block text-[10px] font-bold uppercase">Medical Conditions</span>
                              <span className="font-medium text-white/90 truncate block">{topPatient.conditions}</span>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="flex items-start gap-2 text-sm text-white/90">
                        <MapPin size={18} className="text-amber-300 shrink-0 mt-0.5" />
                        <span className="font-medium leading-snug">
                          {topPriorityEmergency.location?.address || 'GPS Coordinates Locked — Live Tracking Active'}
                        </span>
                      </div>
                    </div>

                    {/* Priority Actions */}
                    <div className="flex flex-col sm:flex-row lg:flex-col gap-3 justify-center">
                      {!topPriorityEmergency.assignedHospitalId ? (
                        <button
                          onClick={() => handleAccept(topPriorityEmergency)}
                          className="w-full py-4 px-6 bg-white hover:bg-slate-100 active:scale-95 text-red-700 font-black text-base rounded-2xl shadow-xl transition-all flex items-center justify-center gap-2 group cursor-pointer"
                        >
                          <Ambulance size={22} className="group-hover:scale-110 transition-transform text-red-600" />
                          <span>Accept & Dispatch Ambulance</span>
                        </button>
                      ) : (
                        <div className="p-3 bg-white/15 rounded-2xl border border-white/20 text-center">
                          <span className="text-xs font-bold uppercase tracking-wider block text-amber-300">Ambulance Status</span>
                          <span className="text-base font-black text-white">
                            {topPriorityEmergency.ambulanceEta ? `ETA: ${topPriorityEmergency.ambulanceEta}` : 'En Route to Patient'}
                          </span>
                        </div>
                      )}

                      {/* View Evidence Button (if recorded) */}
                      {topHasEvidence && (
                        <button
                          onClick={() => setViewingVideo(topPriorityEmergency)}
                          className="py-3 px-4 bg-red-500/40 hover:bg-red-500/60 text-white font-bold text-xs rounded-xl border border-red-300/40 transition-all flex items-center justify-center gap-2 shadow-lg cursor-pointer animate-pulse"
                        >
                          <Video size={16} className="text-red-200" />
                          <span>View Recorded Evidence</span>
                        </button>
                      )}

                      <div className="flex gap-2">
                        <button
                          onClick={() => setViewingAiIncident(topPriorityEmergency)}
                          className="flex-1 py-3 px-4 bg-slate-900/90 hover:bg-slate-900 active:scale-95 text-white font-bold text-xs rounded-xl border border-white/20 transition-all flex items-center justify-center gap-2 shadow-md cursor-pointer"
                        >
                          <Brain size={16} className="text-amber-300" />
                          <span>Adaption AI Brief</span>
                        </button>

                        {!topPriorityEmergency.assignedHospitalId && (
                          <button
                            onClick={() => handleReject(topPriorityEmergency.id)}
                            className="py-3 px-4 bg-black/30 hover:bg-black/50 text-white/80 hover:text-white font-semibold text-xs rounded-xl border border-white/15 transition-all cursor-pointer"
                          >
                            Decline
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard
              title="Active SOS"
              value={liveIncidents.length}
              icon={AlertTriangle}
              color="bg-red-500"
              trend="Live Updates"
            />
            <StatCard
              title="Ambulances"
              value={availableAmbulances} // 🟢 Now dynamic
              icon={Ambulance}
              color="bg-blue-500"
              trend="Available Fleet"
            />
            <StatCard
              title="Staff On-Duty"
              value={availableStaff} // 🟢 Now dynamic
              icon={Users}
              color="bg-indigo-500"
              trend="Ready"
            />
            <StatCard
              title="Total Managed Today"
              value={shiftHistory.length} // 🟢 Counts cases from your archive
              icon={Clock}
              color="bg-green-500"
              trend="Shift History"
            />
          </div>

          {/* --- 1. COMMAND CENTER (OVERVIEW) --- */}
          {currentView === 'overview' && (
            <CommandCenterDashboard
              onAccept={handleAccept}
              onReject={handleReject}
              onViewAi={setViewingAiIncident}
              currentHospitalId={hospital?.id}
            />
          )}

          {/* --- 2. ACTIVE SOS (REAL-TIME QUEUE) --- */}
          {currentView === 'cases' && (
            <div className="space-y-6 animate-in slide-in-from-left duration-500">
              <div className="bg-white p-8 rounded-3xl border-l-8 border-red-500 shadow-sm flex justify-between items-center">
                <div>
                  <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Active SOS Queue</h3>
                  <p className="text-slate-500 font-medium">Monitoring {liveIncidents.length} live emergency signals</p>
                </div>
                <AlertTriangle size={48} className="text-red-100" />
              </div>
              <div className="grid grid-cols-1 gap-4">
                {filteredIncidents.map((incident) => {
                  const isAccepted = incident.assignedHospitalId === hospital?.id;
                  const patient = getPatientDetails(incident);
                  const hasEvidence = !!incident.videoEvidence || (typeof window !== 'undefined' && (!!localStorage.getItem('cers_evidence_id_' + incident.id) || !!localStorage.getItem('cers_evidence_' + incident.id)));

                  return (
                    <div key={incident.id} className={`bg-white rounded-2xl shadow-sm border transition-all ${isAccepted ? 'border-indigo-200 ring-2 ring-indigo-500/10 p-6' : 'border-slate-100 p-6'}`}>
                      {/* Top Header Row */}
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <div className={`text-2xl font-black ${isAccepted ? 'text-indigo-600 bg-indigo-50 px-3 py-1 rounded-xl' : 'text-slate-400'}`}>
                            #{incident.id.slice(-4)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-xl text-slate-800">{incident.type?.name || 'Emergency'}</h4>
                              {isAccepted ? (
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                                  <CheckCircle size={11} /> Case Accepted
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 border border-amber-200">
                                  Pending Triage
                                </span>
                              )}
                            </div>
                            <p className="text-slate-500 italic text-sm mt-0.5">{incident.location?.address}</p>
                          </div>
                        </div>

                        {/* Top Action Buttons */}
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => setViewingAiIncident(incident)}
                            className="flex items-center gap-1.5 px-3.5 py-2.5 bg-indigo-50 text-indigo-700 border border-indigo-200/80 rounded-xl font-bold hover:bg-indigo-100 transition-all text-xs"
                            title="View Adaption Labs AI Incident Brief"
                          >
                            <Brain size={15} />
                            <span>AI Brief</span>
                          </button>

                          {hasEvidence && (
                            <button
                              onClick={() => setViewingVideo(incident)}
                              className="flex items-center gap-1.5 px-3.5 py-2.5 bg-red-50 text-red-600 border border-red-200 rounded-xl font-bold hover:bg-red-100 transition-all text-xs animate-pulse"
                              title="View Recorded Video Evidence"
                            >
                              <Video size={15} />
                              <span>View Evidence</span>
                            </button>
                          )}

                          {!incident.assignedHospitalId ? (
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleReject(incident.id)}
                                className="px-4 py-2.5 bg-slate-100 text-slate-500 border border-slate-200 rounded-xl font-bold hover:bg-red-50 hover:text-red-600 transition-all text-xs"
                              >
                                Reject
                              </button>
                              <button
                                onClick={() => handleAccept(incident)}
                                className="px-5 py-2.5 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 shadow-md shadow-red-200 transition-all text-xs"
                              >
                                Emergency Accept
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => initiateEndEmergency(incident)}
                              className="p-2.5 text-slate-400 hover:text-red-500 hover:bg-red-50 bg-slate-50 rounded-xl transition-all"
                              title="Discharge Patient / Complete Case"
                            >
                              <XCircle size={22} />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* UNACCEPTED STATE: PATIENT DATA PROTECTED BANNER */}
                      {!isAccepted ? (
                        <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 bg-slate-50/70 p-3 rounded-xl border border-dashed border-slate-200">
                          <div className="flex items-center gap-2">
                            <Lock size={14} className="text-amber-500" />
                            <span className="font-semibold text-slate-700">Patient Medical Profile Confidential:</span>
                            <span className="text-slate-500">Blood group, guardian contact, and clinical history will unlock after accepting this emergency.</span>
                          </div>
                          <span className="text-amber-600 font-bold bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200">
                            🔒 Locked for Privacy
                          </span>
                        </div>
                      ) : (
                        /* ACCEPTED STATE: FULL UNLOCKED PATIENT MEDICAL DOSSIER */
                        <div className="mt-5 pt-4 border-t border-indigo-100 space-y-3.5">
                          {/* 🩸 BLOOD GROUP & 📞 EMERGENCY CONTACT HIGHLIGHT */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                            {/* Blood Group */}
                            <div className="bg-red-50 border-2 border-red-200/90 p-3.5 rounded-2xl flex items-center gap-3.5 shadow-sm">
                              <div className="w-12 h-12 rounded-xl bg-red-600 text-white flex items-center justify-center font-black shrink-0 shadow-md shadow-red-200">
                                <Droplets size={24} className="fill-white animate-pulse" />
                              </div>
                              <div>
                                <span className="text-[10px] font-black uppercase text-red-500 tracking-wider block">
                                  Patient Blood Group (Confirmed)
                                </span>
                                <span className="text-2xl font-black text-red-700 tracking-wide">
                                  {patient.bloodGroup}
                                </span>
                              </div>
                            </div>

                            {/* Emergency Contact */}
                            <div className="bg-amber-50/80 border border-amber-200 p-3.5 rounded-2xl flex items-center justify-between gap-3 shadow-sm">
                              <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-amber-100 text-amber-700 rounded-xl shrink-0">
                                  <PhoneCall size={18} />
                                </div>
                                <div>
                                  <span className="text-[10px] font-black uppercase text-amber-700 tracking-wider block">
                                    Guardian Emergency Contact
                                  </span>
                                  <span className="text-sm font-bold text-slate-800 block">
                                    {patient.primaryContact.name} ({patient.primaryContact.relation})
                                  </span>
                                  <span className="text-xs text-slate-600 font-mono block">
                                    {patient.primaryContact.phone}
                                  </span>
                                </div>
                              </div>
                              <a
                                href={`tel:${patient.primaryContact.phone}`}
                                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all shrink-0"
                              >
                                <Phone size={13} /> Call
                              </a>
                            </div>
                          </div>

                          {/* Detailed Clinical & Contact Grid */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80">
                            <div>
                              <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider">Patient Name</span>
                              <span className="font-bold text-slate-800 truncate block">{patient.patientName}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider">Patient Direct Tel</span>
                              <a href={`tel:${patient.patientPhone}`} className="font-bold text-indigo-600 hover:underline">{patient.patientPhone}</a>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider">Known Allergies</span>
                              <span className="font-medium text-slate-700 truncate block">{patient.allergies}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider">Pre-existing Conditions</span>
                              <span className="font-medium text-slate-700 truncate block">{patient.conditions}</span>
                            </div>
                          </div>

                          {/* Ambulance Dispatch Footer */}
                          <div className="flex flex-wrap items-center justify-between text-xs text-indigo-900 bg-indigo-50/50 px-3.5 py-2 rounded-xl border border-indigo-100">
                            <div className="flex items-center gap-2">
                              <Ambulance size={14} className="text-indigo-600" />
                              <span className="font-bold">Ambulance ETA:</span>
                              <span className="font-black text-indigo-700">{incident.ambulanceEta || '8 mins (Est.)'}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-slate-500">Attending Officer:</span>
                              <span className="font-bold text-slate-800">{incident.assignedDoctor || 'On-Duty Medical Team'}</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* --- 3. FLEET & BEDS (DYNAMIC RESOURCE GRID) --- */}
          {currentView === 'resources' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in slide-in-from-right duration-500">
              <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
                <h3 className="font-bold text-xl text-slate-800 mb-8 flex items-center gap-3">
                  <Ambulance className="text-indigo-600" /> Ambulance Fleet
                </h3>
                <div className="space-y-4">
                  {/* Uses real hospital resources */}
                  {Array.from({ length: hospital?.resources?.ambulances || 0 }).map((_, i) => (
                    <div key={i} className="flex justify-between items-center p-5 bg-slate-50 rounded-2xl border border-slate-100">
                      <span className="font-black text-slate-700">UNIT-0{i + 1}</span>
                      <span className="px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-green-100 text-green-600">Standby</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 text-center">
                <h3 className="font-bold text-xl text-slate-800 mb-8 flex items-center gap-3 text-left">
                  <Activity className="text-red-500" /> ER Capacity
                </h3>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                  {Array.from({ length: hospital?.resources?.beds || 0 }).map((_, i) => (
                    <div key={i} className="aspect-square rounded-xl border-2 border-green-100 bg-green-50/50 flex items-center justify-center font-black text-xs text-green-600">{i + 1}</div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* --- 4. MEDICAL STAFF (PERSONNEL TABLE) --- */}
          {currentView === 'staff' && (
            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-500">
              <div className="p-4 md:p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
                <h3 className="font-bold text-lg md:text-xl text-slate-800">Medical Personnel Roster</h3>
                <div className="px-4 py-2 bg-green-100 text-green-700 rounded-lg text-xs font-bold shrink-0 ml-2">{hospital?.resources?.doctors || 0} Staff Active</div>
              </div>
              <div className="overflow-x-auto w-full">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-widest">
                    <tr>
                      <th className="px-8 py-4 whitespace-nowrap">Name</th>
                      <th className="px-8 py-4 whitespace-nowrap">Department</th>
                      <th className="px-8 py-4 whitespace-nowrap">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    <tr className="hover:bg-slate-50 transition-colors">
                      <td className="px-8 py-6 font-bold text-slate-800 whitespace-nowrap">{hospital?.adminDetails?.name || 'Administrator'}</td>
                      <td className="px-8 py-6 text-slate-500 italic whitespace-nowrap">Emergency Medicine</td>
                      <td className="px-8 py-6 whitespace-nowrap"><span className="px-3 py-1 rounded-full text-[10px] font-black bg-indigo-100 text-indigo-600">Admin On-Duty</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* --- 5. COMMUNICATION CENTER --- */}
          {currentView === 'communication' && (
            <div className="h-[calc(100vh-[180px])] -m-8 p-8 overflow-y-auto">
              <HospitalCommunicationCenter />
            </div>
          )}
        </div>

        {/* MODALS */}
        {assigningIncident && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-200">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-xl font-black text-slate-800">Assign Emergency</h3>
                  <p className="text-sm text-slate-500">Case ID: #{assigningIncident.id.slice(-6)}</p>
                </div>
                <button onClick={() => setAssigningIncident(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <XCircle className="text-slate-400" size={24} />
                </button>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 block">
                    Assign Medical Officer (Manual Entry)
                  </label>
                  <input
                    type="text"
                    placeholder="Enter Doctor's Full Name"
                    className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 ring-indigo-500 outline-none transition-all"
                    value={assignmentForm.doctor}
                    onChange={(e) => setAssignmentForm({ ...assignmentForm, doctor: e.target.value })}
                  />
                </div>

                <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100">
                  <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Estimated ETA</p>
                  <p className="text-lg font-black text-blue-700">{assigningIncident.autoEta}</p>
                </div>

                <button
                  onClick={() => confirmAssignment()}
                  disabled={!assignmentForm.doctor}
                  className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-lg shadow-indigo-200 hover:bg-indigo-700 disabled:opacity-50 disabled:shadow-none transition-all mt-4"
                >
                  Confirm Assignment
                </button>
              </div>
            </div>
          </div>
        )}

        {dischargingIncident && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-200 text-center">
              <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertTriangle className="text-red-500" size={40} />
              </div>

              <h3 className="text-xl font-black text-slate-800 mb-2">Confirm Discharge?</h3>
              <p className="text-sm text-slate-500 mb-8 leading-relaxed">
                You are about to end the emergency for <span className="font-bold text-slate-700">#{dischargingIncident.id.slice(-6).toUpperCase()}</span>. This action will archive the case to your shift report.
              </p>

              <div className="flex flex-col gap-3">
                <button
                  onClick={confirmDischarge}
                  className="w-full py-4 bg-red-600 text-white rounded-2xl font-black shadow-lg shadow-red-100 hover:bg-red-700 transition-all"
                >
                  Yes, Discharge Patient
                </button>
                <button
                  onClick={() => setDischargingIncident(null)}
                  className="w-full py-4 bg-slate-100 text-slate-500 rounded-2xl font-black hover:bg-slate-200 transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 🤖 Adaption Labs AI Intelligence Modal */}
        {viewingAiIncident && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl animate-in zoom-in-95 duration-200 relative">
              <div className="sticky top-0 right-0 p-4 bg-white/90 backdrop-blur-md flex justify-between items-center border-b border-slate-100 z-10">
                <div className="flex items-center gap-2">
                  <Brain className="text-indigo-600" size={22} />
                  <h3 className="font-bold text-slate-800 text-base md:text-lg">
                    Adaption Labs Intelligence — Case #{viewingAiIncident.id.slice(-6).toUpperCase()}
                  </h3>
                </div>
                <button
                  onClick={() => setViewingAiIncident(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="p-4 md:p-6">
                <AdaptionIncidentIntelligence incident={viewingAiIncident} />
              </div>
            </div>
          </div>
        )}

        {/* 📹 Emergency Recorded Video Evidence Modal */}
        {viewingVideo && (
          <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-[120] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-800 text-white rounded-3xl max-w-3xl w-full max-h-[92vh] overflow-y-auto shadow-2xl animate-in zoom-in-95 duration-200 relative">
              {/* Header */}
              <div className="sticky top-0 bg-slate-900/95 backdrop-blur-md p-5 border-b border-slate-800 flex justify-between items-center z-10">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-red-600/20 text-red-500 rounded-xl border border-red-500/30">
                    <Video size={22} className="animate-pulse" />
                  </div>
                  <div>
                    <h3 className="font-black text-lg text-white">
                      Emergency Video Evidence — #{viewingVideo.id.slice(-6).toUpperCase()}
                    </h3>
                    <p className="text-xs text-slate-400">
                      {viewingVideo.type?.name || 'Emergency'} • {viewingVideo.location?.address || 'Location Locked'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setViewingVideo(null)}
                  className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Video Player Body */}
              <div className="p-6 space-y-5">
                <div className="bg-black rounded-2xl overflow-hidden border border-slate-800 shadow-inner flex flex-col items-center justify-center relative min-h-[300px]">
                  {isVideoLoading ? (
                    <div className="p-12 flex flex-col items-center justify-center text-center gap-3">
                      <Loader2 size={40} className="animate-spin text-red-500" />
                      <p className="font-bold text-sm text-slate-300">Retrieving video evidence from laptop local storage...</p>
                      <p className="text-xs text-slate-500">Checking browser IndexedDB & local downloads</p>
                    </div>
                  ) : activePlayableVideo?.url ? (
                    <div className="w-full">
                      <video
                        src={activePlayableVideo.url}
                        controls
                        autoPlay
                        playsInline
                        className="w-full max-h-[55vh] object-contain rounded-2xl bg-black"
                      />
                    </div>
                  ) : (
                    <div className="p-12 flex flex-col items-center justify-center text-center gap-3">
                      <Video size={48} className="text-slate-600 mb-2" />
                      <p className="font-bold text-white text-base">Video Evidence Recorded & Stored Locally</p>
                      <p className="text-xs text-slate-400 max-w-md">
                        The evidence video has been safely saved to your laptop's local storage (Downloads & IndexedDB).
                      </p>
                    </div>
                  )}
                </div>

                {/* Evidence Details & Download Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-slate-800/60 rounded-2xl border border-slate-700/60 text-xs">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1.5 text-emerald-400 font-bold bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20">
                      <HardDrive size={14} /> Laptop Local Storage Verified
                    </span>
                    {activePlayableVideo?.timestamp && (
                      <span className="text-slate-400 flex items-center gap-1">
                        <Clock size={12} /> {new Date(activePlayableVideo.timestamp).toLocaleTimeString()}
                      </span>
                    )}
                  </div>

                  {activePlayableVideo?.url && (
                    <a
                      href={activePlayableVideo.url}
                      download={activePlayableVideo.filename || `CERS_Evidence_${viewingVideo.id}.webm`}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl flex items-center gap-2 transition-all shadow-md"
                    >
                      <Download size={14} /> Download File (.webm)
                    </a>
                  )}
                </div>

                {/* Patient Medical Dossier inside Modal (Governed by acceptance) */}
                {(() => {
                  const isAssignedToMe = viewingVideo.assignedHospitalId === hospital?.id;
                  const patient = getPatientDetails(viewingVideo);

                  if (isAssignedToMe) {
                    return (
                      <div className="bg-slate-800/80 border border-slate-700 p-5 rounded-2xl space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-700 pb-3">
                          <span className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                            <Unlock size={14} /> Case Accepted — Patient Dossier Unlocked
                          </span>
                          <span className="text-xs font-bold text-slate-400">
                            Ambulance ETA: {viewingVideo.ambulanceEta || 'En Route'}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {/* 🩸 Blood Group */}
                          <div className="bg-red-950/80 border border-red-500/50 p-3.5 rounded-xl flex items-center gap-3.5">
                            <div className="w-11 h-11 rounded-lg bg-red-600 text-white flex items-center justify-center font-black shrink-0">
                              <Droplets size={22} className="fill-white" />
                            </div>
                            <div>
                              <span className="text-[10px] font-black uppercase text-red-300 block">Patient Blood Group</span>
                              <span className="text-xl font-black text-white">{patient.bloodGroup}</span>
                            </div>
                          </div>

                          {/* 📞 Emergency Contact */}
                          <div className="bg-amber-950/40 border border-amber-500/40 p-3.5 rounded-xl flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5">
                              <div className="p-2 bg-amber-500/20 text-amber-400 rounded-lg">
                                <PhoneCall size={18} />
                              </div>
                              <div>
                                <span className="text-[10px] font-black uppercase text-amber-300 block">Emergency Contact</span>
                                <span className="text-xs font-bold text-white block">{patient.primaryContact.name} ({patient.primaryContact.relation})</span>
                                <span className="text-xs text-amber-200 font-mono block">{patient.primaryContact.phone}</span>
                              </div>
                            </div>
                            <a
                              href={`tel:${patient.primaryContact.phone}`}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1 shrink-0"
                            >
                              <Phone size={12} /> Call
                            </a>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-slate-900/60 p-3.5 rounded-xl border border-slate-700/50">
                          <div>
                            <span className="text-slate-400 block text-[10px] uppercase font-bold">Patient Name</span>
                            <span className="font-bold text-white truncate block">{patient.patientName}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[10px] uppercase font-bold">Patient Tel</span>
                            <a href={`tel:${patient.patientPhone}`} className="text-amber-300 font-mono underline">{patient.patientPhone}</a>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[10px] uppercase font-bold">Known Allergies</span>
                            <span className="font-medium text-slate-200 truncate block">{patient.allergies}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[10px] uppercase font-bold">Conditions</span>
                            <span className="font-medium text-slate-200 truncate block">{patient.conditions}</span>
                          </div>
                        </div>
                      </div>
                    );
                  } else {
                    return (
                      <div className="bg-slate-800/80 border border-amber-500/30 p-5 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className="p-3 bg-amber-500/20 text-amber-400 rounded-xl shrink-0">
                            <Lock size={22} />
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-white">Patient Medical Profile Protected</h4>
                            <p className="text-xs text-slate-400 mt-0.5">
                              Blood group, guardian emergency contact, and clinical notes are unlocked immediately upon accepting this case.
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            const inc = viewingVideo;
                            setViewingVideo(null);
                            handleAccept(inc);
                          }}
                          className="px-5 py-3 bg-red-600 hover:bg-red-500 text-white font-black text-xs rounded-xl shadow-lg transition-all flex items-center gap-2 shrink-0 cursor-pointer"
                        >
                          <Ambulance size={16} /> Accept Case & Unlock Details
                        </button>
                      </div>
                    );
                  }
                })()}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default HospitalDashboard;