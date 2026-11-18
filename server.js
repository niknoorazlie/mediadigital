// Pelayan Warta Sahih: kumpul RSS berkala + hidang laman web.
// Jalankan: node server.js   (Node 18 atau lebih baharu, tiada npm install diperlukan)
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { collect } = require('./lib/feeds');

const PORT = process.env.PORT || 3000;
const REFRESH_MIN = Number(process.env.REFRESH_MINUTES || 10);
const PUBLIC = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

let cache = null;
let refreshing = null;

async function refresh() {
  if (refreshing) return refreshing;
  refreshing = collect()
    .then((data) => {
      cache = data;
      const ok = data.status.filter((s) => s.ok).length;
      console.log(`[${new Date().toLocaleTimeString()}] ${data.articles.length} artikel daripada ${ok}/${data.status.length} sumber`);
      data.status.filter((s) => !s.ok).forEach((s) => console.warn(`  ✗ ${s.name}: ${s.error}`));
    })
    .catch((e) => console.error('Gagal kumpul berita:', e))
    .finally(() => { refreshing = null; });
  return refreshing;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/news') {
    if (!cache) await refresh();
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' });
    return res.end(JSON.stringify(cache || { articles: [], sources: [], status: [] }));
  }
  let file = path.normalize(path.join(PUBLIC, url.pathname === '/' ? 'index.html' : url.pathname));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Tidak dijumpai'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
});

server.listen(PORT, () => {
  console.log(`Warta Sahih berjalan di http://localhost:${PORT}`);
  refresh();
  setInterval(refresh, REFRESH_MIN * 60 * 1000);
});
