// Ambil teks penuh artikel daripada laman penerbit (hanya untuk bahan AI, tidak diterbitkan).
'use strict';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const MAX_CHARS = 15000;
const JUNK = /^(baca juga|klik|ikuti kami|follow us)|\blanggan (sekarang|percuma)\b|\bsubscribe\b|hak cipta terpelihara|all rights reserved|©|download (our|the) app|sign up for/i;

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', hellip: '…', ndash: '–', mdash: '—' };
const decode = (s) => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
const clean = (s) => decode(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// 1) JSON-LD articleBody, yang disediakan oleh banyak laman berita
function fromJsonLd(html) {
  const blocks = html.match(/<script[^>]+application\/ld\+json[^>]*>[\s\S]*?<\/script>/gi) || [];
  let best = '';
  const walk = (o) => {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) return o.forEach(walk);
    if (typeof o.articleBody === 'string' && o.articleBody.length > best.length) best = o.articleBody;
    Object.values(o).forEach(walk);
  };
  for (const b of blocks) {
    try { walk(JSON.parse(b.replace(/^<script[^>]*>|<\/script>$/gi, ''))); } catch {}
  }
  return clean(best);
}

// 2) Badan artikel dalam data JSON yang dikodkan dalam HTML (cth. NSTP: Harian Metro, NST)
function fromEmbeddedJson(html) {
  const h = html.includes('&quot;') ? decode(html) : html;
  let best = '';
  for (const key of ['body_with_inline', 'body', 'articleBody', 'content']) {
    const re = new RegExp(`"${key}"\\s*:\\s*("(?:[^"\\\\]|\\\\.)*")`, 'g');
    let m;
    while ((m = re.exec(h))) {
      try {
        const v = clean(JSON.parse(m[1]).replace(/<\/p>/gi, '\n\n'));
        if (v.length > best.length) best = v;
      } catch {}
    }
    if (best.length >= 400) break;
  }
  return best;
}

// 3) Perenggan <p> dalam kawasan <article> (atau seluruh halaman)
function fromParagraphs(html) {
  let h = html.replace(/<(script|style|noscript|header|footer|nav|aside|form|figure|svg|iframe)\b[\s\S]*?<\/\1>/gi, ' ');
  const arts = h.match(/<article\b[\s\S]*?<\/article>/gi);
  if (arts) h = arts.sort((a, b) => b.length - a.length)[0];
  const paras = (h.match(/<p\b[^>]*>[\s\S]*?<\/p>/gi) || []).map(clean).filter((p) => p.length >= 40 && !JUNK.test(p));
  return [...new Set(paras)].join('\n\n');
}

async function fetchArticleText(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(15000) });
    if (!res.ok) return '';
    const html = await res.text();
    const text = [fromJsonLd(html), fromEmbeddedJson(html), fromParagraphs(html)].sort((x, y) => y.length - x.length)[0];
    return text.length >= 400 ? text.slice(0, MAX_CHARS) : '';
  } catch {
    return '';
  }
}

module.exports = { fetchArticleText, fromJsonLd, fromEmbeddedJson, fromParagraphs };
