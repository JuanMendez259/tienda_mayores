import { expect, test, type Page } from '@playwright/test';

/**
 * Lector de código de barras con la cámara en el alta de producto.
 *
 * Chromium recibe una cámara simulada y, para el caso feliz, un
 * `BarcodeDetector` falso: así se prueba el flujo completo sin depender de
 * hardware ni de descargar el decodificador ZXing.
 */
test.use({
  permissions: ['camera'],
  launchOptions: {
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  },
});

async function abrirNuevoProducto(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /Doña María/ }).click();
  for (const digit of ['1', '2', '3', '4']) {
    await page.getByRole('button', { name: digit, exact: true }).click();
  }
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.getByRole('button', { name: /Abrir caja y vender/ }).click();
  await page.getByText('Ticket de Venta').waitFor({ state: 'attached' });
  await page.getByRole('button', { name: /Nuevo/ }).click();
  await expect(page.getByRole('heading', { name: 'Nuevo producto' })).toBeVisible();
}

test.describe('escanear código de barras al dar de alta', () => {
  test('abre la cámara y se puede cancelar sin perder el formulario', async ({ page }) => {
    await abrirNuevoProducto(page);

    await page.getByRole('button', { name: /Escanear/ }).click();
    const modal = page.getByRole('dialog', { name: 'Escanear código de barras' });
    await expect(modal).toBeVisible();
    await expect(modal.getByText(/Apunta al código/)).toBeVisible();

    await modal.getByRole('button', { name: 'Cancelar' }).click();
    await expect(modal).toBeHidden();
    await expect(page.getByLabel('Código de barras (opcional)')).toBeEditable();
  });

  test('escribe el código leído y cierra la ventana', async ({ page }) => {
    await page.addInitScript(() => {
      class FakeBarcodeDetector {
        static async getSupportedFormats() {
          return ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39'];
        }
        async detect() {
          return [{ rawValue: '7501234567890', format: 'ean_13' }];
        }
      }
      Object.defineProperty(window, 'BarcodeDetector', {
        configurable: true,
        value: FakeBarcodeDetector,
      });
    });
    await abrirNuevoProducto(page);

    await page.getByRole('button', { name: /Escanear/ }).click();
    await expect(page.getByRole('dialog', { name: 'Escanear código de barras' })).toBeHidden();
    await expect(page.getByLabel('Código de barras (opcional)')).toHaveValue('7501234567890');
  });

  test('si la cámara falla avisa y deja escribir a mano', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
        configurable: true,
        value: () => Promise.reject(new Error('permiso denegado')),
      });
    });
    await abrirNuevoProducto(page);

    await page.getByRole('button', { name: /Escanear/ }).click();
    const modal = page.getByRole('dialog', { name: 'Escanear código de barras' });
    await expect(modal.getByText(/No se pudo abrir la cámara/)).toBeVisible();

    await modal.getByRole('button', { name: 'Escribir a mano' }).click();
    await expect(modal).toBeHidden();
    await page.getByLabel('Código de barras (opcional)').fill('123456');
    await expect(page.getByLabel('Código de barras (opcional)')).toHaveValue('123456');
  });

  test('sin BarcodeDetector (iPad/Safari) lee con el respaldo ZXing', async ({ page }) => {
    await page.addInitScript(() => {
      // Safari/iPadOS: el lector nativo no existe.
      Object.defineProperty(window, 'BarcodeDetector', { configurable: true, value: undefined });

      // Cámara simulada: un EAN-13 válido dibujado en un canvas.
      const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
      const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
      const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
      const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

      function ean13(base12: string): string {
        const digits = base12.split('').map(Number);
        const sum = digits.reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 1 : 3), 0);
        return base12 + String((10 - (sum % 10)) % 10);
      }

      function bits(code: string): string {
        const digits = code.split('').map(Number);
        const parity = PARITY[digits[0]];
        let out = '101';
        for (let i = 1; i <= 6; i += 1) {
          out += parity[i - 1] === 'L' ? L[digits[i]] : G[digits[i]];
        }
        out += '01010';
        for (let i = 7; i <= 12; i += 1) out += R[digits[i]];
        return out + '101';
      }

      const code = ean13('750123456789');
      const modules = bits(code);
      const scale = 4;
      const quiet = 20;
      const canvas = document.createElement('canvas');
      canvas.width = (modules.length + quiet * 2) * scale;
      canvas.height = 240;
      const context = canvas.getContext('2d')!;

      function draw() {
        context.fillStyle = '#fff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = '#000';
        for (let i = 0; i < modules.length; i += 1) {
          if (modules[i] === '1') context.fillRect((quiet + i) * scale, 20, scale, canvas.height - 40);
        }
      }

      draw();
      window.setInterval(draw, 100);
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
        configurable: true,
        value: async () => canvas.captureStream(30),
      });
    });
    await abrirNuevoProducto(page);

    await page.getByRole('button', { name: /Escanear/ }).click();
    await expect(page.getByLabel('Código de barras (opcional)')).toHaveValue('7501234567893', {
      timeout: 30_000,
    });
  });
});
