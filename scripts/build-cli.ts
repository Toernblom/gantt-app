#!/usr/bin/env tsx
/**
 * Bundle gantt.ts into a single gantt-cli.js for distribution with Tauri.
 * Output goes to src-tauri/resources/gantt-cli.js.
 */

import * as esbuild from 'esbuild';
import * as path from 'node:path';

const outfile = path.resolve(import.meta.dirname, '..', 'src-tauri', 'resources', 'gantt-cli.cjs');

await esbuild.build({
  entryPoints: [path.resolve(import.meta.dirname, 'gantt.ts')],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  outfile,
  banner: { js: '#!/usr/bin/env node' },
  minify: false, // keep readable for debugging
});

console.log(`Built ${outfile}`);
