import { useMemo, useState } from 'react';
import type { Category, Product } from '../types/database';
import { formatMXN } from '../lib/money';
import { formatMeasure } from '../lib/weight';

interface ProductGridProps {
  products: Product[];
  categories: Category[];
  /** Ids de los productos más vendidos, en orden (F-A09). */
  bestSellers?: string[];
  onPick: (product: Product) => void;
  onNewProduct: () => void;
}

/** Cuadrícula táctil de productos con búsqueda, categorías, marcas y más vendidos (F-101, F-103, F-A09). */
export function ProductGrid({
  products,
  categories,
  bestSellers = [],
  onPick,
  onNewProduct,
}: ProductGridProps) {
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [brand, setBrand] = useState<string | null>(null);
  const [bestOnly, setBestOnly] = useState(false);

  const brands = useMemo(() => {
    const set = new Set<string>();
    for (const product of products) {
      if (product.brand) set.add(product.brand);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [products]);

  const bestRank = useMemo(() => {
    const map = new Map<string, number>();
    bestSellers.forEach((id, index) => map.set(id, index));
    return map;
  }, [bestSellers]);

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    const list = products.filter((product) => {
      const matchesCategory = categoryId ? product.category_id === categoryId : true;
      const matchesText = text ? product.name.toLowerCase().includes(text) : true;
      const matchesBrand = brand ? product.brand === brand : true;
      const matchesBest = bestOnly ? bestRank.has(product.id) : true;
      return matchesCategory && matchesText && matchesBrand && matchesBest;
    });
    if (bestOnly) {
      list.sort((a, b) => (bestRank.get(a.id) ?? 0) - (bestRank.get(b.id) ?? 0));
    }
    return list;
  }, [products, query, categoryId, brand, bestOnly, bestRank]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex w-full items-center gap-2 p-4 pb-2">
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar producto…"
          className="min-h-[56px] min-w-0 flex-1 rounded-2xl border-2 border-slate-300 bg-white px-4 text-xl"
          aria-label="Buscar producto"
        />
        <button
          type="button"
          onClick={onNewProduct}
          className="btn btn-warning shrink-0 whitespace-nowrap px-4 py-3 text-lg"
        >
          + Producto
        </button>
      </div>

      <div className="scrollbar-none flex gap-2 overflow-x-auto whitespace-nowrap px-4 pb-2 pt-1">
        <button
          type="button"
          onClick={() => {
            setCategoryId(null);
            setBestOnly(false);
          }}
          className={`btn shrink-0 px-5 py-3 text-lg ${categoryId === null && !bestOnly ? 'btn-primary text-white' : 'btn-neutral'}`}
        >
          Todo
        </button>
        <button
          type="button"
          onClick={() => {
            setBestOnly(true);
            setCategoryId(null);
          }}
          className={`btn shrink-0 px-5 py-3 text-lg ${bestOnly ? 'btn-warning' : 'btn-neutral'}`}
        >
          🔥 Más vendidos
        </button>
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => {
              setCategoryId(category.id);
              setBestOnly(false);
            }}
            className={`btn shrink-0 px-5 py-3 text-lg ${categoryId === category.id ? 'btn-primary text-white' : 'btn-neutral'}`}
          >
            {category.name}
          </button>
        ))}
      </div>

      {brands.length > 0 && (
        <div className="scrollbar-none flex gap-2 overflow-x-auto whitespace-nowrap px-4 pb-2">
          <button
            type="button"
            onClick={() => setBrand(null)}
            className={`btn shrink-0 px-4 py-2 text-base ${brand === null ? 'btn-primary text-white' : 'btn-neutral'}`}
          >
            Todas las marcas
          </button>
          {brands.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setBrand(item)}
              className={`btn shrink-0 px-4 py-2 text-base ${brand === item ? 'btn-primary text-white' : 'btn-neutral'}`}
            >
              {item}
            </button>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-4 pt-1">
        {filtered.length === 0 ? (
          <p className="p-6 text-center text-xl text-slate-500">
            No se encontraron productos.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
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
