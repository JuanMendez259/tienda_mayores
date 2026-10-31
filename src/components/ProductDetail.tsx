import { useEffect, useRef, useState } from 'react';
import type { Category, Product } from '../types/database';
import { formatMXN, lineTotalByQuantity } from '../lib/money';
import { formatStock } from '../lib/weight';
import { emojiFromIcon, visualFor } from '../lib/productVisual';
import { isSoldOut, maxPieceQuantity } from '../lib/reducedSale';

interface ProductDetailProps {
  product: Product;
  category?: Category;
  inCartQty: number;
  source: 'search' | 'scan' | 'catalog';
  onBack: () => void;
  onAddPiece: (qty: number) => void;
  onWeigh: () => void;
  onOpenCatalog: () => void;
}

/**
 * Detalle grande del producto en la vista reducida (F-113): una decisión por
 * pantalla, con precio, stock y cantidad a agregar en objetivos de 56 px.
 * El panel lo monta con `key` por producto, así que la cantidad vuelve a 1.
 */
export function ProductDetail({
  product,
  category,
  inCartQty,
  source,
  onBack,
  onAddPiece,
  onWeigh,
  onOpenCatalog,
}: ProductDetailProps) {
  const [qty, setQty] = useState(1);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // El foco va al nombre del producto: se lee y se navega con teclado.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const soldOut = isSoldOut(product);
  const maxQty = maxPieceQuantity(product);
  const categoryName = category?.name ?? 'Sin categoría';
  const meta = [categoryName, product.brand, product.barcode ? `Código ${product.barcode}` : null]
    .filter((part): part is string => Boolean(part))
    .join(' · ');
  const unitLabel =
    product.sale_unit === 'piece'
      ? 'por pieza'
      : product.sale_unit === 'volume'
        ? 'por litro'
        : 'por kilo';
  const totalCents = lineTotalByQuantity(product.price_cents, qty);
  const isPiece = product.sale_unit === 'piece';
  const lowStock =
    product.track_stock &&
    product.stock_qty > 0 &&
    product.stock_qty <= product.low_stock_threshold;

  const iconEmoji = emojiFromIcon(product.image_url);
  const isPhoto = Boolean(product.image_url) && !iconEmoji;
  const emoji = iconEmoji ?? visualFor(`${product.name} ${category?.name ?? ''}`).emoji;

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 p-3 xl:gap-4 xl:p-5">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onBack}
            aria-label="Volver a buscar"
            className="flex min-h-14 items-center gap-2 rounded-2xl border-2 border-slate-300 bg-white px-4 py-3 text-lg font-extrabold text-slate-700 shadow-sm transition hover:bg-slate-100 active:scale-95"
          >
            <span aria-hidden="true">←</span> Buscar otro
          </button>
          <span
            className={`shrink-0 rounded-full px-3 py-1.5 text-base font-black uppercase tracking-wide ${
              source === 'scan'
                ? 'bg-sky-100 text-sky-900'
                : 'bg-emerald-100 text-emerald-900'
            }`}
          >
            {source === 'scan' ? 'Escaneado' : 'Seleccionado'}
          </span>
        </div>

        <div
          className={`flex h-44 items-center justify-center overflow-hidden rounded-3xl border-2 border-slate-200 xl:h-60 ${
            isPhoto ? 'bg-slate-50' : category?.color ? '' : 'bg-slate-100'
          }`}
          style={!isPhoto && category?.color ? { backgroundColor: category.color } : undefined}
        >
          {isPhoto ? (
            <img src={product.image_url ?? ''} alt="" className="h-full w-full object-contain p-2" />
          ) : (
            <span aria-hidden="true" className="select-none text-8xl drop-shadow-sm xl:text-9xl">
              {emoji}
            </span>
          )}
        </div>

        <div>
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="text-3xl font-black leading-tight text-slate-900 outline-none xl:text-4xl"
          >
            {product.name}
          </h2>
          <p className="mt-1 text-base font-semibold text-slate-600">{meta}</p>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <span className="block text-4xl font-black tracking-tight text-slate-900 xl:text-5xl">
              {formatMXN(product.price_cents)}
            </span>
            <span className="text-lg font-bold text-slate-600">{unitLabel}</span>
          </div>
          {soldOut ? (
            <span className="rounded-xl bg-red-100 px-3 py-1.5 text-lg font-black text-red-700">
              Agotado
            </span>
          ) : lowStock ? (
            <span className="rounded-xl bg-amber-100 px-3 py-1.5 text-lg font-black text-amber-900">
              Quedan {formatStock(product.stock_qty, product.sale_unit)}
            </span>
          ) : null}
        </div>

        {inCartQty > 0 && (
          <p className="rounded-xl bg-slate-100 px-3 py-2 text-base font-bold text-slate-700">
            Ya en el ticket: {inCartQty}
          </p>
        )}

        {soldOut && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-base font-bold text-red-800">
            Este producto no tiene existencias. Edítalo en el catálogo para poder venderlo.
          </p>
        )}

        {isPiece && !soldOut && (
          <div>
            <p className="mb-1 text-base font-bold text-slate-600">Cantidad a agregar</p>
            <div
              role="group"
              aria-label="Cantidad a agregar"
              className="flex items-center justify-between gap-3 rounded-2xl border-2 border-slate-200 bg-white p-2 shadow-sm"
            >
              <button
                type="button"
                onClick={() => setQty((value) => Math.max(1, value - 1))}
                disabled={qty <= 1}
                aria-label="Quitar una pieza"
                className="flex h-14 w-14 items-center justify-center rounded-xl border border-slate-300 bg-slate-100 text-2xl font-black text-slate-700 transition hover:bg-slate-200 active:scale-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                −
              </button>
              <span
                aria-live="polite"
                className="min-w-12 text-center text-3xl font-black text-slate-900"
              >
                {qty}
              </span>
              <button
                type="button"
                onClick={() => setQty((value) => Math.min(maxQty, value + 1))}
                disabled={qty >= maxQty}
                aria-label="Agregar una pieza"
                className="flex h-14 w-14 items-center justify-center rounded-xl border border-emerald-300 bg-emerald-100 text-2xl font-black text-emerald-800 transition hover:bg-emerald-200 active:scale-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                +
              </button>
            </div>
          </div>
        )}

        {soldOut ? (
          <button
            type="button"
            disabled
            className="flex min-h-16 w-full items-center justify-center gap-2 rounded-2xl border-b-4 border-slate-300 bg-slate-300 px-6 py-4 text-xl font-black text-white"
          >
            Agotado
          </button>
        ) : isPiece ? (
          <button
            type="button"
            onClick={() => onAddPiece(qty)}
            className="flex min-h-16 w-full items-center justify-center gap-2 rounded-2xl border-b-4 border-emerald-800 bg-emerald-600 px-6 py-4 text-xl font-black text-white shadow-lg transition hover:bg-emerald-700 active:scale-[0.98] xl:text-2xl"
          >
            Agregar {qty} al ticket · {formatMXN(totalCents)}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={onWeigh}
              className="flex min-h-16 w-full items-center justify-center gap-2 rounded-2xl border-b-4 border-emerald-800 bg-emerald-600 px-6 py-4 text-xl font-black text-white shadow-lg transition hover:bg-emerald-700 active:scale-[0.98] xl:text-2xl"
            >
              <span aria-hidden="true">{product.sale_unit === 'volume' ? '🧪' : '⚖️'}</span>
              {product.sale_unit === 'volume' ? 'Medir y agregar' : 'Pesar y agregar'}
            </button>
            <p className="text-center text-base font-semibold text-slate-600">
              El total se calcula al pesar.
            </p>
          </>
        )}

        <button
          type="button"
          onClick={onOpenCatalog}
          className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-slate-300 bg-slate-100 px-4 py-3 text-lg font-black text-slate-700 shadow-sm transition hover:bg-slate-200 active:scale-95"
        >
          <span aria-hidden="true">🗂️</span> Ver catálogo
        </button>
      </div>
    </div>
  );
}
