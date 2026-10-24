import { useId, useState } from 'react';
import type { Product } from '../types/database';
import { formatMXN, lineTotalByMeasure } from '../lib/money';
import { formatMeasure, parseKilogramsToGrams, parseLitersToMilliliters } from '../lib/weight';
import { NumericKeypad } from './NumericKeypad';
import { useModalA11y } from '../lib/useModalA11y';

interface WeightModalProps {
  product: Product;
  onCancel: () => void;
  onConfirm: (measure: number) => void;
}

/** Tope por renglón: 50 kg o 50 L. Evita teclear 500 y vender 500 kg. */
export const MAX_MEASURE = 50_000;

/** Captura manual de peso (kg) o volumen (L) con teclado grande (F-105, F-106). */
export function WeightModal({ product, onCancel, onConfirm }: WeightModalProps) {
  const [text, setText] = useState('');
  const unit = product.sale_unit === 'volume' ? 'volume' : 'weight';
  const measure =
    unit === 'volume' ? parseLitersToMilliliters(text) : parseKilogramsToGrams(text);
  const total = lineTotalByMeasure(product.price_cents, measure);
  const perLabel = unit === 'volume' ? 'el litro' : 'el kilo';
  const overMax = measure > MAX_MEASURE;
  // "50.000 kg" se lee como cincuenta mil en México; el tope se escribe simple.
  const maxLabel = unit === 'volume' ? '50 L' : '50 kg';
  const titleId = useId();
  const panelRef = useModalA11y(onCancel);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/60 p-4">
      <div
        ref={panelRef}
        tabIndex={-1}
        className="card w-full max-w-lg p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="mb-4 flex items-center gap-4">
          {product.image_url && (
            <img src={product.image_url} alt="" className="h-16 w-16 rounded-xl" />
          )}
          <div>
            <h2 id={titleId} className="title text-2xl">
              {product.name}
            </h2>
            <p className="text-lg text-slate-600">
              {formatMXN(product.price_cents)} por {perLabel}
            </p>
          </div>
        </div>

        <div
          className="mb-3 flex h-20 flex-col items-center justify-center rounded-2xl bg-slate-900"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <span className="text-3xl font-extrabold text-white">
            {formatMeasure(measure, unit)}
          </span>
          <span className="text-lg text-green-300">{formatMXN(total)}</span>
        </div>

        <div className="mb-3 grid grid-cols-3 gap-3">
          {(unit === 'volume'
            ? [
                ['250 ml', '250'],
                ['500 ml', '500'],
                ['1 L', '1.0'],
              ]
            : [
                ['250 g', '250'],
                ['500 g', '500'],
                ['1 kg', '1.0'],
              ]
          ).map(([label, value]) => (
            <button
              key={label}
              type="button"
              onClick={() => setText(value)}
              className="btn btn-neutral py-4 text-xl"
            >
              {label}
            </button>
          ))}
        </div>

        <NumericKeypad value={text} onChange={setText} autoFocus />

        <p
          role={overMax ? 'alert' : undefined}
          className={`mt-2 text-center text-base font-bold ${
            overMax ? 'text-red-700' : 'text-slate-600'
          }`}
        >
          {overMax ? `Máximo ${maxLabel} por renglón.` : `Tope por renglón: ${maxLabel}.`}
        </p>

        <div className="mt-4 flex gap-3">
          <button type="button" onClick={onCancel} className="btn btn-neutral flex-1 py-4 text-xl">
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onConfirm(measure)}
            disabled={measure <= 0 || overMax}
            className={`btn flex-1 py-4 text-xl text-white ${
              measure > 0 && !overMax
                ? 'bg-emerald-600 hover:bg-emerald-700'
                : 'cursor-not-allowed bg-slate-400'
            }`}
          >
            Agregar {formatMXN(total)}
          </button>
        </div>
      </div>
    </div>
  );
}
