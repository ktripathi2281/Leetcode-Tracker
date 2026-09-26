import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  platform: 'node',
  format: 'esm',
  // The shared package ships TypeScript source, so bundle it into the server output.
  deps: { alwaysBundle: ['@lct/shared'] },
});
