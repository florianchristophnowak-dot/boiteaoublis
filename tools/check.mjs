/* ==========================================================================
   Einfache Selbstprüfung ohne Fremdbibliotheken:
   - Alle in index.html eingebundenen Dateien existieren
   - Alle Skripte sind syntaktisch gültig
   - Es gibt keine Verweise auf externe Ressourcen
   Aufruf:  node tools/check.mjs
   ========================================================================== */
import { readFile, access } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appDir = join(root, 'app');
let failures = 0;

function report(ok, message) {
  console.log((ok ? '  ok   ' : '  FEHL ') + message);
  if (!ok) failures += 1;
}

const html = await readFile(join(appDir, 'index.html'), 'utf8');
const assets = [
  ...[...html.matchAll(/<link[^>]*href="([^"]+)"/g)].map((m) => m[1]),
  ...[...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1])
];

console.log('Dateien aus index.html:');
for (const asset of assets) {
  if (/^(https?:)?\/\//.test(asset)) {
    report(false, 'externe Ressource verlinkt: ' + asset);
    continue;
  }
  try {
    await access(join(appDir, asset));
    report(true, asset);
  } catch {
    report(false, asset + ' fehlt');
  }
}

console.log('\nSyntaxprüfung der Skripte:');
for (const asset of assets.filter((a) => a.endsWith('.js'))) {
  const code = await readFile(join(appDir, asset), 'utf8');
  try {
    new vm.Script(code, { filename: asset });
    report(true, asset);
  } catch (error) {
    report(false, asset + ': ' + error.message);
  }
}

console.log('\nSuche nach Verweisen ins Internet:');
const suspicious = [];
for (const asset of assets.filter((a) => a.endsWith('.js') || a.endsWith('.css'))) {
  const code = await readFile(join(appDir, asset), 'utf8');
  const hits = code.match(/https?:\/\/(?!www\.w3\.org)[^\s'"`)]+/g);
  if (hits) suspicious.push(asset + ': ' + hits.join(', '));
}
report(suspicious.length === 0, suspicious.length ? suspicious.join(' | ') : 'keine gefunden');

console.log('');
if (failures) {
  console.error(failures + ' Prüfung(en) fehlgeschlagen.');
  process.exit(1);
}
console.log('Alle Prüfungen bestanden.');
