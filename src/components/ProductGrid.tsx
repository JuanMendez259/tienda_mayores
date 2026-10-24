import { useMemo, useState } from 'react';
import type { Category, Product } from '../types/database';
import { formatMXN } from '../lib/money';

interface ProductGridProps {
  products: Product[];
  categories: Category[];
  /** Ids de los productos más vendidos, en orden (F-A09). */
  bestSellers?: string[];
  onPick: (product: Product) => void;
  onNewProduct: () => void;
}

/** Emoji representativo y color de la etiqueta según el nombre/categoría. */
function visualFor(text: string): { emoji: string; badge: string } {
  const value = text.toLowerCase();
  if (/(refresco|bebida|jugo|agua|soda|cola|cerveza)/.test(value))
    return { emoji: '🥤', badge: 'bg-blue-600' };
  if (/huevo/.test(value)) return { emoji: '🥚', badge: 'bg-amber-700' };
  if (/(leche|lácteo|lacteo|yogur|queso|crema)/.test(value))
    return { emoji: '🥛', badge: 'bg-sky-600' };
  if (/(pan|bolillo|tortilla|pastel|galleta)/.test(value))
    return { emoji: '🍞', badge: 'bg-orange-600' };
  if (/(limpieza|jabón|jabon|detergente|cloro)/.test(value))
    return { emoji: '🧼', badge: 'bg-emerald-700' };
  if (/(fruta|verdura|jitomate|cebolla|papa|tomate|aguacate)/.test(value))
    return { emoji: '🍅', badge: 'bg-emerald-600' };
  if (/(frijol|atún|atun|enlatad|sopa|aceite|arroz|pasta|despensa)/.test(value))
    return { emoji: '🥫', badge: 'bg-red-600' };
  return { emoji: '📦', badge: 'bg-slate-800' };
}

/**
 * Las fotos de los productos demo son un SVG con un emoji (seed.ts).
 * Recuperamos el emoji para dibujarlo grande, como en el diseño de Stitch.
 */
function emojiFromIcon(url: string | null): string | null {
  if (!url || !url.startsWith('data:image/svg+xml')) return null;
  try {
    const svg = decodeURIComponent(url.slice(url.indexOf(',') + 1));
    return svg.match(/<text[^>]*>([^<]+)<\/text>/)?.[1]?.trim() || null;
  } catch {
    return null;
  }
}

