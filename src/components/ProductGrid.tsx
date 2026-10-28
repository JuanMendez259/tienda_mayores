import { useMemo, useState } from 'react';
import type { Category, Product } from '../types/database';
import { formatMXN } from '../lib/money';
import { formatStock } from '../lib/weight';
import { emojiFromIcon, sizeLabel, visualFor } from '../lib/productVisual';
import { isSoldOut } from '../lib/reducedSale';

/** Categorías visibles antes de ofrecer "Ver más" (tablet, sin gestos). */
const CATEGORY_LIMIT = 3;

interface ProductGridProps {
  products: Product[];
  categories: Category[];
  /** Ids de los productos más vendidos, en orden (F-A09). */
  bestSellers?: string[];
  /** Ids marcados como favoritos en esta caja. */
  favorites?: string[];
  onToggleFavorite?: (productId: string) => void;
  onPick: (product: Product) => void;
  onNewProduct: () => void;
  /** `'add'` agrega de un toque; `'detail'` abre el detalle grande (F-113). */
  pickVerb?: 'add' | 'detail';
}

/** Cuadrícula táctil de productos con búsqueda, categorías, marcas y más vendidos (F-101, F-103, F-A09). */
export function ProductGrid({
  products,
  categories,
  bestSellers = [],
  favorites = [],
  onToggleFavorite,
  onPick,
  onNewProduct,
  pickVerb = 'add',
}: ProductGridProps) {
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [brand, setBrand] = useState<string | null>(null);
  const [bestOnly, setBestOnly] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [brandPanelOpen, setBrandPanelOpen] = useState(false);

  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);
  const categoryById = useMemo(() => new Map(categories.map((item) => [item.id, item])), [categories]);
  const visibleCategories = showAllCategories ? categories : categories.slice(0, CATEGORY_LIMIT);
  const hiddenCategoryCount = categories.length - visibleCategories.length;
  const activeFilterCount =
    (query.trim() ? 1 : 0) +
    (categoryId ? 1 : 0) +
    (brand ? 1 : 0) +
    (bestOnly ? 1 : 0) +
    (favoritesOnly ? 1 : 0);

  function clearFilters() {
    setQuery('');
    setCategoryId(null);
    setBrand(null);
    setBestOnly(false);
    setFavoritesOnly(false);
    setBrandPanelOpen(false);
  }

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
      const matchesFavorite = favoritesOnly ? favoriteSet.has(product.id) : true;
      return matchesCategory && matchesText && matchesBrand && matchesBest && matchesFavorite;
    });
    if (bestOnly) {
      list.sort((a, b) => (bestRank.get(a.id) ?? 0) - (bestRank.get(b.id) ?? 0));
    }
    return list;
  }, [products, query, categoryId, brand, bestOnly, favoritesOnly, bestRank, favoriteSet]);

  const inactiveChip =
    'flex min-h-14 shrink-0 items-center gap-2 whitespace-nowrap rounded-2xl border-2 border-slate-200 bg-white px-3 py-2.5 text-base font-extrabold text-slate-800 shadow-xs transition hover:bg-slate-100 active:scale-95 xl:px-4';
  const activeChip =
    'flex min-h-14 shrink-0 items-center gap-2 whitespace-nowrap rounded-2xl border-2 border-emerald-700 bg-emerald-600 px-4 py-2.5 text-lg font-black text-white shadow-sm transition active:scale-95 xl:px-5';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2 border-b border-slate-200 bg-white p-3 shadow-xs xl:space-y-3 xl:p-4">
        <div className="flex items-center gap-2 xl:gap-3">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-2xl text-slate-400">
              🔍
            </span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar producto..."
              className="w-full rounded-2xl border-2 border-slate-300 bg-slate-50 py-3 pl-13 pr-4 text-lg font-bold text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100 xl:py-3.5"
              aria-label="Buscar producto"
            />
          </div>
          <button
            type="button"
            onClick={onNewProduct}
            className="flex min-h-14 items-center gap-2 whitespace-nowrap rounded-2xl border-2 border-amber-600 bg-amber-500 px-3 py-2 text-lg font-black text-slate-950 shadow-sm transition hover:bg-amber-600 active:scale-95 xl:px-5 xl:py-3.5"
          >
            <span className="text-2xl leading-none">➕</span>
            <span className="hidden xl:inline">Nuevo / Manual</span>
            <span className="xl:hidden">Nuevo</span>
          </button>
        </div>

        {/* En teléfono se muestran los accesos rápidos y "Ver N más"; al
            desplegar, todas las categorías quedan en filas visibles. */}
        <div
          role="group"
          aria-label="Filtros y categorías"
          className="flex flex-wrap items-center gap-2"
        >
          <button
            type="button"
            aria-pressed={categoryId === null && !bestOnly && !favoritesOnly}
            onClick={() => {
              setCategoryId(null);
              setBestOnly(false);
              setFavoritesOnly(false);
            }}
            className={categoryId === null && !bestOnly && !favoritesOnly ? activeChip : inactiveChip}
          >
            <span aria-hidden="true">✨</span> Todo
          </button>
          <button
            type="button"
            aria-pressed={bestOnly}
            onClick={() => {
              setBestOnly(true);
              setCategoryId(null);
              setFavoritesOnly(false);
            }}
            className={
              bestOnly
                ? 'flex min-h-14 shrink-0 items-center gap-2 whitespace-nowrap rounded-2xl border-2 border-amber-600 bg-amber-500 px-4 py-2.5 text-base font-extrabold text-slate-900 shadow-sm transition active:scale-95'
                : inactiveChip
            }
          >
            <span aria-hidden="true">🔥</span> Más vendidos
          </button>
          {onToggleFavorite && (
            <button
              type="button"
              aria-pressed={favoritesOnly}
              onClick={() => {
                setFavoritesOnly(true);
                setCategoryId(null);
                setBestOnly(false);
              }}
              className={
                favoritesOnly
                  ? 'flex min-h-14 shrink-0 items-center gap-2 whitespace-nowrap rounded-2xl border-2 border-amber-500 bg-amber-300 px-4 py-2.5 text-base font-black text-amber-950 shadow-sm transition active:scale-95'
                  : inactiveChip
              }
            >
              <span aria-hidden="true">⭐</span> Favoritos
              {favorites.length > 0 && <span>({favorites.length})</span>}
            </button>
          )}
          {/* En tablet el botón de categorías va antes de la lista: así cabe en
              la primera fila y no queda solo en una tercera fila desbalanceada. */}
          {categories.length > CATEGORY_LIMIT && (
            <button
              type="button"
              aria-expanded={showAllCategories}
              aria-label={
                showAllCategories
                  ? 'Ver menos categorías'
                  : `Ver ${hiddenCategoryCount} categorías más`
              }
              onClick={() => setShowAllCategories((value) => !value)}
              className={`${inactiveChip} hidden md:flex`}
            >
              <span aria-hidden="true">📂</span>
              {showAllCategories ? 'Ver menos' : 'Ver más'}
            </button>
          )}
          {visibleCategories.map((category) => (
            <button
              key={category.id}
              type="button"
              aria-pressed={categoryId === category.id}
              onClick={() => {
                setCategoryId(category.id);
                setBestOnly(false);
                setFavoritesOnly(false);
              }}
              className={`${categoryId === category.id ? activeChip : inactiveChip} ${
                showAllCategories ? '' : 'hidden md:flex'
              }`}
            >
              <span aria-hidden="true">
                {emojiFromIcon(category.image_url) ?? visualFor(category.name).emoji}
              </span>
              {category.name}
            </button>
          ))}
          {/* En teléfono las categorías y la marca se despliegan con un botón
              rotulado; en tablet caben en la misma franja de filtros. */}
          <button
            type="button"
            aria-expanded={showAllCategories}
            onClick={() => setShowAllCategories((value) => !value)}
            className={`${inactiveChip} md:hidden`}
          >
            <span aria-hidden="true">📂</span>
            {showAllCategories ? 'Ver menos' : `Ver ${categories.length} más`}
          </button>
          {brands.length > 0 && (
            <button
              type="button"
              aria-expanded={brandPanelOpen}
              aria-controls="brand-panel"
              onClick={() => setBrandPanelOpen((value) => !value)}
              className={`${brand ? activeChip : inactiveChip} ${
                brand || showAllCategories ? 'flex' : 'hidden md:flex'
              }`}
            >
              <span aria-hidden="true">🏷️</span>
              <span>
                Marca: <strong>{brand ?? 'Todas'}</strong>
              </span>
              <span aria-hidden="true">{brandPanelOpen ? '▲' : '▼'}</span>
            </button>
          )}
          {brand && (
            <button type="button" onClick={() => setBrand(null)} className={inactiveChip}>
              <span aria-hidden="true">✖</span> Quitar marca
            </button>
          )}
          {activeFilterCount > 0 && (
            <button type="button" onClick={clearFilters} className={inactiveChip}>
              <span aria-hidden="true">↺</span> Limpiar filtros
            </button>
          )}
        </div>

        {brands.length > 0 && brandPanelOpen && (
          <div
            id="brand-panel"
            className="rounded-2xl border-2 border-slate-200 bg-slate-50 p-3"
          >
            <p className="mb-2 text-base font-black uppercase tracking-wider text-slate-600">
              Elige una marca
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                aria-pressed={brand === null}
                onClick={() => {
                  setBrand(null);
                  setBrandPanelOpen(false);
                }}
                className={brand === null ? activeChip : inactiveChip}
              >
                Todas
              </button>
              {brands.map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={brand === item}
                  onClick={() => {
                    setBrand(item);
                    setBrandPanelOpen(false);
                  }}
                  className={brand === item ? activeChip : inactiveChip}
                >
                  {item}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setBrandPanelOpen(false)}
              className="btn btn-neutral mt-3 w-full py-3 text-lg"
            >
              Cerrar marcas
            </button>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 xl:p-4">
        {filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-slate-500">
            <span className="text-6xl">🔎</span>
            <p className="text-xl font-bold">No se encontraron productos.</p>
            {activeFilterCount > 0 && (
              <button type="button" onClick={clearFilters} className="btn btn-neutral px-6 py-4 text-xl">
                ↺ Ver todo el catálogo
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 xl:gap-3.5 lg:grid-cols-3">
            {filtered.map((product) => {
              const category = product.category_id ? categoryById.get(product.category_id) : undefined;
              const visual = visualFor(`${product.name} ${category?.name ?? ''}`);
              const iconEmoji = emojiFromIcon(product.image_url);
              const isPhoto = Boolean(product.image_url) && !iconEmoji;
              const emoji = iconEmoji ?? visual.emoji;
              const measureLabel =
                product.sale_unit === 'piece'
                  ? 'Por pieza'
                  : product.sale_unit === 'volume'
                    ? 'Por litro'
                    : 'Por kilo';
              // La marca ya suele estar en el nombre ("Coca Cola Light 255ml"):
              // repetirla parte el subtítulo en dos líneas y desalinea la fila.
              const brandInName = product.brand
                ? product.name.toLowerCase().includes(product.brand.toLowerCase())
                : false;
              const subtitle =
                product.brand && !brandInName
                  ? `${product.brand} · ${measureLabel}`
                  : product.sale_unit === 'weight'
                    ? `${measureLabel} a granel`
                    : measureLabel;
              const soldOut = isSoldOut(product);
              const lowStock =
                product.track_stock &&
                product.stock_qty > 0 &&
                product.stock_qty <= product.low_stock_threshold;
              return (
                <article
                  key={product.id}
                  className={`group relative flex flex-col justify-between rounded-2xl border-2 p-2.5 shadow-sm transition xl:rounded-3xl xl:p-3.5 ${
                    soldOut
                      ? 'border-slate-200 bg-slate-50'
                      : 'border-slate-200 bg-white hover:border-emerald-400'
                  }`}
                >
                  {/* Toda la tarjeta es el botón de agregar (objetivo táctil enorme). */}
                  <button
                    type="button"
                    onClick={() => onPick(product)}
                    disabled={soldOut}
                    aria-label={
                      soldOut
                        ? `${product.name} agotado`
                        : pickVerb === 'detail'
                          ? `Ver detalle de ${product.name}, ${formatMXN(product.price_cents)}`
                          : `Agregar ${product.name}, ${formatMXN(product.price_cents)} ${
                              product.sale_unit === 'piece'
                                ? 'por pieza'
                                : product.sale_unit === 'volume'
                                  ? 'por litro'
                                  : 'por kilo'
                            }`
                    }
                    className={`absolute inset-0 z-10 rounded-2xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200 xl:rounded-3xl ${
                      soldOut ? 'cursor-not-allowed' : ''
                    }`}
                  />
                  {onToggleFavorite && (
                    <button
                      type="button"
                      onClick={() => onToggleFavorite(product.id)}
                      aria-pressed={favoriteSet.has(product.id)}
                      aria-label={
                        favoriteSet.has(product.id)
                          ? `Quitar ${product.name} de favoritos`
                          : `Agregar ${product.name} a favoritos`
                      }
                      title={
                        favoriteSet.has(product.id)
                          ? 'Quitar de favoritos'
                          : 'Marcar como favorito'
                      }
                      className={`absolute left-2 top-2 z-20 flex h-14 w-14 items-center justify-center rounded-2xl border-2 text-3xl leading-none shadow-sm transition active:scale-95 ${
                        favoriteSet.has(product.id)
                          ? 'border-amber-500 bg-amber-300 text-amber-950'
                          : 'border-slate-200 bg-white/95 text-slate-500 hover:bg-amber-50'
                      }`}
                    >
                      <span aria-hidden="true">
                        {favoriteSet.has(product.id) ? '★' : '☆'}
                      </span>
                    </button>
                  )}
                  <span
                    className={`absolute right-3 top-3 rounded-full px-2.5 py-1 text-sm font-extrabold uppercase tracking-wide text-white ${visual.badge}`}
                  >
                    {sizeLabel(product)}
                  </span>
                  <div
                    className={`mb-2 flex items-center justify-center rounded-2xl p-2 xl:mb-3 xl:p-4 ${isPhoto ? 'bg-slate-50' : category?.color ? '' : 'bg-slate-100'}`}
                    style={!isPhoto && category?.color ? { backgroundColor: category.color } : undefined}
                  >
                    {isPhoto ? (
                      <img src={product.image_url ?? ''} alt="" className="h-16 w-full object-contain xl:h-24" />
                    ) : (
                      <span aria-hidden="true" className="select-none text-4xl drop-shadow-sm xl:text-6xl">
                        {emoji}
                      </span>
                    )}
                  </div>
                  <div>
                    <h3 className="line-clamp-2 text-lg font-extrabold leading-tight text-slate-900 xl:text-xl">
                      {product.name}
                    </h3>
                    <p className="mb-1.5 text-base font-semibold text-slate-600 xl:mb-2">{subtitle}</p>
                    {soldOut ? (
                      <p className="mb-1.5 text-base font-black text-red-700 xl:mb-2">Agotado</p>
                    ) : lowStock ? (
                      <p className="mb-1.5 text-base font-bold text-amber-800 xl:mb-2">
                        Quedan {formatStock(product.stock_qty, product.sale_unit)}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-100 pt-1.5 xl:pt-2">
                    <span className="text-2xl font-black text-slate-900">
                      {formatMXN(product.price_cents)}
                    </span>
                    <span
                      aria-hidden="true"
                      className={`flex h-14 w-14 items-center justify-center rounded-2xl text-2xl font-black text-white shadow-md transition ${
                        soldOut ? 'bg-slate-400' : 'bg-emerald-600 group-hover:bg-emerald-700'
                      }`}
                    >
                      {soldOut ? '—' : '+'}
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
