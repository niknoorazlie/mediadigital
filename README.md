# Semasa.my

Laman web berita interaktif yang mengumpul tajuk daripada suapan RSS rasmi penerbit tempatan dan antarabangsa. Setiap berita dipaut terus ke laman sumber asal.

## Ciri-ciri
- Kategori: Utama, Nasional, Dunia, Bisnes, Teknologi, Sains, Kesihatan, Sukan
- Jalur "Terkini" yang bergerak, berita utama, grid mengikut kategori dan senarai terkini dengan "Muat lagi"
- Carian langsung, penapis bahasa (BM/English) dan penapis sumber
- Topik hangat (kata kunci paling kerap 48 jam lepas, boleh diklik)
- Simpan berita (☆) dan "Paling dibaca anda" (disimpan dalam pelayar)
- Status setiap sumber (hijau = suapan berjaya dibaca)
- Tema gelap/cerah, mesra telefon
- Berita dimuat semula automatik setiap 10 minit

## Sumber
Senarai dalam `sources.json`: Bernama, Berita Harian, Harian Metro, Astro Awani, Sinar Harian, Malaysiakini, The Star, NST, Malay Mail, FMT, BBC, Al Jazeera dan The Guardian. Tambah atau buang sumber dengan menyunting fail ini (`id`, `name`, `lang`, `category`, `home`, `url`).

Alamat RSS penerbit kadang-kadang berubah. Selepas larian pertama, lihat log atau panel "Sumber kami": sumber bertitik kelabu gagal dibaca dan alamatnya perlu dikemas kini.

## Cara jalankan (Node.js 18 atau lebih baharu, tiada `npm install`)
```
node server.js
```
Buka http://localhost:3000. Tetapan pilihan: `PORT=8080`, `REFRESH_MINUTES=5`.

## Halaman berita sendiri (SEO)
Setiap berita mendapat halaman sendiri di `https://semasa.my/berita/<slug>/` dengan tajuk, ringkasan dan pautan ke laporan asal. Klik pada laman utama membuka halaman ini, bukan laman penerbit.

- **Kandungan:** tajuk dan ringkasan daripada RSS setiap sumber, dengan pautan ke laporan asal. Tiada API berbayar digunakan.
- Halaman tanpa ringkasan AI hanya memaparkan petikan pendek penerbit dan ditanda `noindex`, supaya Google tidak melihatnya sebagai kandungan pendua.
- Arkib 30 hari disimpan dalam `data/archive.json` (di-commit oleh aliran kerja) supaya halaman lama kekal wujud.
- `sitemap.xml` dan `robots.txt` dijana setiap larian. Hantar `https://semasa.my/sitemap.xml` di Google Search Console.

## Domain sendiri
Laman diterbitkan di https://semasa.my (fail `public/CNAME`). Tetapkan juga domain yang sama dalam Settings → Pages → Custom domain.

## Hosting percuma di GitHub Pages
1. Muat naik folder ini ke repositori GitHub.
2. Settings → Pages → Source: **GitHub Actions**.
3. Aliran kerja `.github/workflows/update-news.yml` akan menjana `public/data/news.json` setiap 30 minit dan menerbitkan laman.

Atau jana sekali secara manual: `node build-static.js`, kemudian hos folder `public/` di mana-mana hos statik.

## Struktur
```
server.js          pelayan + API /api/news
build-static.js    jana data/news.json untuk hosting statik
lib/feeds.js       pembaca RSS/Atom, buang pendua, susun ikut masa
sources.json       senarai sumber
public/            antara muka (index.html, styles.css, app.js)
public/data/sample.json  data contoh untuk mod pratonton
```

## Nota hak cipta
Laman ini hanya memaparkan tajuk, ringkasan pendek dan gambar kecil yang diterbitkan sendiri oleh penerbit dalam suapan RSS mereka, serta memaut ke artikel asal. Semak terma penggunaan RSS setiap penerbit sebelum digunakan secara komersial.
