import { expect, test, type Page } from '@playwright/test';

/**
 * Aceptación de la densidad en tablet horizontal (iPad 1024 × 768 CSS).
 *
 * El catálogo y el ticket conviven en dos columnas: la primera fila de
 * productos debe verse completa, los filtros no pueden pasar de dos filas y
 * la letra, el precio y los objetivos táctiles conservan su mínimo.
 */
test.use({ viewport: { width: 1024, height: 768 } });

async function entrarAVenta(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /Doña María/ }).click();
  for (const digit of ['1', '2', '3', '4']) {
    await page.getByRole('button', { name: digit, exact: true }).click();
  }
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.getByRole('button', { name: /Abrir caja y vender/ }).click();
  await expect(page.getByText('Ticket de Venta')).toBeAttached();
}

test.describe('densidad tablet', () => {
  test('catálogo y ticket conviven sin desbordes y con la primera fila visible', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'tablet', 'solo aplica a la tablet');
    await entrarAVenta(page);

    // Sin scroll horizontal del documento: cada panel scrollea por su cuenta.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, 'sin scroll horizontal').toBeLessThanOrEqual(0);

    // Los dos paneles están a la vista al mismo tiempo.
    await expect(page.getByRole('region', { name: 'Catálogo de productos' })).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Ticket de venta' })).toBeVisible();

    // Los filtros caben en dos filas (antes eran tres, con la marca sola).
    const chips = page.locator('[role="group"][aria-label="Filtros y categorías"]');
    const chipsBox = await chips.boundingBox();
    expect(chipsBox!.height, 'filtros en dos filas como máximo').toBeLessThanOrEqual(140);

    // La primera fila de tarjetas entra completa en el primer pantallazo.
    const card = page.locator('article').first();
    const cardBox = await card.boundingBox();
    const viewport = page.viewportSize()!;
    expect(cardBox!.y + cardBox!.height, 'primera fila de tarjetas visible').toBeLessThanOrEqual(
      viewport.height,
    );

    // El buscador no se come media pantalla.
    const search = await page.getByRole('textbox', { name: 'Buscar producto' }).boundingBox();
    expect(search!.height, 'buscador compacto').toBeLessThanOrEqual(68);
  });

  test('respeta letra >= 18 px, precio >= 24 px y toques >= 56 px', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'tablet', 'solo aplica a la tablet');
    await entrarAVenta(page);

    const medidas = await page.evaluate(() => {
      const visible = [...document.querySelectorAll('button')].filter((b) => {
        const r = b.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.top < window.innerHeight;
      });
      const fontSize = (el: Element | null) =>
        el ? parseFloat(getComputedStyle(el).fontSize) : 0;
      return {
        body: fontSize(document.body),
        nombre: fontSize(document.querySelector('article h3')),
        precio: fontSize(document.querySelector('article .text-2xl')),
        chicos: visible
          .filter((b) => {
            const r = b.getBoundingClientRect();
            return r.width < 56 || r.height < 56;
          })
          .map((b) => (b.textContent ?? '').trim().slice(0, 24)),
      };
    });

    expect(medidas.body).toBeGreaterThanOrEqual(18);
    expect(medidas.nombre).toBeGreaterThanOrEqual(18);
    expect(medidas.precio).toBeGreaterThanOrEqual(24);
    expect(medidas.chicos, 'ningún botón menor a 56x56').toEqual([]);
  });

  test('agregar producto y cobrar sin cambiar de pantalla', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'tablet', 'solo aplica a la tablet');
    await entrarAVenta(page);

    // Los productos por pieza agregan directo; los de peso abren el modal.
    await page
      .locator('article button[aria-label*="por pieza"]:not([aria-label*="favoritos"])')
      .first()
      .click();

    const ticket = page.getByRole('complementary', { name: 'Ticket de venta' });
    await expect(ticket.getByText('1 producto')).toBeVisible();
    const cobrar = ticket.getByRole('button', { name: /Cobrar/ });
    await expect(cobrar).toBeVisible();

    // Cobrar se ve sin desplazar el panel del ticket.
    const cobrarBox = await cobrar.boundingBox();
    const viewport = page.viewportSize()!;
    expect(cobrarBox!.y + cobrarBox!.height, 'Cobrar visible sin scroll').toBeLessThanOrEqual(
      viewport.height,
    );
  });
});
