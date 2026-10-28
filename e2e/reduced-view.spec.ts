import { expect, test, type Page } from '@playwright/test';

/**
 * Núcleo de la vista reducida (F-113): buscador, detalle grande del producto
 * y catálogo secundario. La preferencia vive en localStorage por tienda y no
 * debe vaciar el ticket al cambiar de modo.
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

test.describe('vista reducida', () => {
  test('activar la vista reducida muestra la búsqueda y la conserva al recargar', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'tablet', 'solo aplica a la tablet');
    await entrarAVenta(page);
    await page.getByRole('button', { name: /Vista reducida/ }).click();

    await expect(page.getByRole('heading', { name: '¿Qué vas a vender?' })).toBeVisible();
    await expect(page.getByLabel('Buscar producto por nombre o código')).toBeVisible();
    await expect(page.getByRole('button', { name: /Escanear código/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Ver catálogo/ })).toBeVisible();
    await expect(page.locator('article')).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('pos-abarrotes:vista:store-1'))).toBe(
      'reducida',
    );

    await page.reload();
    await entrarAVenta(page);
    await expect(page.getByRole('heading', { name: '¿Qué vas a vender?' })).toBeVisible();
  });

  test('buscar, abrir el detalle, subir a 2 y agregar', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'tablet', 'solo aplica a la tablet');
    await entrarAVenta(page);
    await page.getByRole('button', { name: /Vista reducida/ }).click();

    const search = page.getByLabel('Buscar producto por nombre o código');
    await search.fill('Arroz');
    await page.getByRole('button', { name: /Arroz 1 kg/ }).click();

    await expect(page.getByRole('heading', { name: 'Arroz 1 kg' })).toBeVisible();
    await expect(page.getByText('por pieza')).toBeVisible();

    await page.getByRole('button', { name: 'Agregar una pieza' }).click();
    const qty = page.getByRole('group', { name: 'Cantidad a agregar' });
    await expect(qty).toContainText('2');

    await page.getByRole('button', { name: /Agregar 2 al ticket/ }).click();
    await expect(page.getByRole('heading', { name: '¿Qué vas a vender?' })).toBeVisible();

    const ticket = page.getByRole('complementary', { name: 'Ticket de venta' });
    await expect(ticket.getByText('2 productos')).toBeVisible();
    await expect(ticket.getByText('Arroz 1 kg')).toBeVisible();
    await expect(ticket.getByText('$64.00').first()).toBeVisible();

    // En tablet el buscador recupera el foco para la siguiente venta.
    await expect(search).toBeFocused();
  });

  test('ver catálogo abre el detalle sin agregar', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'tablet', 'solo aplica a la tablet');
    await entrarAVenta(page);
    await page.getByRole('button', { name: /Vista reducida/ }).click();
    await page.getByRole('button', { name: /Ver catálogo/ }).click();

    await expect(page.getByRole('textbox', { name: 'Buscar producto' })).toBeVisible();
    await page.getByRole('button', { name: /Ver detalle de Lechuga/ }).click();

    await expect(page.getByRole('heading', { name: 'Lechuga' })).toBeVisible();
    await expect(
      page.getByRole('complementary', { name: 'Ticket de venta' }).getByText('0 productos'),
    ).toBeVisible();
  });

  test('volver a vista normal conserva el agregado de un toque', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'tablet', 'solo aplica a la tablet');
    await entrarAVenta(page);
    await page.getByRole('button', { name: /Vista reducida/ }).click();
    await page.getByRole('button', { name: /Vista normal/ }).click();

    await expect(page.locator('article').first()).toBeVisible();
    await page
      .locator('article button[aria-label*="por pieza"]:not([aria-label*="favoritos"])')
      .first()
      .click();
    await expect(
      page.getByRole('complementary', { name: 'Ticket de venta' }).getByText('1 producto'),
    ).toBeVisible();
  });
});
