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
import { DiscountModal } from './DiscountModal';
import { ProductGrid } from './ProductGrid';
import { AdminScreen } from './admin/AdminScreen';
import { CapturaScreen } from './CapturaScreen';

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

  it('muestra el bloqueo de PIN en la tarjeta del usuario', () => {
    const lockedUntil = new Date(Date.now() + 4 * 60_000).toISOString();
    const html = renderToStaticMarkup(
      <LoginScreen
        store={seedStore}
        users={[{ ...seedUsers[0], locked_until: lockedUntil }]}
        onLogin={noop}
      />,
    );
    expect(html).toContain('Bloqueado');
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
        users={seedUsers}
        cashSession={session}
        products={seedProducts}
        categories={seedCategories}
        promotionsKey={0}
        onRefreshProducts={noop}
        onOpenCash={noop}
        onOpenAdmin={noop}
        onLogout={noop}
      />,
    );
    expect(html).toContain('Jitomate');
    expect(html).toContain('Cobrar');
    // La cabecera reduce seis acciones a tres primarias y un panel "Más".
    expect(html).toContain('En espera');
    expect(html).toContain('Más');
    expect(html).not.toContain('Salir del turno');
  });

  it('marca agotado y stock bajo en la cuadrícula', () => {
    const soldOut = renderToStaticMarkup(
      <ProductGrid
        products={[{ ...seedProducts[0], stock_qty: 0, track_stock: true }]}
        categories={seedCategories}
        onPick={noop}
        onNewProduct={noop}
      />,
    );
    expect(soldOut).toContain('Agotado');
    expect(soldOut).toContain('agotado');

    const low = renderToStaticMarkup(
      <ProductGrid
        products={[
          {
            ...seedProducts[0],
            brand: 'La Costeña',
            stock_qty: 500,
            low_stock_threshold: 1000,
          },
        ]}
        categories={seedCategories}
        onPick={noop}
        onNewProduct={noop}
      />,
    );
    expect(low).toContain('Quedan 0.500 kg');
    expect(low).toContain('Marca:');
  });

  it('marca favoritos con estrella y filtro propio', () => {
    const html = renderToStaticMarkup(
      <ProductGrid
        products={seedProducts.slice(0, 2)}
        categories={seedCategories}
        favorites={[seedProducts[0].id]}
        onToggleFavorite={noop}
        onPick={noop}
        onNewProduct={noop}
      />,
    );
    expect(html).toContain('Favoritos');
    expect(html).toContain('★');
    expect(html).toContain('Quitar Jitomate de favoritos');
    expect(html).toContain('Agregar Papa a favoritos');
  });

  it('renderiza los modales de cobro, peso, ticket, caja y producto', () => {
    const payment = renderToStaticMarkup(
      <PaymentModal totalCents={10013} onCancel={noop} onConfirm={noop} />,
    );
    expect(payment).toContain('Cobrar');
    expect(payment).toContain('Falta');
    expect(payment).not.toContain('Cambio');
    expect(payment).toContain('Cobrar exacto');
    expect(
      renderToStaticMarkup(<PaymentModal totalCents={0} onCancel={noop} onConfirm={noop} />),
    ).toContain('Cobrar sin pago');
    const weight = renderToStaticMarkup(
      <WeightModal product={seedProducts[0]} onCancel={noop} onConfirm={noop} />,
    );
    expect(weight).toContain(seedProducts[0].name);
    expect(weight).toContain('Tope por renglón: 50 kg');
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
          onRepeatSale={noop}
        />,
      ),
    ).toContain('Ticket #1');
    expect(
      renderToStaticMarkup(
        <TicketModal
          open
          store={seedStore}
          data={{
            number: 2,
            dateIso: '2026-01-01T10:00:00Z',
            lines: [{ name: 'Arroz 1 kg', detail: '2 × $32.00', importeCents: 6400 }],
            subtotalCents: 6400,
            totalCents: 6400,
            receivedCents: 6400,
            changeCents: 0,
          }}
          onNewSale={noop}
          onRepeatSale={noop}
        />,
      ),
    ).toContain('Repetir venta');
    expect(
      renderToStaticMarkup(<CashPanel session={session} onClose={noop} onClosed={noop} />),
    ).toContain('Contar el efectivo');
    expect(
      renderToStaticMarkup(
        <ProductFormModal
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

  it('renderiza la administración con pestañas (Fase 2)', () => {
    const html = renderToStaticMarkup(
      <AdminScreen
        store={seedStore}
        user={seedUsers.find((u) => u.role === 'owner') ?? seedUsers[0]}
        users={seedUsers}
        products={seedProducts}
        categories={seedCategories}
        cashSessionId={null}
        onClose={noop}
        onRefreshProducts={noop}
        onStoreSaved={noop}
      />,
    );
    expect(html).toContain('Administración');
    expect(html).toContain('Configuración');
    expect(html).toContain('Proveedores');
  });

  it('renderiza el modal de descuento', () => {
    const html = renderToStaticMarkup(
      <DiscountModal
        cart={[]}
        orderDiscountCents={0}
        onApplyLine={noop}
        onApplyOrder={noop}
        onClose={noop}
      />,
    );
    expect(html).toContain('Aplicar descuento');
  });

  it('renderiza la captura móvil sin conexión al backend', () => {
    const html = renderToStaticMarkup(<CapturaScreen />);
    expect(html).toContain('Alta rápida');
  });
});
