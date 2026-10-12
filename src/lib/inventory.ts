import type { CartItem } from './cart';

/**
 * Delta con signo (unidades base) que un renglón de venta aplica al inventario.
 * Por pieza: -cantidad. Por peso/volumen: -medida (gramos o mililitros).
 */
export function stockDeltaForItem(item: Pick<CartItem, 'saleUnit' | 'qty' | 'measure'>): number {
  if (item.saleUnit === 'piece') return -item.qty;
  return -(item.measure ?? 0);
}

export function applyStockDelta(stockQty: number, delta: number): number {
  return stockQty + delta;
}

/** Existencias resultantes tras vender un renglón. */
export function stockAfterSale(
  product: { stock_qty: number; sale_unit: string },
  item: Pick<CartItem, 'saleUnit' | 'qty' | 'measure'>,
): number {
  return Math.max(0, applyStockDelta(product.stock_qty, stockDeltaForItem(item)));
}

/** ¿Debe mostrarse alerta de stock bajo? (F-504, visible en Fase 3) */
export function isLowStock(stockQty: number, lowStockThreshold: number): boolean {
  return stockQty <= lowStockThreshold;
}

/** ¿Hay existencia suficiente para vender el renglón? */
export function hasEnoughStock(
  product: { track_stock: boolean; stock_qty: number },
  item: Pick<CartItem, 'saleUnit' | 'qty' | 'measure'>,
): boolean {
  if (!product.track_stock) return true;
  return product.stock_qty - Math.abs(stockDeltaForItem(item)) >= 0;
}
