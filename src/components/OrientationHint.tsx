import { useEffect, useState } from 'react';

/** Lado mínimo para considerar el dispositivo una tablet (no un teléfono). */
const TABLET_MIN_SIDE = 600;

/**
 * La caja se usa en tablet horizontal. Si la tablet está vertical, se muestra
 * un aviso grande y se ofrece continuar así (sin bloquear el trabajo).
 */
export function OrientationHint() {
  const [portrait, setPortrait] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const media = window.matchMedia?.('(orientation: portrait)');
    const update = () => {
      const isPortrait =
        Boolean(media?.matches) && Math.min(window.innerWidth, window.innerHeight) >= TABLET_MIN_SIDE;
      setPortrait(isPortrait);
      // Al volver a horizontal se "arma" de nuevo para la próxima vez.
      if (!isPortrait) setDismissed(false);
    };

    void Promise.resolve().then(update);
    media?.addEventListener?.('change', update);
    window.addEventListener('resize', update);
    return () => {
      media?.removeEventListener?.('change', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  if (!portrait || dismissed) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="orientation-title"
      className="fixed inset-0 z-[80] flex flex-col items-center justify-center gap-6 bg-slate-900/95 p-8 text-center text-white"
    >
      <span className="rotate-90 text-8xl" aria-hidden="true">
        📱
      </span>
      <h2 id="orientation-title" className="text-4xl font-extrabold">
        Gira la tablet
      </h2>
      <p className="max-w-xl text-2xl text-slate-200">
        Esta caja se usa de lado, en horizontal, para ver los productos y el carrito al mismo
        tiempo.
      </p>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="btn btn-neutral px-8 py-5 text-2xl"
      >
        Continuar en vertical
      </button>
    </div>
  );
}
