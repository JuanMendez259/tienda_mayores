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

/** Carrito de venta con controles grandes por renglón (F-104, F-108). */
export function Cart({ items, onInc, onDec, onRemove, onEditMeasure }: CartProps) {
  if (items.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-slate-500">
        <span className="text-6xl">🛒</span>
        <p className="text-xl font-bold">Toca un producto para empezar la venta</p>
        <p className="text-base">Aquí verás el ticket y el total a cobrar.</p>
      </div>
    );
  }

  return (
    <ul className="flex h-full flex-col gap-3 overflow-y-auto p-4">
      {items.map((item) => (
        <li key={item.key} className="rounded-2xl border-2 border-slate-200 bg-white p-3.5 shadow-sm">
          {/* Renglón 1: nombre, precio unitario y subtotal. */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="line-clamp-2 text-lg font-black leading-snug text-slate-900">{item.name}</p>
              <p className="text-base font-bold text-slate-500">
                {item.saleUnit === 'piece'
                  ? `Precio unitario: ${formatMXN(item.unitPriceCents)}`
                  : `${formatMeasure(item.measure ?? 0, item.saleUnit)} × ${formatMXN(item.unitPriceCents)}`}
              </p>
              {item.discountCents > 0 && (
                <p className="text-base font-bold text-emerald-700">
                  Descuento −{formatMXN(item.discountCents)}
                </p>
              )}
            </div>
            <span className="shrink-0 text-xl font-black text-slate-900">
              {formatMXN(item.lineTotalCents)}
            </span>
          </div>

          {/* Renglón 2: controles grandes, separados para no apretar el nombre. */}
          <div className="mt-2 flex items-center justify-between gap-2 pt-1">
            {item.saleUnit === 'piece' ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onDec(item.key)}
                  className="btn w-14 border-2 border-slate-300 bg-slate-100 px-0 py-2 text-3xl font-black text-slate-700 hover:bg-slate-200"
                  aria-label={`Quitar uno de ${item.name}`}
                >
                  −
                </button>
                <span className="w-12 text-center text-2xl font-black">{item.qty}</span>
                <button
                  type="button"
                  onClick={() => onInc(item.key)}
                  className="btn w-14 border-2 border-emerald-300 bg-emerald-100 px-0 py-2 text-3xl font-black text-emerald-800 hover:bg-emerald-200"
                  aria-label={`Agregar uno de ${item.name}`}
                >
                  +
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onEditMeasure(item)}
                className="btn border-2 border-slate-300 bg-slate-100 px-4 py-3 text-base font-extrabold text-slate-700 hover:bg-slate-200"
              >
                ✏️ Cambiar medida
              </button>
            )}
            <button
              type="button"
              onClick={() => onRemove(item.key)}
              className="btn w-14 border-2 border-red-200 bg-red-50 px-0 py-2 text-2xl text-red-600 hover:bg-red-100"
              aria-label={`Quitar ${item.name}`}
            >
              🗑️
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
