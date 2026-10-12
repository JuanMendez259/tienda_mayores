import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { CashSession } from '../types/database';
import { seedCategories, seedProducts, seedStore, seedUsers } from '../data/seed';
import { LoginScreen } from './LoginScreen';
import { OpenCashScreen } from './OpenCashScreen';
import { SaleScreen } from './SaleScreen';
import { PaymentModal } from './PaymentModal';
import { WeightModal } from './WeightModal';
import { TicketModal } from './TicketModal';
import { CashPanel } from './CashPanel';
import { ConfirmDialog } from './ConfirmDialog';
import { ProductFormModal } from './ProductFormModal';

const noop = () => {};

const session: CashSession = {
  id: 'cash-1',
  store_id: seedStore.id,
  user_id: 'user-maria',
  opened_at: '2026-01-01T10:00:00Z',
  closed_at: null,
  opening_cents: 50000,
  expected_cents: null,
  counted_cents: null,
  difference_cents: null,
};

describe('render de pantallas (smoke)', () => {
  it('renderiza el login con usuarios por foto', () => {
    const html = renderToStaticMarkup(
      <LoginScreen store={seedStore} users={seedUsers} onLogin={noop} />,
    );
    expect(html).toContain('Doña María');
    expect(html).toContain(seedStore.name);
  });

  it('renderiza la apertura de caja', () => {
    const html = renderToStaticMarkup(
      <OpenCashScreen store={seedStore} user={seedUsers[0]} onOpened={noop} />,
    );
    expect(html).toContain('Abrir caja');
  });

  it('renderiza la pantalla de venta con productos', () => {
    const html = renderToStaticMarkup(
      <SaleScreen
        store={seedStore}
        user={seedUsers[0]}
        cashSession={session}
        products={seedProducts}
        categories={seedCategories}
        onRefreshProducts={noop}
        onOpenCash={noop}
        onLogout={noop}
      />,
    );
    expect(html).toContain('Jitomate');
    expect(html).toContain('Cobrar');
  });

  it('renderiza los modales de cobro, peso, ticket, caja y producto', () => {
    expect(
      renderToStaticMarkup(<PaymentModal totalCents={10013} onCancel={noop} onConfirm={noop} />),
    ).toContain('Cobrar en efectivo');
    expect(
      renderToStaticMarkup(
        <WeightModal product={seedProducts[0]} onCancel={noop} onConfirm={noop} />,
      ),
    ).toContain(seedProducts[0].name);
    expect(
      renderToStaticMarkup(
        <TicketModal
          open
          store={seedStore}
          data={{
            number: 1,
            dateIso: '2026-01-01T10:00:00Z',
            lines: [{ name: 'Arroz 1 kg', detail: '2 × $32.00', importeCents: 6400 }],
            subtotalCents: 6400,
            totalCents: 6400,
            receivedCents: 10000,
            changeCents: 3600,
          }}
          onNewSale={noop}
        />,
      ),
    ).toContain('Ticket #1');
    expect(
      renderToStaticMarkup(<CashPanel session={session} onClose={noop} onClosed={noop} />),
    ).toContain('Contar el efectivo');
    expect(
      renderToStaticMarkup(
        <ProductFormModal
          open
          categories={seedCategories}
          storeId={seedStore.id}
          userId="user-maria"
          onClose={noop}
          onSaved={noop}
        />,
      ),
    ).toContain('Nuevo producto');
    expect(
      renderToStaticMarkup(
        <ConfirmDialog open title="¿Cancelar?" onConfirm={noop} onCancel={noop} />,
      ),
    ).toContain('¿Cancelar?');
  });
});
