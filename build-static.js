// Jana public/data/news.json untuk hosting statik (GitHub Pages, Netlify, dll.)
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { collect } = require('./lib/feeds');

collect().then((data) => {
  const out = path.join(__dirname, 'public', 'data', 'news.json');
  fs.writeFileSync(out, JSON.stringify(data));
  const ok = data.status.filter((s) => s.ok).length;
  console.log(`Ditulis ${data.articles.length} artikel (${ok}/${data.status.length} sumber berjaya) ke ${out}`);
  data.status.forEach((s) => console.log(s.ok ? `  ✓ ${s.name}: ${s.count} artikel (${s.url})` : `  ✗ ${s.name}: ${s.error}`));
});
