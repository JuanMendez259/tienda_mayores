/**
 * Lectura de códigos de barras con la cámara (F-102, sección 8.5).
 *
 * Usa el lector nativo `BarcodeDetector` cuando el navegador lo ofrece
 * (Chrome/Android: cero descargas). En Safari/iPadOS, donde sigue desactivado,
 * cae a `@zxing/browser`, que se importa en diferido: el paquete solo se
 * descarga la primera vez que se abre el escáner y luego queda en caché.
 */

/** Formatos de una dimensión habituales en una tienda de abarrotes. */
export const DEFAULT_FORMATS = [
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'code_128',
  'code_39',
  'itf',
  'codabar',
] as const;

export type BarcodeFormatName = (typeof DEFAULT_FORMATS)[number];

interface DetectedBarcode {
  rawValue?: string | null;
}

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}

interface BarcodeDetectorConstructor {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
}

export interface CameraScanner {
  /** Apaga la cámara y detiene el bucle de lectura. Es idempotente. */
  stop: () => void;
}

export interface StartCameraScannerOptions {
  video: HTMLVideoElement;
  /** Se llama una sola vez, con el código ya limpio. */
  onDetected: (code: string) => void;
  /** Fallo posterior a la apertura (por ejemplo, al cargar el decodificador). */
  onError?: (message: string) => void;
}

/** Quita espacios accidentales y descarta lecturas vacías. */
export function cleanBarcode(value: string | null | undefined): string | null {
  const clean = (value ?? '').trim();
  return clean.length > 0 ? clean : null;
}

/**
 * Deja solo los formatos que el lector nativo dice soportar. Si no informa
 * ninguno se usan los de la tienda, para no construir un detector inválido.
 */
export function barcodeFormatsFor(supported: readonly string[] | null | undefined): string[] {
  if (!supported || supported.length === 0) return [...DEFAULT_FORMATS];
  const allowed = new Set<string>(DEFAULT_FORMATS);
  return supported.filter((format) => allowed.has(format));
}

/** Traduce el fallo de la cámara a una instrucción clara de mostrador. */
export function cameraErrorMessage(error: unknown): string {
  const name =
    typeof error === 'object' && error !== null && 'name' in error
      ? String((error as { name?: unknown }).name ?? '')
      : '';
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
    return 'No hay permiso para usar la cámara. Actívalo en los ajustes del navegador o escribe el código a mano.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
    return 'No se encontró una cámara en este dispositivo. Escribe el código a mano.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'La cámara está ocupada por otra aplicación. Ciérrala e inténtalo de nuevo.';
  }
  return 'No se pudo abrir la cámara. Revisa los permisos o escribe el código a mano.';
}

async function createNativeDetector(): Promise<BarcodeDetectorLike | null> {
  const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
  if (!Detector) return null;
  try {
    const supported = typeof Detector.getSupportedFormats === 'function' ? await Detector.getSupportedFormats() : null;
    const formats = barcodeFormatsFor(supported);
    if (formats.length === 0) return null;
    return new Detector({ formats });
  } catch {
    return null;
  }
}

/**
 * Abre la cámara trasera y empieza a leer. Resuelve cuando el video ya se ve;
 * la carga del decodificador de respaldo sigue en segundo plano.
 */
export async function startCameraScanner({
  video,
  onDetected,
  onError,
}: StartCameraScannerOptions): Promise<CameraScanner> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('sin cámara');
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
  });

  let stopped = false;
  let timer: number | null = null;
  let zxingControls: { stop: () => void } | null = null;

  function stop() {
    if (stopped) return;
    stopped = true;
    if (timer !== null) window.clearTimeout(timer);
    zxingControls?.stop();
    stream.getTracks().forEach((track) => track.stop());
    if (video.srcObject === stream) video.srcObject = null;
  }

  try {
    video.srcObject = stream;
    await video.play();
  } catch (error) {
    stop();
    throw error;
  }

  /** Devuelve true si el código era válido y ya se avisó al formulario. */
  function emit(raw: string | null | undefined): boolean {
    const code = cleanBarcode(raw);
    if (!code || stopped) return false;
    stop();
    onDetected(code);
    return true;
  }

  const detector = await createNativeDetector();
  if (detector) {
    const tick = async () => {
      if (stopped) return;
      try {
        const results = await detector.detect(video);
        for (const result of results) {
          if (emit(result.rawValue)) return;
        }
      } catch {
        /* fotograma aún sin datos: se reintenta */
      }
      if (!stopped) timer = window.setTimeout(() => void tick(), 200);
    };
    void tick();
    return { stop };
  }

  // Respaldo para Safari/iPadOS: el paquete se descarga solo en este momento.
  void (async () => {
    try {
      const { BrowserMultiFormatOneDReader } = await import('@zxing/browser');
      if (stopped) return;
      const reader = new BrowserMultiFormatOneDReader(undefined, {
        delayBetweenScanAttempts: 150,
        delayBetweenScanSuccess: 600,
      });
      const controls = await reader.decodeFromStream(stream, video, (result) => {
        if (result) emit(result.getText());
      });
      if (stopped) controls.stop();
      else zxingControls = controls;
    } catch {
      if (!stopped) {
        stop();
        onError?.('No se pudo cargar el lector de códigos. Escribe el código a mano.');
      }
    }
  })();

  return { stop };
}
