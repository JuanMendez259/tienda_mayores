/**
 * Pagos con terminal Clip y Mercado Pago (F-202, F-203, sección 8.1 y 8.2).
 *
 * No hay integración directa viable sin credenciales ni terminal física, así que
 * se implementa el **flujo manual** documentado: la app muestra el monto, el
 * cajero cobra en la terminal (o genera el QR) y confirma el pago registrando
 * una referencia opcional (folio o últimos 4 dígitos).
 *
 * Todo queda detrás de `PaymentProvider` para poder sustituirlo por la API real
 * (con las llaves en el servidor) sin rehacer la arquitectura.
 */
import type { PaymentMethod } from '../types/database';

/** Etiquetas legibles de cada método de pago. */
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  card_clip: 'Terminal Clip',
  mercadopago_qr: 'Mercado Pago (QR)',
  mercadopago_terminal: 'Mercado Pago (terminal)',
  credit: 'Fiado',
};

export interface PaymentRequest {
  /** Monto a cobrar en centavos. */
  totalCents: number;
  /** Texto breve para mostrar al cajero (por ejemplo, el número de venta). */
  label: string;
}

export interface PaymentResult {
  method: PaymentMethod;
  amountCents: number;
  reference: string | null;
}

export interface PaymentProvider {
  id: string;
  label: string;
  icon: string;
  method: PaymentMethod;
  /** Indica si el flujo puede iniciarse en este momento. */
  isAvailable(): boolean;
  /**
   * Ejecuta el cobro y devuelve el pago a registrar.
   * `reference` lo captura el cajero (folio o últimos 4 dígitos).
   */
  charge(request: PaymentRequest, reference: string | null): Promise<PaymentResult>;
}

/** Cobro manual en terminal Clip: el cajero confirma con una referencia. */
export const clipProvider: PaymentProvider = {
  id: 'clip',
  label: PAYMENT_METHOD_LABELS.card_clip,
  icon: '💳',
  method: 'card_clip',
  isAvailable: () => true,
  async charge(request, reference) {
    return { method: 'card_clip', amountCents: request.totalCents, reference };
  },
};

/** Cobro por Mercado Pago con QR y confirmación manual (8.2). */
export const mercadoPagoProvider: PaymentProvider = {
  id: 'mercadopago',
  label: PAYMENT_METHOD_LABELS.mercadopago_qr,
  icon: '📱',
  method: 'mercadopago_qr',
  isAvailable: () => true,
  async charge(request, reference) {
    return { method: 'mercadopago_qr', amountCents: request.totalCents, reference };
  },
};

/** Proveedores de pago distintos del efectivo, disponibles en el cobro. */
export const paymentProviders: PaymentProvider[] = [clipProvider, mercadoPagoProvider];

export function providerFor(method: PaymentMethod): PaymentProvider | undefined {
  return paymentProviders.find((provider) => provider.method === method);
}
