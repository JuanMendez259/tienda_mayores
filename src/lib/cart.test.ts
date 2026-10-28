import { describe, expect, it } from 'vitest';
import type { Product, Promotion } from '../types/database';
import { seedProducts } from '../data/seed';
import {
  addMeasure,
  addPiece,
  addPieces,
  applyAutoPromotions,
  cartDiscountCents,
  cartItemCount,
  cartPromoDiscountCents,
  cartSubtotalCents,
  cartTotalCents,
  changeQty,
  netLineTotal,
  promoDiscountFor,
  promotionLabel,
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
    supplier_id: null,
    brand: null,
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

describe('agregar varias piezas (F-113)', () => {
  const product = seedProducts.find((p) => p.id === 'prd-arroz')!;

  it('crea un renglón con la cantidad pedida', () => {
    const next = addPieces([], product, 3);
    expect(next).toHaveLength(1);
    expect(next[0].qty).toBe(3);
    expect(next[0].lineTotalCents).toBe(product.price_cents * 3);
  });

  it('suma a un renglón existente sin duplicarlo', () => {
    const first = addPieces([], product, 1);
    const next = addPieces(first, product, 2);
    expect(next).toHaveLength(1);
    expect(next[0].qty).toBe(3);
    expect(next[0].lineTotalCents).toBe(product.price_cents * 3);
  });

  it('ignora cantidades no positivas', () => {
    expect(addPieces([], product, 0)).toEqual([]);
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

function promotion(overrides: Partial<Promotion>): Promotion {
  return {
    id: 'promo-1',
    store_id: 's1',
    product_id: 'a',
    type: 'bogo',
    min_qty: 2,
    discount_cents: 0,
    active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('promociones automáticas (F-407)', () => {
  it('aplica 2×1: por cada 2 piezas, una gratis', () => {
    const promo = promotion({ type: 'bogo' });
    let cart = addPiece([], product({ id: 'a', price_cents: 1000 }));
    expect(promoDiscountFor(cart[0], promo)).toBe(0);
    cart = addPiece(cart, product({ id: 'a', price_cents: 1000 }));
    expect(promoDiscountFor(cart[0], promo)).toBe(1000);
    cart = addPiece(cart, product({ id: 'a', price_cents: 1000 }));
    expect(promoDiscountFor(cart[0], promo)).toBe(1000);
  });

  it('aplica descuento por cantidad solo al alcanzar el mínimo', () => {
    const promo = promotion({ type: 'qty_discount', min_qty: 3, discount_cents: 500 });
    const cart = addPiece([], product({ id: 'a', price_cents: 1000 }));
    expect(promoDiscountFor(cart[0], promo)).toBe(0);
    const three = [1, 2, 3].reduce((acc) => addPiece(acc, product({ id: 'a', price_cents: 1000 })), cart);
    expect(promoDiscountFor(three[0], promo)).toBe(500);
  });

  it('no aplica promociones a productos por peso', () => {
    const promo = promotion({ type: 'bogo' });
    const cart = addMeasure([], product({ id: 'a', sale_unit: 'weight', price_cents: 1000 }), 2000);
    expect(promoDiscountFor(cart[0], promo)).toBe(0);
  });

  it('recalcula el carrito y suma el descuento promocional', () => {
    let cart = addPiece([], product({ id: 'a', price_cents: 1000 }));
    cart = addPiece(cart, product({ id: 'a', price_cents: 1000 }));
    cart = applyAutoPromotions(cart, [promotion({ type: 'bogo' })]);
    expect(cart[0].promoDiscountCents).toBe(1000);
    expect(cartPromoDiscountCents(cart)).toBe(1000);
    expect(cartDiscountCents(cart)).toBe(1000);
    expect(cartSubtotalCents(cart)).toBe(2000);
    expect(cartTotalCents(cart)).toBe(1000);
    expect(promotionLabel(cart[0], promotion({ type: 'bogo' }))).toBe('2×1');
  });

  it('ignora promociones inactivas', () => {
    let cart = addPiece([], product({ id: 'a', price_cents: 1000 }));
    cart = addPiece(cart, product({ id: 'a', price_cents: 1000 }));
    cart = applyAutoPromotions(cart, [promotion({ type: 'bogo', active: false })]);
    expect(cart[0].promoDiscountCents).toBe(0);
  });
});
