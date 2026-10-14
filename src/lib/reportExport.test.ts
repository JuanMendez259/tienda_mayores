import { describe, expect, it } from 'vitest';
import type { Category, Product } from '../types/database';
import type { ReportData } from '../data/repository';
import { catalogToCsv, reportToCsv } from './reportExport';

const report: ReportData = {
  from: '2026-01-01T00:00:00Z',
  to: '2026-01-02T00:00:00Z',
  salesCount: 2,
  totalSalesCents: 15000,
  profitCents: 4000,
  byDay: [{ date: '2026-01-01', totalCents: 15000, count: 2 }],
  byPaymentMethod: [{ method: 'cash', totalCents: 15000, count: 2 }],
  topProducts: [{ productId: 'p1', name: 'Arroz', qty: 3, totalCents: 9600 }],
  lowRotation: [{ productId: 'p2', name: 'Frijol', qty: 0 }],
};

const product: Product = {
  id: 'p1',
  store_id: 's1',
  category_id: 'c1',
  name: 'Arroz 1 kg',
  image_url: null,
  sale_unit: 'piece',
  price_cents: 3200,
  cost_cents: 2400,
  barcode: '7501055300123',
  is_generated_barcode: false,
  track_stock: true,
  stock_qty: 10,
  low_stock_threshold: 2,
  supplier_id: null,
  brand: null,
  active: true,
  created_by: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const category: Category = {
  id: 'c1',
  store_id: 's1',
  name: 'Básicos',
  image_url: null,
  color: null,
  sort_order: 1,
  active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('exportación de reportes (F-605, F-707)', () => {
  it('genera el CSV del reporte con totales y métodos de pago', () => {
    const csv = reportToCsv(report);
    expect(csv).toContain('Reporte de ventas');
    expect(csv).toContain('Total de ventas,150.00');
    expect(csv).toContain('Ganancia estimada,40.00');
    expect(csv).toContain('Efectivo,150.00,2');
    expect(csv).toContain('Arroz,3,96.00');
  });

  it('genera el CSV del catálogo con la categoría resuelta', () => {
    const csv = catalogToCsv([product], [category]);
    expect(csv).toContain('nombre,categoria,unidad,precio,costo');
    expect(csv).toContain('Arroz 1 kg,Básicos,pieza,32.00,24.00,7501055300123,10,2,sí');
  });
});
