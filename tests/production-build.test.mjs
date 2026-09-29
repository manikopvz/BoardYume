import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, relative, resolve } from 'node:path';
import test from 'node:test';

import { build } from 'vite';

const ROOT = resolve(import.meta.dirname, '..');
const TEST_BASE = '/BoardYume/';

function filesBelow(directory) {
  const files = [];
  const visit = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) visit(path);
      else files.push(path);
    }
  };
  visit(directory);
  return files;
}

test('production build chạy dưới GitHub Pages subdirectory và không thiếu asset tĩnh', { timeout: 60_000 }, async () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'board-yume-build-'));
  const outDir = join(temporaryRoot, 'dist');
  try {
    await build({
      root: ROOT,
      base: TEST_BASE,
      logLevel: 'silent',
      build: { outDir, emptyOutDir: true },
    });

    const indexPath = join(outDir, 'index.html');
    assert.ok(existsSync(indexPath), 'thiếu dist/index.html');
    const outputFiles = filesBelow(outDir);
    assert.ok(outputFiles.some((file) => extname(file) === '.js'), 'bundle không có JavaScript');
    assert.ok(outputFiles.some((file) => extname(file) === '.css'), 'bundle không có CSS');
    assert.ok(existsSync(join(outDir, 'sw.js')), 'service worker không được đóng gói');
    assert.ok(existsSync(join(outDir, 'manifest.webmanifest')), 'web manifest không được đóng gói');

    const textFiles = outputFiles.filter((file) => ['.css', '.html', '.js', '.webmanifest'].includes(extname(file)));
    const localReferences = [];
    for (const file of textFiles) {
      const source = readFileSync(file, 'utf8');
      assert.doesNotMatch(source, /(?:src|href)=["']\/(?!BoardYume\/)/, `${relative(outDir, file)} dùng URL tuyệt đối ngoài base`);
      for (const match of source.matchAll(/["'`](?<path>(?:\/BoardYume\/|\.\/)?(?:assets\/)?[^"'`?#\s]+\.(?:avif|css|jpe?g|js|json|mp3|ogg|png|wav|webmanifest|webp))(?:[?#][^"'`]*)?["'`]/gi)) {
        localReferences.push({ source: file, path: match.groups.path });
      }
    }

    for (const reference of localReferences) {
      const normalized = reference.path
        .replace(TEST_BASE, '')
        .replace(/^\.\//, '');
      const target = join(outDir, normalized);
      assert.ok(existsSync(target) && statSync(target).isFile(), `${relative(outDir, reference.source)} tham chiếu file thiếu: ${reference.path}`);
    }
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
