// Servidor de prueba local: sirve la app y el lector de audios/capturas
// (el mismo código que corre en Supabase). Uso: node dev-server.js
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { leer } from './supabase/functions/_shared/lector.js';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const PUERTO = Number(process.env.PORT) || 5180;
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json' };

function llaveApimart() {
  if (process.env.APIMART_API_KEY) return process.env.APIMART_API_KEY;
  try {
    const env = fs.readFileSync(path.join(process.env.HOME, '.claude/skills/anuncios-ugc/scripts/.env'), 'utf8');
    return env.match(/^APIMART_API_KEY\s*=\s*["']?([^"'\n]+)/m)?.[1].trim();
  } catch { return null; }
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'POST' && url.pathname === '/api/leer') {
    try {
      const fd = await new Request(url, { method: 'POST', headers: req.headers, body: req, duplex: 'half' }).formData();
      const r = await leer({
        apiKey: llaveApimart(),
        catalogo: JSON.parse(fd.get('catalogo')),
        hoy: fd.get('hoy'),
        audio: fd.get('audio') || undefined,
        imagen: fd.get('imagen') || undefined,
        texto: fd.get('texto') || undefined,
      });
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(r));
    } catch (e) {
      console.error(e);
      res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: e.message }));
    }
    return;
  }
  let archivo = path.join(RAIZ, decodeURIComponent(url.pathname));
  if (!archivo.startsWith(RAIZ)) return res.writeHead(403).end();
  if (fs.existsSync(archivo) && fs.statSync(archivo).isDirectory()) archivo = path.join(archivo, 'index.html');
  if (!fs.existsSync(archivo)) return res.writeHead(404).end('No está');
  res.writeHead(200, { 'Content-Type': TIPOS[path.extname(archivo)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(archivo).pipe(res);
}).listen(PUERTO, () => console.log(`App lista en http://localhost:${PUERTO}`));
