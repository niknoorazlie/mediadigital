// Pengumpul RSS/Atom tanpa kebergantungan luar (Node 18+).
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const SOURCES = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'sources.json'), 'utf8'));
const MAX_PER_SOURCE = 25;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', hellip: '…', ndash: '–', mdash: '—' };

function decode(s = '') {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

function stripHtml(s = '') {
  return decode(decode(s)).replace(/<[^>]+>/g, ' ').replace(/\u00c2(?=[\s\u00a0]|$)/g, '').replace(/\s+/g, ' ').trim();
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return m ? m[1] : '';
}

function attr(block, tagName, attrName, filter) {
  const re = new RegExp(`<${tagName}\\b([^>]*)\\/?>`, 'gi');
  let m;
  while ((m = re.exec(block))) {
    if (filter && !filter.test(m[1])) continue;
    const a = m[1].match(new RegExp(`${attrName}\\s*=\\s*["']([^"']+)["']`, 'i'));
    if (a) return decode(a[1]);
  }
  return '';
}

function findImage(block) {
  return (
    attr(block, 'media:content', 'url', /medium=["']image|type=["']image|\.(jpe?g|png|webp)/i) ||
    attr(block, 'media:thumbnail', 'url') ||
    attr(block, 'enclosure', 'url', /image/i) ||
    (decode(block).match(/<img[^>]+src=["']([^"']+)["']/i) || [])[1] ||
    ''
  );
}

function parseFeed(xml, source) {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  return blocks.slice(0, MAX_PER_SOURCE).map((b) => {
    const title = stripHtml(tag(b, 'title'));
    let link = stripHtml(tag(b, 'link')) || attr(b, 'link', 'href', /rel=["']alternate|^(?![\s\S]*rel=)/i) || attr(b, 'link', 'href');
    const dateRaw = stripHtml(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date'));
    const date = dateRaw && !isNaN(Date.parse(dateRaw)) ? new Date(dateRaw).toISOString() : null;
    let summary = stripHtml(tag(b, 'description') || tag(b, 'summary') || tag(b, 'content:encoded') || tag(b, 'content'));
    if (summary.length > 700) summary = summary.slice(0, 697).replace(/\s\S*$/, '') + '…';
    let image = findImage(b);
    if (image.startsWith('//')) image = 'https:' + image;
    return {
      title, link, date, summary, image: /^https?:\/\//.test(image) ? image : '',
      source: source.id, sourceName: source.name, lang: source.lang, category: source.category,
    };
  }).filter((a) => a.title && /^https?:\/\//.test(a.link));
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 WartaSahih/1.0';

async function fetchUrl(url, source) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5' },
    redirect: 'follow',
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const items = parseFeed(await res.text(), source);
  if (!items.length) throw new Error('Tiada artikel dalam suapan');
  return items;
}

// `url` boleh jadi satu alamat atau senarai alamat cadangan; yang pertama berjaya digunakan.
async function fetchSource(source) {
  const started = Date.now();
  const errors = [];
  for (const url of [].concat(source.url)) {
    try {
      const items = await fetchUrl(url, source);
      return { items, status: { id: source.id, name: source.name, ok: true, url, count: items.length, ms: Date.now() - started } };
    } catch (e) {
      errors.push(`${url} → ${e.message || e}`);
    }
  }
  return { items: [], status: { id: source.id, name: source.name, ok: false, error: errors.join(' | '), ms: Date.now() - started } };
}

const norm = (t) => t.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim();

async function collect() {
  const results = await Promise.all(SOURCES.map(fetchSource));
  const seen = new Set();
  const articles = [];
  for (const r of results) {
    for (const a of r.items) {
      const key = norm(a.title);
      if (seen.has(key) || seen.has(a.link)) continue;
      seen.add(key); seen.add(a.link);
      articles.push(a);
    }
  }
  articles.sort((a, b) => (b.date ? Date.parse(b.date) : 0) - (a.date ? Date.parse(a.date) : 0));
  articles.forEach((a, i) => { a.id = Buffer.from(a.link).toString('base64url').slice(-16) + i; });
  return {
    generatedAt: new Date().toISOString(),
    sources: SOURCES.map(({ id, name, lang, category, home }) => ({ id, name, lang, category, home })),
    status: results.map((r) => r.status),
    articles,
  };
}

module.exports = { collect, parseFeed, SOURCES };
