(() => {
  'use strict';
  const CATS = [
    ['utama', 'Utama'], ['nasional', 'Nasional'], ['dunia', 'Dunia'], ['bisnes', 'Bisnes'],
    ['teknologi', 'Teknologi'], ['sains', 'Sains'], ['kesihatan', 'Kesihatan'], ['sukan', 'Sukan'], ['disimpan', 'Disimpan'],
  ];
  const CAT_LABEL = Object.fromEntries(CATS);
  const PAGE = 15;
  const STOP = new Set(('yang dan di ke dari untuk dengan pada ini itu dalam akan tidak oleh juga ada kepada bagi lebih telah sebagai atau baru kata selepas susulan antara bukan masih hari tahun lagi boleh mereka kerana kami kita jadi semua dijangka baharu dibuka bulan minggu negara daerah terima catat ketika setelah'
    + ' the a an of to in on for and is are was were be by with at from as after over about into new says say said its it his her their they this that will has have not more than up out who what how why when you your we our us he she no amid but can could would may first two three one reach region amid ahead news report says year week').split(' '));

  const $ = (s) => document.querySelector(s);
  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem('ws:' + k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem('ws:' + k, JSON.stringify(v)); } catch {} },
  };

  const state = { data: null, cat: 'utama', lang: 'all', sources: new Set(), q: '', shown: PAGE,
    saved: new Map(store.get('saved', []).map((a) => [a.link, a])), reads: store.get('reads', {}) };

  // ---------- util ----------
  const esc = (s = '') => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function ago(iso) {
    if (!iso) return '';
    const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
    if (m < 1) return 'baru sahaja';
    if (m < 60) return `${m} minit lalu`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h} jam lalu`;
    const d = Math.round(h / 24);
    if (d < 7) return `${d} hari lalu`;
    return new Date(iso).toLocaleDateString('ms-MY', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function hue(str) { let h = 0; for (const c of str) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }
  function initials(name) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase(); }

  function thumb(a) {
    const h = hue(a.source);
    const ph = `<div class="ph" style="background:linear-gradient(135deg,hsl(${h} 45% 32%),hsl(${(h + 40) % 360} 50% 20%))">${esc(initials(a.sourceName))}</div>`;
    const img = a.image ? `<img src="${esc(a.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : '';
    return `<div class="thumb">${ph}${img}</div>`;
  }
  function meta(a, withCat = true) {
    return `<div class="meta"><span class="src">${esc(a.sourceName)}</span>${withCat ? `<span class="cat-tag">${esc(CAT_LABEL[a.category] || a.category)}</span>` : ''}<span>${ago(a.date)}</span><span class="lang">${a.lang === 'ms' ? 'BM' : 'EN'}</span></div>`;
  }
  const saveBtn = (a) => `<button class="save ${state.saved.has(a.link) ? 'on' : ''}" data-save="${esc(a.link)}" aria-label="Simpan berita" title="Simpan untuk dibaca kemudian">${state.saved.has(a.link) ? '★' : '☆'}</button>`;
  // Berita dibuka di halaman sendiri; pautan ke sumber asal ada dalam halaman itu.
  const href = (a) => a.slug ? `/berita/${encodeURIComponent(a.slug)}/` : a.link;
  const ext = (a) => a.slug ? '' : ' target="_blank" rel="noopener"';
  const link = (a, inner, cls = 'card') => `<article class="${cls}">${saveBtn(a)}<a href="${esc(href(a))}"${ext(a)} data-read="${esc(a.link)}">${inner}</a></article>`;

  const cardLead = (a) => link(a, `${thumb(a)}${meta(a)}<h3>${esc(a.title)}</h3>${a.summary ? `<p>${esc(a.summary)}</p>` : ''}`, 'card lead');
  const cardSmall = (a) => link(a, `${thumb(a)}<div>${meta(a, false)}<h3>${esc(a.title)}</h3></div>`);
  const cardGrid = (a) => link(a, `${thumb(a)}${meta(a, false)}<h3>${esc(a.title)}</h3>`);
  const rowItem = (a) => `<li>${link(a, `<div>${meta(a)}<h3>${esc(a.title)}</h3>${a.summary ? `<p>${esc(a.summary)}</p>` : ''}</div>${thumb(a)}`, 'card row')}</li>`;

  // ---------- filtering ----------
  function filtered({ ignoreCat = false } = {}) {
    let list = state.cat === 'disimpan' && !ignoreCat ? [...state.saved.values()] : state.data.articles;
    if (!ignoreCat && !state.q && !['utama', 'disimpan'].includes(state.cat)) list = list.filter((a) => a.category === state.cat);
    if (state.lang !== 'all') list = list.filter((a) => a.lang === state.lang);
    if (state.sources.size) list = list.filter((a) => state.sources.has(a.source));
    if (state.q) {
      const terms = state.q.toLowerCase().split(/\s+/).filter(Boolean);
      list = list.filter((a) => { const t = (a.title + ' ' + a.summary + ' ' + a.sourceName).toLowerCase(); return terms.every((w) => t.includes(w)); });
    }
    return list;
  }

  // ---------- render ----------
  function renderNav() {
    $('#cats').innerHTML = CATS.map(([id, label]) => `<button data-cat="${id}" class="${state.cat === id ? 'on' : ''}">${label}${id === 'disimpan' && state.saved.size ? `<span class="badge">${state.saved.size}</span>` : ''}</button>`).join('');
  }
  function renderChips() {
    const counts = {};
    state.data.articles.forEach((a) => { counts[a.source] = (counts[a.source] || 0) + 1; });
    $('#sourceChips').innerHTML = state.data.sources.filter((s) => counts[s.id] && (state.lang === 'all' || s.lang === state.lang))
      .map((s) => `<button class="chip ${state.sources.has(s.id) ? 'on' : ''}" data-src="${s.id}">${esc(s.name)}</button>`).join('');
  }
  function renderTicker() {
    const items = state.data.articles.slice(0, 14).map((a) => `<a href="${esc(href(a))}"${ext(a)} data-read="${esc(a.link)}"><b>${esc(a.sourceName)}</b>${esc(a.title)}</a>`).join('');
    $('#ticker').innerHTML = items + items;
  }

  function renderMain() {
    const list = filtered();
    const browsing = state.cat === 'utama' && !state.q && !state.sources.size;
    $('#pageTitle').textContent = state.q ? `Hasil carian: “${state.q}”` : CAT_LABEL[state.cat];
    $('#count').textContent = `${list.length} berita`;

    if (!list.length) {
      $('#hero').innerHTML = ''; $('#sections').innerHTML = '';
      $('#latest').innerHTML = `<li class="empty">${state.cat === 'disimpan' ? 'Belum ada berita disimpan. Tekan ☆ pada mana-mana berita untuk menyimpannya.' : 'Tiada berita sepadan dengan penapis anda.'}</li>`;
      $('#more').hidden = true; return;
    }

    const withImg = list.filter((a) => a.image);
    const lead = state.cat === 'disimpan' ? list[0] : (withImg[0] || list[0]);
    const stack = list.filter((a) => a !== lead).slice(0, 4);
    $('#hero').innerHTML = `${cardLead(lead)}<div class="stack">${stack.map(cardSmall).join('')}</div>`;
    const used = new Set([lead, ...stack]);

    if (browsing && state.lang === 'all') {
      $('#sections').innerHTML = CATS.slice(1, -1).map(([id, label]) => {
        const items = list.filter((a) => a.category === id && !used.has(a)).slice(0, 4);
        if (items.length < 2) return '';
        items.forEach((a) => used.add(a));
        return `<div class="cat-sec"><div class="sec-head"><h2>${label}</h2><button class="all" data-cat="${id}">Semua ${label.toLowerCase()} →</button></div><div class="grid">${items.map(cardGrid).join('')}</div></div>`;
      }).join('');
    } else $('#sections').innerHTML = '';

    const rest = list.filter((a) => !used.has(a) || !browsing);
    const rows = (browsing ? rest : list.slice(5));
    $('#latest').innerHTML = rows.slice(0, state.shown).map(rowItem).join('') || '<li class="empty">Itu sahaja buat masa ini.</li>';
    $('#more').hidden = rows.length <= state.shown;
  }

  function renderSide() {
    // Topik hangat: kata kunci paling kerap dalam tajuk 48 jam lepas
    const since = Date.now() - 48 * 3600e3;
    const freq = {};
    state.data.articles.filter((a) => !a.date || Date.parse(a.date) > since).forEach((a) => {
      new Set(a.title.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, ' ').split(/\s+/)).forEach((w) => {
        if (w.length > 3 && !STOP.has(w) && !/^\d+$/.test(w)) freq[w] = (freq[w] || 0) + 1;
      });
    });
    const top = Object.entries(freq).filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]).slice(0, 14);
    $('#topics').innerHTML = top.length ? top.map(([w, n]) => `<button data-topic="${esc(w)}">${esc(w)}<small>${n}</small></button>`).join('') : '<span class="muted small">Belum cukup data.</span>';

    // Paling dibaca anda (direkod dalam pelayar ini sahaja)
    const byLink = new Map(state.data.articles.map((a) => [a.link, a]));
    const read = Object.entries(state.reads).filter(([l]) => byLink.has(l)).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([l]) => byLink.get(l));
    const list = read.length >= 3 ? read : state.data.articles.slice(0, 5);
    $('#mostRead').innerHTML = list.map((a) => `<li><div><a href="${esc(href(a))}"${ext(a)} data-read="${esc(a.link)}">${esc(a.title)}</a><div class="meta"><span class="src">${esc(a.sourceName)}</span><span>${ago(a.date)}</span></div></div></li>`).join('');
    $('#mostRead').previousElementSibling.textContent = read.length >= 3 ? 'Paling dibaca anda' : 'Pilihan terkini';

    const status = Object.fromEntries((state.data.status || []).map((s) => [s.id, s]));
    $('#sourceList').innerHTML = state.data.sources.map((s) => {
      const st = status[s.id]; const ok = st ? st.ok : true;
      return `<li><button data-src="${s.id}" title="${ok ? 'Tapis sumber ini' : esc(st.error || '')}"><span class="dot ${ok ? '' : 'off'}"></span>${esc(s.name)}</button><a class="muted small" href="${esc(s.home)}" target="_blank" rel="noopener">laman ↗</a></li>`;
    }).join('');
    $('#updated').textContent = state.data.generatedAt ? `Dikemas kini ${ago(state.data.generatedAt)}` : '';
  }

  function render() { renderNav(); renderChips(); renderMain(); }

  // ---------- events ----------
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-cat],[data-src],[data-topic],[data-save],[data-read],[data-lang]');
    if (!t) return;
    if (t.dataset.save) {
      e.preventDefault(); e.stopPropagation();
      const l = t.dataset.save;
      if (state.saved.has(l)) state.saved.delete(l);
      else { const a = state.data.articles.find((x) => x.link === l); if (a) state.saved.set(l, a); }
      store.set('saved', [...state.saved.values()]);
      render(); return;
    }
    if (t.dataset.read) { state.reads[t.dataset.read] = (state.reads[t.dataset.read] || 0) + 1; store.set('reads', state.reads); setTimeout(renderSide, 300); return; }
    if (t.dataset.cat) { e.preventDefault(); state.cat = t.dataset.cat; state.shown = PAGE; state.q = ''; $('#q').value = ''; location.hash = t.dataset.cat === 'utama' ? '' : t.dataset.cat; render(); scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (t.dataset.src) { const s = t.dataset.src; state.sources.has(s) ? state.sources.delete(s) : state.sources.add(s); state.shown = PAGE; render(); return; }
    if (t.dataset.topic) { state.q = t.dataset.topic; $('#q').value = state.q; state.cat = 'utama'; state.shown = PAGE; render(); scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (t.dataset.lang) { state.lang = t.dataset.lang; state.sources.clear(); document.querySelectorAll('#langSeg button').forEach((b) => b.classList.toggle('on', b === t)); state.shown = PAGE; render(); }
  });
  let qt; $('#q').addEventListener('input', (e) => { clearTimeout(qt); qt = setTimeout(() => { state.q = e.target.value.trim(); state.shown = PAGE; render(); }, 180); });
  $('#more').addEventListener('click', () => { state.shown += PAGE; renderMain(); });
  const isDark = () => (document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark';
  $('#themeBtn').addEventListener('click', () => { const t = isDark() ? 'light' : 'dark'; document.documentElement.dataset.theme = t; store.set('theme', t); });
  const savedTheme = store.get('theme', null); if (savedTheme) document.documentElement.dataset.theme = savedTheme;
  $('#yr').textContent = new Date().getFullYear();

  // ---------- data ----------
  async function load() {
    if (window.WARTA_DATA) return { data: window.WARTA_DATA, demo: true };
    for (const url of ['/api/news', 'data/news.json']) {
      try { const r = await fetch(url, { cache: 'no-store' }); if (r.ok) { const d = await r.json(); if (d.articles?.length) return { data: d }; } } catch {}
    }
    const r = await fetch('data/sample.json'); return { data: await r.json(), demo: true };
  }
  async function boot() {
    const { data, demo } = await load();
    state.data = data;
    if (demo) { // anjak masa data contoh supaya kelihatan semasa
      const shift = Date.now() - Date.parse(data.generatedAt);
      data.articles.forEach((a) => { if (a.date) a.date = new Date(Date.parse(a.date) + shift).toISOString(); });
      data.generatedAt = new Date().toISOString();
    }
    if (demo) $('#notice').innerHTML = '<div class="notice"><b>Mod pratonton:</b> tajuk di bawah ialah data contoh, bukan berita sebenar. </div>';
    const h = location.hash.slice(1); if (CAT_LABEL[h]) state.cat = h;
    renderTicker(); render(); renderSide();
  }
  boot();
  // Muat semula setiap 10 minit apabila menggunakan pelayan
  setInterval(async () => { if (window.WARTA_DATA) return; const { data, demo } = await load(); if (!demo) { state.data = data; renderTicker(); render(); renderSide(); } }, 10 * 60 * 1000);
})();
