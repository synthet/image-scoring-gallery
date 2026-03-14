import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    env: { VITEST: '1' },
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'electron/**/*.{test,spec}.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts', 'src/**/*.tsx', 'electron/**/*.ts'],
      exclude: ['**/*.d.ts', '**/*.test.*', '**/*.spec.*'],
    },
  },
});
