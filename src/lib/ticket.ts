/**
 * Texto del ticket para WhatsApp (F-302, sección 8.4) y armado del enlace
 * `wa.me`. El número se escribe a mano y se asume el código de país de la
 * tienda (México +52) cuando no se incluye.
 */
import type { PrintableTicket } from '../devices/printer';
import { formatMXN } from './money';

/** Ticket en texto plano para copiar o enviar por WhatsApp. */
export function ticketToText(ticket: PrintableTicket): string {
  const lines: string[] = [];
  lines.push(ticket.storeName);
  lines.push(ticket.pending ? 'Venta sin conexión' : `Ticket #${ticket.number}`);
  lines.push(new Date(ticket.dateIso).toLocaleString('es-MX'));
  lines.push('------------------------------');
  for (const line of ticket.lines) {
    lines.push(line.name);
    lines.push(`  ${line.detail}  ${formatMXN(line.importeCents)}`);
    if (line.discountCents && line.discountCents > 0) {
      lines.push(`  Descuento -${formatMXN(line.discountCents)}`);
    }
  }
  lines.push('------------------------------');
  lines.push(`Subtotal: ${formatMXN(ticket.subtotalCents)}`);
  if (ticket.discountCents > 0) lines.push(`Descuento: -${formatMXN(ticket.discountCents)}`);
  lines.push(`TOTAL: ${formatMXN(ticket.totalCents)}`);
  if (ticket.paymentsLabel) lines.push(`Pago: ${ticket.paymentsLabel}`);
  lines.push(`Recibí: ${formatMXN(ticket.receivedCents)}`);
  lines.push(`Cambio: ${formatMXN(ticket.changeCents)}`);
  if (ticket.storeFooter) {
    lines.push('------------------------------');
    lines.push(ticket.storeFooter);
  }
  return lines.join('\n');
}

/** Deja solo dígitos; agrega el código de país si el número es local. */
export function normalizePhone(phone: string, countryCode: string): string {
  const digits = phone.replace(/\D/g, '');
  const country = countryCode.replace(/\D/g, '');
  if (digits.length <= 10) return `${country}${digits}`;
  return digits;
}

/** Enlace de WhatsApp con el ticket como texto. */
export function whatsappUrl(phone: string, text: string): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}
