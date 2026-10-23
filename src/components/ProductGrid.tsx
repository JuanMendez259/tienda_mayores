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

type Visual = { emoji: string; tint: string };

/** Emoji y fondo según el nombre del producto o su categoría. */
function visualFor(text: string): Visual {
  const value = text.toLowerCase();
  if (/(refresco|bebida|jugo|agua|soda|cola)/.test(value))
    return { emoji: '🥤', tint: 'bg-blue-50' };
  if (/huevo/.test(value))
    return { emoji: '🥚', tint: 'bg-amber-50' };
  if (/(leche|lácteo|lacteo|yogur|queso|crema)/.test(value))
    return { emoji: '🥛', tint: 'bg-sky-50' };
  if (/(pan|bolillo|tortilla|pastel|galleta)/.test(value))
    return { emoji: '🍞', tint: 'bg-orange-50' };
  if (/(limpieza|jabón|jabon|detergente|cloro)/.test(value))
    return { emoji: '🧼', tint: 'bg-cyan-50' };
  if (/(fruta|verdura|jitomate|cebolla|papa|tomate|aguacate)/.test(value))
    return { emoji: '🍅', tint: 'bg-emerald-50' };
  if (/(frijol|atún|atun|enlatad|sopa|aceite|arroz|pasta|despensa)/.test(value))
    return { emoji: '🥫', tint: 'bg-rose-50' };
  return { emoji: '📦', tint: 'bg-slate-100' };
}

/** Etiqueta de existencia: es lo que más le sirve al cajero en el día a día. */
function stockBadge(product: Product): { label: string; tone: string } | null {
  if (!product.track_stock) return product.brand ? { label: product.brand, tone: 'bg-slate-700' } : null;
  const label =
    product.sale_unit === 'piece'
      ? `${product.stock_qty} pzas`
      : formatMeasure(product.stock_qty, product.sale_unit);
  if (product.stock_qty <= product.low_stock_threshold) return { label, tone: 'bg-red-600' };
  if (product.sale_unit === 'piece') return { label, tone: 'bg-slate-800' };
  if (product.sale_unit === 'volume') return { label, tone: 'bg-blue-600' };
  return { label, tone: 'bg-amber-600' };
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

  const categoryName = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  );

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

  const chip = 'btn shrink-0 border-2 px-4 py-2 text-base';
  const chipOff = `${chip} border-slate-200 bg-white text-slate-800 hover:bg-slate-100`;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-3 border-b border-slate-200 bg-white p-4 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="relative min-w-0 flex-1">
            <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-2xl text-slate-400">
              🔍
            </span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar producto por nombre..."
              className="min-h-[56px] w-full rounded-2xl border-2 border-slate-300 bg-slate-50 py-3 pl-12 pr-4 text-lg font-bold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white"
              aria-label="Buscar producto"
            />
          </div>
          <button
            type="button"
            onClick={onNewProduct}
            className="btn shrink-0 whitespace-nowrap border-2 border-amber-600 bg-amber-400 px-4 py-3 text-base font-extrabold text-slate-900 hover:bg-amber-500"
          >
            ➕ <span className="hidden sm:inline">Nuevo / Manual</span>
            <span className="sm:hidden">Nuevo</span>
          </button>
        </div>

        <div className="scrollbar-none flex gap-2 overflow-x-auto whitespace-nowrap">
          <button
            type="button"
            onClick={() => {
              setCategoryId(null);
              setBestOnly(false);
            }}
            className={`${chip} ${categoryId === null && !bestOnly ? 'border-emerald-700 bg-emerald-600 text-white' : chipOff}`}
          >
            ✨ Todo
          </button>
          <button
            type="button"
            onClick={() => {
              setBestOnly(true);
              setCategoryId(null);
            }}
            className={`${chip} ${bestOnly ? 'border-amber-600 bg-amber-500 text-slate-900' : chipOff}`}
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
              className={`${chip} ${categoryId === category.id ? 'border-emerald-700 bg-emerald-600 text-white' : chipOff}`}
            >
              {visualFor(category.name).emoji} {category.name}
            </button>
          ))}
        </div>

        {brands.length > 0 && (
          <div className="scrollbar-none flex gap-2 overflow-x-auto whitespace-nowrap">
            <button
              type="button"
              onClick={() => setBrand(null)}
              className={`${chip} ${brand === null ? 'border-slate-700 bg-slate-800 text-white' : chipOff}`}
            >
              Todas las marcas
            </button>
            {brands.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setBrand(item)}
                className={`${chip} ${brand === item ? 'border-slate-700 bg-slate-800 text-white' : chipOff}`}
              >
                {item}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 p-4">
        {filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-slate-500">
            <span className="text-6xl">🔎</span>
            <p className="text-xl font-bold">No se encontraron productos.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3.5 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {filtered.map((product) => {
              const visual = visualFor(`${product.name} ${categoryName.get(product.category_id ?? '') ?? ''}`);
              const badge = stockBadge(product);
              return (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => onPick(product)}
                  className="relative flex flex-col justify-between rounded-3xl border-2 border-slate-200 bg-white p-3.5 text-left shadow-sm transition hover:border-emerald-400 active:scale-[0.99]"
                >
                  {badge && (
                    <span
                      className={`absolute right-3 top-3 z-10 rounded-full px-2.5 py-1 text-base font-extrabold text-white ${badge.tone}`}
                    >
                      {badge.label}
                    </span>
                  )}
                  <div className={`mb-3 flex h-28 items-center justify-center rounded-2xl ${visual.tint}`}>
                    {product.image_url ? (
                      <img src={product.image_url} alt="" className="h-24 w-24 rounded-xl object-contain" />
                    ) : (
                      <span className="select-none text-6xl drop-shadow-sm">{visual.emoji}</span>
                    )}
                  </div>
                  <div>
                    <h3 className="line-clamp-2 text-xl font-extrabold leading-tight text-slate-900">
                      {product.name}
                    </h3>
                    <p className="text-base font-bold text-slate-500">
                      {product.sale_unit === 'piece'
                        ? 'Por pieza'
                        : `Por ${product.sale_unit === 'volume' ? 'litro' : 'kilo'}`}
                    </p>
                  </div>
                  <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
                    <span className="text-2xl font-black text-slate-900">{formatMXN(product.price_cents)}</span>
                    <span
                      aria-hidden="true"
                      className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-2xl font-black text-white shadow-md"
                    >
                      +
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
