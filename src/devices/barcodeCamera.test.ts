import { describe, expect, it } from 'vitest';
import {
  barcodeFormatsFor,
  cameraErrorMessage,
  cleanBarcode,
  DEFAULT_FORMATS,
} from './barcodeCamera';

describe('lector de códigos con cámara', () => {
  it('limpia espacios y rechaza códigos vacíos', () => {
    expect(cleanBarcode('  7501234567890 ')).toBe('7501234567890');
    expect(cleanBarcode('')).toBeNull();
    expect(cleanBarcode('   ')).toBeNull();
    expect(cleanBarcode(null)).toBeNull();
  });

  it('se queda solo con los formatos que el lector nativo soporta', () => {
    expect(barcodeFormatsFor(['ean_13', 'qr_code'])).toEqual(['ean_13']);
    expect(barcodeFormatsFor([])).toEqual([...DEFAULT_FORMATS]);
    expect(barcodeFormatsFor(null)).toEqual([...DEFAULT_FORMATS]);
  });

  it('explica el fallo de la cámara en palabras del mostrador', () => {
    expect(cameraErrorMessage({ name: 'NotAllowedError' })).toMatch(/permiso/i);
    expect(cameraErrorMessage({ name: 'NotFoundError' })).toMatch(/cámara/i);
    expect(cameraErrorMessage(new Error('otra cosa'))).toMatch(/cámara/i);
  });
});
