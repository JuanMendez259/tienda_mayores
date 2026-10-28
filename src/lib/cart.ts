import type { Product, Promotion, SaleUnit } from '../types/database';
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
  /** Importe bruto del renglón (sin descuento). */
  lineTotalCents: number;
  /** Descuento manual aplicado al renglón (F-112). */
  discountCents: number;
  /** Descuento automático por promoción (F-407). */
  promoDiscountCents: number;
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
    discountCents: 0,
    promoDiscountCents: 0,
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
    discountCents: 0,
    promoDiscountCents: 0,
  };
}

/**
 * Agrega varias piezas de un producto en un solo movimiento (F-113).
 * Si ya existe un renglón de ese producto, incrementa la cantidad sin
 * recalcular ni borrar sus descuentos guardados.
 */
export function addPieces(cart: readonly CartItem[], product: Product, qty: number): CartItem[] {
  if (qty <= 0) return [...cart];
  const existing = cart.find(
    (item) => item.productId === product.id && item.saleUnit === 'piece',
  );
  if (!existing) return [...cart, pieceFromProduct(product, qty)];
  return cart.map((item) =>
    item.key === existing.key
      ? {
          ...item,
          qty: item.qty + qty,
          lineTotalCents: lineTotal(item.unitPriceCents, 'piece', item.qty + qty, null),
        }
      : item,
  );
}

/**
 * Agrega un producto por pieza. Si ya existe un renglón de ese producto,
 * incrementa la cantidad (comportamiento típico de POS).
 */
export function addPiece(cart: readonly CartItem[], product: Product): CartItem[] {
  return addPieces(cart, product, 1);
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
    const lineTotalCents = lineTotal(item.unitPriceCents, 'piece', qty, null);
    return {
      ...item,
      qty,
      lineTotalCents,
      discountCents: Math.min(item.discountCents, lineTotalCents - item.promoDiscountCents),
    };
  });
}

/** Vuelve a capturar la medida de un renglón por peso/volumen. */
export function setMeasure(cart: readonly CartItem[], key: string, measure: number): CartItem[] {
  return cart.map((item) => {
    if (item.key !== key || item.saleUnit === 'piece' || measure <= 0) return item;
    const lineTotalCents = lineTotal(item.unitPriceCents, item.saleUnit, 1, measure);
    return {
      ...item,
      measure,
      lineTotalCents,
      discountCents: Math.min(item.discountCents, lineTotalCents - item.promoDiscountCents),
    };
  });
}

export function removeItem(cart: readonly CartItem[], key: string): CartItem[] {
  return cart.filter((item) => item.key !== key);
}

/** Aplica un descuento manual (en centavos) a un renglón. */
export function setLineDiscount(
  cart: readonly CartItem[],
  key: string,
  discountCents: number,
): CartItem[] {
  return cart.map((item) =>
    item.key === key
      ? {
          ...item,
          discountCents: Math.min(
            Math.max(0, discountCents),
            item.lineTotalCents - item.promoDiscountCents,
          ),
        }
      : item,
  );
}

// ------------------------------------------------------------
// Promociones automáticas por producto (F-407)
// ------------------------------------------------------------

/**
 * Calcula el descuento automático de un renglón según su promoción.
 * - `bogo` (2x1): por cada 2 piezas, 1 gratis.
 * - `qty_discount`: si la cantidad alcanza el mínimo, descuenta un monto fijo.
 * Solo aplica a productos por pieza.
 */
export function promoDiscountFor(item: CartItem, promotion: Promotion | undefined): number {
  if (!promotion || !promotion.active) return 0;
  if (item.saleUnit !== 'piece') return 0;
  if (promotion.type === 'bogo') {
    if (item.qty < 2) return 0;
    const freeUnits = Math.floor(item.qty / 2);
    return Math.min(item.lineTotalCents, freeUnits * item.unitPriceCents);
  }
  if (promotion.type === 'qty_discount') {
    if (item.qty < promotion.min_qty) return 0;
    return Math.min(item.lineTotalCents, promotion.discount_cents);
  }
  return 0;
}

/** Recalcula el descuento por promoción de cada renglón. */
export function applyAutoPromotions(
  cart: readonly CartItem[],
  promotions: readonly Promotion[],
): CartItem[] {
  const byProduct = new Map(
    promotions.filter((p) => p.active).map((p) => [p.product_id, p]),
  );
  return cart.map((item) => {
    const promoDiscountCents = promoDiscountFor(item, byProduct.get(item.productId));
    return item.promoDiscountCents === promoDiscountCents
      ? item
      : { ...item, promoDiscountCents };
  });
}

/** Descripción corta de la promoción aplicada a un renglón, o null. */
export function promotionLabel(item: CartItem, promotion: Promotion | undefined): string | null {
  if (!promotion || promoDiscountFor(item, promotion) <= 0) return null;
  return promotion.type === 'bogo' ? '2×1' : `Promo ${promotion.min_qty}+`;
}

/** Importe neto de un renglón (bruto − descuentos). */
export function netLineTotal(item: CartItem): number {
  return Math.max(0, item.lineTotalCents - item.discountCents - item.promoDiscountCents);
}

/** Subtotal bruto del carrito (sin descuentos). */
export function cartSubtotalCents(cart: readonly CartItem[]): number {
  return sumCents(cart.map((item) => item.lineTotalCents));
}

/** Descuentos por renglón acumulados (manuales + promociones). */
export function cartDiscountCents(cart: readonly CartItem[]): number {
  return sumCents(cart.map((item) => item.discountCents + item.promoDiscountCents));
}

/** Solo los descuentos manuales del carrito. */
export function cartManualDiscountCents(cart: readonly CartItem[]): number {
  return sumCents(cart.map((item) => item.discountCents));
}

/** Solo los descuentos por promoción del carrito. */
export function cartPromoDiscountCents(cart: readonly CartItem[]): number {
  return sumCents(cart.map((item) => item.promoDiscountCents));
}

/** Total neto del carrito (bruto − descuentos de renglón). */
export function cartTotalCents(cart: readonly CartItem[]): number {
  return sumCents(cart.map((item) => netLineTotal(item)));
}

export function cartItemCount(cart: readonly CartItem[]): number {
  return cart.reduce((acc, item) => acc + (item.saleUnit === 'piece' ? item.qty : 1), 0);
}
