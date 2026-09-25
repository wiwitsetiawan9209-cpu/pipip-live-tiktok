import { build } from 'esbuild';
await build({entryPoints:['apps/desktop/src/main/index.ts'],outfile:'build-electron/main.mjs',bundle:true,platform:'node',format:'esm',packages:'external',external:['electron','better-sqlite3'],sourcemap:true});
await build({entryPoints:['apps/desktop/src/preload/index.ts'],outfile:'build-electron/preload.cjs',bundle:true,platform:'node',format:'cjs',packages:'external',external:['electron'],sourcemap:true});
