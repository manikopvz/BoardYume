#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(import.meta.dirname, '..');
const DIST = join(ROOT, 'dist');
const SKIP_DIRS = new Set(['.git', 'node_modules', '.vite', 'coverage', 'dist']);
const CODE_EXTENSIONS = new Set(['.css', '.html', '.js', '.json', '.jsx', '.mjs', '.ts', '.tsx', '.webmanifest']);
const IMAGE_EXTENSIONS = new Set(['.avif', '.jpeg', '.jpg', '.png', '.webp']);
const AUDIO_EXTENSIONS = new Set(['.mp3', '.ogg', '.wav']);
const ASSET_EXTENSIONS = new Set([...IMAGE_EXTENSIONS, ...AUDIO_EXTENSIONS]);
const FORBIDDEN_DEPENDENCIES = [
  /^@?babylon(?:js)?(?:\/|$)/i,
  /^konva$/i,
  /^p5$/i,
  /^phaser/i,
  /^pixi/i,
  /^three$/i,
  /^three-/i,
  /canvas/i,
  /webgl/i,
];
const PLACEHOLDER_NAME = /(?:^|[-_.])(dummy|empty|missing|placeholder|sample|temp|tmp)(?:[-_.]|$)/i;
const REMOTE_ASSET = /(?:src|href)\s*=\s*["']https?:\/\/[^"']+|url\(\s*["']?https?:\/\/[^)'"\s]+|["'`]https?:\/\/[^"'`\s]+\.(?:avif|jpe?g|png|webp|mp3|ogg|wav)(?:\?[^"'`\s]*)?["'`]/gi;
const ASSET_REFERENCE = /(?:["'`](?<path>(?:\/|\.\.\/|\.\/)?(?:assets|audio|images|sprites|tiles|buildings|crops|items|ui)\/[^"'`?#]+\.(?:avif|jpe?g|png|webp|mp3|ogg|wav))(?:[?#][^"'`]*)?["'`])|(?:url\(\s*["']?(?<css>[^)'"\s?#]+\.(?:avif|jpe?g|png|webp|mp3|ogg|wav))(?:[?#][^)'"\s]*)?["']?\s*\))/gi;

const failures = [];
const notices = [];

function report(message) {
  failures.push(message);
}

function listFiles(start, { includeSkipped = false } = {}) {
  if (!existsSync(start)) return [];
  const result = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!includeSkipped && entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) result.push(absolute);
    }
  };
  visit(start);
  return result;
}

function display(file) {
  return relative(ROOT, file).split(sep).join('/');
}

function isExactCase(file) {
  const absolute = resolve(file);
  const parsedRoot = absolute.slice(0, absolute.indexOf(sep) + 1) || sep;
  let current = parsedRoot;
  for (const part of absolute.slice(parsedRoot.length).split(sep).filter(Boolean)) {
    if (!existsSync(current)) return false;
    const names = readdirSync(current);
    if (!names.includes(part)) return false;
    current = join(current, part);
  }
  return true;
}

function readPngSize(buffer) {
  if (buffer.length < 24 || buffer.toString('hex', 0, 8) !== '89504e470d0a1a0a') return null;
  return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
}

function readWebpSize(buffer) {
  if (buffer.length < 30 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') return null;
  const type = buffer.toString('ascii', 12, 16);
  if (type === 'VP8X') return [1 + buffer.readUIntLE(24, 3), 1 + buffer.readUIntLE(27, 3)];
  if (type === 'VP8L' && buffer[20] === 0x2f) {
    const bits = buffer.readUInt32LE(21);
    return [1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff)];
  }
  if (type === 'VP8 ' && buffer.length >= 30) return [buffer.readUInt16LE(26) & 0x3fff, buffer.readUInt16LE(28) & 0x3fff];
  return null;
}

function readJpegSize(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) { offset += 1; continue; }
    const marker = buffer[offset + 1];
    if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2) return null;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return [buffer.readUInt16BE(offset + 7), buffer.readUInt16BE(offset + 5)];
    }
    offset += 2 + length;
  }
  return null;
}

