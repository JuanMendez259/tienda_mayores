import { describe, expect, it, vi } from 'vitest';
import { getLastScan, recordScan, subscribeDeviceStatus } from './deviceStatus';
import { attachBarcodeScanner } from './barcode';

describe('estado de dispositivos (F-704)', () => {
  it('guarda el último código escaneado y notifica', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeDeviceStatus(listener);
    recordScan('7501234567890');
    expect(getLastScan()?.code).toBe('7501234567890');
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('no falla sin documento (entorno sin navegador)', () => {
    const cleanup = attachBarcodeScanner(() => undefined);
    expect(typeof cleanup).toBe('function');
    cleanup();
  });
});
