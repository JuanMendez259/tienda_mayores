import { beforeEach, describe, expect, it } from 'vitest';
import { loadSaleMode, saveSaleMode } from './saleMode';

/** `localStorage` mínimo: en Node no existe y el módulo debe tolerarlo. */
function installStorage() {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => data.clear(),
    key: (index: number) => [...data.keys()][index] ?? null,
    get length() {
      return data.size;
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
    writable: true,
  });
  return storage;
}

describe('modo de venta por tienda', () => {
  beforeEach(() => installStorage());

  it('empieza en normal y guarda por tienda', () => {
    expect(loadSaleMode('tienda-a')).toBe('normal');
    saveSaleMode('tienda-a', 'reducida');
    expect(loadSaleMode('tienda-a')).toBe('reducida');
    expect(loadSaleMode('tienda-b')).toBe('normal');
  });

  it('tolera valores corruptos o desconocidos', () => {
    localStorage.setItem('pos-abarrotes:vista:tienda-a', '{no es json');
    expect(loadSaleMode('tienda-a')).toBe('normal');
    localStorage.setItem('pos-abarrotes:vista:tienda-a', 'otra-cosa');
    expect(loadSaleMode('tienda-a')).toBe('normal');
  });

  it('tolera localStorage ausente', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    expect(loadSaleMode('tienda-a')).toBe('normal');
    expect(() => saveSaleMode('tienda-a', 'reducida')).not.toThrow();
  });
});
