import { describe, expect, it } from 'vitest';
import type { PrintableTicket } from '../devices/printer';
import { normalizePhone, ticketToText, whatsappUrl } from './ticket';

const ticket: PrintableTicket = {
  storeName: 'Abarrotes La Esquina',
  storeFooter: '¡Gracias por su compra!',
  number: 12,
  dateIso: '2026-01-01T10:00:00Z',
  lines: [{ name: 'Arroz', detail: '1 × $32.00', importeCents: 3200 }],
  subtotalCents: 3200,
  discountCents: 0,
  totalCents: 3200,
  paymentsLabel: 'Efectivo $32.00',
  receivedCents: 5000,
  changeCents: 1800,
};

describe('ticket de texto y WhatsApp (F-302)', () => {
  it('arma el ticket con productos y totales', () => {
    const text = ticketToText(ticket);
    expect(text).toContain('Abarrotes La Esquina');
    expect(text).toContain('Ticket #12');
    expect(text).toContain('Arroz');
    expect(text).toContain('TOTAL: $32.00');
    expect(text).toContain('Cambio: $18.00');
  });

  it('agrega el código de país a números locales', () => {
    expect(normalizePhone('55 1234 5678', '+52')).toBe('525512345678');
    expect(normalizePhone('+52 55 1234 5678', '+52')).toBe('525512345678');
    expect(normalizePhone('15551234567', '+52')).toBe('15551234567');
  });

  it('arma el enlace de WhatsApp con el ticket', () => {
    expect(whatsappUrl('525512345678', 'Hola')).toBe('https://wa.me/525512345678?text=Hola');
  });
});
