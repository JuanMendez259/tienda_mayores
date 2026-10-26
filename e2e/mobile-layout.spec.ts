import { expect, test, type Page } from '@playwright/test';

/**
 * Aceptación de la densidad móvil: el catálogo debe verse sin ahogarse en
 * cabecera, avisos y chips, manteniendo letra >= 18 px y toques >= 56 px.
 */
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

test.describe('densidad móvil', () => {
  test('el catálogo se ve sin desbordes y con la primera tarjeta completa', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'movil', 'solo aplica al teléfono');
    await entrarAVenta(page);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, 'sin scroll horizontal').toBeLessThanOrEqual(0);

    // Los chips caben en dos filas como máximo (hoy eran 5 filas / 351 px).
    const chips = page.getByRole('button', { name: /Todo/ }).first().locator('..');
    const chipsBox = await chips.boundingBox();
    expect(chipsBox!.height, 'chips en dos filas como máximo').toBeLessThanOrEqual(140);

    // Al menos una tarjeta completa dentro del primer pantallazo.
    const card = page.locator('article').first();
    const cardBox = await card.boundingBox();
    const viewport = page.viewportSize()!;
    expect(cardBox!.y + cardBox!.height, 'primera tarjeta visible').toBeLessThanOrEqual(
      viewport.height,
    );

    // La barra inferior muestra el total y lleva al carrito.
    const barra = page.getByRole('navigation', { name: 'Resumen de venta' });
    await expect(barra).toBeVisible();
    await expect(barra.getByText('$0.00')).toBeVisible();
    await expect(barra.getByRole('button', { name: /Ver carrito/ })).toBeVisible();
  });

  test('respeta letra >= 18 px, precio >= 24 px y toques >= 56 px', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'movil', 'solo aplica al teléfono');
    await entrarAVenta(page);

    const medidas = await page.evaluate(() => {
      const visible = [...document.querySelectorAll('button')].filter((b) => {
        const r = b.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.top < window.innerHeight;
      });
      return {
        body: parseFloat(getComputedStyle(document.body).fontSize),
        nombre: parseFloat(
          getComputedStyle(document.querySelector('article h3')!).fontSize,
        ),
        precio: parseFloat(
          getComputedStyle(document.querySelector('article .text-2xl')!).fontSize,
        ),
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

  test('agregar producto, ver carrito y volver al catálogo', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'movil', 'solo aplica al teléfono');
    await entrarAVenta(page);

    // Un producto por pieza agrega directo; los de peso abren el modal de medida.
    await page
      .locator('article button[aria-label*="por pieza"]:not([aria-label*="favoritos"])')
      .first()
      .click();
    const barra = page.getByRole('navigation', { name: 'Resumen de venta' });
    await expect(barra.getByText('1 producto')).toBeVisible();
    await barra.getByRole('button', { name: /Ver carrito/ }).click();

    await expect(page.getByRole('button', { name: 'Volver al catálogo' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Cobrar/ })).toBeVisible();

    await page.getByRole('button', { name: 'Volver al catálogo' }).click();
    await expect(page.locator('article').first()).toBeVisible();
  });
});
