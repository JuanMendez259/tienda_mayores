import type { Product, SaleUnit } from '../types/database';
import { lineTotalByMeasure, lineTotalByQuantity, sumCents } from './money';
import { uid } from './uid';

export interface CartItem {
  key: string;
  productId: string;
  name: string;
  image_url: string | null;
  saleUnit: SaleUnit;
  unitPriceCents: number;
  /** Piezas vendidas (siempre >= 1). */
  qty: number;
  /** Gramos (weight) o mililitros (volume); null cuando es por pieza. */
  measure: number | null;
  lineTotalCents: number;
}

function lineTotal(
  unitPriceCents: number,
  saleUnit: SaleUnit,
  qty: number,
  measure: number | null,
): number {
  if (saleUnit === 'piece') return lineTotalByQuantity(unitPriceCents, qty);
  return lineTotalByMeasure(unitPriceCents, measure ?? 0);
}

/** Crea un renglón por pieza a partir de un producto. */
export function pieceFromProduct(product: Product, qty = 1): CartItem {
  return {
    key: uid(),
    productId: product.id,
    name: product.name,
    image_url: product.image_url,
    saleUnit: 'piece',
    unitPriceCents: product.price_cents,
    qty,
    measure: null,
    lineTotalCents: lineTotal(product.price_cents, 'piece', qty, null),
  };
}

/** Crea un renglón por peso/volumen. */
export function measureFromProduct(product: Product, measure: number): CartItem {
  return {
    key: uid(),
    productId: product.id,
    name: product.name,
    image_url: product.image_url,
    saleUnit: product.sale_unit,
    unitPriceCents: product.price_cents,
    qty: 1,
    measure,
    lineTotalCents: lineTotal(product.price_cents, product.sale_unit, 1, measure),
  };
}

/**
 * Agrega un producto por pieza. Si ya existe un renglón de ese producto,
 * incrementa la cantidad (comportamiento típico de POS).
 */
export function addPiece(cart: readonly CartItem[], product: Product): CartItem[] {
  const existing = cart.find(
    (item) => item.productId === product.id && item.saleUnit === 'piece',
  );
  if (!existing) return [...cart, pieceFromProduct(product)];
  return cart.map((item) =>
    item.key === existing.key
      ? {
          ...item,
          qty: item.qty + 1,
          lineTotalCents: lineTotal(item.unitPriceCents, 'piece', item.qty + 1, null),
        }
      : item,
  );
}

/** Agrega un producto por peso/volumen (cada captura es un renglón). */
export function addMeasure(
  cart: readonly CartItem[],
  product: Product,
  measure: number,
): CartItem[] {
  if (measure <= 0) return [...cart];
  return [...cart, measureFromProduct(product, measure)];
}

/** Cambia la cantidad de un renglón por pieza en +1/-1. Mínimo 1. */
export function changeQty(cart: readonly CartItem[], key: string, delta: number): CartItem[] {
  return cart.map((item) => {
    if (item.key !== key || item.saleUnit !== 'piece') return item;
    const qty = Math.max(1, item.qty + delta);
    return { ...item, qty, lineTotalCents: lineTotal(item.unitPriceCents, 'piece', qty, null) };
  });
}

/** Vuelve a capturar la medida de un renglón por peso/volumen. */
export function setMeasure(cart: readonly CartItem[], key: string, measure: number): CartItem[] {
  return cart.map((item) => {
    if (item.key !== key || item.saleUnit === 'piece' || measure <= 0) return item;
    return {
      ...item,
      measure,
      lineTotalCents: lineTotal(item.unitPriceCents, item.saleUnit, 1, measure),
    };
  });
}

export function removeItem(cart: readonly CartItem[], key: string): CartItem[] {
  return cart.filter((item) => item.key !== key);
}

export function cartTotalCents(cart: readonly CartItem[]): number {
  return sumCents(cart.map((item) => item.lineTotalCents));
}

export function cartItemCount(cart: readonly CartItem[]): number {
  return cart.reduce((acc, item) => acc + (item.saleUnit === 'piece' ? item.qty : 1), 0);
}
