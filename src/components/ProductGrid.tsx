import { useMemo, useState } from 'react';
import type { Category, Product } from '../types/database';
import { formatMXN } from '../lib/money';
import { formatMeasure } from '../lib/weight';

interface ProductGridProps {
  products: Product[];
  categories: Category[];
  onPick: (product: Product) => void;
  onNewProduct: () => void;
}

/** Cuadrícula táctil de productos con búsqueda y categorías (F-101, F-103). */
export function ProductGrid({ products, categories, onPick, onNewProduct }: ProductGridProps) {
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    return products.filter((product) => {
      const matchesCategory = categoryId ? product.category_id === categoryId : true;
      const matchesText = text ? product.name.toLowerCase().includes(text) : true;
      return matchesCategory && matchesText;
    });
  }, [products, query, categoryId]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex gap-2 p-3 pb-2">
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar producto por nombre…"
          className="min-h-[56px] flex-1 rounded-2xl border-2 border-slate-300 bg-white px-4 text-xl"
          aria-label="Buscar producto"
        />
        <button type="button" onClick={onNewProduct} className="btn btn-warning px-5 text-lg">
          + Producto
        </button>
      </div>

      <div className="flex flex-wrap gap-2 px-3 pb-2">
        <button
          type="button"
          onClick={() => setCategoryId(null)}
          className={`btn px-5 py-3 text-lg ${categoryId === null ? 'btn-primary text-white' : 'btn-neutral'}`}
        >
          Todo
        </button>
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => setCategoryId(category.id)}
            className={`btn px-5 py-3 text-lg ${categoryId === category.id ? 'btn-primary text-white' : 'btn-neutral'}`}
          >
            {category.name}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 pt-1">
        {filtered.length === 0 ? (
          <p className="p-6 text-center text-xl text-slate-500">
            No se encontraron productos.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {filtered.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => onPick(product)}
                className="card flex flex-col items-center p-3 text-center hover:border-green-500"
              >
                {product.image_url ? (
                  <img src={product.image_url} alt="" className="mb-2 h-24 w-24 rounded-xl" />
                ) : (
                  <div className="mb-2 flex h-24 w-24 items-center justify-center rounded-xl bg-slate-100 text-4xl">
                    📦
                  </div>
                )}
                <span className="line-clamp-2 text-xl font-semibold leading-tight">
                  {product.name}
                </span>
                <span className="price mt-1">{formatMXN(product.price_cents)}</span>
                <span className="text-base text-slate-500">
                  {product.sale_unit === 'piece'
                    ? 'Por pieza'
                    : `Por ${product.sale_unit === 'volume' ? 'litro' : 'kilo'}`}
                </span>
                {product.sale_unit !== 'piece' && (
                  <span className="text-sm text-slate-400">
                    quedan {formatMeasure(product.stock_qty, product.sale_unit)}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
