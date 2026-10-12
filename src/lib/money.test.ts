import { describe, expect, it } from 'vitest';
import {
  changeDue,
  formatMXN,
  lineTotalByMeasure,
  lineTotalByQuantity,
  parseAmountToCents,
  sumCents,
} from './money';

describe('formatMXN', () => {
  it('formatea pesos con dos decimales', () => {
    expect(formatMXN(123450)).toBe('$1,234.50');
    expect(formatMXN(1050)).toBe('$10.50');
    expect(formatMXN(0)).toBe('$0.00');
    expect(formatMXN(5)).toBe('$0.05');
  });
});

describe('parseAmountToCents', () => {
  it('convierte texto a centavos enteros', () => {
    expect(parseAmountToCents('12.50')).toBe(1250);
    expect(parseAmountToCents('$1,234.50')).toBe(123450);
    expect(parseAmountToCents('10')).toBe(1000);
    expect(parseAmountToCents('')).toBe(0);
  });
});

describe('totales de renglón', () => {
  it('calcula por pieza sin decimales flotantes', () => {
    expect(lineTotalByQuantity(1999, 3)).toBe(5997);
  });
  it('calcula por peso redondeando a centavos', () => {
    // $45.90/kg por 1.250 kg = $57.375 -> 5738 centavos
    expect(lineTotalByMeasure(4590, 1250)).toBe(5738);
    // $120.00/L por 0.750 L = $90.00
    expect(lineTotalByMeasure(12000, 750)).toBe(9000);
  });
});

describe('sumCents y changeDue', () => {
  it('suma importes', () => {
    expect(sumCents([5738, 5997, 9000])).toBe(20735);
  });
  it('calcula el cambio y nunca es negativo', () => {
    expect(changeDue(20735, 50000)).toBe(29265);
    expect(changeDue(50000, 20000)).toBe(0);
  });
});
