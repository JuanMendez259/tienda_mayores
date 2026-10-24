import { useId, useMemo, useState } from 'react';
import type { Customer, PaymentMethod } from '../types/database';
import type { PaymentInput } from '../data';
import { changeDue, formatMXN, parseAmountToCents } from '../lib/money';
import { PAYMENT_METHOD_LABELS, paymentProviders } from '../devices/payments';
import { NumericKeypad } from './NumericKeypad';
import { useModalA11y } from '../lib/useModalA11y';

interface PaymentModalProps {
  totalCents: number;
  /** Clientes de fiado disponibles (F-B03). */
  customers?: Customer[];
  /** Saldo actual por cliente, para mostrar el límite antes de autorizar. */
  customerBalances?: Record<string, number>;
  /** Si se permite cobrar fiado (permiso del cajero). */
  allowCredit?: boolean;
  onCancel: () => void;
  onConfirm: (payments: PaymentInput[], receivedCents: number, customerId?: string | null) => void;
}

/** Billetes y monedas frecuentes en México. Cada toque SUMA al recibido (C-01). */
const QUICK_DENOMS = [5, 10, 20, 50, 100, 200, 500, 1000];

type Mode = 'cash' | 'card_clip' | 'mercadopago_qr' | 'credit';

interface Entry {
  method: PaymentMethod;
  appliedCents: number;
  reference: string | null;
  /** Efectivo recibido (para calcular cambio); igual al aplicado en pagos digitales. */
  receivedCents: number;
}

const MODE_LABEL: Record<Mode, string> = {
  cash: '💵 Efectivo',
  card_clip: '💳 Clip',
  mercadopago_qr: '📱 Mercado Pago',
  credit: '🪙 Fiado',
};

/**
 * Cobro en efectivo o combinado: efectivo + Clip + Mercado Pago (F-201 a F-204).
 * La suma de los pagos siempre iguala el total de la venta. Incluye el cobro a
 * crédito "Fiado" eligiendo al cliente (F-B03).
 *
 * En tablet el contenido se reparte en dos zonas para que el teclado y el botón
 * de cobro queden siempre visibles, sin tener que desplazarse dentro del modal.
 */
