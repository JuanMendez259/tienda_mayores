import { describe, expect, it } from 'vitest';
import { generateBarcode, parseProductsCsv, productsCsvTemplate } from './csv';

describe('parseProductsCsv', () => {
  it('ignora el encabezado y convierte precios a centavos', () => {
    const csv = ['nombre,categoria,unidad,precio,costo', 'Refresco,Bebidas,pieza,18.50,12.00'].join('\n');
    const { rows, errors } = parseProductsCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: 'Refresco',
      category: 'Bebidas',
      saleUnit: 'piece',
      priceCents: 1850,
      costCents: 1200,
    });
  });

  it('interpreta unidades de peso y volumen', () => {
    const csv = ['Jitomate,Básicos,peso,28.90', 'Leche,Lácteos,volumen,24.00'].join('\n');
    const { rows } = parseProductsCsv(csv);
    expect(rows[0].saleUnit).toBe('weight');
    expect(rows[1].saleUnit).toBe('volume');
  });

  it('reporta renglones sin nombre o sin precio', () => {
    const csv = ['', 'Sin precio,,pieza,,', 'Producto,,pieza,10'].join('\n');
    const { rows, errors } = parseProductsCsv(csv);
    expect(rows).toHaveLength(1);
    expect(errors).toHaveLength(1);
  });

  it('respeta campos entre comillas', () => {
    const csv = '"Refresco, grande",Bebidas,pieza,20.00';
    const { rows } = parseProductsCsv(csv);
    expect(rows[0].name).toBe('Refresco, grande');
  });

  it('lee la plantilla sin errores', () => {
    const { rows, errors } = parseProductsCsv(productsCsvTemplate());
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(3);
  });
});

describe('generateBarcode', () => {
  it('genera un código numérico de 13 dígitos con dígito verificador', () => {
    const code = generateBarcode();
    expect(code).toMatch(/^\d{13}$/);
  });
});
