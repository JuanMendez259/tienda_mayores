import { describe, expect, it } from 'vitest';
import {
  isSoldOut, looksLikeBarcode, maxPieceQuantity, pieceQtyInCart, resolveDetailProduct,
  searchProducts,
} from './reducedSale';
import { pieceFromProduct, measureFromProduct } from './cart';
import { seedProducts } from '../data/seed';

const arroz = seedProducts.find((p) => p.id === 'prd-arroz')!;
const jitomate = seedProducts.find((p) => p.id === 'prd-jitomate')!;

describe('helpers de vista reducida', () => {
  it('detecta agotados y respeta productos sin control de stock', () => {
    expect(isSoldOut({ ...arroz, stock_qty: 0 })).toBe(true);
    expect(isSoldOut({ ...arroz, stock_qty: 3 })).toBe(false);
    expect(isSoldOut({ ...arroz, track_stock: false, stock_qty: 0 })).toBe(false);
  });

  it('calcula el máximo de piezas', () => {
    expect(maxPieceQuantity({ ...arroz, stock_qty: 3 })).toBe(3);
    expect(maxPieceQuantity({ ...arroz, stock_qty: 0 })).toBe(1);
    expect(maxPieceQuantity({ ...arroz, track_stock: false, stock_qty: 0 })).toBe(99);
  });

  it('cuenta solo piezas del producto en el ticket', () => {
    const cart = [
      pieceFromProduct(arroz, 2),
      measureFromProduct(jitomate, 500),
    ];
    expect(pieceQtyInCart(cart, arroz.id)).toBe(2);
    expect(pieceQtyInCart(cart, jitomate.id)).toBe(0);
  });

  it('busca por nombre o código, sin distinguir mayúsculas', () => {
    expect(searchProducts(seedProducts, 'arroz').map((p) => p.id)).toContain('prd-arroz');
    expect(searchProducts(seedProducts, 'ARROZ').map((p) => p.id)).toContain('prd-arroz');
    const temporal = { ...arroz, id: 'prd-temp', name: 'Arroz especial', barcode: '7501234567890' };
    expect(searchProducts([temporal, ...seedProducts], '7501234567890').map((p) => p.id)).toEqual(['prd-temp']);
    expect(searchProducts(seedProducts, '   ')).toEqual([]);
    expect(searchProducts(seedProducts, 'no-existe')).toEqual([]);
  });

  it('reconoce un código capturado a mano', () => {
    expect(looksLikeBarcode('7501234567890')).toBe(true);
    expect(looksLikeBarcode('12345')).toBe(false);
    expect(looksLikeBarcode('arroz')).toBe(false);
  });

  it('sostiene el detalle del producto recién guardado hasta que llega el catálogo', () => {
    const saved = { ...arroz, id: 'prd-nuevo', name: 'Producto nuevo', stock_qty: 5 };

    // El refresco todavía no trae el producto: se usa la copia del alta.
    expect(resolveDetailProduct(saved, seedProducts, saved.id)).toBe(saved);

    // El producto ya está en el catálogo: manda la copia fresca.
    const refreshed = { ...saved, name: 'Producto nuevo actualizado' };
    expect(resolveDetailProduct(saved, [...seedProducts, refreshed], saved.id)).toEqual(refreshed);

    // Ya no está pendiente y tampoco en el catálogo: el detalle debe cerrarse.
    expect(resolveDetailProduct(saved, seedProducts, null)).toBeNull();
  });
});
