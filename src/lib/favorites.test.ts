import { beforeEach, describe, expect, it } from 'vitest';
import { loadFavorites, saveFavorites, toggleFavorite } from './favorites';

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

beforeEach(() => {
  installStorage();
});

describe('favoritos del mostrador', () => {
  it('empieza vacío y guarda la lista por tienda', () => {
    expect(loadFavorites('tienda-a')).toEqual([]);
    saveFavorites('tienda-a', ['prd-1', 'prd-2', 'prd-1']);
    expect(loadFavorites('tienda-a')).toEqual(['prd-1', 'prd-2']);
    expect(loadFavorites('tienda-b')).toEqual([]);
  });

  it('alterna un producto y devuelve la lista nueva', () => {
    expect(toggleFavorite('tienda-a', 'prd-1')).toEqual(['prd-1']);
    expect(toggleFavorite('tienda-a', 'prd-2')).toEqual(['prd-1', 'prd-2']);
    expect(toggleFavorite('tienda-a', 'prd-1')).toEqual(['prd-2']);
  });

  it('tolera datos corruptos y almacenamiento ausente', () => {
    localStorage.setItem('pos-abarrotes:favoritos:tienda-a', '{no es json');
    expect(loadFavorites('tienda-a')).toEqual([]);

    // Sin `localStorage` (SSR o modo privado) no truena.
    Object.defineProperty(globalThis, 'localStorage', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    expect(loadFavorites('tienda-a')).toEqual([]);
    expect(() => saveFavorites('tienda-a', ['prd-1'])).not.toThrow();
    expect(toggleFavorite('tienda-a', 'prd-1')).toEqual(['prd-1']);
  });
});
