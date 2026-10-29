import { expect, test, type Page } from '@playwright/test';

/**
 * Núcleo de la vista reducida (F-113): buscador, detalle grande del producto
 * y catálogo secundario. La preferencia vive en localStorage por tienda y no
 * debe vaciar el ticket al cambiar de modo.
 */

// La cámara simulada solo se abre cuando la prueba toca "Escanear código".
test.use({
  permissions: ['camera'],
  launchOptions: {
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  },
});

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

/** Da de alta un producto por pieza desde el formulario normal de "Nuevo". */
async function crearProductoPorPieza(
  page: Page,
  { name, barcode }: { name: string; barcode: string },
) {
  await page.getByRole('button', { name: /Nuevo/ }).click();
  await expect(page.getByRole('heading', { name: 'Nuevo producto' })).toBeVisible();
  await page.getByLabel('Nombre', { exact: true }).fill(name);
  await page.getByLabel('Precio por pieza').fill('10.00');
  await page.getByLabel('Piezas en bodega').fill('10');
  await page.getByLabel('Código de barras (opcional)').fill(barcode);
  await page.getByRole('button', { name: 'Guardar producto' }).click();
  await expect(page.getByRole('heading', { name: 'Nuevo producto' })).toBeHidden();
  await expect(page.getByRole('article').filter({ hasText: name })).toBeVisible();
}

async function activarVistaReducida(page: Page) {
  await page.getByRole('button', { name: /Vista reducida/ }).click();
  await expect(page.getByRole('heading', { name: '¿Qué vas a vender?' })).toBeVisible();
}

/** Instala un `BarcodeDetector` falso que siempre devuelve el mismo código. */
async function simularCamaraConCodigo(page: Page, code: string) {
  await page.addInitScript((detectedCode) => {
    class FakeBarcodeDetector {
      static async getSupportedFormats() {
        return ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39'];
      }
      async detect() {
        return [{ rawValue: detectedCode, format: 'ean_13' }];
      }
    }
    Object.defineProperty(window, 'BarcodeDetector', {
      configurable: true,
      value: FakeBarcodeDetector,
    });
  }, code);
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

  test('el escaneo USB limpia la consulta y abre el detalle', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'tablet', 'solo aplica a la tablet');
    const code = '7501234567890';
    await entrarAVenta(page);
    await crearProductoPorPieza(page, { name: 'Galletas USB', barcode: code });
    await activarVistaReducida(page);

    const search = page.getByLabel('Buscar producto por nombre o código');
    await search.focus();
    // El reloj fijo evita que la carga del runner se interprete como pausa
    // humana: un lector USB real teclea sin huecos y el detector corta a 50 ms.
    await page.clock.setFixedTime(Date.now());
    await page.keyboard.type(code, { delay: 10 });
    await page.keyboard.press('Enter');

    await expect(page.getByRole('heading', { name: 'Galletas USB' })).toBeVisible();
    await expect(page.getByText('Escaneado')).toBeVisible();

    await page.getByRole('button', { name: 'Volver a buscar' }).click();
    await expect(search).toHaveValue('');
  });

  test('el escaneo con cámara de un código conocido abre el detalle', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'tablet', 'solo aplica a la tablet');
    const code = '7501234567890';
    await simularCamaraConCodigo(page, code);
    await entrarAVenta(page);
    await crearProductoPorPieza(page, { name: 'Galletas cámara', barcode: code });
    await activarVistaReducida(page);

    await page.getByRole('button', { name: /Escanear código/ }).click();

    await expect(page.getByRole('heading', { name: 'Galletas cámara' })).toBeVisible();
    await expect(page.getByText('Escaneado')).toBeVisible();
  });

  test('el escaneo con cámara de un código desconocido abre el alta', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'tablet', 'solo aplica a la tablet');
    const code = '9999999999999';
    await simularCamaraConCodigo(page, code);
    await entrarAVenta(page);
    await activarVistaReducida(page);

    await page.getByRole('button', { name: /Escanear código/ }).click();

    await expect(page.getByRole('heading', { name: 'Nuevo producto' })).toBeVisible();
    await expect(page.getByLabel('Código de barras (opcional)')).toHaveValue(code);
  });

  test('pesar y agregar un producto por peso vuelve al buscador con el ticket', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'tablet', 'solo aplica a la tablet');
    await entrarAVenta(page);
    await activarVistaReducida(page);

    const search = page.getByLabel('Buscar producto por nombre o código');
    await search.fill('Jitomate');
    await page.getByRole('button', { name: /Jitomate/ }).click();

    await expect(page.getByRole('heading', { name: 'Jitomate' })).toBeVisible();
    await expect(page.getByText(/por kilo|por kg/)).toBeVisible();
    await expect(page.getByRole('group', { name: 'Cantidad a agregar' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Pesar y agregar' }).click();
    const dialogo = page.getByRole('dialog');
    for (const digit of ['5', '0', '0']) {
      await dialogo.getByRole('button', { name: digit, exact: true }).click();
    }
    await expect(dialogo.getByText('0.500 kg')).toBeVisible();
    await dialogo.getByRole('button', { name: 'Agregar $14.45' }).click();

    await expect(page.getByRole('heading', { name: '¿Qué vas a vender?' })).toBeVisible();
    const ticket = page.getByRole('complementary', { name: 'Ticket de venta' });
    await expect(ticket.getByText('0.500 kg')).toBeVisible();
    await expect(ticket.getByText('$14.45').first()).toBeVisible();
  });

  test('en teléfono no se enfoca el buscador y el ticket se alcanza con botones grandes', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'movil', 'solo aplica al teléfono');
    await entrarAVenta(page);
    await activarVistaReducida(page);

    const search = page.getByLabel('Buscar producto por nombre o código');
    await expect(search).toBeVisible();
    await expect(search).not.toBeFocused();
    await expect(page.getByRole('button', { name: /Escanear código/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Ver catálogo/ })).toBeVisible();

    await search.fill('Arroz');
    await page.getByRole('button', { name: /Arroz 1 kg/ }).click();
    await expect(page.getByRole('heading', { name: 'Arroz 1 kg' })).toBeVisible();

    const barra = page.getByRole('navigation', { name: 'Resumen de venta' });
    const verTicket = barra.getByRole('button', { name: /Ver ticket/ });
    await expect(verTicket).toBeVisible();
    await verTicket.click();

    await expect(page.getByRole('button', { name: 'Volver a la venta' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Cobrar/ })).toBeVisible();

    await page.getByRole('button', { name: 'Volver a la venta' }).click();
    await expect(page.getByRole('heading', { name: 'Arroz 1 kg' })).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, 'sin scroll horizontal').toBeLessThanOrEqual(0);

    const chicos = await page.evaluate(() =>
      [...document.querySelectorAll('button')]
        .filter((button) => {
          const rect = button.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight;
        })
        .filter((button) => {
          const rect = button.getBoundingClientRect();
          return rect.width < 56 || rect.height < 56;
        })
        .map((button) => (button.textContent ?? '').trim().slice(0, 24)),
    );
    expect(chicos, 'ningún botón visible menor a 56x56').toEqual([]);

    const precio = page.locator('span.text-4xl').first();
    await expect(precio).toBeVisible();
    const precioPx = await precio.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).fontSize),
    );
    expect(precioPx, 'precio del detalle >= 24 px').toBeGreaterThanOrEqual(24);
  });
});
