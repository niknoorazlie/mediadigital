// Jana halaman artikel statik, sitemap.xml dan robots.txt.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const SITE_NAME = process.env.SITE_NAME || 'Semasa';
const SITE_URL = (process.env.SITE_URL || 'https://semasa.my').replace(/\/$/, '');
const CAT_LABEL = { nasional: 'Nasional', dunia: 'Dunia', bisnes: 'Bisnes', teknologi: 'Teknologi', sains: 'Sains', kesihatan: 'Kesihatan', sukan: 'Sukan' };

const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (iso) => iso ? new Date(iso).toLocaleString('ms-MY', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Kuala_Lumpur' }) : '';
const MIN_WORDS = 150;
const isIndexable = (a) => Boolean(a.body) && a.body.join(' ').split(/\s+/).length >= MIN_WORDS;
const GA_ID = /^G-[A-Z0-9]+$/.test(process.env.GA_MEASUREMENT_ID || '') ? process.env.GA_MEASUREMENT_ID : '';
const analytics = () => GA_ID ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${GA_ID}');</script>` : '';
const url = (a) => `${SITE_URL}/berita/${a.slug}/`;

function header() {
  return `<header class="masthead"><div class="wrap bar"><a class="logo" href="/">Semasa<span>.my</span></a>
  <nav class="art-nav">${Object.entries(CAT_LABEL).map(([id, l]) => `<a href="/#${id}">${l}</a>`).join('')}</nav></div></header>`;
}

function articlePage(a, related) {
  const indexable = isIndexable(a);
  const paras = a.body || (a.excerpt ? [a.excerpt] : []);
  const desc = (paras[0] || a.title).slice(0, 160);
  const ld = {
    '@context': 'https://schema.org', '@type': 'NewsArticle', headline: a.title, description: desc,
    datePublished: a.date || a.firstSeen, dateModified: a.date || a.firstSeen, inLanguage: 'ms',
    mainEntityOfPage: url(a), image: a.image ? [a.image] : undefined,
    author: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
    publisher: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
    isBasedOn: a.link, citation: { '@type': 'CreativeWork', name: a.originalTitle, url: a.link, publisher: { '@type': 'Organization', name: a.sourceName } },
  };
  return `<!doctype html>
<html lang="ms">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(a.title)} | ${esc(SITE_NAME)}</title>
<meta name="description" content="${esc(desc)}">
${indexable ? `<link rel="canonical" href="${url(a)}">` : '<meta name="robots" content="noindex, follow">'}
<meta property="og:type" content="article">
<meta property="og:site_name" content="${esc(SITE_NAME)}">
<meta property="og:title" content="${esc(a.title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url(a)}">
${a.image ? `<meta property="og:image" content="${esc(a.image)}">\n<meta name="twitter:card" content="summary_large_image">` : '<meta name="twitter:card" content="summary">'}
<meta property="article:published_time" content="${esc(a.date || a.firstSeen)}">
<meta property="article:section" content="${esc(CAT_LABEL[a.category] || a.category)}">
<meta name="theme-color" content="#0e1318">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>
<script>try{var t=localStorage.getItem('ws:theme');if(t)document.documentElement.dataset.theme=JSON.parse(t)}catch(e){}</script>
${analytics()}
</head>
<body>
${header()}
<main class="wrap art-wrap">
  <article class="art">
    <nav class="crumbs"><a href="/">Utama</a> › <a href="/#${esc(a.category)}">${esc(CAT_LABEL[a.category] || a.category)}</a></nav>
    <h1>${esc(a.title)}</h1>
    <div class="meta"><span class="src">Sumber: ${esc(a.sourceName)}</span><time datetime="${esc(a.date || a.firstSeen)}">${esc(fmtDate(a.date || a.firstSeen))}</time></div>
    ${a.image ? `<figure class="art-fig"><img src="${esc(a.image)}" alt="${esc(a.title)}" referrerpolicy="no-referrer" onerror="this.parentNode.remove()"><figcaption>Gambar: ${esc(a.sourceName)}</figcaption></figure>` : ''}
    <div class="art-body">${paras.map((p) => `<p>${esc(p)}</p>`).join('\n')}</div>
    <aside class="art-source">
      <p>${a.body ? `Berita ini ditulis semula oleh ${esc(SITE_NAME)} berdasarkan laporan asal` : 'Petikan daripada laporan asal'} <b>${esc(a.sourceName)}</b>: “${esc(a.originalTitle)}”.</p>
      <a class="src-link" href="${esc(a.link)}" target="_blank" rel="noopener nofollow">Baca laporan penuh di ${esc(a.sourceName)} ↗</a>
    </aside>
  </article>
  ${related.length ? `<section class="art-related"><div class="sec-head"><h2>Berita berkaitan</h2></div><ul>${related.map((r) => `<li><a href="/berita/${r.slug}/"><span class="src">${esc(r.sourceName)}</span>${esc(r.title)}</a></li>`).join('')}</ul></section>` : ''}
</main>
<footer class="foot"><div class="wrap"><a class="logo" href="/">Semasa<span>.my</span></a><p>${esc(SITE_NAME)} meringkaskan berita daripada penerbit yang sahih. Setiap berita menyatakan sumber dan memaut ke laporan asal.</p><p class="muted small"><a href="/privasi/">Dasar privasi</a></p></div></footer>
</body>
</html>
`;
}

function writePages(archive, publicDir) {
  const root = path.join(publicDir, 'berita');
  fs.rmSync(root, { recursive: true, force: true });
  const byCat = {};
  archive.forEach((a) => (byCat[a.category] ||= []).push(a));
  for (const a of archive) {
    const related = (byCat[a.category] || []).filter((r) => r !== a && r.body).slice(0, 6);
    const dir = path.join(root, a.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), articlePage(a, related));
  }
  const indexed = archive.filter(isIndexable);
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>${SITE_URL}/</loc><changefreq>hourly</changefreq></url>
${indexed.map((a) => `<url><loc>${url(a)}</loc><lastmod>${a.date || a.firstSeen}</lastmod></url>`).join('\n')}
</urlset>
`;
  fs.writeFileSync(path.join(publicDir, 'sitemap.xml'), sitemap);
  fs.writeFileSync(path.join(publicDir, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
  return { pages: archive.length, indexed: indexed.length };
}

module.exports = { writePages, SITE_URL, analytics };
