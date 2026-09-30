import { resolve } from 'node:path';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Az SWC plugin a tsconfig.json alapján (experimentalDecorators +
  // emitDecoratorMetadata) állítja elő a NestJS DI-hoz szükséges
  // dekorátor-metaadatot a tesztek transzpilálásakor.
  plugins: [
    swc.vite({
      tsconfigFile: resolve(__dirname, 'tsconfig.json'),
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
    root: __dirname,
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    testTimeout: 20000,
  },
});