export function PaymentModal({
  totalCents,
  customers = [],
  customerBalances,
  allowCredit = false,
  onCancel,
  onConfirm,
}: PaymentModalProps) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [mode, setMode] = useState<Mode>('cash');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const titleId = useId();
  const panelRef = useModalA11y(onCancel);

  const paid = entries.reduce((acc, entry) => acc + entry.appliedCents, 0);
  const remaining = Math.max(0, totalCents - paid);
  const received = parseAmountToCents(amount);
  const shortfall = Math.max(0, remaining - received);
  const cashChange = changeDue(remaining, received);
  const cashEnough = remaining > 0 && received >= remaining;

  const modes: Mode[] =
    allowCredit && customers.length > 0
      ? ['cash', 'card_clip', 'mercadopago_qr', 'credit']
      : ['cash', 'card_clip', 'mercadopago_qr'];

  const filteredCustomers = useMemo(() => {
    const term = customerSearch.trim().toLowerCase();
    const list = customers.filter((customer) => customer.active);
    if (!term) return list;
    return list.filter((customer) => customer.name.toLowerCase().includes(term));
  }, [customers, customerSearch]);

  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId) ?? null;
  const selectedBalance =
    selectedCustomerId !== null ? customerBalances?.[selectedCustomerId] : undefined;
  const selectedLimit = selectedCustomer?.credit_limit_cents ?? null;
  const projected =
    selectedCustomer && selectedBalance !== undefined ? selectedBalance + remaining : undefined;
  const overLimit =
    projected !== undefined && selectedLimit !== null && projected > selectedLimit;

  function chooseMode(next: Mode) {
    setMode(next);
    setError(null);
  }

  function finish(next: Entry[], customerId?: string | null) {
    const changeTotal = next.reduce(
      (acc, entry) => acc + Math.max(0, entry.receivedCents - entry.appliedCents),
      0,
    );
    const payments: PaymentInput[] = next.map((entry) => ({
      method: entry.method,
      amount_cents: entry.appliedCents,
      reference: entry.reference,
    }));
    onConfirm(payments, totalCents + changeTotal, customerId ?? null);
  }

  function addCredit() {
    if (remaining === 0 || !selectedCustomerId) return;
    finish(
      [
        ...entries,
        { method: 'credit', appliedCents: remaining, reference: null, receivedCents: remaining },
      ],
      selectedCustomerId,
    );
  }

  function addCash() {
    if (remaining === 0 || received <= 0) return;
    const appliedCents = Math.min(remaining, received);
    const next: Entry[] = [
      ...entries,
      { method: 'cash', appliedCents, reference: null, receivedCents: received },
    ];
    if (appliedCents >= remaining) {
      finish(next);
      return;
    }
    setEntries(next);
    setAmount('');
  }

  /** Cobra el resto en efectivo sin capturar: el cliente dio el importe exacto. */
  function chargeExactCash() {
    if (remaining <= 0) return;
    finish([
      ...entries,
      { method: 'cash', appliedCents: remaining, reference: null, receivedCents: remaining },
    ]);
  }

  async function addDigital() {
    if (remaining === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const provider = paymentProviders.find((item) => item.method === mode);
      const result = provider
        ? await provider.charge({ totalCents: remaining, label: 'Venta' }, reference.trim() || null)
        : { method: mode, amountCents: remaining, reference: reference.trim() || null };
      setBusy(false);
      finish([
        ...entries,
        {
          method: result.method,
          appliedCents: result.amountCents,
          reference: result.reference,
          receivedCents: result.amountCents,
        },
      ]);
    } catch (cause) {
      setBusy(false);
      setError(
        cause instanceof Error
          ? cause.message
          : 'No se pudo confirmar el pago. Revisa la terminal e inténtalo otra vez.',
      );
    }
  }

  const primaryButton = cashEnough
    ? `Cobrar ${formatMXN(remaining)}`
    : received > 0
      ? `Agregar ${formatMXN(received)}`
      : 'Escribe el efectivo';

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/60 p-2 sm:p-4">
      <div
        ref={panelRef}
        tabIndex={-1}
        className="card max-h-[96dvh] w-full max-w-3xl overflow-y-auto p-0"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="flex items-center justify-between gap-4 border-b-2 border-slate-200 bg-white px-4 py-3 sm:px-5">
          <div>
            <p className="text-sm font-black uppercase tracking-widest text-emerald-700">Cobro</p>
            <h2 id={titleId} className="text-2xl font-black leading-tight text-slate-900">
              Cobrar
            </h2>
          </div>
          <div className="text-right">
            <span className="block text-3xl font-black leading-none text-emerald-700">
              {formatMXN(totalCents)}
            </span>
            <span className="text-sm font-bold text-slate-500">MXN</span>
          </div>
        </header>

        <div className="grid gap-3 p-3 sm:p-4 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:gap-4">
          <section className="space-y-3" aria-label="Forma de pago">
            {entries.length > 0 && (
              <div className="rounded-2xl border-2 border-slate-200 bg-slate-50 p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-base font-bold text-slate-700">Pagos agregados</span>
                  <span className="text-xl font-black text-slate-900">{formatMXN(paid)}</span>
                </div>
                <ul className="mt-1 max-h-24 space-y-1 overflow-y-auto pr-1">
                  {entries.map((entry, index) => (
                    <li key={index} className="flex justify-between text-base text-slate-700">
                      <span>{PAYMENT_METHOD_LABELS[entry.method]}</span>
                      <span className="font-semibold">{formatMXN(entry.appliedCents)}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-base font-extrabold text-amber-800">
                    Falta {formatMXN(remaining)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setEntries((prev) => prev.slice(0, -1))}
                    className="btn btn-neutral px-3 py-2 text-base"
                  >
                    ↶ Quitar
                  </button>
                </div>
              </div>
            )}

            <div className={`grid gap-2 ${modes.length === 4 ? 'grid-cols-2' : 'grid-cols-3'}`}>
              {modes.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => chooseMode(value)}
                  disabled={busy}
                  aria-pressed={mode === value}
                  className={`btn min-h-14 px-2 py-2 text-base leading-tight ${
                    mode === value
                      ? 'border-2 border-emerald-800 bg-emerald-600 text-white hover:bg-emerald-700'
                      : 'btn-neutral'
                  }`}
                >
                  {MODE_LABEL[value]}
                </button>
              ))}
            </div>

            {mode === 'cash' && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-2xl bg-slate-900 px-3 py-2.5">
                    <span className="block text-sm font-bold uppercase tracking-wide text-slate-300">
                      Recibí
                    </span>
                    <span className="block text-2xl font-black leading-tight text-white">
                      {formatMXN(received)}
                    </span>
                  </div>
                  <div
                    className={`rounded-2xl px-3 py-2.5 ${
                      shortfall > 0 ? 'bg-red-100' : 'bg-amber-100'
                    }`}
                    role="status"
                    aria-live="polite"
                    aria-atomic="true"
                  >
                    <span
                      className={`block text-sm font-bold uppercase tracking-wide ${
                        shortfall > 0 ? 'text-red-900' : 'text-amber-900'
                      }`}
                    >
                      {shortfall > 0 ? 'Falta' : 'Cambio'}
                    </span>
                    <span
                      className={`block text-2xl font-black leading-tight ${
                        shortfall > 0 ? 'text-red-900' : 'text-amber-900'
                      }`}
                    >
                      {formatMXN(shortfall > 0 ? shortfall : cashChange)}
                    </span>
                  </div>
                </div>

                <p className="text-base font-semibold text-slate-600">
                  Toca los billetes y monedas que te dieron; se van sumando.
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {QUICK_DENOMS.map((denom) => (
                    <button
                      key={denom}
                      type="button"
                      onClick={() =>
                        setAmount((prev) => String((parseAmountToCents(prev) + denom * 100) / 100))
                      }
                      aria-label={`Sumar ${denom} pesos`}
                      className="btn btn-neutral min-h-14 px-1 py-2 text-base"
                    >
                      +${denom}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={chargeExactCash}
                    className="btn min-h-14 border-2 border-emerald-800 bg-emerald-600 px-2 py-2 text-base font-black text-white hover:bg-emerald-700"
                  >
                    💵 Cobrar exacto
                  </button>
                  <button
                    type="button"
                    onClick={() => setAmount('')}
                    className="btn btn-neutral min-h-14 px-2 py-2 text-base"
                  >
                    🧹 Borrar
                  </button>
                </div>
              </>
            )}

            {mode === 'credit' && (
              <>
                <p className="rounded-2xl bg-amber-100 p-3 text-base font-semibold text-amber-900">
                  Se anotará {formatMXN(remaining)} a fiado. Elige al cliente:
                </p>
                <input
                  value={customerSearch}
                  onChange={(event) => setCustomerSearch(event.target.value)}
                  placeholder="Buscar cliente…"
                  aria-label="Buscar cliente de fiado"
                  className="min-h-[56px] w-full rounded-2xl border-2 border-slate-300 px-4 text-lg"
                />
                {filteredCustomers.length === 0 ? (
                  <p className="text-base text-slate-600">
                    No hay clientes. Da de alta uno en Administración · Fiado.
                  </p>
                ) : (
                  <ul className="max-h-[42dvh] space-y-2 overflow-y-auto pr-1">
                    {filteredCustomers.map((customer) => {
                      const balance = customerBalances?.[customer.id];
                      const limit = customer.credit_limit_cents;
                      const isSelected = selectedCustomerId === customer.id;
                      return (
                        <li key={customer.id}>
                          <button
                            type="button"
                            onClick={() => setSelectedCustomerId(customer.id)}
                            aria-pressed={isSelected}
                            className={`card flex w-full items-center justify-between gap-3 p-3 text-left transition ${
                              isSelected
                                ? 'border-emerald-500 bg-emerald-50'
                                : 'hover:border-emerald-400'
                            }`}
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-lg font-bold">{customer.name}</span>
                              <span className="block text-base text-slate-600">
                                {customer.phone ?? 'Sin teléfono'}
                              </span>
                            </span>
                            <span className="shrink-0 text-right text-base leading-tight text-slate-700">
                              <span className="block">
                                Debe {balance !== undefined ? formatMXN(balance) : '—'}
                              </span>
                              <span className="block text-slate-500">
                                Límite {limit !== null ? formatMXN(limit) : 'sin límite'}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}

            {mode !== 'cash' && mode !== 'credit' && (
              <>
                <p className="rounded-2xl bg-slate-100 p-3 text-base text-slate-700">
                  {mode === 'card_clip'
                    ? `Cobra ${formatMXN(remaining)} en la terminal Clip y confirma.`
                    : `Muestra el QR de Mercado Pago por ${formatMXN(remaining)} y confirma al acreditarse.`}
                </p>
                <label className="mb-1 block text-lg font-semibold" htmlFor="pay-ref">
                  Referencia (opcional)
                </label>
                <input
                  id="pay-ref"
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                  placeholder="Folio o últimos 4 dígitos"
                  className="min-h-[56px] w-full rounded-2xl border-2 border-slate-300 px-4 text-lg"
                />
              </>
            )}
          </section>

          <section
            className="space-y-3 md:border-l-2 md:border-slate-200 md:pl-4"
            aria-label="Teclado y confirmación"
          >
            {mode === 'cash' && (
              <>
                <div className="rounded-2xl border-2 border-slate-200 bg-slate-50 p-3">
                  <p className="text-base font-bold text-slate-700">
                    ¿Cuánto efectivo entregó el cliente?
                  </p>
                  <p className="text-sm text-slate-500">Escribe la cantidad y confirma.</p>
                </div>
                <NumericKeypad value={amount} onChange={setAmount} autoFocus />
                <div className="grid grid-cols-[0.8fr_1.2fr] gap-2">
                  <button
                    type="button"
                    onClick={onCancel}
                    className="btn btn-neutral px-3 py-3 text-lg"
                  >
                    Volver
                  </button>
                  {remaining === 0 ? (
                    <button
                      type="button"
                      onClick={() => finish(entries)}
                      className="btn bg-emerald-600 px-3 py-3 text-lg text-white hover:bg-emerald-700"
                    >
                      Cobrar sin pago
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={addCash}
                      disabled={received <= 0}
                      className={`btn px-3 py-3 text-lg text-white ${
                        received > 0
                          ? 'bg-emerald-600 hover:bg-emerald-700'
                          : 'cursor-not-allowed bg-slate-300'
                      }`}
                    >
                      {primaryButton}
                    </button>
                  )}
                </div>
              </>
            )}

            {mode === 'credit' && (
              <>
                {selectedCustomer ? (
                  <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
                    <p className="text-base font-bold text-amber-900">Fiado para</p>
                    <p className="text-2xl font-black leading-tight text-amber-950">
                      {selectedCustomer.name}
                    </p>
                    <dl className="mt-3 grid grid-cols-2 gap-2 text-base text-amber-950">
                      <div>
                        <dt className="font-bold">Debe</dt>
                        <dd>{selectedBalance !== undefined ? formatMXN(selectedBalance) : '—'}</dd>
                      </div>
                      <div>
                        <dt className="font-bold">Límite</dt>
                        <dd>{selectedLimit !== null ? formatMXN(selectedLimit) : 'Sin límite'}</dd>
                      </div>
                      <div className="col-span-2">
                        <dt className="font-bold">Después de esta venta</dt>
                        <dd>
                          {projected !== undefined ? formatMXN(projected) : 'Se valida al cobrar'}
                        </dd>
                      </div>
                    </dl>
                    {overLimit && (
                      <p className="mt-2 rounded-xl bg-red-100 p-2 text-base font-bold text-red-800">
                        Supera el límite; se pedirá autorización.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="rounded-2xl border-2 border-slate-200 bg-slate-50 p-4 text-lg text-slate-600">
                    Elige un cliente de la lista para continuar.
                  </div>
                )}
                {error && (
                  <p className="rounded-xl bg-red-100 p-3 text-base font-bold text-red-800">
                    {error}
                  </p>
                )}
                <div className="grid gap-2">
                  <button
                    type="button"
                    onClick={addCredit}
                    disabled={!selectedCustomer || remaining === 0}
                    className={`btn px-3 py-3 text-lg text-white ${
                      selectedCustomer && remaining > 0
                        ? 'bg-emerald-600 hover:bg-emerald-700'
                        : 'cursor-not-allowed bg-slate-300'
                    }`}
                  >
                    Anotar {formatMXN(remaining)} a fiado
                  </button>
                  <button
                    type="button"
                    onClick={onCancel}
                    className="btn btn-neutral px-3 py-3 text-lg"
                  >
                    Volver
                  </button>
                </div>
              </>
            )}

            {mode !== 'cash' && mode !== 'credit' && (
              <>
                <div className="rounded-2xl bg-slate-900 p-4 text-white">
                  <p className="text-base text-slate-300">
                    {mode === 'card_clip' ? 'Cobrar en Clip' : 'Cobrar en Mercado Pago'}
                  </p>
                  <p className="text-3xl font-black leading-tight">{formatMXN(remaining)}</p>
                </div>
                {error && (
                  <p className="rounded-xl bg-red-100 p-3 text-base font-bold text-red-800">
                    {error}
                  </p>
                )}
                <div className="grid gap-2">
                  <button
                    type="button"
                    onClick={() => void addDigital()}
                    disabled={busy || remaining === 0}
                    className={`btn px-3 py-3 text-lg text-white ${
                      busy || remaining === 0
                        ? 'cursor-not-allowed bg-slate-300'
                        : 'bg-emerald-600 hover:bg-emerald-700'
                    }`}
                  >
                    {busy ? 'Procesando…' : `Confirmar ${formatMXN(remaining)}`}
                  </button>
                  <button
                    type="button"
                    onClick={onCancel}
                    className="btn btn-neutral px-3 py-3 text-lg"
                  >
                    Volver
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
