import { expect, test } from '@playwright/test';

/**
 * Humo E2E: la tienda carga, se ve la selección de usuario y el PIN
 * de demostración (1234) deja entrar a la pantalla de venta.
 */
test.describe('login de demostración', () => {
  test('muestra la tienda y permite entrar con el PIN', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Abarrotes La Esquina' })).toBeVisible();
    await expect(page.getByText('Selecciona tu nombre')).toBeVisible();

    await page.getByRole('button', { name: /Doña María/ }).click();
    await expect(
      page.getByRole('heading', { name: 'Escribe tu PIN', level: 2 }),
    ).toBeVisible();

    await page.getByRole('button', { name: '1', exact: true }).click();
    await page.getByRole('button', { name: '2', exact: true }).click();
    await page.getByRole('button', { name: '3', exact: true }).click();
    await page.getByRole('button', { name: '4', exact: true }).click();
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();

    // El siguiente paso del flujo es abrir la caja con el fondo del turno.
    await expect(page.getByRole('heading', { name: 'Abrir caja', level: 1 })).toBeVisible();
    await page.getByRole('button', { name: /Abrir caja y vender/ }).click();

    // En móvil (< 768 px) el ticket empieza oculto: se abre con la barra
    // inferior "Ver carrito" (en tablet ambas columnas ya están visibles).
    const verCarrito = page.getByRole('button', { name: /Ver carrito/i });
    if (await verCarrito.isVisible()) {
      await verCarrito.click();
    }
    await expect(page.getByText('Ticket de Venta')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Más', exact: true })).toBeVisible();
  });

  test('el PIN incorrecto cuenta los intentos restantes', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Doña María/ }).click();
    for (const digit of ['9', '9', '9', '9']) {
      await page.getByRole('button', { name: digit, exact: true }).click();
    }
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page.getByText(/Te quedan 4 intentos antes del bloqueo/)).toBeVisible();
  });
});
