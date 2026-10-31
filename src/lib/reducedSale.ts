import type { Product } from '../types/database';
import type { CartItem } from './cart';

/** Dice si un producto está agotado. Los que no controlan stock nunca se agotan. */
export function isSoldOut(product: Product): boolean {
  return product.track_stock && product.stock_qty <= 0;
}

/** Máximo de piezas que se pueden agregar al ticket (1..99). */
export function maxPieceQuantity(product: Product): number {
  return product.track_stock ? Math.max(1, product.stock_qty) : 99;
}

/** Suma las piezas ya capturadas de un producto en el ticket. */
export function pieceQtyInCart(cart: readonly CartItem[], productId: string): number {
  return cart.reduce(
    (acc, item) => (item.productId === productId && item.saleUnit === 'piece' ? acc + item.qty : acc),
    0,
  );
}

/**
 * Busca productos por nombre o código de barras, sin distinguir mayúsculas.
 * Una consulta vacía o en blanco no devuelve nada.
 */
export function searchProducts(products: readonly Product[], query: string): Product[] {
  const term = query.trim().toLowerCase();
  if (!term) return [];
  return products.filter(
    (p) =>
      p.name.toLowerCase().includes(term) || (p.barcode ?? '').toLowerCase().includes(term),
  );
}

/** Dice si un texto capturado a mano parece un código de barras (6 o más dígitos). */
export function looksLikeBarcode(text: string): boolean {
  return /^\d{6,}$/.test(text.trim());
}

/**
 * Resuelve el producto que se pinta en el detalle grande.
 *
 * Mientras el catálogo no trae el producto recién guardado (`pendingId`), se
 * usa la copia que devolvió el alta. Si el producto ya estaba en el catálogo y
 * desaparece, devuelve null para que el detalle se cierre y vuelva al buscador.
 */
export function resolveDetailProduct(
  selected: Product | null,
  products: readonly Product[],
  pendingId: string | null,
): Product | null {
  if (!selected) return null;
  const fresh = products.find((product) => product.id === selected.id);
  if (fresh) return fresh;
  return selected.id === pendingId ? selected : null;
}
