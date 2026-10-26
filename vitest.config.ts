import { configDefaults, defineConfig } from 'vitest/config';

/**
 * Config de Vitest separada de la de Vite para excluir los specs de Playwright:
 * `e2e/**` corre con `npm run test:e2e`, no con `npm test`.
 */
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
});
