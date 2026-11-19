// Tulis ringkasan berita asli dalam Bahasa Melayu menggunakan Claude.
// Hanya berjalan jika ANTHROPIC_API_KEY ditetapkan.
'use strict';

const MODEL = process.env.SUMMARY_MODEL || 'claude-opus-5-5';
const CONCURRENCY = 4;

const SYSTEM = `Anda editor berita untuk portal berita Malaysia. Tulis semula maklumat yang diberi sebagai berita ringkas yang asli dalam Bahasa Melayu standard.

Peraturan:
- Guna hanya fakta dalam tajuk dan petikan yang diberi. Jangan tambah fakta, nama, angka atau petikan kata-kata yang tiada dalam bahan.
- Jangan salin ayat sumber secara langsung. Tulis dengan ayat sendiri.
- Jika bahan berbahasa Inggeris, terjemah dan tulis dalam Bahasa Melayu.
- Nada neutral dan berfakta, tanpa pendapat.
- Format jawapan tepat seperti ini:
TAJUK: <tajuk baharu, maksimum 90 aksara>
<perenggan 1>

<perenggan 2 jika ada bahan mencukupi>
- Dua hingga tiga perenggan pendek, 80 hingga 160 patah perkataan semuanya. Jika bahan terlalu sedikit, tulis satu perenggan sahaja.`;

let client;
function getClient() {
  if (!client) {
    const Anthropic = require('@anthropic-ai/sdk');
    client = new (Anthropic.default || Anthropic)();
  }
  return client;
}

function parse(text) {
  const m = text.match(/TAJUK:\s*(.+)\n([\s\S]+)/);
  if (!m) return null;
  const body = m[2].split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (!body.length) return null;
  return { title: m[1].trim().replace(/^["“]|["”]$/g, ''), body };
}

async function summarizeOne(a) {
  const res = await getClient().beta.messages.create({
    model: MODEL,
    max_tokens: 2000,
    output_config: { effort: 'low' },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM,
    messages: [{
      role: 'user',
      content: `Sumber: ${a.sourceName}\nTajuk asal: ${a.originalTitle}\nPetikan: ${a.excerpt || '(tiada)'}`,
    }],
  });
  if (res.stop_reason === 'refusal') return null;
  const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  return parse(text);
}

// Ringkaskan sehingga `limit` artikel yang belum ada ringkasan. Mengubah objek secara terus.
async function summarizeMissing(articles, limit) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('ANTHROPIC_API_KEY tiada: ringkasan AI dilangkau.');
    return 0;
  }
  const queue = articles.filter((a) => !a.body && !a.summaryFailed).slice(0, limit);
  let done = 0;
  async function worker() {
    for (let a = queue.shift(); a; a = queue.shift()) {
      try {
        const r = await summarizeOne(a);
        if (r) { a.title = r.title; a.body = r.body; done++; } else a.summaryFailed = true;
      } catch (e) {
        console.warn(`  Ringkasan gagal untuk "${a.originalTitle}": ${e.status || ''} ${e.message}`);
        if (e.status && e.status < 500 && e.status !== 429) a.summaryFailed = true;
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`Ringkasan AI ditulis: ${done} (model ${MODEL})`);
  return done;
}

module.exports = { summarizeMissing };