function validateImage(file, buffer) {
  const extension = extname(file).toLowerCase();
  let dimensions = null;
  if (extension === '.png') dimensions = readPngSize(buffer);
  if (extension === '.webp') dimensions = readWebpSize(buffer);
  if (extension === '.jpg' || extension === '.jpeg') dimensions = readJpegSize(buffer);
  if (extension === '.avif') {
    if (buffer.length < 16 || buffer.toString('ascii', 4, 8) !== 'ftyp' || !buffer.toString('ascii', 8, 32).includes('avif')) {
      report(`${display(file)} không phải AVIF hợp lệ.`);
    }
    return;
  }
  if (!dimensions) report(`${display(file)} không có header ${extension.slice(1).toUpperCase()} hợp lệ.`);
  else if (dimensions[0] < 2 || dimensions[1] < 2) report(`${display(file)} có kích thước ${dimensions.join('×')} (asset rỗng/placeholder).`);
}

function validateAudio(file, buffer) {
  const extension = extname(file).toLowerCase();
  const ascii = buffer.toString('ascii', 0, 12);
  const valid = extension === '.wav'
    ? ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WAVE'
    : extension === '.ogg'
      ? ascii.startsWith('OggS')
      : buffer.slice(0, 3).toString('ascii') === 'ID3' || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0);
  if (!valid) report(`${display(file)} không có header âm thanh ${extension.slice(1).toUpperCase()} hợp lệ.`);
}

function resolveAssetReference(sourceFile, reference) {
  const clean = decodeURIComponent(reference.replaceAll('\\', '/'));
  const attempts = [];
  if (clean.startsWith('/')) {
    attempts.push(join(ROOT, 'public', clean.slice(1)), join(ROOT, clean.slice(1)));
  } else if (clean.startsWith('./') || clean.startsWith('../')) {
    attempts.push(resolve(dirname(sourceFile), clean));
  } else {
    attempts.push(join(ROOT, 'public', clean), join(ROOT, clean), resolve(dirname(sourceFile), clean));
  }
  return { attempts, match: attempts.find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) };
}

function hashFile(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

const projectFiles = listFiles(ROOT);

for (const file of projectFiles) {
  if (extname(file).toLowerCase() === '.svg') report(`${display(file)}: file SVG bị cấm.`);
}

const packageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies, ...packageJson.optionalDependencies };
for (const dependency of Object.keys(dependencies)) {
  if (FORBIDDEN_DEPENDENCIES.some((pattern) => pattern.test(dependency))) {
    report(`package.json: dependency render Canvas/WebGL bị cấm: ${dependency}`);
  }
  if (/font-?awesome|material-?icons|bootstrap-?icons|iconify/i.test(dependency)) {
    report(`package.json: icon font/icon package bị cấm: ${dependency}`);
  }
}

