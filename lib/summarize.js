// Tulis ringkasan berita asli dalam Bahasa Melayu menggunakan OpenAI (lalai: gpt-6-luna, sandaran gpt-5-nano).
// Hanya berjalan jika OPENAI_API_KEY ditetapkan.
'use strict';
const { fetchArticleText } = require('./extract');

// Senarai model dicuba mengikut urutan; jika akaun tiada akses kepada satu model, guna yang seterusnya.
const MODELS = (process.env.SUMMARY_MODEL || 'gpt-6-luna,gpt-5-nano').split(',').map((m) => m.trim()).filter(Boolean);
let MODEL = MODELS.shift();
let useReasoning = /^(gpt-[5-9]|o\d)/.test(MODEL);
const CONCURRENCY = 6;
const VERSION = 5; // naikkan untuk tulis semula semua ringkasan
const RETRY = 7; // naikkan untuk cuba semula yang ditolak sahaja

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
- Panjang: ikut sasaran panjang yang diberi dalam mesej pengguna, iaitu lebih kurang sama dengan laporan asal. Jika bahan pendek, tulis lebih pendek; jangan panjangkan dengan ayat kosong, ulangan atau fakta rekaan.
- Jangan sebut "bahan", "petikan", "sumber yang diberi" atau kekurangan maklumat. Tulis seperti berita biasa.

Format jawapan tepat seperti ini:
TAJUK: <tajuk baharu, maksimum 90 aksara>
<perenggan 1>

<perenggan 2>

