import React, { useState, useEffect, useRef } from 'react';
import { Video, Mic, MicOff, RefreshCw, FileVideo, HardDrive, CheckCircle2 } from 'lucide-react';
import { VideoEvidence, LocationData } from '../types';
import { EmergencyService } from '../services/EmergencyService';
import { VideoStorageService } from '../services/videoStorageService';

interface VideoRecorderProps {
  emergencyId: string;
  emergencyType: string;
  location: LocationData;
  onSave: (video: VideoEvidence) => void;
  onDiscard?: () => void;
}

const VideoRecorder: React.FC<VideoRecorderProps> = ({ emergencyId, emergencyType, location, onSave, onDiscard }) => {
  const [recording, setRecording] = useState(false);
  const [timeLeft, setTimeLeft] = useState(60);
  const [isMuted, setIsMuted] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [cameraError, setCameraError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // Initialize Camera
  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, [facingMode]);

  // Timer Logic
  useEffect(() => {
    let interval: any;
    if (recording && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && recording) {
      stopRecording();
    }
    return () => clearInterval(interval);
  }, [recording, timeLeft]);

  const startCamera = async () => {
    try {
      // 🟢 Native Permission Fix: Uses platform-aware logic in EmergencyService
      await EmergencyService.requestAllPermissions();

      stopCamera(); // Stop previous stream if switching
      setCameraError(false);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facingMode },
        audio: true
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      // Auto-start recording
      if (!recording && timeLeft === 60) {
        startRecordingProcess(stream);
      }
    } catch (err) {
      console.error("Camera access failed", err);
      setCameraError(true);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const startRecordingProcess = (stream: MediaStream) => {
    // Use webm for better browser compatibility during recording
    const options = { mimeType: 'video/webm' };
    let mediaRecorder;

    try {
      mediaRecorder = new MediaRecorder(stream, options);
    } catch (e) {
      // Fallback if specific mimeType fails
      mediaRecorder = new MediaRecorder(stream);
    }

    mediaRecorderRef.current = mediaRecorder;
    chunksRef.current = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    mediaRecorder.onstop = async () => {
      if (isSavingRef.current) return;
      isSavingRef.current = true;
      setIsSaving(true);
      stopCamera(); // Stop camera immediately to save battery and hide preview
      setRecording(false);

      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      const videoId = `VID-${Date.now()}`;
      const timestamp = new Date().toISOString();
      const duration = 60 - timeLeft;

      console.log(`🎬 Recording completed (${duration}s). Automatically saving to laptop local storage...`);

      // 💾 Automatically store in laptop local storage (IndexedDB + laptop file download + localStorage)
      let blobUrl = '';
      try {
        const result = await VideoStorageService.autoSaveVideo(blob, {
          id: videoId,
          emergencyId,
          emergencyType,
          timestamp,
        });
        blobUrl = result.blobUrl;
      } catch (err) {
        console.warn('AutoSave fallback:', err);
        blobUrl = URL.createObjectURL(blob);
      }

      // 🚀 Automatically pass to onSave which registers video evidence and immediately hides the camera section
      onSave({
        id: videoId,
        url: blobUrl,
        timestamp,
        duration,
        emergencyType,
        location,
      });
    };

    mediaRecorder.start();
    setRecording(true);
  };

  const stopRecording = () => {
    if (isSavingRef.current) return;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      isSavingRef.current = true;
      mediaRecorderRef.current.stop();
    }
  };

  const toggleMute = () => {
    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach(track => track.enabled = !track.enabled);
      setIsMuted(!isMuted);
    }
  };

  const toggleCamera = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  };

  // --- ERROR UI ---
  if (cameraError) {
    return (
      <div className="h-full w-full bg-[#2f3640] rounded-3xl p-8 border-2 border-red-500/30 flex flex-col items-center justify-center text-center">
        <Video size={48} className="text-red-500 mb-4" />
        <h3 className="text-xl font-bold text-white mb-2">Camera Error</h3>
        <p className="text-gray-400 text-sm mb-6">Unable to access camera. Please check permissions.</p>
        <button onClick={() => setCameraError(false)} className="px-6 py-2 bg-gray-700 text-white rounded-lg font-bold">Retry</button>
      </div>
    );
  }

  // --- RECORDING UI ---
  return (
    <div className="h-full w-full bg-black rounded-3xl overflow-hidden relative shadow-2xl border-4 border-emergency">
      {/* Saving Overlay */}
      {isSaving && (
        <div className="absolute inset-0 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center z-40 animate-in fade-in">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-3"></div>
          <p className="text-white font-bold text-base">Auto-Saving to Laptop Storage...</p>
          <p className="text-emerald-400 text-xs mt-1">Downloading file & persisting locally</p>
        </div>
      )}

      {/* Video Stream */}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className={`w-full h-full object-cover transition-opacity duration-500 ${recording ? 'opacity-100' : 'opacity-0'}`}
      />
      {!recording && !isSaving && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="animate-spin w-12 h-12 border-4 border-emergency border-t-transparent rounded-full"></div>
        </div>
      )}

      {/* Top Overlays */}
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start bg-gradient-to-b from-black/90 via-black/50 to-transparent pt-6">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3 bg-red-600/20 backdrop-blur px-3 py-1.5 rounded-full border border-red-500/50">
            <div className="w-3 h-3 bg-red-600 rounded-full animate-pulse shadow-[0_0_10px_#ff0000]"></div>
            <span className="font-mono text-red-500 font-black text-lg tracking-widest">
              00:{timeLeft < 10 ? '0' : ''}{timeLeft}
            </span>
          </div>
          <span className="text-[10px] text-red-400 font-bold ml-1 flex items-center gap-1">
            <FileVideo size={10} /> REC • {emergencyType.toUpperCase()}
          </span>
        </div>

        <div className="bg-black/50 backdrop-blur px-3 py-1.5 rounded-lg border border-white/20">
          <span className="text-xs text-emerald-300 font-bold flex items-center gap-2">
            <HardDrive size={13} className="text-emerald-400" /> Laptop Storage Auto-Save
          </span>
        </div>
      </div>

      {/* Bottom Controls */}
      <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/90 via-black/60 to-transparent">
        <div className="flex items-center justify-between">
          {/* Mute Toggle */}
          <button
            onClick={toggleMute}
            className="p-4 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur border border-white/10 active:scale-95 transition-all"
            title="Mute / unmute"
          >
            {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
          </button>

          {/* Stop Button */}
          <div className="flex flex-col items-center -mt-4">
            <button
              onClick={stopRecording}
              className="w-20 h-20 rounded-full border-[6px] border-white flex items-center justify-center mb-2 hover:scale-105 active:scale-95 transition-all shadow-[0_0_20px_rgba(255,255,255,0.3)] bg-red-600/20"
              title="Stop recording and save automatically to laptop storage"
            >
              <div className="w-8 h-8 bg-red-500 rounded-md shadow-lg"></div>
            </button>
            <span className="text-xs uppercase font-black text-white tracking-widest drop-shadow-md">Stop Recording</span>
          </div>

          {/* Camera Flip */}
          <button
            onClick={toggleCamera}
            className="p-4 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur border border-white/10 active:scale-95 transition-all"
            title="Switch camera"
          >
            <RefreshCw size={24} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default VideoRecorder;