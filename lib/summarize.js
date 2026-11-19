// Tulis ringkasan berita asli dalam Bahasa Melayu menggunakan OpenAI (lalai: gpt-5-nano).
// Hanya berjalan jika OPENAI_API_KEY ditetapkan.
'use strict';
const { fetchArticleText } = require('./extract');

const MODEL = process.env.SUMMARY_MODEL || 'gpt-5-nano';
const CONCURRENCY = 6;
const VERSION = 5; // naikkan untuk tulis semula semua ringkasan

const SYSTEM = `Anda wartawan kanan di portal berita Malaysia. Tulis artikel berita yang asli dalam Bahasa Melayu standard berdasarkan bahan laporan yang diberi.

Peraturan fakta:
- Guna hanya fakta dalam bahan. Jangan tambah fakta, nama, tempat, angka, tarikh atau kata-kata petikan yang tiada dalam bahan.
- Kekalkan nama orang, jawatan, organisasi, angka dan tarikh tepat seperti dalam bahan.
- Kata-kata petikan orang boleh dikekalkan dalam tanda petikan, tetapi hanya jika ada dalam bahan, dan sebut siapa yang berkata.
- Bahan mungkin terpotong di hujung. Abaikan ayat yang tidak lengkap dan jangan teka sambungannya.

Peraturan penulisan:
- Tulis dengan susunan dan ayat sendiri. Jangan terjemah atau salin ayat demi ayat.
- Jika bahan berbahasa Inggeris, tulis artikel dalam Bahasa Melayu.
- Gaya berita: perenggan pertama menjawab apa, siapa, di mana dan bila. Perenggan seterusnya memberi butiran, latar belakang dan kenyataan pihak berkaitan yang ada dalam bahan.
- Nada neutral dan berfakta, tanpa pendapat sendiri.
- Panjang: 250 hingga 400 patah perkataan dalam 4 hingga 7 perenggan jika bahan mencukupi. Jika bahan pendek, tulis lebih pendek; jangan panjangkan dengan ayat kosong atau ulangan.
- Jangan sebut "bahan", "petikan", "sumber yang diberi" atau kekurangan maklumat. Tulis seperti berita biasa.

Format jawapan tepat seperti ini:
TAJUK: <tajuk baharu, maksimum 90 aksara>
<perenggan 1>

<perenggan 2>

<perenggan seterusnya>`;

// Tolak jawapan yang menyebut bahan sumber atau mengandungi catatan model.
const stats = { full: 0 };
let lastOut = '';

const META = /petikan|maklumat (lanjut|tambahan)|tidak (dinyatakan|tersedia|diberikan)|sumber (yang )?diberi|bahan (yang )?diberi|catatan:|\?\s*\(|ayat tidak lengkap/i;

function parse(text) {
  const m = text.match(/TAJUK:\s*(.+)\n([\s\S]+)/);
  if (!m || META.test(m[2])) return null;
  const body = m[2].split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (!body.length) return null;
  return { title: m[1].trim().replace(/^["“]|["”]$/g, ''), body };
}

async function summarizeOne(a) {
  const full = await fetchArticleText(a.link);
  if (full) stats.full++;
  const text = full || a.excerpt || '(tiada)';
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(60000),
    body: JSON.stringify({
      model: MODEL,
      reasoning_effort: process.env.SUMMARY_REASONING || 'low',
      max_completion_tokens: 6000,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `Penerbit: ${a.sourceName}\nTajuk asal: ${a.originalTitle}\n\nBahan laporan:\n${text}` },
      ],
    }),
  });
  if (!res.ok) {
    const err = new Error((await res.text()).slice(0, 300));
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const out = data.choices?.[0]?.message?.content || '';
  lastOut = out || `(kosong, finish_reason=${data.choices?.[0]?.finish_reason})`;
  return parse(out);
}

// Ringkaskan sehingga `limit` artikel yang belum ada ringkasan. Mengubah objek secara terus.
async function summarizeMissing(articles, limit) {
  if (!process.env.OPENAI_API_KEY) {
    console.log('OPENAI_API_KEY tiada: ringkasan AI dilangkau.');
    return 0;
  }
  const queue = articles.filter((a) => (!a.body || a.sv !== VERSION) && a.summaryFailed !== VERSION).slice(0, limit);
  let done = 0;
  async function worker() {
    for (let a = queue.shift(); a; a = queue.shift()) {
      try {
        const r = await summarizeOne(a);
        if (r) { a.title = r.title; a.body = r.body; a.sv = VERSION; done++; } else { a.summaryFailed = VERSION; console.warn(`  Ditolak: "${a.originalTitle}" → ${String(lastOut).slice(0, 160).replace(/\n/g, ' ')}`); }
      } catch (e) {
        console.warn(`  Ringkasan gagal untuk "${a.originalTitle}": ${e.status || ''} ${e.message}`);
        if (e.status && e.status < 500 && e.status !== 429) a.summaryFailed = VERSION;
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`Ringkasan AI ditulis: ${done} (model ${MODEL}); teks penuh diambil untuk ${stats.full}`);
  return done;
}

module.exports = { summarizeMissing };
