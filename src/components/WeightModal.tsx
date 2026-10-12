import { useState } from 'react';
import type { Product } from '../types/database';
import { formatMXN, lineTotalByMeasure } from '../lib/money';
import { formatMeasure, parseKilogramsToGrams, parseLitersToMilliliters } from '../lib/weight';
import { NumericKeypad } from './NumericKeypad';

interface WeightModalProps {
  product: Product;
  onCancel: () => void;
  onConfirm: (measure: number) => void;
}

/** Captura manual de peso (kg) o volumen (L) con teclado grande (F-105, F-106). */
export function WeightModal({ product, onCancel, onConfirm }: WeightModalProps) {
  const [text, setText] = useState('');
  const unit = product.sale_unit === 'volume' ? 'volume' : 'weight';
  const measure =
    unit === 'volume' ? parseLitersToMilliliters(text) : parseKilogramsToGrams(text);
  const total = lineTotalByMeasure(product.price_cents, measure);
  const perLabel = unit === 'volume' ? 'el litro' : 'el kilo';

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/60 p-4">
      <div className="card w-full max-w-lg p-6" role="dialog" aria-modal="true">
        <div className="mb-4 flex items-center gap-4">
          {product.image_url && (
            <img src={product.image_url} alt="" className="h-16 w-16 rounded-xl" />
          )}
          <div>
            <h2 className="title text-2xl">{product.name}</h2>
            <p className="text-lg text-slate-600">
              {formatMXN(product.price_cents)} por {perLabel}
            </p>
          </div>
        </div>

        <div className="mb-3 flex h-20 flex-col items-center justify-center rounded-2xl bg-slate-900">
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

        <NumericKeypad value={text} onChange={setText} />

        <div className="mt-4 flex gap-3">
          <button type="button" onClick={onCancel} className="btn btn-neutral flex-1 py-4 text-xl">
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onConfirm(measure)}
            disabled={measure <= 0}
            className={`btn flex-1 py-4 text-xl text-white ${
              measure > 0 ? 'bg-green-600 hover:bg-green-700' : 'cursor-not-allowed bg-slate-400'
            }`}
          >
            Agregar {formatMXN(total)}
          </button>
        </div>
      </div>
    </div>
  );
}
