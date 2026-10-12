import { describe, expect, it } from 'vitest';
import type { CartItem } from './cart';
import { applyStockDelta, hasEnoughStock, isLowStock, stockAfterSale, stockDeltaForItem } from './inventory';

function item(overrides: Partial<CartItem>): CartItem {
  return {
    key: 'k',
    productId: 'p1',
    name: 'Producto',
    image_url: null,
    saleUnit: 'piece',
    unitPriceCents: 1000,
    qty: 1,
    measure: null,
    lineTotalCents: 1000,
    discountCents: 0,
    ...overrides,
  };
}

describe('inventario', () => {
  it('descuenta piezas', () => {
    expect(stockDeltaForItem(item({ saleUnit: 'piece', qty: 3 }))).toBe(-3);
  });
  it('descuenta peso/volumen por medida', () => {
    expect(stockDeltaForItem(item({ saleUnit: 'weight', measure: 1250 }))).toBe(-1250);
    expect(stockDeltaForItem(item({ saleUnit: 'volume', measure: 750 }))).toBe(-750);
  });
  it('aplica el delta sobre las existencias', () => {
    expect(applyStockDelta(10, -3)).toBe(7);
  });
  it('nunca deja existencias negativas tras una venta', () => {
    expect(stockAfterSale({ stock_qty: 2, sale_unit: 'piece' }, item({ qty: 5 }))).toBe(0);
  });
  it('valida existencias suficientes', () => {
    expect(hasEnoughStock({ track_stock: true, stock_qty: 2 }, item({ qty: 2 }))).toBe(true);
    expect(hasEnoughStock({ track_stock: true, stock_qty: 2 }, item({ qty: 3 }))).toBe(false);
    expect(hasEnoughStock({ track_stock: false, stock_qty: 0 }, item({ qty: 3 }))).toBe(true);
  });
  it('alerta rubros con stock bajo', () => {
    expect(isLowStock(3, 5)).toBe(true);
    expect(isLowStock(6, 5)).toBe(false);
  });
});
