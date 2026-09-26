// Builds the extension into dist/, ready for chrome://extensions → "Load unpacked".
// Usage: node build.mjs [--watch]
import { build, context } from 'esbuild';
import { copyFile, mkdir, rm } from 'node:fs/promises';

const watch = process.argv.includes('--watch');
const outdir = 'dist';

const common = {
  bundle: true,
  target: 'chrome111',
  outdir,
  logLevel: 'info',
  // Readable output: Chrome Web Store reviewers read it, and so might you.
  minify: false,
  legalComments: 'none',
};

const configs = [
  // Scripts that run in pages and the popup: plain scripts.
  { ...common, entryPoints: { page: 'src/page.ts', content: 'src/content.ts', popup: 'src/popup.ts' }, format: 'iife' },
  // The service worker is declared as a module in the manifest.
  { ...common, entryPoints: { background: 'src/background.ts' }, format: 'esm' },
];

async function copyStatic() {
  for (const file of ['manifest.json', 'popup.html', 'popup.css']) await copyFile(`src/${file}`, `${outdir}/${file}`);
}

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

if (watch) {
  for (const config of configs) await (await context(config)).watch();
  await copyStatic();
  console.log('Watching for changes. Reload the extension in chrome://extensions after edits.');
} else {
  await Promise.all(configs.map((config) => build(config)));
  await copyStatic();
}
