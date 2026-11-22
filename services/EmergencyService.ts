import { Camera } from '@capacitor/camera';
import { Geolocation } from '@capacitor/geolocation';
import { Network } from '@capacitor/network';
import { SmsManager } from '@byteowls/capacitor-sms';

import { Capacitor } from '@capacitor/core';

export class EmergencyService {
    private static permissionLock = false;

    /**
     * Explicitly requests all hardware permissions required for SOS
     */
    static async requestAllPermissions() {
        if (this.permissionLock) return true;
        this.permissionLock = true;
        try {
            console.log('Requesting SOS permissions...');

            // 🌐 Skip native native permission requests on web to avoid "Not implemented" crash
            if (Capacitor.getPlatform() === 'web') {
                console.log('Running on Web: Skipping native hardware permission requests.');
                return true;
            }

            // Request Camera
            await Camera.requestPermissions();

            // Request Location
            await Geolocation.requestPermissions();

            console.log('Native permissions initialized successfully.');
            return true;
        } catch (error: any) {
            console.error('Permission Error:', error);
            return false;
        }
    }

    /**
     * Core SOS Logic: Checks network and executes either Online or Offline path
     */
    static async triggerSOS(guardianNumber: string, onOnlineSubmit: (coords: { lat: number, lng: number }) => Promise<void>) {
        let lat = 21.1702;
        let lng = 72.8311; // Default fallback: Surat, Gujarat

        // 1. Attempt to get current location safely
        try {
            if (navigator && navigator.geolocation) {
                const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, {
                        enableHighAccuracy: true,
                        timeout: 5000
                    });
                }).catch(() => null);

                if (pos?.coords) {
                    lat = pos.coords.latitude;
                    lng = pos.coords.longitude;
                }
            } else {
                const coordinates = await Geolocation.getCurrentPosition({
                    enableHighAccuracy: true,
                    timeout: 5000
                }).catch(() => null);

                if (coordinates?.coords) {
                    lat = coordinates.coords.latitude;
                    lng = coordinates.coords.longitude;
                }
            }
        } catch (locErr) {
            console.warn('Location retrieval fallback used:', locErr);
        }

        // 2. Check network connectivity
        let isOnline = true;
        try {
            const status = await Network.getStatus();
            isOnline = Boolean(status.connected);
        } catch {
            isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
        }

        console.log(`SOS Status: Online=${isOnline}, Coords=(${lat}, ${lng})`);

        // 3. Online path: submit immediately
        if (isOnline) {
            console.log('Device is ONLINE. Submitting emergency to CERS+ network...');
            await onOnlineSubmit({ lat, lng });
            return;
        }

        // 4. Offline path: trigger SMS fallback only on supported native platforms
        const isNative = Capacitor.isNativePlatform();
        const googleMapsLink = `https://www.google.com/maps?q=${lat},${lng}`;
        const message = `EMERGENCY! I need immediate help. My location: ${googleMapsLink}`;

        if (isNative && guardianNumber) {
            try {
                console.log('Device is OFFLINE. Triggering SMS Fallback...');
                await SmsManager.send({
                    numbers: [guardianNumber],
                    text: message
                });
            } catch (smsErr) {
                console.error('SMS fallback failed:', smsErr);
                window.location.href = `sms:${guardianNumber}?body=${encodeURIComponent(message)}`;
            }
        } else {
            // Still try online submit in case browser network was misreported
            await onOnlineSubmit({ lat, lng });
        }
    }
}
