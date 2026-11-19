// Tulis ringkasan berita asli dalam Bahasa Melayu menggunakan OpenAI (lalai: gpt-5-nano).
// Hanya berjalan jika OPENAI_API_KEY ditetapkan.
'use strict';

const MODEL = process.env.SUMMARY_MODEL || 'gpt-5-nano';
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

function parse(text) {
  const m = text.match(/TAJUK:\s*(.+)\n([\s\S]+)/);
  if (!m) return null;
  const body = m[2].split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (!body.length) return null;
  return { title: m[1].trim().replace(/^["“]|["”]$/g, ''), body };
}

async function summarizeOne(a) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(60000),
    body: JSON.stringify({
      model: MODEL,
      reasoning_effort: 'minimal',
      max_completion_tokens: 2000,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `Sumber: ${a.sourceName}\nTajuk asal: ${a.originalTitle}\nPetikan: ${a.excerpt || '(tiada)'}` },
      ],
    }),
  });
  if (!res.ok) {
    const err = new Error((await res.text()).slice(0, 300));
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';
  return parse(text);
}

// Ringkaskan sehingga `limit` artikel yang belum ada ringkasan. Mengubah objek secara terus.
async function summarizeMissing(articles, limit) {
  if (!process.env.OPENAI_API_KEY) {
    console.log('OPENAI_API_KEY tiada: ringkasan AI dilangkau.');
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
