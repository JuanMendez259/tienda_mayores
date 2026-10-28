import { useEffect, useMemo, useRef } from 'react';
import type { Category, Product } from '../types/database';
import { formatMXN } from '../lib/money';
import { formatStock } from '../lib/weight';
import { emojiFromIcon, visualFor } from '../lib/productVisual';
import { isSoldOut, looksLikeBarcode, searchProducts } from '../lib/reducedSale';

interface ReducedSearchProps {
  products: Product[];
  categories: Category[];
  query: string;
  focusSignal: number;
  autoFocus: boolean;
  onQueryChange: (value: string) => void;
  onSelect: (product: Product) => void;
  onScan: () => void;
  onOpenCatalog: () => void;
  onNewProduct: (initialBarcode?: string) => void;
}

/**
 * Buscador de la vista reducida (F-113): una sola pregunta grande, atajos de
 * escáner y catálogo, y resultados en filas táctiles. Sin gestos ni menús.
 */
export function ReducedSearch({
  products,
  categories,
  query,
  focusSignal,
  autoFocus,
  onQueryChange,
  onSelect,
  onScan,
  onOpenCatalog,
  onNewProduct,
}: ReducedSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  // En tablet el buscador recibe el foco (y selecciona el texto) para teclear
  // la siguiente venta sin tocar la pantalla.
  useEffect(() => {
    if (!autoFocus) return;
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, [autoFocus, focusSignal]);

  const trimmed = query.trim();
  const results = searchProducts(products, query);
  const showEmpty = trimmed.length > 0 && results.length === 0;

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 p-3 xl:gap-4 xl:p-5">
        <div>
          <h2 className="text-2xl font-black leading-tight text-slate-900 xl:text-3xl">
            ¿Qué vas a vender?
          </h2>
          <p className="mt-1 text-base font-semibold text-slate-600">
            Busca el producto y toca para ver el detalle.
          </p>
        </div>

        <div className="relative">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-2xl text-slate-400"
          >
            🔍
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Nombre o código de barras"
            aria-label="Buscar producto por nombre o código"
            className="w-full rounded-2xl border-2 border-slate-300 bg-white py-4 pl-14 pr-4 text-xl font-bold text-slate-900 shadow-sm outline-none transition placeholder:text-slate-500 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
          />
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={onScan}
            className="flex min-h-16 items-center justify-center gap-2 rounded-2xl border-2 border-emerald-700 bg-emerald-600 px-4 py-3 text-xl font-black text-white shadow-sm transition hover:bg-emerald-700 active:scale-95"
          >
            <span aria-hidden="true">📷</span> Escanear código
          </button>
          <button
            type="button"
            onClick={onOpenCatalog}
            className="flex min-h-16 items-center justify-center gap-2 rounded-2xl border-2 border-slate-300 bg-slate-100 px-4 py-3 text-xl font-black text-slate-700 shadow-sm transition hover:bg-slate-200 active:scale-95"
          >
            <span aria-hidden="true">🗂️</span> Ver catálogo
          </button>
        </div>

        {showEmpty ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-5 text-center">
            <p className="text-xl font-bold text-slate-800">No encontramos «{trimmed}».</p>
            <p className="mt-1 text-base font-semibold text-slate-500">
              Puedes darlo de alta o revisar el catálogo.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => onNewProduct(looksLikeBarcode(query) ? query.trim() : undefined)}
                className="flex min-h-14 items-center justify-center gap-2 rounded-2xl border-2 border-amber-600 bg-amber-500 px-4 py-3 text-lg font-black text-slate-950 shadow-sm transition hover:bg-amber-600 active:scale-95"
              >
                <span aria-hidden="true">➕</span> Crear producto nuevo
              </button>
              <button
                type="button"
                onClick={onOpenCatalog}
                className="flex min-h-14 items-center justify-center gap-2 rounded-2xl border-2 border-slate-300 bg-slate-100 px-4 py-3 text-lg font-black text-slate-700 shadow-sm transition hover:bg-slate-200 active:scale-95"
              >
                <span aria-hidden="true">🗂️</span> Ver catálogo
              </button>
            </div>
          </div>
        ) : results.length > 0 ? (
          <ul aria-label="Resultados de la búsqueda" className="space-y-2">
            {results.map((product) => {
              const category = product.category_id
                ? categoryById.get(product.category_id)
                : undefined;
              const iconEmoji = emojiFromIcon(product.image_url);
              const isPhoto = Boolean(product.image_url) && !iconEmoji;
              const emoji = iconEmoji ?? visualFor(`${product.name} ${category?.name ?? ''}`).emoji;
              const soldOut = isSoldOut(product);
              return (
                <li key={product.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(product)}
                    disabled={soldOut}
                    className={`flex min-h-20 w-full items-center gap-3 rounded-2xl border-2 p-2.5 text-left shadow-sm transition active:scale-[0.99] ${
                      soldOut
                        ? 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-70'
                        : 'border-slate-200 bg-white hover:border-emerald-400 hover:bg-emerald-50'
                    }`}
                  >
                    <span
                      className={`flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl ${
                        isPhoto ? 'bg-slate-50' : category?.color ? '' : 'bg-slate-100'
                      }`}
                      style={
                        !isPhoto && category?.color ? { backgroundColor: category.color } : undefined
                      }
                    >
                      {isPhoto ? (
                        <img
                          src={product.image_url ?? ''}
                          alt=""
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <span aria-hidden="true" className="text-3xl">
                          {emoji}
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-lg font-extrabold leading-tight text-slate-900">
                        {product.name}
                      </span>
                      <span
                        className={`block text-base font-bold ${
                          soldOut ? 'text-red-700' : 'text-slate-600'
                        }`}
                      >
                        {soldOut
                          ? 'Agotado'
                          : product.track_stock
                            ? formatStock(product.stock_qty, product.sale_unit)
                            : 'Disponible'}
                      </span>
                    </span>
                    <span className="shrink-0 text-2xl font-black text-slate-900">
                      {formatMXN(product.price_cents)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-5 text-center text-lg font-semibold text-slate-600">
            Escribe el nombre o el código de barras del producto.
          </p>
        )}
      </div>
    </div>
  );
}
