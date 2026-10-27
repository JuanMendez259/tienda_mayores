import { useEffect, useId, useRef, useState } from 'react';
import { cameraErrorMessage, startCameraScanner, type CameraScanner } from '../devices/barcodeCamera';
import { beep } from '../lib/sound';
import { useModalA11y } from '../lib/useModalA11y';

interface BarcodeScannerModalProps {
  /** Recibe el código ya limpio; el formulario lo escribe y cierra. */
  onDetected: (code: string) => void;
  onClose: () => void;
}

/** Cuánto se muestra la confirmación antes de cerrar y escribir el código. */
const CONFIRM_MS = 500;

/** Lee un código de barras con la cámara del dispositivo (F-102, sección 8.5). */
export function BarcodeScannerModal({ onDetected, onClose }: BarcodeScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const panelRef = useModalA11y(onClose);
  const titleId = useId();
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const onDetectedRef = useRef(onDetected);

  useEffect(() => {
    onDetectedRef.current = onDetected;
  });

  useEffect(() => {
    let active = true;
    let scanner: CameraScanner | null = null;
    let closeTimer: number | null = null;

    void (async () => {
      try {
        const video = videoRef.current;
        if (!video) return;
        const started = await startCameraScanner({
          video,
          onDetected: (code) => {
            if (!active) return;
            setReading(true);
            beep(1200, 120);
            navigator.vibrate?.(60);
            closeTimer = window.setTimeout(() => {
              if (active) onDetectedRef.current(code);
            }, CONFIRM_MS);
          },
          onError: (message) => {
            if (active) setError(message);
          },
        });
        if (!active) {
          started.stop();
          return;
        }
        scanner = started;
      } catch (caught) {
        if (active) setError(cameraErrorMessage(caught));
      }
    })();

    return () => {
      active = false;
      if (closeTimer !== null) window.clearTimeout(closeTimer);
      scanner?.stop();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4">
      <div
        ref={panelRef}
        tabIndex={-1}
        className="card w-full max-w-lg p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h2 id={titleId} className="title mb-3 text-2xl">
          Escanear código de barras
        </h2>

        {error ? (
          <p role="alert" className="mb-4 rounded-xl bg-amber-100 p-4 text-lg font-semibold text-amber-900">
            {error}
          </p>
        ) : (
          <div className="relative mb-4 overflow-hidden rounded-2xl bg-slate-900">
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="aspect-[4/3] w-full object-cover"
              aria-label="Vista de la cámara"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-8 inset-y-12 rounded-xl border-4 border-white/80"
            />
            <div className="absolute inset-x-0 bottom-0 bg-slate-900/70 p-3 text-center">
              <p className="text-lg font-bold text-white" aria-live="polite">
                {reading ? '✅ Código leído' : 'Apunta al código de barras'}
              </p>
            </div>
          </div>
        )}

        {!error && (
          <p className="mb-4 text-base text-slate-600">
            Acerca el código al centro del marco. Si no enfoca, acerca la cámara y evita el reflejo.
          </p>
        )}

        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="btn btn-neutral flex-1 py-4 text-xl">
            Cancelar
          </button>
          <button type="button" onClick={onClose} className="btn btn-neutral flex-1 py-4 text-xl">
            Escribir a mano
          </button>
        </div>
      </div>
    </div>
  );
}
