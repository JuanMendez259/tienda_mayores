import { defineConfig, devices } from '@playwright/test';

/**
 * Pruebas E2E con Playwright (Chromium).
 *
 * El servidor arranca en modo LOCAL: vacía `VITE_SUPABASE_*` para que la app
 * use el repositorio en memoria (datos demo, PIN 1234). Así las pruebas nunca
 * tocan el backend real de Supabase ni las ventas del piloto.
 *
 * Con `E2E_REUSE=1` se reutiliza un servidor ya corriendo (útil en desarrollo,
 * pero solo si esa sesión corre en modo local).
 */
const reuse = process.env.E2E_REUSE === '1';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Escritorio: tablet horizontal, el flujo principal del mostrador.
    {
      name: 'tablet',
      use: { ...devices['iPad Pro landscape'] },
    },
    // Móvil: vigila que la UI siga siendo usable en pantallas chicas.
    {
      name: 'movil',
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: reuse,
    timeout: 60_000,
    env: {
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_ANON_KEY: '',
    },
  },
});
