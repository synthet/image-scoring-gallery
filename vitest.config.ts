import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    // Parallel forks + jsdom can OOM on constrained Windows hosts; override with VITEST_MAX_WORKERS.
    maxWorkers: Number.parseInt(process.env.VITEST_MAX_WORKERS ?? '1', 10),
    globals: true,
    environment: 'jsdom',
    env: { VITEST: '1' },
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'electron/**/*.{test,spec}.ts', 'server/**/*.{test,spec}.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'json-summary', 'lcov', 'html'],
      reportsDirectory: './coverage',
      reportOnFailure: true,
      include: ['src/**/*.ts', 'src/**/*.tsx', 'electron/**/*.ts', 'server/**/*.ts'],
      exclude: ['**/*.d.ts', '**/*.test.*', '**/*.spec.*'],
      thresholds: {
        branches: 7,
        functions: 9,
        lines: 11,
        statements: 11,
      },
    },
  },
});