/** Etiqueta corta del producto: "355 ml", "1 Kg", "12 pzas"... */
function sizeLabel(product: Product): string {
  const match = product.name.match(
    /(\d+(?:[.,]\d+)?)\s?(ml|mililitros?|l|lt|litros?|g|gr|gramos?|kg|kilos?|pzas?|piezas?)\b/i,
  );
  if (match) return `${match[1]} ${match[2]}`;
  if (product.sale_unit === 'piece') return 'Pza';
  return product.sale_unit === 'volume' ? '1 L' : '1 Kg';
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

  const categoryById = useMemo(() => new Map(categories.map((item) => [item.id, item])), [categories]);

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
      const matchesText = text
        ? product.name.toLowerCase().includes(text) || (product.barcode ?? '').includes(text)
        : true;
      const matchesBrand = brand ? product.brand === brand : true;
      const matchesBest = bestOnly ? bestRank.has(product.id) : true;
      return matchesCategory && matchesText && matchesBrand && matchesBest;
    });
    if (bestOnly) {
      list.sort((a, b) => (bestRank.get(a.id) ?? 0) - (bestRank.get(b.id) ?? 0));
    }
    return list;
  }, [products, query, categoryId, brand, bestOnly, bestRank]);

  const inactiveChip =
    'flex min-h-14 shrink-0 items-center gap-2 whitespace-nowrap rounded-2xl border-2 border-slate-200 bg-white px-4 py-2.5 text-base font-extrabold text-slate-800 shadow-xs transition hover:bg-slate-100 active:scale-95';
  const activeChip =
    'flex min-h-14 shrink-0 items-center gap-2 whitespace-nowrap rounded-2xl border-2 border-emerald-700 bg-emerald-600 px-5 py-2.5 text-lg font-black text-white shadow-sm transition active:scale-95';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-3 border-b border-slate-200 bg-white p-4 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-2xl text-slate-400">
              🔍
            </span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar producto por nombre o código..."
              className="w-full rounded-2xl border-2 border-slate-300 bg-slate-50 py-3.5 pl-13 pr-4 text-lg font-bold text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
              aria-label="Buscar producto"
            />
          </div>
          <button
            type="button"
            onClick={onNewProduct}
            className="flex items-center gap-2 whitespace-nowrap rounded-2xl border-2 border-amber-600 bg-amber-500 px-5 py-3.5 text-lg font-black text-slate-950 shadow-sm transition hover:bg-amber-600 active:scale-95"
          >
            <span className="text-2xl leading-none">➕</span>
            <span className="hidden sm:inline">Nuevo / Manual</span>
            <span className="sm:hidden">Nuevo</span>
          </button>
        </div>

        <div className="scrollbar-none flex items-center gap-2 overflow-x-auto pb-1 pt-0.5">
          <button
            type="button"
            aria-pressed={categoryId === null && !bestOnly}
            onClick={() => {
              setCategoryId(null);
              setBestOnly(false);
            }}
            className={categoryId === null && !bestOnly ? activeChip : inactiveChip}
          >
            <span>✨</span> Todo
          </button>
          <button
            type="button"
            aria-pressed={bestOnly}
            onClick={() => {
              setBestOnly(true);
              setCategoryId(null);
            }}
            className={
              bestOnly
                ? 'flex min-h-14 shrink-0 items-center gap-2 whitespace-nowrap rounded-2xl border-2 border-amber-600 bg-amber-500 px-4 py-2.5 text-base font-extrabold text-slate-900 shadow-sm transition active:scale-95'
                : inactiveChip
            }
          >
            <span>🔥</span> Más vendidos
          </button>
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              aria-pressed={categoryId === category.id}
              onClick={() => {
                setCategoryId(category.id);
                setBestOnly(false);
              }}
              className={categoryId === category.id ? activeChip : inactiveChip}
            >
              <span>{emojiFromIcon(category.image_url) ?? visualFor(category.name).emoji}</span>
              {category.name}
            </button>
          ))}
        </div>

        {brands.length > 0 && (
          <div className="scrollbar-none flex items-center gap-2 overflow-x-auto pb-1">
            <span className="shrink-0 text-sm font-black uppercase tracking-wider text-slate-600">
              Marca
            </span>
            <button
              type="button"
              onClick={() => setBrand(null)}
              aria-pressed={brand === null}
              className={
                brand === null
                  ? 'flex min-h-14 shrink-0 items-center rounded-2xl border-2 border-slate-700 bg-slate-800 px-3 py-1.5 text-base font-extrabold text-white'
                  : 'flex min-h-14 shrink-0 items-center rounded-2xl border-2 border-slate-200 bg-white px-3 py-1.5 text-base font-extrabold text-slate-700 hover:bg-slate-100'
              }
            >
              Todas
            </button>
            {brands.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setBrand(item)}
                aria-pressed={brand === item}
                className={
                  brand === item
                    ? 'flex min-h-14 shrink-0 items-center rounded-2xl border-2 border-slate-700 bg-slate-800 px-3 py-1.5 text-base font-extrabold text-white'
                    : 'flex min-h-14 shrink-0 items-center rounded-2xl border-2 border-slate-200 bg-white px-3 py-1.5 text-base font-extrabold text-slate-700 hover:bg-slate-100'
                }
              >
                {item}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-slate-500">
            <span className="text-6xl">🔎</span>
            <p className="text-xl font-bold">No se encontraron productos.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-3">
            {filtered.map((product) => {
              const category = product.category_id ? categoryById.get(product.category_id) : undefined;
              const visual = visualFor(`${product.name} ${category?.name ?? ''}`);
              const iconEmoji = emojiFromIcon(product.image_url);
              const isPhoto = Boolean(product.image_url) && !iconEmoji;
              const emoji = iconEmoji ?? visual.emoji;
              const subtitle = product.brand
                ? `${product.brand} · ${
                    product.sale_unit === 'piece'
                      ? 'Por pieza'
                      : product.sale_unit === 'volume'
                        ? 'Por litro'
                        : 'Por kilo'
                  }`
                : product.sale_unit === 'piece'
                  ? 'Por pieza'
                  : product.sale_unit === 'volume'
                    ? 'Por litro'
                    : 'Por kilo a granel';
              return (
                <article
                  key={product.id}
                  className="group relative flex flex-col justify-between rounded-3xl border-2 border-slate-200 bg-white p-3.5 shadow-sm transition hover:border-emerald-400"
                >
                  {/* Toda la tarjeta es el botón de agregar (objetivo táctil enorme). */}
                  <button
                    type="button"
                    onClick={() => onPick(product)}
                    aria-label={`Agregar ${product.name}, ${formatMXN(product.price_cents)} ${
                      product.sale_unit === 'piece'
                        ? 'por pieza'
                        : product.sale_unit === 'volume'
                          ? 'por litro'
                          : 'por kilo'
                    }`}
                    className="absolute inset-0 z-10 rounded-3xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200"
                  />
                  <span
                    className={`absolute right-3 top-3 rounded-full px-2.5 py-1 text-sm font-extrabold uppercase tracking-wide text-white ${visual.badge}`}
                  >
                    {sizeLabel(product)}
                  </span>
                  <div
                    className={`mb-3 flex items-center justify-center rounded-2xl p-4 ${isPhoto ? 'bg-slate-50' : category?.color ? '' : 'bg-slate-100'}`}
                    style={!isPhoto && category?.color ? { backgroundColor: category.color } : undefined}
                  >
                    {isPhoto ? (
                      <img src={product.image_url ?? ''} alt="" className="h-24 w-full object-contain" />
                    ) : (
                      <span aria-hidden="true" className="select-none text-6xl drop-shadow-sm">
                        {emoji}
                      </span>
                    )}
                  </div>
                  <div>
                    <h3 className="line-clamp-2 text-xl font-extrabold leading-tight text-slate-900">
                      {product.name}
                    </h3>
                    <p className="mb-2 text-base font-semibold text-slate-600">{subtitle}</p>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-100 pt-2">
                    <span className="text-2xl font-black text-slate-900">
                      {formatMXN(product.price_cents)}
                    </span>
                    <span
                      aria-hidden="true"
                      className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-2xl font-black text-white shadow-md transition group-hover:bg-emerald-700"
                    >
                      +
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
