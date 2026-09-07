/* ==========================================================================
   Kleiner lokaler Webserver für die Entwicklung.
   Aufruf:  node tools/serve.mjs [Port]
   Nur nötig, wenn man die App nicht direkt als Datei öffnen möchte.
   ========================================================================== */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2] || process.env.PORT || 8765);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png'
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/app/index.html';
    const filePath = join(root, normalize(pathname).replace(/^(\.\.[/\\])+/, ''));
    if (!filePath.startsWith(root)) {
      response.writeHead(403).end('Zugriff verweigert');
      return;
    }
    const info = await stat(filePath);
    const target = info.isDirectory() ? join(filePath, 'index.html') : filePath;
    const body = await readFile(target);
    response.writeHead(200, {
      'Content-Type': TYPES[extname(target)] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    response.end(body);
  } catch (error) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Nicht gefunden');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Boîte à Oublis läuft auf http://localhost:${port}/`);
  console.log('Beenden mit Strg + C');
});
