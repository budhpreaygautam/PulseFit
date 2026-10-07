import React, { useEffect, useRef, useState } from 'react';
import { CameraOff, X } from 'lucide-react';
import { focusRing } from './ui.js';

// BarcodeDetector is not in TypeScript's DOM library yet (Chromium and Android only).
interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
}
type BarcodeDetectorCtor = (new (options?: { formats?: string[] }) => BarcodeDetectorLike) & {
  getSupportedFormats?: () => Promise<string[]>;
};

const detectorCtor = (): BarcodeDetectorCtor | undefined => (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;

export const canScanWithCamera = (): boolean => typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia;

function cameraErrorMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Camera access was refused. Allow the camera for this site, or type the pass code instead.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera was found on this device. Type the pass code instead.';
  if (name === 'NotReadableError') return 'The camera is in use by another app. Close it and try again.';
  return 'The camera could not be started. Type the pass code instead.';
}

interface CameraScannerProps {
  onDetected: (code: string) => void;
  onClose: () => void;
}

/** Live camera preview that reads the first QR code it sees. The stream stops when this unmounts. */
export const CameraScanner: React.FC<CameraScannerProps> = ({ onDetected, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;
  const [status, setStatus] = useState<'starting' | 'scanning' | 'error'>('starting');
  const [error, setError] = useState('');

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    let stopped = false;

    const stop = () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach(track => track.stop());
      stream = null;
    };

    (async () => {
      try {
        const Ctor = detectorCtor();
        if (!Ctor) throw new Error('unsupported');
        const formats = Ctor.getSupportedFormats ? await Ctor.getSupportedFormats() : ['qr_code'];
        if (!formats.includes('qr_code')) throw new Error('unsupported');
        const detector = new Ctor({ formats: ['qr_code'] });

        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (stopped) {
          stop();
          return;
        }
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();
        setStatus('scanning');

        const tick = async () => {
          if (stopped) return;
          try {
            const codes = video.readyState >= 2 ? await detector.detect(video) : [];
            const value = codes.find(c => c.rawValue.trim())?.rawValue.trim();
            if (value && !stopped) {
              stop();
              onDetectedRef.current(value);
              return;
            }
          } catch {
            // A frame that cannot be read yet; try the next one.
          }
          timer = window.setTimeout(tick, 250);
        };
        tick();
      } catch (err) {
        if (stopped) return;
        stop();
        setError(err instanceof Error && err.message === 'unsupported' ? 'This browser cannot read QR codes from the camera. Type the pass code instead.' : cameraErrorMessage(err));
        setStatus('error');
      }
    })();

    return stop;
  }, []);

  return (
    <div className="space-y-3">
      <div className="relative rounded-2xl overflow-hidden neu-pressed-sm aspect-video bg-black">
        <video ref={videoRef} muted playsInline className="w-full h-full object-cover" aria-label="Camera preview" />
        {status === 'scanning' && <div className="absolute inset-8 border-2 border-lime-400/80 rounded-2xl pointer-events-none" aria-hidden="true" />}
        {status !== 'scanning' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-sm text-slate-200 bg-black/70">
            {status === 'error' ? <CameraOff className="w-6 h-6 text-rose-400" aria-hidden="true" /> : null}
            <span>{status === 'starting' ? 'Starting the camera…' : null}</span>
          </div>
        )}
      </div>
      <p className="text-xs text-slate-400" role="status">
        {status === 'scanning' ? 'Hold the member’s QR pass inside the frame.' : null}
      </p>
      {status === 'error' && (
        <p className="text-sm font-semibold text-rose-400" role="alert">
          {error}
        </p>
      )}
      <button type="button" onClick={onClose} className={`neu-btn px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 ${focusRing}`}>
        <X className="w-3.5 h-3.5" aria-hidden="true" /> Close camera
      </button>
    </div>
  );
};
