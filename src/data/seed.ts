import type { AppUser, Category, Product, Store } from '../types/database';

export const DEMO_STORE_ID = 'store-1';

/** Genera una imagen local (data URI) con un emoji. Funciona sin internet. */
export function emojiImage(emoji: string, bg: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240">` +
    `<rect width="240" height="240" rx="28" fill="${bg}"/>` +
    `<text x="120" y="132" font-size="128" text-anchor="middle" ` +
    `dominant-baseline="middle">${emoji}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export const seedStore: Store = {
  id: DEMO_STORE_ID,
  name: 'Abarrotes La Esquina',
  logo_url: emojiImage('🏪', '#dcfce7'),
  timezone: 'America/Mexico_City',
  ticket_footer: '¡Gracias por su compra!',
  font_size: 'normal',
  primary_color: '#16a34a',
  discount_requires_manager: true,
  modules: {
    discounts: true,
    inventory: true,
    movements: true,
    photos: true,
    purchases: true,
    suppliers: true,
  },
  expiry_alert_days: 15,
  ticket_width_mm: 80,
  whatsapp_country_code: '+52',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

export const seedUsers: AppUser[] = [
  {
    id: 'user-maria',
    store_id: DEMO_STORE_ID,
    name: 'Doña María',
    photo_url: emojiImage('👩', '#fce7f3'),
    role: 'owner',
    pin_hash: 'demo',
    active: true,
    failed_attempts: 0,
    locked_until: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'user-jose',
    store_id: DEMO_STORE_ID,
    name: 'Don José',
    photo_url: emojiImage('👨', '#dbeafe'),
    role: 'cashier',
    pin_hash: 'demo',
    active: true,
    failed_attempts: 0,
    locked_until: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'user-ana',
    store_id: DEMO_STORE_ID,
    name: 'Ana',
    photo_url: emojiImage('👧', '#fef9c3'),
    role: 'manager',
    pin_hash: 'demo',
    active: true,
    failed_attempts: 0,
    locked_until: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
];

/** PIN de demostración (solo modo local). En Supabase se usa verify_pin. */
export const seedPins: Record<string, string> = {
  'user-maria': '1234',
  'user-jose': '1111',
  'user-ana': '2222',
};

function category(id: string, name: string, emoji: string, color: string, sort: number): Category {
  return {
    id,
    store_id: DEMO_STORE_ID,
    name,
    image_url: emojiImage(emoji, color),
    sort_order: sort,
    color,
    active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

export const seedCategories: Category[] = [
  category('cat-frutas', 'Frutas y Verduras', '🥬', '#dcfce7', 1),
  category('cat-abarrotes', 'Abarrotes', '🥫', '#fef3c7', 2),
  category('cat-bebidas', 'Bebidas', '🥤', '#dbeafe', 3),
  category('cat-lacteos', 'Lácteos', '🧀', '#fef9c3', 4),
  category('cat-limpieza', 'Limpieza', '🧼', '#f3e8ff', 5),
];

interface ProductSeed {
  id: string;
  name: string;
  category: string;
  emoji: string;
  color: string;
  sale_unit: Product['sale_unit'];
  price_cents: number;
  cost_cents: number;
  stock_qty: number;
  low_stock_threshold: number;
}

const productSeeds: ProductSeed[] = [
  { id: 'prd-jitomate', name: 'Jitomate', category: 'cat-frutas', emoji: '🍅', color: '#fee2e2', sale_unit: 'weight', price_cents: 2890, cost_cents: 1800, stock_qty: 25000, low_stock_threshold: 5000 },
  { id: 'prd-papa', name: 'Papa', category: 'cat-frutas', emoji: '🥔', color: '#fef3c7', sale_unit: 'weight', price_cents: 2490, cost_cents: 1500, stock_qty: 40000, low_stock_threshold: 8000 },
  { id: 'prd-cebolla', name: 'Cebolla', category: 'cat-frutas', emoji: '🧅', color: '#fde68a', sale_unit: 'weight', price_cents: 1990, cost_cents: 1200, stock_qty: 18000, low_stock_threshold: 5000 },
  { id: 'prd-manzana', name: 'Manzana', category: 'cat-frutas', emoji: '🍎', color: '#fee2e2', sale_unit: 'weight', price_cents: 4590, cost_cents: 3000, stock_qty: 12000, low_stock_threshold: 3000 },
  { id: 'prd-platano', name: 'Plátano', category: 'cat-frutas', emoji: '🍌', color: '#fef9c3', sale_unit: 'weight', price_cents: 2190, cost_cents: 1400, stock_qty: 15000, low_stock_threshold: 4000 },
  { id: 'prd-lechuga', name: 'Lechuga', category: 'cat-frutas', emoji: '🥬', color: '#dcfce7', sale_unit: 'piece', price_cents: 1800, cost_cents: 1000, stock_qty: 8, low_stock_threshold: 3 },

  { id: 'prd-arroz', name: 'Arroz 1 kg', category: 'cat-abarrotes', emoji: '🍚', color: '#f1f5f9', sale_unit: 'piece', price_cents: 3200, cost_cents: 2400, stock_qty: 25, low_stock_threshold: 5 },
  { id: 'prd-frijol', name: 'Frijol 1 kg', category: 'cat-abarrotes', emoji: '🫘', color: '#fed7aa', sale_unit: 'piece', price_cents: 3800, cost_cents: 2900, stock_qty: 20, low_stock_threshold: 5 },
  { id: 'prd-aceite', name: 'Aceite 1 L', category: 'cat-abarrotes', emoji: '🫒', color: '#fef9c3', sale_unit: 'piece', price_cents: 4590, cost_cents: 3600, stock_qty: 15, low_stock_threshold: 4 },
  { id: 'prd-atun', name: 'Atún en lata', category: 'cat-abarrotes', emoji: '🐟', color: '#dbeafe', sale_unit: 'piece', price_cents: 2450, cost_cents: 1800, stock_qty: 30, low_stock_threshold: 6 },
  { id: 'prd-azucar', name: 'Azúcar 1 kg', category: 'cat-abarrotes', emoji: '🧂', color: '#f1f5f9', sale_unit: 'piece', price_cents: 2990, cost_cents: 2200, stock_qty: 22, low_stock_threshold: 5 },
  { id: 'prd-huevo', name: 'Huevo 12 pzas', category: 'cat-abarrotes', emoji: '🥚', color: '#fef3c7', sale_unit: 'piece', price_cents: 4200, cost_cents: 3400, stock_qty: 3, low_stock_threshold: 4 },

  { id: 'prd-refresco', name: 'Refresco 2 L', category: 'cat-bebidas', emoji: '🥤', color: '#fee2e2', sale_unit: 'piece', price_cents: 3500, cost_cents: 2600, stock_qty: 18, low_stock_threshold: 4 },
  { id: 'prd-agua', name: 'Agua 1 L', category: 'cat-bebidas', emoji: '💧', color: '#dbeafe', sale_unit: 'piece', price_cents: 1800, cost_cents: 1100, stock_qty: 40, low_stock_threshold: 8 },
  { id: 'prd-jugo', name: 'Jugo de naranja 1 L', category: 'cat-bebidas', emoji: '🧃', color: '#fed7aa', sale_unit: 'piece', price_cents: 3200, cost_cents: 2400, stock_qty: 12, low_stock_threshold: 3 },
  { id: 'prd-cerveza', name: 'Cerveza 355 ml', category: 'cat-bebidas', emoji: '🍺', color: '#fef3c7', sale_unit: 'piece', price_cents: 2200, cost_cents: 1600, stock_qty: 48, low_stock_threshold: 12 },

  { id: 'prd-leche', name: 'Leche 1 L', category: 'cat-lacteos', emoji: '🥛', color: '#f1f5f9', sale_unit: 'piece', price_cents: 2850, cost_cents: 2200, stock_qty: 16, low_stock_threshold: 4 },
  { id: 'prd-queso', name: 'Queso', category: 'cat-lacteos', emoji: '🧀', color: '#fef9c3', sale_unit: 'weight', price_cents: 18900, cost_cents: 14000, stock_qty: 6000, low_stock_threshold: 1500 },
  { id: 'prd-yogur', name: 'Yogur 900 g', category: 'cat-lacteos', emoji: '🍶', color: '#fce7f3', sale_unit: 'piece', price_cents: 3600, cost_cents: 2800, stock_qty: 10, low_stock_threshold: 3 },
  { id: 'prd-crema', name: 'Crema', category: 'cat-lacteos', emoji: '🥣', color: '#fef3c7', sale_unit: 'weight', price_cents: 8900, cost_cents: 6500, stock_qty: 3500, low_stock_threshold: 1000 },

  { id: 'prd-jabon', name: 'Jabón de baño', category: 'cat-limpieza', emoji: '🧼', color: '#f3e8ff', sale_unit: 'piece', price_cents: 1590, cost_cents: 1000, stock_qty: 24, low_stock_threshold: 6 },
  { id: 'prd-detergente', name: 'Detergente 1 kg', category: 'cat-limpieza', emoji: '🧴', color: '#e0f2fe', sale_unit: 'piece', price_cents: 4990, cost_cents: 3800, stock_qty: 9, low_stock_threshold: 3 },
  { id: 'prd-cloro', name: 'Cloro 1 L', category: 'cat-limpieza', emoji: '🫧', color: '#dbeafe', sale_unit: 'volume', price_cents: 3290, cost_cents: 2400, stock_qty: 8000, low_stock_threshold: 2000 },
  { id: 'prd-suavizante', name: 'Suavizante 1 L', category: 'cat-limpieza', emoji: '🌸', color: '#fce7f3', sale_unit: 'piece', price_cents: 4290, cost_cents: 3300, stock_qty: 7, low_stock_threshold: 2 },
];

export const seedProducts: Product[] = productSeeds.map((p) => ({
  id: p.id,
  store_id: DEMO_STORE_ID,
  category_id: p.category,
  name: p.name,
  image_url: emojiImage(p.emoji, p.color),
  sale_unit: p.sale_unit,
  price_cents: p.price_cents,
  cost_cents: p.cost_cents,
  barcode: null,
  is_generated_barcode: false,
  track_stock: true,
  stock_qty: p.stock_qty,
  low_stock_threshold: p.low_stock_threshold,
  active: true,
  created_by: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}));
