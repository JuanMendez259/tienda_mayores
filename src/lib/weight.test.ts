import { describe, expect, it } from 'vitest';
import {
  formatKilograms,
  formatLiters,
  formatMeasure,
  gramsToKilograms,
  parseKilogramsToGrams,
  parseLitersToMilliliters,
} from './weight';

describe('peso', () => {
  it('convierte gramos a kilogramos', () => {
    expect(gramsToKilograms(1250)).toBe(1.25);
  });
  it('formatea kilogramos con 3 decimales', () => {
    expect(formatKilograms(1250)).toBe('1.250 kg');
    expect(formatKilograms(500)).toBe('0.500 kg');
  });
  it('interpreta gramos o kilogramos según el texto', () => {
    expect(parseKilogramsToGrams('1250')).toBe(1250);
    expect(parseKilogramsToGrams('1.25')).toBe(1250);
    expect(parseKilogramsToGrams('')).toBe(0);
  });
});

describe('volumen', () => {
  it('formatea litros con 3 decimales', () => {
    expect(formatLiters(1500)).toBe('1.500 L');
  });
  it('interpreta mililitros o litros según el texto', () => {
    expect(parseLitersToMilliliters('1500')).toBe(1500);
    expect(parseLitersToMilliliters('1.5')).toBe(1500);
  });
  it('formatea según la unidad de venta', () => {
    expect(formatMeasure(750, 'weight')).toBe('0.750 kg');
    expect(formatMeasure(750, 'volume')).toBe('0.750 L');
  });
});
