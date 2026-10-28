import { describe, expect, it } from 'vitest';
import { emojiFromIcon, sizeLabel, visualFor } from './productVisual';
import type { Product } from '../types/database';

function product(overrides: Partial<Product>): Product {
  return {
    id: 'p1', store_id: 's1', category_id: null, name: 'Producto',
    image_url: null, sale_unit: 'piece', price_cents: 1000, cost_cents: 0,
    barcode: null, is_generated_barcode: false, track_stock: true,
    stock_qty: 10, low_stock_threshold: 2, supplier_id: null, brand: null,
    active: true, created_by: null, created_at: '', updated_at: '',
    ...overrides,
  };
}

describe('helpers visuales de producto', () => {
  it('recupera el emoji de un SVG data URI y rechaza lo demás', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><text>🍅</text></svg>`;
    expect(emojiFromIcon(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)).toBe('🍅');
    expect(emojiFromIcon(null)).toBeNull();
    expect(emojiFromIcon('https://ejemplo.com/foto.jpg')).toBeNull();
    expect(emojiFromIcon('data:image/svg+xml,%E0%A4%A')).toBeNull();
  });

  it('etiqueta el tamaño desde el nombre y cae a la unidad', () => {
    expect(sizeLabel(product({ name: 'Refresco 2 L' }))).toBe('2 L');
    expect(sizeLabel(product({ name: 'Arroz 1 kg' }))).toBe('1 kg');
    expect(sizeLabel(product({ name: 'Huevo 12 pzas' }))).toBe('12 pzas');
    expect(sizeLabel(product({ name: 'Lechuga', sale_unit: 'piece' }))).toBe('Pza');
    expect(sizeLabel(product({ name: 'Cloro', sale_unit: 'volume' }))).toBe('1 L');
    expect(sizeLabel(product({ name: 'Queso', sale_unit: 'weight' }))).toBe('1 Kg');
  });

  it('elige emoji y color por nombre', () => {
    expect(visualFor('Refresco de cola').emoji).toBe('🥤');
    expect(visualFor('Leche entera').emoji).toBe('🥛');
    expect(visualFor('Producto raro').emoji).toBe('📦');
  });
});
