import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/__tests__/**/*.ts'],
    exclude: ['dist', 'node_modules'],
    coverage: {
      reporter: ['text', 'html'],
      include: ['src/utils/**', 'src/services/**'],
    },
  },
});
