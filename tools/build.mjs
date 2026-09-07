/* ==========================================================================
   Erzeugt eine einzige, portable HTML-Datei aus app/index.html.
   Alle Stylesheets und Skripte werden eingebettet – die Datei läuft danach
   ohne Webserver, ohne Internet und ohne weitere Dateien.
   Aufruf:  node tools/build.mjs
   ========================================================================== */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appDir = join(root, 'app');
const outDir = join(root, 'dist');
const outFile = join(outDir, 'boite-a-oublis.html');

function isLocal(url) {
  return url && !/^(https?:)?\/\//.test(url) && !url.startsWith('data:');
}

async function readPackageVersion() {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  return pkg.version;
}

async function build() {
  const version = await readPackageVersion();
  let html = await readFile(join(appDir, 'index.html'), 'utf8');
  const inlined = [];

  // Stylesheets einbetten
  const linkPattern = /[ \t]*<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>\s*\n?/g;
  const links = [...html.matchAll(linkPattern)];
  for (const match of links) {
    const href = match[1];
    if (!isLocal(href)) continue;
    const css = await readFile(join(appDir, href), 'utf8');
    inlined.push(href);
    html = html.replace(match[0], `  <style>\n/* ${href} */\n${css}\n  </style>\n`);
  }

  // Symbol als Daten-URL einbetten
  const iconMatch = html.match(/[ \t]*<link rel="icon" href="([^"]+)"[^>]*>\s*\n?/);
  if (iconMatch && isLocal(iconMatch[1])) {
    const svg = await readFile(join(appDir, iconMatch[1]), 'utf8');
    const dataUrl = 'data:image/svg+xml;base64,' + Buffer.from(svg, 'utf8').toString('base64');
    html = html.replace(iconMatch[0], `  <link rel="icon" href="${dataUrl}" type="image/svg+xml">\n`);
    inlined.push(iconMatch[1]);
  }

  // Skripte einbetten (Reihenfolge bleibt erhalten)
  const scriptPattern = /[ \t]*<script src="([^"]+)"><\/script>\s*\n?/g;
  const scripts = [...html.matchAll(scriptPattern)];
  for (const match of scripts) {
    const src = match[1];
    if (!isLocal(src)) continue;
    let js = await readFile(join(appDir, src), 'utf8');
    // Ein </script> im Quelltext würde die Einbettung zerreißen.
    js = js.replace(/<\/script>/gi, '<\\/script>');
    inlined.push(src);
    html = html.replace(match[0], `  <script>\n/* ${src} */\n${js}\n  </script>\n`);
  }

  const banner = `<!--\n  Boîte à Oublis ${version} – © Florian Nowak\n`
    + `  Erzeugt am ${new Date().toISOString()} aus app/index.html.\n`
    + `  Diese Datei ist vollständig eigenständig: einfach im Browser öffnen.\n-->\n`;
  html = banner + html;

  if (/<script src="|<link[^>]*rel="stylesheet"[^>]*href="(?!data:)/.test(html)) {
    throw new Error('Es sind noch externe Verweise enthalten – Build abgebrochen.');
  }

  await mkdir(outDir, { recursive: true });
  await writeFile(outFile, html, 'utf8');

  const sizeKb = Math.round(Buffer.byteLength(html, 'utf8') / 1024);
  console.log(`Fertig: dist/boite-a-oublis.html (${sizeKb} kB, ${inlined.length} Dateien eingebettet)`);
}

build().catch((error) => {
  console.error('Build fehlgeschlagen:', error.message);
  process.exit(1);
});
