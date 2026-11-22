/**
 * Video Storage Service
 * Handles automatic persistence to:
 * 1. Laptop file system via instant download
 * 2. Laptop browser IndexedDB (unlimited persistent local storage)
 * 3. window.localStorage metadata registry
 */

const DB_NAME = 'cers_local_evidence_db';
const DB_VERSION = 1;
const STORE_NAME = 'evidence_videos';

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported in this environment'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export interface StoredVideoRecord {
  id: string;
  emergencyId?: string;
  filename: string;
  timestamp: string;
  emergencyType: string;
  blob: Blob;
  sizeBytes: number;
}

export class VideoStorageService {
  /**
   * Automatically save recording to laptop disk and browser local storage
   */
  static async autoSaveVideo(
    blob: Blob,
    metadata: {
      id: string;
      emergencyId?: string;
      emergencyType: string;
      timestamp?: string;
    }
  ): Promise<{ filename: string; blobUrl: string }> {
    const timestamp = metadata.timestamp || new Date().toISOString();
    const cleanType = (metadata.emergencyType || 'Emergency').replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `CERS_Evidence_${cleanType}_${Date.now()}.webm`;
    const blobUrl = URL.createObjectURL(blob);

    // 1. Automatically trigger laptop local disk download
    try {
      if (typeof document !== 'undefined') {
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          if (document.body.contains(a)) {
            document.body.removeChild(a);
          }
        }, 300);
        console.log(`💾 Video automatically saved to laptop downloads: ${filename}`);
      }
    } catch (err) {
      console.warn('Auto-download to laptop storage failed:', err);
    }

    // 2. Persist high-resolution video in Laptop IndexedDB
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      const record: StoredVideoRecord = {
        id: metadata.id,
        emergencyId: metadata.emergencyId,
        filename,
        timestamp,
        emergencyType: metadata.emergencyType,
        blob,
        sizeBytes: blob.size,
      };

      store.put(record);
      await new Promise((res, rej) => {
        tx.oncomplete = res;
        tx.onerror = rej;
      });
      console.log(`📦 Video persisted in Laptop IndexedDB store: ${metadata.id} (${blob.size} bytes)`);
    } catch (idbErr) {
      console.warn('IndexedDB persistence warning:', idbErr);
    }

    // 3. Register entry in window.localStorage
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('cers_latest_evidence_id', metadata.id);
        localStorage.setItem('cers_latest_evidence_file', filename);
        localStorage.setItem('cers_latest_evidence_time', timestamp);
        localStorage.setItem('cers_latest_evidence_type', metadata.emergencyType);
        localStorage.setItem('cers_latest_evidence_size', String(blob.size));
        if (metadata.emergencyId) {
          localStorage.setItem(`cers_evidence_id_${metadata.emergencyId}`, metadata.id);
          localStorage.setItem(`cers_evidence_file_${metadata.emergencyId}`, filename);
        }
      }
    } catch (lsErr) {
      console.warn('localStorage metadata update warning:', lsErr);
    }

    return { filename, blobUrl };
  }

  /**
   * Retrieve video record from local storage by id
   */
  static async getStoredVideo(id: string): Promise<StoredVideoRecord | null> {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    } catch {
      return null;
    }
  }

  /**
   * Retrieve all stored videos from local IndexedDB
   */
  static async getAllStoredVideos(): Promise<StoredVideoRecord[]> {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    } catch {
      return [];
    }
  }

  /**
   * Get an actively playable video URL from any available laptop source:
   * 1. Live blob url (if valid in this session)
   * 2. IndexedDB by video id
   * 3. IndexedDB by emergency id
   * 4. Most recent recorded video in IndexedDB
   */
  static async getPlayableVideo(
    videoEvidence?: any,
    emergencyId?: string
  ): Promise<{ url: string; filename?: string; timestamp?: string } | null> {
    // 1. Direct active blob URL test
    if (videoEvidence?.url && typeof videoEvidence.url === 'string') {
      if (videoEvidence.url.startsWith('http://') || videoEvidence.url.startsWith('https://') || videoEvidence.url.startsWith('data:')) {
        return { url: videoEvidence.url, timestamp: videoEvidence.timestamp };
      }
      if (videoEvidence.url.startsWith('blob:')) {
        try {
          const testRes = await fetch(videoEvidence.url, { method: 'HEAD' });
          if (testRes.ok) {
            return { url: videoEvidence.url, timestamp: videoEvidence.timestamp };
          }
        } catch {
          // Blob may have expired across reload; continue to IndexedDB recovery
        }
      }
    }

    // 2. Lookup IndexedDB by videoEvidence.id
    if (videoEvidence?.id) {
      const record = await this.getStoredVideo(videoEvidence.id);
      if (record && record.blob) {
        return {
          url: URL.createObjectURL(record.blob),
          filename: record.filename,
          timestamp: record.timestamp,
        };
      }
    }

    // 3. Lookup IndexedDB by emergencyId mapped id
    if (emergencyId && typeof window !== 'undefined') {
      const mappedId = localStorage.getItem(`cers_evidence_id_${emergencyId}`);
      if (mappedId) {
        const record = await this.getStoredVideo(mappedId);
        if (record && record.blob) {
          return {
            url: URL.createObjectURL(record.blob),
            filename: record.filename,
            timestamp: record.timestamp,
          };
        }
      }
    }

    // 4. Fallback: Search all records in local IndexedDB
    try {
      const all = await this.getAllStoredVideos();
      if (all && all.length > 0) {
        // Find matching emergencyId if available, or sort newest first
        if (emergencyId) {
          const match = all.find(r => r.emergencyId === emergencyId);
          if (match && match.blob) {
            return {
              url: URL.createObjectURL(match.blob),
              filename: match.filename,
              timestamp: match.timestamp,
            };
          }
        }
        all.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
        const newest = all[0];
        if (newest && newest.blob) {
          return {
            url: URL.createObjectURL(newest.blob),
            filename: newest.filename,
            timestamp: newest.timestamp,
          };
        }
      }
    } catch (allErr) {
      console.warn('Error reading stored videos:', allErr);
    }

    // 5. Ultimate fallback if videoEvidence has url
    if (videoEvidence?.url) {
      return { url: videoEvidence.url, timestamp: videoEvidence.timestamp };
    }

    return null;
  }
}
