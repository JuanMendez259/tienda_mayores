import { useCallback, useEffect, useState } from 'react';
import type { AppUser, Customer, Product, Store } from '../../types/database';
import { repository } from '../../data';
import type { CustomerStatement } from '../../data';
import { formatMXN } from '../../lib/money';
import { PAYMENT_METHOD_LABELS } from '../../devices/payments';
import { printPlainText } from '../../devices/printer';

interface CustomersAdminProps {
  store: Store;
  user: AppUser;
  products: Product[];
  /** Sesión de caja abierta, para que los abonos en efectivo entren al corte. */
  cashSessionId: string | null;
}

const field = 'min-h-[56px] w-full rounded-2xl border-2 border-slate-300 px-4 text-xl';
const label = 'mb-1 block text-lg font-semibold';

type View = { kind: 'list' } | { kind: 'statement'; customerId: string };

/**
 * Fiado completo (F-B01 a F-B06): deudores, abonos, estados de cuenta legibles
 * y lista de morosos (saldo con más de 30 días).
 */
export function CustomersAdmin({ store, user, products, cashSessionId }: CustomersAdminProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [statements, setStatements] = useState<Record<string, CustomerStatement>>({});
  const productById = new Map(products.map((product) => [product.id, product.name]));
  const [tab, setTab] = useState<'deudores' | 'morosos'>('deudores');
  const [view, setView] = useState<View>({ kind: 'list' });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  // Alta de cliente
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newLimit, setNewLimit] = useState('');

  // Abono
  const [payFor, setPayFor] = useState<Customer | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<'cash' | 'card_clip' | 'mercadopago_qr'>('cash');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const list = await repository.listCustomers(store.id);
    setCustomers(list);
    const entries = await Promise.all(
      list.map(async (customer) => {
        try {
          return [customer.id, await repository.getCustomerStatement(customer.id)] as const;
        } catch {
          return null;
        }
      }),
    );
    const map: Record<string, CustomerStatement> = {};
    for (const entry of entries) {
      if (entry) map[entry[0]] = entry[1];
    }
    setStatements(map);
    setLoading(false);
  }, [store.id]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  async function createCustomer() {
    if (!newName.trim()) {
      setError('Escribe el nombre del cliente.');
      return;
    }
    setError(null);
    await repository.createCustomer({
      store_id: store.id,
      name: newName.trim(),
      phone: newPhone.trim() || null,
      notes: null,
      credit_limit_cents: newLimit ? Math.round(Number(newLimit) * 100) : null,
    });
    setNewName('');
    setNewPhone('');
    setNewLimit('');
    setNewOpen(false);
    setMessage('Cliente agregado.');
    await load();
  }

  async function registerPayment() {
    if (!payFor) return;
    const cents = Math.round(Number(payAmount) * 100);
    if (!cents || cents <= 0) {
      setError('Escribe un monto válido.');
      return;
    }
    const statement = statements[payFor.id];
    if (statement && cents > statement.balance_cents) {
      setError(`El abono supera el saldo (${formatMXN(statement.balance_cents)}).`);
      return;
    }
    setError(null);
    await repository.createCustomerPayment({
      store_id: store.id,
      customer_id: payFor.id,
      amount_cents: cents,
      method: payMethod,
      cash_session_id: payMethod === 'cash' ? cashSessionId : null,
      user_id: user.id,
    });
    setMessage(`Abono de ${formatMXN(cents)} registrado.`);
    setPayFor(null);
    setPayAmount('');
    await load();
  }

  const withBalance = customers.filter((c) => (statements[c.id]?.balance_cents ?? 0) > 0);
  const overdue = withBalance.filter((c) => (statements[c.id]?.overdue_cents ?? 0) > 0);
  const shown = tab === 'morosos' ? overdue : withBalance;

  return (
    <section className="space-y-4">
      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <h3 className="title text-2xl">🪙 Fiado</h3>
        <button
          type="button"
          onClick={() => {
            setNewOpen((prev) => !prev);
            setError(null);
          }}
          className="btn btn-primary px-5 py-3 text-lg text-white"
        >
          ➕ Nuevo cliente
        </button>
      </div>

      {message && (
        <p className="rounded-xl bg-green-100 p-3 text-lg font-semibold text-green-900">{message}</p>
      )}

      {newOpen && (
        <div className="card space-y-3 p-4">
          <div>
            <label className={label} htmlFor="cust-name">
              Nombre
            </label>
            <input
              id="cust-name"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              className={field}
            />
          </div>
          <div>
            <label className={label} htmlFor="cust-phone">
              Teléfono (opcional)
            </label>
            <input
              id="cust-phone"
              value={newPhone}
              inputMode="tel"
              onChange={(event) => setNewPhone(event.target.value)}
              className={field}
            />
          </div>
          <div>
            <label className={label} htmlFor="cust-limit">
              Límite de fiado en pesos (opcional)
            </label>
            <input
              id="cust-limit"
              value={newLimit}
              inputMode="decimal"
              onChange={(event) => setNewLimit(event.target.value.replace(/[^0-9.]/g, ''))}
              className={field}
            />
          </div>
          <button
            type="button"
            onClick={() => void createCustomer()}
            className="btn btn-primary w-full py-4 text-xl text-white"
          >
            Guardar cliente
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setTab('deudores')}
          className={`btn py-3 text-lg ${tab === 'deudores' ? 'btn-primary text-white' : 'btn-neutral'}`}
        >
          Deudores ({withBalance.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('morosos')}
          className={`btn py-3 text-lg ${tab === 'morosos' ? 'btn-danger text-white' : 'btn-neutral'}`}
        >
          Morosos ({overdue.length})
        </button>
      </div>
      {tab === 'morosos' && (
        <p className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-800">
          Saldo con más de 30 días sin abonar.
        </p>
      )}

      {loading ? (
        <p className="text-lg text-slate-500">Cargando…</p>
      ) : shown.length === 0 ? (
        <p className="text-lg text-slate-500">No hay clientes con saldo pendiente.</p>
      ) : (
        <ul className="space-y-3">
          {shown.map((customer) => {
            const statement = statements[customer.id];
            const balance = statement?.balance_cents ?? 0;
            const overdueCents = statement?.overdue_cents ?? 0;
            const oldestDays = statement
              ? statement.sales.reduce(
                  (max, entry) => (entry.balance_cents > 0 ? Math.max(max, entry.age_days) : max),
                  0,
                )
              : 0;
            const overLimit =
              customer.credit_limit_cents !== null && balance > customer.credit_limit_cents;
            return (
              <li key={customer.id} className="card space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-xl font-bold">{customer.name}</p>
                    {customer.phone && (
                      <p className="text-base text-slate-500">📞 {customer.phone}</p>
                    )}
                    {oldestDays > 0 && (
                      <p className="text-base text-slate-500">Deuda más antigua: {oldestDays} día(s)</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="price text-2xl">{formatMXN(balance)}</p>
                    {overdueCents > 0 && (
                      <p className="text-base font-semibold text-red-700">
                        +30 días: {formatMXN(overdueCents)}
                      </p>
                    )}
                  </div>
                </div>
                {overLimit && (
                  <p className="rounded-xl bg-amber-100 p-2 text-base font-semibold text-amber-900">
                    ⚠️ Supera su límite de {formatMXN(customer.credit_limit_cents ?? 0)}.
                  </p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setView({ kind: 'statement', customerId: customer.id });
                      setMessage(null);
                    }}
                    className="btn btn-neutral py-3 text-lg"
                  >
                    📄 Estado de cuenta
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPayFor(customer);
                      setPayAmount((balance / 100).toFixed(2));
                      setPayMethod('cash');
                      setError(null);
                    }}
                    className="btn btn-primary py-3 text-lg text-white"
                  >
                    💰 Registrar abono
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {view.kind === 'statement' && (
        <StatementView
          statements={statements}
          customerId={view.customerId}
          productById={productById}
          widthMm={store.ticket_width_mm}
          onBack={() => setView({ kind: 'list' })}
        />
      )}

      {payFor && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="card w-full max-w-md p-6" role="dialog" aria-modal="true">
            <h3 className="title mb-3 text-2xl">Abono de {payFor.name}</h3>
            <div className="mb-3 flex items-center justify-between rounded-2xl bg-slate-100 px-4 py-3">
              <span className="text-lg font-semibold">Saldo</span>
              <span className="text-2xl font-extrabold">
                {formatMXN(statements[payFor.id]?.balance_cents ?? 0)}
              </span>
            </div>
            <label className={label} htmlFor="pay-amount">
              Monto en pesos
            </label>
            <input
              id="pay-amount"
              value={payAmount}
              inputMode="decimal"
              onChange={(event) => setPayAmount(event.target.value.replace(/[^0-9.]/g, ''))}
              className={`${field} mb-3`}
            />
            <div className="mb-3 grid grid-cols-3 gap-2">
              {(['cash', 'card_clip', 'mercadopago_qr'] as const).map((method) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => setPayMethod(method)}
                  className={`btn px-1 py-3 text-base ${
                    payMethod === method ? 'btn-primary text-white' : 'btn-neutral'
                  }`}
                >
                  {PAYMENT_METHOD_LABELS[method]}
                </button>
              ))}
            </div>
            {error && (
              <p className="mb-3 rounded-xl bg-red-100 p-3 text-lg font-semibold text-red-800">
                {error}
              </p>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setPayFor(null)}
                className="btn btn-neutral flex-1 py-4 text-xl"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void registerPayment()}
                className="btn btn-primary flex-1 py-4 text-xl text-white"
              >
                Guardar abono
              </button>
            </div>
          </div>
        </div>
      )}

      {error && !payFor && (
        <p className="rounded-xl bg-red-100 p-3 text-lg font-semibold text-red-800">{error}</p>
      )}
    </section>
  );
}

function formatDateTime(iso: string): string {
  return iso.slice(0, 16).replace('T', ' ');
}

/** Texto listo para copiar o enviar por WhatsApp (F-B04). */
function statementText(statement: CustomerStatement, productById: Map<string, string>): string {
  const lines: string[] = [
    `Estado de cuenta · ${statement.customer.name}`,
    `Debe: ${formatMXN(statement.balance_cents)}`,
  ];
  if (statement.overdue_cents > 0) {
    lines.push(`Más de 30 días: ${formatMXN(statement.overdue_cents)}`);
  }
  lines.push('', 'Fiados:');
  for (const entry of statement.sales) {
    lines.push(
      `#${entry.sale.number} · ${formatDateTime(entry.sale.created_at)} · ${formatMXN(
        entry.sale.total_cents,
      )} (resta ${formatMXN(entry.balance_cents)})`,
    );
    for (const item of entry.items) {
      lines.push(`   • ${productById.get(item.product_id) ?? 'Producto'} × ${item.qty}`);
    }
  }
  if (statement.payments.length > 0) {
    lines.push('', 'Abonos:');
    for (const payment of statement.payments) {
      lines.push(`   ${formatDateTime(payment.created_at)} · ${formatMXN(payment.amount_cents)}`);
    }
  }
  return lines.join('\n');
}

function StatementView({
  statements,
  customerId,
  productById,
  widthMm,
  onBack,
}: {
  statements: Record<string, CustomerStatement>;
  customerId: string;
  productById: Map<string, string>;
  widthMm: number;
  onBack: () => void;
}) {
  const [ticketView, setTicketView] = useState(false);
  const statement = statements[customerId];
  if (!statement) {
    return (
      <div className="card p-4">
        <p className="text-lg text-slate-500">Cargando estado de cuenta…</p>
        <button type="button" onClick={onBack} className="btn btn-neutral mt-3 py-3 text-lg">
          Regresar
        </button>
      </div>
    );
  }

  const text = statementText(statement, productById);

  return (
    <div className="card space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="title text-2xl">{statement.customer.name}</h3>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTicketView((prev) => !prev)}
            className="btn btn-neutral px-4 py-3 text-lg"
          >
            {ticketView ? '📄 Ver lista' : '🧾 Ver ticket'}
          </button>
          {ticketView && (
            <button
              type="button"
              onClick={() =>
                printPlainText(`Estado de cuenta · ${statement.customer.name}`, text, widthMm)
              }
              className="btn btn-primary px-4 py-3 text-lg text-white"
            >
              🖨 Imprimir
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(text);
            }}
            className="btn btn-neutral px-4 py-3 text-lg"
          >
            📋 Copiar
          </button>
          <button type="button" onClick={onBack} className="btn btn-neutral px-4 py-3 text-lg">
            ← Regresar
          </button>
        </div>
      </div>

      {ticketView ? (
        <div className="mx-auto w-full max-w-sm rounded-xl border-2 border-dashed border-slate-400 bg-white p-4 font-mono text-base">
          <pre className="whitespace-pre-wrap">{text}</pre>
        </div>
      ) : (
        <>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-red-50 p-4">
          <p className="text-base font-semibold text-red-800">Debe</p>
          <p className="price text-2xl">{formatMXN(statement.balance_cents)}</p>
        </div>
        <div className="rounded-2xl bg-amber-50 p-4">
          <p className="text-base font-semibold text-amber-800">+30 días</p>
          <p className="price text-2xl">{formatMXN(statement.overdue_cents)}</p>
        </div>
      </div>

      <div>
        <h4 className="mb-2 text-xl font-bold">Fiados</h4>
        {statement.sales.length === 0 ? (
          <p className="text-lg text-slate-500">Sin compras fiadas.</p>
        ) : (
          <ul className="space-y-2">
            {statement.sales.map((entry) => (
              <li key={entry.sale.id} className="rounded-xl bg-slate-50 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-lg font-semibold">Venta #{entry.sale.number}</span>
                  <span className="text-lg">{formatMXN(entry.sale.total_cents)}</span>
                </div>
                <p className="text-base text-slate-600">
                  {formatDateTime(entry.sale.created_at)} · {entry.age_days} día(s) · abonado{' '}
                  {formatMXN(entry.paid_cents)} · resta{' '}
                  <span className="font-semibold">{formatMXN(entry.balance_cents)}</span>
                </p>
                {entry.items.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {entry.items.map((item) => (
                      <li key={item.id} className="text-base text-slate-700">
                        • {productById.get(item.product_id) ?? 'Producto'} × {item.qty}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h4 className="mb-2 text-xl font-bold">Abonos</h4>
        {statement.payments.length === 0 ? (
          <p className="text-lg text-slate-500">Sin abonos registrados.</p>
        ) : (
          <ul className="space-y-2">
            {statement.payments
              .slice()
              .reverse()
              .map((payment) => (
                <li key={payment.id} className="flex items-center justify-between rounded-xl bg-green-50 p-3">
                  <span className="text-lg">
                    {payment.created_at.slice(0, 10)} · {PAYMENT_METHOD_LABELS[payment.method]}
                  </span>
                  <span className="text-lg font-semibold text-green-800">
                    {formatMXN(payment.amount_cents)}
                  </span>
                </li>
              ))}
          </ul>
        )}
      </div>
        </>
      )}
    </div>
  );
}
