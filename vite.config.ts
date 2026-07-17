import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const publicRoot = resolve(process.cwd(), 'public');
const fighterAssetPattern = /^assets\/fighters\/(?:rafa-mare|guto-barba)\/[^/]+\.png$/;

function listPublicFiles(root: string): string[] {
  if (!existsSync(root)) return [];

  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory)) {
      const absolute = join(directory, entry);
      if (statSync(absolute).isDirectory()) {
        visit(absolute);
        continue;
      }
      const name = relative(root, absolute).split(sep).join('/');
      if (!['service-worker.js', 'precache-manifest.js'].includes(name) && !name.endsWith('.gitkeep')) {
        files.push(name);
      }
    }
  };
  visit(root);
  return files;
}

function contentRevision(root: string, files: readonly string[]): string {
  const hash = createHash('sha256');
  for (const file of [...files].sort()) {
    hash.update(file);
    const absolute = join(root, file);
    if (existsSync(absolute)) hash.update(readFileSync(absolute));
  }
  return hash.digest('hex').slice(0, 12);
}

// Faz parte do bundle e muda sempre que um PNG de Rafa/Guto muda. Assim o
// bundle novo nunca pede a mesma URL que um service worker antigo tem em cache.
const fighterAssetRevision = contentRevision(
  publicRoot,
  listPublicFiles(publicRoot).filter((file) => fighterAssetPattern.test(file)),
);

function precacheManifestPlugin(): Plugin {
  return {
    name: 'rua-de-aco-precache',
    apply: 'build',
    generateBundle(_options, bundle) {
      const bundleFiles = Object.values(bundle)
        .map((item) => item.fileName)
        .filter((fileName) => !fileName.endsWith('.map'));
      const publicFiles = listPublicFiles(publicRoot);
      const files = [...new Set(['index.html', ...bundleFiles, ...publicFiles])].sort();
      const hash = createHash('sha256');
      for (const item of Object.values(bundle)) {
        hash.update(item.fileName);
        hash.update(item.type === 'chunk' ? item.code : String(item.source));
      }
      for (const file of publicFiles) {
        const publicPath = join(publicRoot, file);
        hash.update(file);
        if (existsSync(publicPath)) hash.update(readFileSync(publicPath));
      }
      const revision = hash.digest('hex').slice(0, 12);
      const source = 'self.__RUA_DE_ACO_PRECACHE__=' + JSON.stringify({ revision, files }) + ';';
      this.emitFile({ type: 'asset', fileName: 'precache-manifest.js', source });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [precacheManifestPlugin()],
  define: {
    __FIGHTER_ASSET_REVISION__: JSON.stringify(fighterAssetRevision),
  },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  server: {
    host: true,
  },
  test: {
    environment: 'node',
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    globals: true,
    restoreMocks: true,
    clearMocks: true,
    unstubGlobals: true,
  },
});
