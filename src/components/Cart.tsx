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
        <span className="text-5xl">🛒</span>
        <p className="text-xl">Toca un producto para empezar la venta</p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2 overflow-y-auto p-2">
      {items.map((item) => (
        <li key={item.key} className="card flex items-center gap-3 p-3">
          {item.image_url && (
            <img src={item.image_url} alt="" className="h-14 w-14 rounded-xl" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-xl font-bold">{item.name}</p>
            <p className="text-base text-slate-600">
              {item.saleUnit === 'piece'
                ? `${item.qty} × ${formatMXN(item.unitPriceCents)}`
                : `${formatMeasure(item.measure ?? 0, item.saleUnit)} × ${formatMXN(item.unitPriceCents)}`}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {item.saleUnit === 'piece' ? (
              <>
                <button
                  type="button"
                  onClick={() => onDec(item.key)}
                  className="btn btn-neutral w-14 py-2 text-3xl"
                  aria-label={`Quitar uno de ${item.name}`}
                >
                  −
                </button>
                <span className="w-10 text-center text-2xl font-extrabold">{item.qty}</span>
                <button
                  type="button"
                  onClick={() => onInc(item.key)}
                  className="btn btn-neutral w-14 py-2 text-3xl"
                  aria-label={`Agregar uno de ${item.name}`}
                >
                  +
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => onEditMeasure(item)}
                className="btn btn-neutral px-4 py-3 text-lg"
              >
                Cambiar
              </button>
            )}
            <span className="w-24 text-right text-2xl font-extrabold">
              {formatMXN(item.lineTotalCents)}
            </span>
            <button
              type="button"
              onClick={() => onRemove(item.key)}
              className="btn btn-danger w-14 py-2 text-2xl"
              aria-label={`Quitar ${item.name}`}
            >
              ✕
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