const referencedAssets = new Map();
const runtimeCodeFiles = projectFiles.filter((candidate) => {
  if (!CODE_EXTENSIONS.has(extname(candidate).toLowerCase())) return false;
  const path = display(candidate);
  return path === 'index.html' || path.startsWith('src/') || path.startsWith('public/') || /^vite\.config\./.test(path);
});
for (const file of runtimeCodeFiles) {
  const source = readFileSync(file, 'utf8');
  const checks = [
    [/<svg(?:\s|>)/i, 'chuỗi <svg'],
    [/data:image\/svg\+xml/i, 'SVG Data URI'],
    [/<canvas(?:\s|>)/i, 'thẻ <canvas>'],
    [/\bgetContext\s*\(/, 'Canvas getContext()'],
    [/\bOffscreenCanvas\b/, 'OffscreenCanvas'],
    [/\b(?:WebGL|WebGL2|WebGLRenderingContext)\b/i, 'WebGL'],
    [/@font-face/i, 'icon/custom font (@font-face)'],
    [/\b(?:FontAwesome|material-icons|bootstrap-icons|iconify)\b/i, 'icon font'],
    [/\p{Extended_Pictographic}/u, 'emoji/pictogram'],
  ];
  for (const [pattern, label] of checks) if (pattern.test(source)) report(`${display(file)}: phát hiện ${label}.`);
  for (const match of source.matchAll(REMOTE_ASSET)) report(`${display(file)}: runtime asset từ CDN/URL ngoài: ${match[0].slice(0, 140)}`);
  for (const match of source.matchAll(ASSET_REFERENCE)) {
    const reference = match.groups.path ?? match.groups.css;
    if (/^(?:data|blob):/i.test(reference)) continue;
    const resolved = resolveAssetReference(file, reference);
    if (!resolved.match) {
      const caseInsensitive = resolved.attempts.find((candidate) => {
        const parent = dirname(candidate);
        return existsSync(parent) && readdirSync(parent).some((name) => name.toLowerCase() === candidate.slice(parent.length + 1).toLowerCase());
      });
      report(caseInsensitive
        ? `${display(file)}: sai chữ hoa/thường trong đường dẫn asset “${reference}”.`
        : `${display(file)}: asset khai báo không tồn tại “${reference}”.`);
      continue;
    }
    if (!isExactCase(resolved.match)) report(`${display(file)}: sai chữ hoa/thường trong đường dẫn asset “${reference}”.`);
    referencedAssets.set(resolved.match, reference);
  }
}

const assetRoots = ['assets', 'public/assets', 'public/audio', 'src/assets'].map((path) => join(ROOT, path));
const assetFiles = assetRoots.flatMap((directory) => listFiles(directory)).filter((file, index, all) => all.indexOf(file) === index);
if (assetFiles.length === 0) report('Không tìm thấy bất kỳ asset raster/âm thanh cục bộ nào trong repository.');

for (const file of assetFiles) {
  const extension = extname(file).toLowerCase();
  if (extension === '.svg') report(`${display(file)}: file SVG bị cấm.`);
  if (!ASSET_EXTENSIONS.has(extension)) continue;
  const size = statSync(file).size;
  if (size === 0) { report(`${display(file)} có kích thước 0 byte.`); continue; }
  if (size < 64) report(`${display(file)} quá nhỏ (${size} byte), có khả năng là placeholder hoặc file hỏng.`);
  if (PLACEHOLDER_NAME.test(file.split(sep).at(-1))) report(`${display(file)} có tên placeholder/tạm.`);
  const buffer = readFileSync(file);
  if (IMAGE_EXTENSIONS.has(extension)) validateImage(file, buffer);
  if (AUDIO_EXTENSIONS.has(extension)) validateAudio(file, buffer);
}

if (process.env.VERIFY_ASSETS_SKIP_BUILD !== '1' && failures.length === 0) {
  rmSync(DIST, { recursive: true, force: true });
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const build = spawnSync(npmCommand, ['run', 'build'], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' });
  if (build.status !== 0) {
    report(`Production build thất bại:\n${build.stdout}\n${build.stderr}`);
  } else {
    const outputFiles = listFiles(DIST, { includeSkipped: true });
    if (!outputFiles.some((file) => file.endsWith('.html'))) report('Production build không tạo file HTML đầu vào.');
    const outputHashes = new Set(outputFiles.filter((file) => ASSET_EXTENSIONS.has(extname(file).toLowerCase())).map(hashFile));
    const productionCandidates = new Map(referencedAssets);
    for (const file of assetFiles) {
      if (file.startsWith(`${join(ROOT, 'public')}${sep}`) && ASSET_EXTENSIONS.has(extname(file).toLowerCase())) {
        productionCandidates.set(file, display(file));
      }
    }
    for (const [file, reference] of productionCandidates) {
      if (!outputHashes.has(hashFile(file))) report(`Asset “${reference}” không được đóng gói vào production build.`);
    }
    const distText = outputFiles.filter((file) => CODE_EXTENSIONS.has(extname(file).toLowerCase())).map((file) => readFileSync(file, 'utf8')).join('\n');
    if (/<canvas(?:\s|>)/i.test(distText) || /\bgetContext\s*\(/.test(distText) || /\bOffscreenCanvas\b/.test(distText) || /\bWebGL\b/i.test(distText)) {
      report('Production bundle chứa API Canvas/WebGL bị cấm.');
    }
    notices.push(`production build: ${outputFiles.length} file`);
  }
} else if (process.env.VERIFY_ASSETS_SKIP_BUILD === '1') {
  notices.push('bỏ qua production build theo VERIFY_ASSETS_SKIP_BUILD=1');
}

if (failures.length) {
  console.error(`\nAsset verification FAILED (${failures.length} lỗi):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Asset verification passed: ${assetFiles.length} file asset, ${referencedAssets.size} asset được khai báo${notices.length ? `, ${notices.join(', ')}` : ''}.`);
}
