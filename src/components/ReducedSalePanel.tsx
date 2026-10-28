import { useMemo } from 'react';
import type { Category, Product } from '../types/database';
import type { CartItem } from '../lib/cart';
import { pieceQtyInCart } from '../lib/reducedSale';
import { ProductGrid } from './ProductGrid';
import { ProductDetail } from './ProductDetail';
import { ReducedSearch } from './ReducedSearch';

interface ReducedSalePanelProps {
  products: Product[];
  categories: Category[];
  bestSellers?: string[];
  favorites?: string[];
  onToggleFavorite?: (productId: string) => void;
  view: 'search' | 'detail' | 'catalog';
  selectedProduct: Product | null;
  source: 'search' | 'scan' | 'catalog';
  query: string;
  focusSignal: number;
  autoFocus: boolean;
  cart: CartItem[];
  onQueryChange: (value: string) => void;
  onSelect: (product: Product, source: 'search' | 'catalog') => void;
  onBackToSearch: () => void;
  onOpenCatalog: () => void;
  onCloseCatalog: () => void;
  onAddPiece: (product: Product, qty: number) => void;
  onWeigh: (product: Product) => void;
  onScan: () => void;
  onNewProduct: (initialBarcode?: string) => void;
}

/**
 * Panel izquierdo de la vista reducida (F-113). Alterna buscador, detalle
 * grande y catálogo secundario reutilizando la cuadrícula existente.
 */
export function ReducedSalePanel({
  products,
  categories,
  bestSellers = [],
  favorites = [],
  onToggleFavorite,
  view,
  selectedProduct,
  source,
  query,
  focusSignal,
  autoFocus,
  cart,
  onQueryChange,
  onSelect,
  onBackToSearch,
  onOpenCatalog,
  onCloseCatalog,
  onAddPiece,
  onWeigh,
  onScan,
  onNewProduct,
}: ReducedSalePanelProps) {
  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  if (view === 'catalog') {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex min-h-14 flex-none items-center gap-3 border-b-2 border-slate-200 bg-white px-3">
          <button
            type="button"
            onClick={onCloseCatalog}
            aria-label="Volver a la búsqueda"
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border-2 border-slate-300 bg-white text-2xl text-slate-700 shadow-sm transition hover:bg-slate-100 active:scale-95"
          >
            ←
          </button>
          <span className="text-xl font-black text-slate-900">Catálogo</span>
        </div>
        <div className="min-h-0 flex-1">
          <ProductGrid
            products={products}
            categories={categories}
            bestSellers={bestSellers}
            favorites={favorites}
            onToggleFavorite={onToggleFavorite}
            pickVerb="detail"
            onPick={(product) => onSelect(product, 'catalog')}
            onNewProduct={() => onNewProduct()}
          />
        </div>
      </div>
    );
  }

  if (view === 'detail' && selectedProduct) {
    return (
      <ProductDetail
        key={selectedProduct.id}
        product={selectedProduct}
        category={
          selectedProduct.category_id
            ? categoryById.get(selectedProduct.category_id)
            : undefined
        }
        inCartQty={pieceQtyInCart(cart, selectedProduct.id)}
        source={source}
        onBack={onBackToSearch}
        onAddPiece={(qty) => onAddPiece(selectedProduct, qty)}
        onWeigh={() => onWeigh(selectedProduct)}
        onOpenCatalog={onOpenCatalog}
      />
    );
  }

  return (
    <ReducedSearch
      products={products}
      categories={categories}
      query={query}
      focusSignal={focusSignal}
      autoFocus={autoFocus}
      onQueryChange={onQueryChange}
      onSelect={(product) => onSelect(product, 'search')}
      onScan={onScan}
      onOpenCatalog={onOpenCatalog}
      onNewProduct={onNewProduct}
    />
  );
}
