import type { Product } from '../types/database';

/** Emoji representativo y color de la etiqueta según el nombre/categoría. */
export function visualFor(text: string): { emoji: string; badge: string } {
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
export function emojiFromIcon(url: string | null): string | null {
  if (!url || !url.startsWith('data:image/svg+xml')) return null;
  try {
    const svg = decodeURIComponent(url.slice(url.indexOf(',') + 1));
    return svg.match(/<text[^>]*>([^<]+)<\/text>/)?.[1]?.trim() || null;
  } catch {
    return null;
  }
}

/** Etiqueta corta del producto: "355 ml", "1 Kg", "12 pzas"... */
export function sizeLabel(product: Product): string {
  const match = product.name.match(
    /(\d+(?:[.,]\d+)?)\s?(ml|mililitros?|l|lt|litros?|g|gr|gramos?|kg|kilos?|pzas?|piezas?)\b/i,
  );
  if (match) return `${match[1]} ${match[2]}`;
  if (product.sale_unit === 'piece') return 'Pza';
  return product.sale_unit === 'volume' ? '1 L' : '1 Kg';
}
