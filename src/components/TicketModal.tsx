import type { Store } from '../types/database';
import { formatMXN } from '../lib/money';

export interface TicketLine {
  name: string;
  detail: string;
  importeCents: number;
  /** Descuento aplicado al renglón (F-112), si lo hay. */
  discountCents?: number;
}

export interface TicketData {
  number: number;
  /** Venta guardada sin conexión, pendiente de enviar (F-704). */
  pending?: boolean;
  dateIso: string;
  lines: TicketLine[];
  subtotalCents: number;
  discountCents?: number;
  totalCents: number;
  receivedCents: number;
  changeCents: number;
}

interface TicketModalProps {
  open: boolean;
  store: Store;
  data: TicketData | null;
  onNewSale: () => void;
}

/** Ticket en pantalla al cobrar (F-303). Impresión y WhatsApp son Fase 4. */
export function TicketModal({ open, store, data, onNewSale }: TicketModalProps) {
  if (!open || !data) return null;
  const fecha = new Date(data.dateIso).toLocaleString('es-MX');

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/60 p-4">
      <div className="card max-h-[92vh] w-full max-w-md overflow-y-auto p-6" role="dialog" aria-modal="true">
        <div className="mb-4 border-b border-dashed border-slate-400 pb-4 text-center">
          <h2 className="text-2xl font-extrabold">{store.name}</h2>
          <p className="text-lg text-slate-600">
            {data.pending ? 'Venta sin conexión' : `Ticket #${data.number}`}
          </p>
          <p className="text-base text-slate-500">{fecha}</p>
          {data.pending && (
            <p className="mt-2 rounded-xl bg-amber-100 p-2 text-base font-semibold text-amber-900">
              Se enviará al recuperar la conexión.
            </p>
          )}
        </div>

        <ul className="mb-4 space-y-3">
          {data.lines.map((line, index) => (
            <li key={index} className="flex justify-between gap-2 text-lg">
              <span>
                <span className="font-semibold">{line.name}</span>
                <br />
                <span className="text-base text-slate-600">{line.detail}</span>
                {line.discountCents ? (
                  <>
                    <br />
                    <span className="text-base font-semibold text-green-700">
                      Descuento −{formatMXN(line.discountCents)}
                    </span>
                  </>
                ) : null}
              </span>
              <span className="font-bold">{formatMXN(line.importeCents)}</span>
            </li>
          ))}
        </ul>

        <dl className="space-y-1 border-t border-dashed border-slate-400 pt-4 text-lg">
          <div className="flex justify-between">
            <span className="text-slate-600">Subtotal</span>
            <span className="font-bold">{formatMXN(data.subtotalCents)}</span>
          </div>
          {data.discountCents ? (
            <div className="flex justify-between text-green-700">
              <span>Descuento</span>
              <span className="font-bold">−{formatMXN(data.discountCents)}</span>
            </div>
          ) : null}
          <div className="flex justify-between text-2xl font-extrabold">
            <span>Total</span>
            <span>{formatMXN(data.totalCents)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">Efectivo</span>
            <span className="font-bold">{formatMXN(data.receivedCents)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">Cambio</span>
            <span className="font-bold">{formatMXN(data.changeCents)}</span>
          </div>
        </dl>

        {store.ticket_footer && (
          <p className="mt-6 border-t border-dashed border-slate-400 pt-4 text-center text-lg text-slate-600">
            {store.ticket_footer}
          </p>
        )}

        <button type="button" onClick={onNewSale} className="btn btn-primary mt-6 w-full py-5 text-2xl text-white">
          Nueva venta
        </button>
      </div>
    </div>
  );
}
