// Kumpul berita, simpan arkib, tulis ringkasan AI, dan jana laman statik.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { collect } = require('./lib/feeds');
const { writePages, analytics } = require('./lib/pages');

const ARCHIVE = path.join(__dirname, 'data', 'archive.json');
const PUBLIC = path.join(__dirname, 'public');
const KEEP_DAYS = Number(process.env.KEEP_DAYS) || 30;
const MAX_ARCHIVE = 3000;

function slugify(title, link) {
  const base = title.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').split('-').slice(0, 10).join('-');
  const h = crypto.createHash('sha1').update(link).digest('hex').slice(0, 6);
  return `${base || 'berita'}-${h}`;
}

function loadArchive() {
  try { return JSON.parse(fs.readFileSync(ARCHIVE, 'utf8')); } catch { return []; }
}

(async () => {
  const data = await collect();
  const ok = data.status.filter((s) => s.ok).length;
  console.log(`Dikumpul ${data.articles.length} artikel (${ok}/${data.status.length} sumber berjaya)`);
  data.status.forEach((s) => console.log(s.ok ? `  ✓ ${s.name}: ${s.count} artikel` : `  ✗ ${s.name}: ${s.error}`));

  // Gabung dengan arkib supaya halaman lama kekal wujud
  const archive = loadArchive();
  const known = new Set(archive.map((a) => a.link));
  const now = new Date().toISOString();
  let added = 0;
  for (const a of data.articles) {
    if (known.has(a.link)) continue;
    archive.push({
      slug: slugify(a.title, a.link), title: a.title, originalTitle: a.title, excerpt: a.summary,
      link: a.link, date: a.date, firstSeen: now, image: a.image,
      source: a.source, sourceName: a.sourceName, lang: a.lang, category: a.category, body: null,
    });
    added++;
  }
  const cutoff = Date.now() - KEEP_DAYS * 864e5;
  const t = (a) => Date.parse(a.date || a.firstSeen);
  let kept = archive.filter((a) => t(a) > cutoff).sort((x, y) => t(y) - t(x)).slice(0, MAX_ARCHIVE);
  console.log(`Arkib: ${added} baharu, ${kept.length} disimpan`);


  fs.mkdirSync(path.dirname(ARCHIVE), { recursive: true });
  fs.writeFileSync(ARCHIVE, JSON.stringify(kept, null, 0));

  // Data untuk laman utama
  const latest = kept.slice(0, 400).map((a) => ({
    slug: a.slug, title: a.title, link: a.link, date: a.date || a.firstSeen,
    summary: (a.body && a.body[0]) || a.excerpt, image: a.image,
    source: a.source, sourceName: a.sourceName, lang: a.body ? 'ms' : a.lang, category: a.category,
  }));
  fs.mkdirSync(path.join(PUBLIC, 'data'), { recursive: true });
  fs.writeFileSync(path.join(PUBLIC, 'data', 'news.json'), JSON.stringify({ ...data, articles: latest }));

  // Masukkan kod Google Analytics ke laman utama dan halaman privasi
  for (const f of ['index.html', 'privasi/index.html']) {
    const fp = path.join(PUBLIC, f);
    fs.writeFileSync(fp, fs.readFileSync(fp, 'utf8').replace('<!--ANALYTICS-->', analytics()));
  }

  const r = writePages(kept, PUBLIC);
  console.log(`Halaman artikel: ${r.pages} (${r.indexed} dengan ringkasan asli, masuk sitemap)`);
})().catch((e) => { console.error(e); process.exit(1); });
