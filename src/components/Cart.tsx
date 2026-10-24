import type { CartItem } from '../lib/cart';
import { formatMXN } from '../lib/money';
import { formatMeasure } from '../lib/weight';

interface CartProps {
  items: CartItem[];
  onInc: (key: string) => void;
  onDec: (key: string) => void;
  onRemove: (key: string) => void;
  onEditMeasure: (item: CartItem) => void;
}

/** Carrito de venta con el diseño de ticket táctil de Stitch (F-104, F-108). */
export function Cart({ items, onInc, onDec, onRemove, onEditMeasure }: CartProps) {
  if (items.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 overflow-y-auto p-3 text-center text-slate-500">
        <span className="text-5xl">🛒</span>
        <p className="text-lg font-bold">Toca un producto para empezar</p>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-3 overflow-y-auto p-4">
      {items.map((item) => {
        const isPiece = item.saleUnit === 'piece';
        const unitSuffix = item.saleUnit === 'weight' ? '/kg' : item.saleUnit === 'volume' ? '/L' : '';
        return (
          <div
            key={item.key}
            className="flex flex-col gap-2.5 rounded-2xl border-2 border-slate-200 bg-white p-3.5 shadow-xs transition hover:border-slate-300"
          >
            {/* Renglón 1: nombre, precio unitario y subtotal. */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h4 className="text-lg font-black leading-snug text-slate-900">{item.name}</h4>
                <p className="text-base font-bold text-slate-600">
                  {isPiece
                    ? `Precio unitario: ${formatMXN(item.unitPriceCents)}`
                    : `${formatMeasure(item.measure ?? 0, item.saleUnit === 'volume' ? 'volume' : 'weight')} × ${formatMXN(item.unitPriceCents)}${unitSuffix}`}
                </p>
                {item.discountCents > 0 && (
                  <p className="text-base font-bold text-emerald-700">
                    Descuento −{formatMXN(item.discountCents)}
                  </p>
                )}
              </div>
              <div className="shrink-0 text-right">
                <span className="text-xl font-black text-slate-900">{formatMXN(item.lineTotalCents)}</span>
              </div>
            </div>

            {/* Renglón 2: controles grandes, separados para no apretar el nombre. */}
            <div className="flex items-center justify-between gap-2 pt-1">
              {isPiece ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onDec(item.key)}
                    className="flex h-14 w-14 items-center justify-center rounded-xl border border-slate-300 bg-slate-100 text-2xl font-black text-slate-700 transition hover:bg-slate-200 active:scale-90"
                    aria-label={`Disminuir ${item.name}`}
                  >
                    −
                  </button>
                  <span className="w-12 text-center text-2xl font-black text-slate-900">{item.qty}</span>
                  <button
                    type="button"
                    onClick={() => onInc(item.key)}
                    className="flex h-14 w-14 items-center justify-center rounded-xl border border-emerald-300 bg-emerald-100 text-2xl font-black text-emerald-800 transition hover:bg-emerald-200 active:scale-90"
                    aria-label={`Aumentar ${item.name}`}
                  >
                    +
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onEditMeasure(item)}
                  className="flex min-h-14 items-center gap-2 rounded-xl border border-slate-300 bg-slate-100 px-4 text-base font-extrabold text-slate-700 transition hover:bg-slate-200 active:scale-95"
                >
                  ✏️ Cambiar medida
                </button>
              )}
              <button
                type="button"
                onClick={() => onRemove(item.key)}
                className="flex h-14 w-14 items-center justify-center rounded-xl text-xl text-red-500 transition hover:bg-red-50 hover:text-red-700 active:scale-90"
                title="Quitar este producto"
                aria-label={`Quitar ${item.name}`}
              >
                🗑️
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
