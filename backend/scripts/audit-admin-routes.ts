/**
 * Admin endpoint envanteri — refactor doğrulama aracı (tek seferlik denetim).
 *
 * `routes/admin.ts` konu bazlı alt router'lara bölünürken hiçbir endpoint'in
 * kaybolmadığını/değişmediğini kanıtlar. İki mod:
 *
 *   static <dosya|klasör>  — kaynak dosyaları tarar, `router.<method>('path')`
 *                            çiftlerini (çok satırlılar dahil) sıralı listeler.
 *   runtime <modül>        — modülün default export'u olan Express router'ı
 *                            import eder, mount edilmiş alt router'ları
 *                            özyinelemeli gezerek GERÇEKTEN kayıtlı
 *                            `METHOD /path` listesini üretir.
 *
 * Çıktı: her satır `METHOD /path`; sıralı (localeCompare). `compare` modu iki
 * listeyi karşılaştırır, farkta non-zero exit eder.
 *
 * Kullanım:
 *   npx tsx scripts/audit-admin-routes.ts static src/routes/admin.ts
 *   npx tsx scripts/audit-admin-routes.ts static src/routes/admin
 *   npx tsx scripts/audit-admin-routes.ts runtime ./src/routes/admin/index.js
 *   npx tsx scripts/audit-admin-routes.ts compare baseline.txt src/routes/admin
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'all'] as const;
const ROUTE_RE = new RegExp(
  `router\\.(${METHODS.join('|')})\\s*\\(\\s*(['"\`])([^'"\`]*)\\2`,
  'g',
);

function listSourceFiles(target: string): string[] {
  const abs = path.resolve(target);
  const stat = fs.statSync(abs);
  if (stat.isFile()) return [abs];
  const out: string[] = [];
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const full = path.join(abs, entry.name);
    if (entry.isDirectory()) out.push(...listSourceFiles(full));
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

/** Bir kaynak dosyadan `METHOD /path` satırlarını çıkarır (yorumlar sayılmaz). */
function extractStatic(target: string): string[] {
  const out = new Set<string>();
  for (const file of listSourceFiles(target)) {
    const source = fs.readFileSync(file, 'utf-8');
    // Önce satır yorumları (URL'lerdeki `//` korunur), sonra blok yorumlar.
    // Sıra önemli: satır yorumundaki `/admin/*` dizisi blok-yorumu tetiklemesin.
    const noLine = source.replace(/(^|[^:\\])\/\/[^\n]*/g, '$1');
    const noBlock = noLine.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const match of noBlock.matchAll(ROUTE_RE)) {
      const method = match[1].toUpperCase();
      const routePath = match[3];
      out.add(`${method} ${routePath}`);
    }
  }
  return sortLines([...out]);
}

interface RouteLayerShape {
  route: { path: string; methods: Record<string, boolean> };
}

function isRouteLayer(layer: unknown): layer is RouteLayerShape {
  return (
    typeof layer === 'object' &&
    layer !== null &&
    'route' in layer &&
    typeof (layer as RouteLayerShape).route === 'object' &&
    (layer as RouteLayerShape).route !== null &&
    'path' in (layer as RouteLayerShape).route
  );
}

interface RouterLayerShape {
  name: string;
  handle: { stack?: unknown[] };
}

function isMountedRouterLayer(layer: unknown): layer is RouterLayerShape {
  if (typeof layer !== 'object' || layer === null || !('handle' in layer)) return false;
  const handle = (layer as { handle: unknown }).handle;
  if (handle === null) return false;
  // Express router'ı bir fonksiyondur; `stack` özelliği taşır.
  if (typeof handle !== 'function' && typeof handle !== 'object') return false;
  return Array.isArray((handle as { stack?: unknown }).stack);
}

/** Express 5 router stack'ini özyinelemeli gezer; alt router'lar prefixesiz mount edilir. */
function walkRouterStack(stack: unknown[], out: Set<string>): void {
  for (const layer of stack) {
    if (isRouteLayer(layer)) {
      for (const [method, enabled] of Object.entries(layer.route.methods)) {
        if (enabled) out.add(`${method.toUpperCase()} ${layer.route.path}`);
      }
      continue;
    }
    if (isMountedRouterLayer(layer)) {
      walkRouterStack(layer.handle.stack as unknown[], out);
    }
  }
}

async function extractRuntime(moduleSpecifier: string): Promise<string[]> {
  // Gerçek app.db'ye dokunma — import zinciri DB bağlantısı açıyor.
  if (!process.env.DB_PATH) {
    process.env.DB_PATH = path.join(
      process.env.TEMP ?? process.env.TMP ?? '.',
      `audit-admin-routes-${Date.now()}.db`,
    );
  }
  const mod = (await import(
    pathToFileURL(path.resolve(process.cwd(), moduleSpecifier)).href
  )) as { default?: unknown };
  const router = mod.default as { stack?: unknown[] } | undefined;
  if (!router || !Array.isArray(router.stack)) {
    throw new Error(`Modülün default export'u bir Express router değil: ${moduleSpecifier}`);
  }
  const out = new Set<string>();
  walkRouterStack(router.stack, out);
  return sortLines([...out]);
}

function sortLines(lines: string[]): string[] {
  return lines.sort((a, b) => a.localeCompare(b, 'en'));
}

function readListFile(file: string): string[] {
  return sortLines(
    fs
      .readFileSync(file, 'utf-8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean),
  );
}

function compare(baselineFile: string, candidate: string[]): void {
  const baseline = readListFile(baselineFile);
  const baseSet = new Set(baseline);
  const candSet = new Set(candidate);
  const missing = baseline.filter((l) => !candSet.has(l));
  const added = candidate.filter((l) => !baseSet.has(l));

  console.log(`Baseline: ${baseline.length} endpoint`);
  console.log(`Aday:     ${candidate.length} endpoint`);

  if (candidate.length !== candSet.size) {
    console.error('HATA: aday listede duplike endpoint var.');
  }
  if (missing.length === 0 && added.length === 0 && candidate.length === baseline.length) {
    console.log('SONUC: BIREBIR AYNI ✔');
    return;
  }
  console.error('SONUC: FARK VAR!');
  if (missing.length > 0) console.error('Eksik olanlar:\n  ' + missing.join('\n  '));
  if (added.length > 0) console.error('Fazla/gruplananlar:\n  ' + added.join('\n  '));
  process.exitCode = 1;
}

async function main(): Promise<void> {
  const [mode, arg1, arg2] = process.argv.slice(2);
  if (mode === 'static' && arg1) {
    for (const line of extractStatic(arg1)) console.log(line);
    return;
  }
  if (mode === 'runtime' && arg1) {
    for (const line of await extractRuntime(arg1)) console.log(line);
    return;
  }
  if (mode === 'compare' && arg1 && arg2) {
    const candidate = arg2.startsWith('runtime:')
      ? await extractRuntime(arg2.slice('runtime:'.length))
      : extractStatic(arg2);
    compare(arg1, candidate);
    return;
  }
  console.error(
    [
      'Kullanım:',
      '  static  <dosya|klasör>',
      '  runtime <modül>',
      '  compare <baseline.txt> <dosya|klasör>',
    ].join('\n'),
  );
  process.exitCode = 2;
}

void main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
