import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

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

function precacheManifestPlugin(): Plugin {
  const publicRoot = resolve(process.cwd(), 'public');
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
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  server: {
    host: true,
  },
  test: {
    environment: 'node',
    globals: true,
    restoreMocks: true,
    clearMocks: true,
    unstubGlobals: true,
  },
});
