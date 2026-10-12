import { useEffect, useRef, useState } from 'react';

interface CameraCaptureProps {
  onCapture: (dataUrl: string) => void;
  onClose: () => void;
}

const MAX_SIZE = 400;

/** Toma una foto del producto con la cámara del dispositivo (F-403, sección 8.7). */
export function CameraCapture({ onCapture, onClose }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let active = true;
    void (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('sin cámara');
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setReady(true);
      } catch {
        setError('No se pudo abrir la cámara. Revisa los permisos o usa "Tomar o elegir foto".');
      }
    })();
    return () => {
      active = false;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  function capture() {
    const video = videoRef.current;
    if (!video) return;
    const scale = Math.min(1, MAX_SIZE / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) return;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    onCapture(canvas.toDataURL('image/jpeg', 0.85));
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4">
      <div className="card w-full max-w-lg p-6" role="dialog" aria-modal="true">
        <h2 className="title mb-4 text-3xl">Tomar foto</h2>
        {error ? (
          <p className="mb-4 rounded-xl bg-amber-100 p-4 text-lg font-semibold text-amber-900">{error}</p>
        ) : (
          <video ref={videoRef} playsInline muted className="mb-4 w-full rounded-2xl bg-slate-900" />
        )}
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="btn btn-neutral flex-1 py-4 text-xl">
            Cerrar
          </button>
          <button
            type="button"
            onClick={capture}
            disabled={!ready}
            className={`btn flex-1 py-4 text-xl text-white ${
              ready ? 'bg-green-600 hover:bg-green-700' : 'cursor-not-allowed bg-slate-400'
            }`}
          >
            📸 Capturar
          </button>
        </div>
      </div>
    </div>
  );
}
