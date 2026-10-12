import { describe, expect, it } from 'vitest';
import type { Product } from '../types/database';
import {
  addMeasure,
  addPiece,
  cartDiscountCents,
  cartItemCount,
  cartSubtotalCents,
  cartTotalCents,
  changeQty,
  netLineTotal,
  removeItem,
  setLineDiscount,
  setMeasure,
} from './cart';

function product(overrides: Partial<Product>): Product {
  return {
    id: 'p1',
    store_id: 's1',
    category_id: null,
    name: 'Producto',
    image_url: null,
    sale_unit: 'piece',
    price_cents: 1000,
    cost_cents: 0,
    barcode: null,
    is_generated_barcode: false,
    track_stock: true,
    stock_qty: 10,
    low_stock_threshold: 1,
    active: true,
    created_by: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('carrito por pieza', () => {
  it('agrega y fusiona el mismo producto', () => {
    const p = product({ id: 'a', price_cents: 1500 });
    let cart = addPiece([], p);
    cart = addPiece(cart, p);
    expect(cart).toHaveLength(1);
    expect(cart[0].qty).toBe(2);
    expect(cart[0].lineTotalCents).toBe(3000);
    expect(cartTotalCents(cart)).toBe(3000);
  });

  it('cambia cantidad y nunca baja de 1', () => {
    let cart = addPiece([], product({ price_cents: 999 }));
    const key = cart[0].key;
    cart = changeQty(cart, key, 1);
    expect(cart[0].qty).toBe(2);
    cart = changeQty(cart, key, -5);
    expect(cart[0].qty).toBe(1);
  });

  it('quita renglones', () => {
    let cart = addPiece([], product({}));
    cart = removeItem(cart, cart[0].key);
    expect(cart).toHaveLength(0);
  });
});

describe('carrito por peso/volumen', () => {
  it('agrega un renglón por medida y calcula el importe', () => {
    const p = product({ id: 'f', sale_unit: 'weight', price_cents: 4590 });
    const cart = addMeasure([], p, 1250);
    expect(cart).toHaveLength(1);
    expect(cart[0].measure).toBe(1250);
    expect(cart[0].lineTotalCents).toBe(5738);
  });

  it('ignora medidas en cero o negativas', () => {
    const p = product({ id: 'f', sale_unit: 'weight', price_cents: 4590 });
    expect(addMeasure([], p, 0)).toHaveLength(0);
  });

  it('permite recapturar la medida y cuenta renglones', () => {
    const p = product({ id: 'f', sale_unit: 'weight', price_cents: 10000 });
    let cart = addMeasure([], p, 500);
    cart = setMeasure(cart, cart[0].key, 1500);
    expect(cart[0].measure).toBe(1500);
    expect(cart[0].lineTotalCents).toBe(15000);
    expect(cartItemCount(cart)).toBe(1);
  });
});

describe('descuentos por renglón (F-112)', () => {
  it('aplica y calcula el neto', () => {
    let cart = addPiece([], product({ id: 'a', price_cents: 5000 }));
    cart = setLineDiscount(cart, cart[0].key, 1000);
    expect(cart[0].discountCents).toBe(1000);
    expect(cartSubtotalCents(cart)).toBe(5000);
    expect(cartDiscountCents(cart)).toBe(1000);
    expect(netLineTotal(cart[0])).toBe(4000);
    expect(cartTotalCents(cart)).toBe(4000);
  });

  it('no permite descuento mayor al importe', () => {
    let cart = addPiece([], product({ id: 'a', price_cents: 1500 }));
    cart = setLineDiscount(cart, cart[0].key, 9999);
    expect(cart[0].discountCents).toBe(1500);
    expect(cartTotalCents(cart)).toBe(0);
  });

  it('recorta el descuento al bajar la cantidad', () => {
    let cart = addPiece([], product({ id: 'a', price_cents: 1000 }));
    cart = addPiece(cart, product({ id: 'a', price_cents: 1000 }));
    cart = setLineDiscount(cart, cart[0].key, 2000);
    expect(cart[0].discountCents).toBe(2000);
    cart = changeQty(cart, cart[0].key, -1);
    expect(cart[0].discountCents).toBe(1000);
  });
});