<perenggan seterusnya>`;

// Tolak jawapan yang menyebut bahan sumber atau mengandungi catatan model.
const stats = { full: 0, calls: 0, inTok: 0, cachedTok: 0, outTok: 0, reasonTok: 0 };
// Harga USD per 1J token (gpt-6-luna); boleh ubah melalui SUMMARY_PRICE="input,cached,output"
const PRICE = (process.env.SUMMARY_PRICE || '0.10,0.01,0.50').split(',').map(Number);
let lastOut = '';

const META = /(petikan|bahan|sumber) (yang )?diberi|maklumat lanjut tidak (tersedia|diberikan)|tidak dinyatakan dalam (petikan|bahan)|catatan:|ayat tidak lengkap/i;

function parse(text) {
  const m = text.match(/TAJUK:\s*(.+)\n([\s\S]+)/);
  if (!m || META.test(m[2])) return null;
  const body = m[2].split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (!body.length) return null;
  return { title: m[1].trim().replace(/^["“]|["”]$/g, ''), body };
}

async function summarizeOne(a) {
  const model = MODEL;
  const full = await fetchArticleText(a.link);
  if (full) stats.full++;
  const text = full || a.excerpt || '(tiada)';
  const srcWords = text.split(/\s+/).length;
  const target = full ? Math.min(1200, Math.max(250, Math.round(srcWords / 10) * 10)) : Math.min(200, Math.max(60, srcWords));
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(180000),
    body: JSON.stringify({
      model,
      // reasoning_effort hanya diterima oleh model penaakulan (gpt-5/6, o-series)
      ...(useReasoning ? { reasoning_effort: process.env.SUMMARY_REASONING || 'low' } : {}),
      max_completion_tokens: 16000,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `Penerbit: ${a.sourceName}\nTajuk asal: ${a.originalTitle}\nSasaran panjang: kira-kira ${target} patah perkataan, dalam ${Math.max(3, Math.round(target / 70))} perenggan atau lebih.\n\nBahan laporan:\n${text}` },
      ],
    }),
  });
  if (!res.ok) {
    const msg = (await res.text()).slice(0, 300);
    // Model tidak menerima reasoning_effort: buang parameter dan cuba sekali lagi
    if (res.status === 400 && useReasoning && /reasoning/i.test(msg)) {
      useReasoning = false;
      console.warn(`  ${MODEL} tidak terima reasoning_effort; dibuang.`);
      return summarizeOne(a);
    }
    const err = new Error(msg);
    err.model = model;
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const u = data.usage || {};
  const cached = u.prompt_tokens_details?.cached_tokens || 0;
  stats.calls++;
  stats.inTok += (u.prompt_tokens || 0) - cached;
  stats.cachedTok += cached;
  stats.outTok += u.completion_tokens || 0;
  stats.reasonTok += u.completion_tokens_details?.reasoning_tokens || 0;
  const out = data.choices?.[0]?.message?.content || '';
  lastOut = out || `(kosong, finish_reason=${data.choices?.[0]?.finish_reason})`;
  return parse(out);
}

// Ringkaskan sehingga `limit` artikel yang belum ada ringkasan. Mengubah objek secara terus.
// Bajet harian (USD, ikut tarikh UTC). Kos direkod dalam usage = { 'YYYY-MM-DD': usd }.
const DAILY_BUDGET = Number(process.env.DAILY_BUDGET_USD) || 0.30;
const costOf = (st) => (st.inTok * PRICE[0] + st.cachedTok * PRICE[1] + st.outTok * PRICE[2]) / 1e6;

async function summarizeMissing(articles, limit, usage = {}) {
  const day = new Date().toISOString().slice(0, 10);
  const spentBefore = usage[day] || 0;
  const perArticle = 0.0005; // anggaran awal kos satu artikel
  const left = DAILY_BUDGET - spentBefore;
  if (left < perArticle) {
    console.log(`Bajet harian USD ${DAILY_BUDGET} sudah dicapai (USD ${spentBefore.toFixed(3)}): ringkasan AI dilangkau hingga esok (UTC).`);
    return 0;
  }
  limit = Math.min(limit, Math.floor(left / perArticle));
  if (!process.env.OPENAI_API_KEY) {
    console.log('OPENAI_API_KEY tiada: ringkasan AI dilangkau.');
    return 0;
  }
  // Hanya berita baharu: dilihat selepas AI_SINCE dan tidak lebih tua daripada MAX_AGE_H jam. Berita lama kekal ringkasan pendek.
  const since = Date.parse(process.env.AI_SINCE || '2026-11-25T13:20:00Z');
  const minSeen = Math.max(since, Date.now() - (Number(process.env.MAX_AGE_H) || 24) * 36e5);
  const queue = articles.filter((a) => (!a.body || a.sv !== VERSION) && a.summaryFailed !== RETRY && Date.parse(a.firstSeen) >= minSeen).slice(0, limit);
  let done = 0;
  let accountError = false;
  async function worker() {
    for (let a = queue.shift(); a; a = queue.shift()) {
      try {
        const r = await summarizeOne(a);
        if (r) { a.title = r.title; a.body = r.body; a.sv = VERSION; done++; } else { a.summaryFailed = RETRY; console.warn(`  Ditolak: "${a.originalTitle}" → ${String(lastOut).slice(0, 160).replace(/\n/g, ' ')}`); }
      } catch (e) {
        // Masalah akaun OpenAI (kunci, akses model, kredit): henti semua dan jangan tanda artikel gagal
        if ([401, 403, 404].includes(e.status) || /insufficient_quota|model_not_found/.test(e.message)) {
          if (e.model && e.model !== MODEL) { queue.unshift(a); continue; } // pekerja lain sudah tukar model
          const why = e.message.replace(/\s+/g, ' ').slice(0, 220);
          if (MODELS.length && (e.status === 404 || /model_not_found|does not exist|not have access/i.test(e.message))) {
            const failed = MODEL;
            MODEL = MODELS.shift();
            useReasoning = /^(gpt-[5-9]|o\d)/.test(MODEL);
            console.warn(`::warning::Model ${failed} ditolak (${e.status}): ${why}. Tukar ke ${MODEL}.`);
            queue.unshift(a);
            continue;
          }
          if (!accountError) console.error(`::error::OpenAI menolak permintaan (${e.status}, model ${MODEL}): ${why}`);
          accountError = true;
          queue.length = 0;
          continue;
        }
        console.warn(`  Ringkasan gagal untuk "${a.originalTitle}": ${e.status || ''} ${e.message}`);
        if (e.status && e.status < 500 && e.status !== 429) a.summaryFailed = RETRY;
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`Ringkasan AI ditulis: ${done} (model ${MODEL}); teks penuh diambil untuk ${stats.full}`);
  if (stats.calls) {
    const cost = costOf(stats);
    usage[day] = Math.round((spentBefore + cost) * 1e5) / 1e5;
    for (const k of Object.keys(usage)) if (k < new Date(Date.now() - 62 * 864e5).toISOString().slice(0, 10)) delete usage[k];
    console.log(`Token: ${stats.calls} panggilan, input ${stats.inTok} (+${stats.cachedTok} cache), output ${stats.outTok} (penaakulan ${stats.reasonTok}). Anggaran kos: USD ${cost.toFixed(4)} (USD ${(cost / stats.calls).toFixed(5)}/artikel). Hari ini: USD ${usage[day].toFixed(3)} / ${DAILY_BUDGET}`);
  }
  return done;
}

module.exports = { summarizeMissing };
