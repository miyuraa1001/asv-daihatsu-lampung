# Product Requirement Document (PRD)
## Asset Scan & Verification System (ASV)
### Astra Daihatsu Asset Management – DSO Regional Lampung

---

## 1. Executive Summary & Problem Statement

### 1.1 Latar Belakang & Problem Statement
Pelaksanaan Stock Opname aset fisik di lingkungan PT Astra International Tbk - Daihatsu Sales Operation (DSO) Regional Lampung mencakup 5 jaringan cabang operasional (`D660 Lampung A. Yani`, `D661 Lampung S. Hatta`, `D662 Bandar Jaya`, `D663 Lampung Utara`, dan `D664 Lampung Timur`).

Sebelum adanya sistem ASV, inventarisasi aset menghadapi tantangan:
- **Pencatatan Manual Berbasis Kertas:** Rawan salah ketik (*human error*), risiko lembar inventaris hilang, dan lambatnya pencocokan data dengan SAP Asset Register.
- **Verifikasi Fisik & Label Tidak Terstandarisasi:** Kondisi kerusakan fisik aset atau hilangnya stiker barcode tidak terdokumentasi visual secara langsung di lapangan.
- **Ketiadaan Real-time Monitoring:** Manajemen cabang dan auditor internal kesulitan memantau progress opname antar-ruangan dan status kesehatan aset tanpa menunggu rekapitulasi akhir tahun/kuartal.

### 1.2 Solusi Produk (ASV)
**Asset Scan & Verification System (ASV)** adalah aplikasi web terpadu berbasis cloud yang memungkinkan petugas internal audit dan operasional cabang untuk:
1. Melakukan pemindaian barcode/QR code aset secara langsung menggunakan kamera smartphone atau barcode scanner handheld.
2. Memverifikasi kesesuaian lokasi fisik terkini dengan Master SAP.
3. Mendokumentasikan kondisi fisik aset dan label barcode, lengkap dengan lampiran foto bukti temuan langsung dari perangkat.
4. Memantau progres opname secara *real-time* melalui interactive visual dashboard.
5. Melakukan ekspor laporan terverifikasi ke format Microsoft Excel (.xlsx) dan sinkronisasi dua arah ke Google Sheets database via secure serverless proxy.

---

## 2. Current Features & User Flow

### 2.1 Fitur yang Aktif Berjalan (Current Features)

#### A. Autentikasi & Sesi Petugas (Mandatory Auth Guard)
- **Modal Login Barrier:** Modal login tertutup rapat tanpa tombol penutup (X) atau penutup klik backdrop bagi pengguna yang belum terautentikasi.
- **Verifikasi Kredensial:** Otentikasi NPK & Kata Sandi melalui API endpoint `/api/proxy` (action: `checkLogin`).
- **Fitur "Ingat Saya":** Menyimpan preferensi NPK/Sandi di local storage untuk mempermudah login berikutnya.
- **State Pengguna Dinamis:** Tampilan profil di sidebar dan settings view otomatis menyesuaikan identitas petugas aktif (nama, inisial avatar, role).
- **Logout Aman:** Menghapus sesi `asv_active_user`, mereset UI ke kondisi unauthenticated, dan menampilkan kembali form login.

#### B. Dashboard Stock Opname (Pro-Insight Edition)
- **Ring Progress Indikator:** Persentase dan rasio aset yang berhasil diverifikasi vs total target aset terdaftar.
- **Kartu Metrik KPI (Interactive Filters):**
  - *Total Aset Terdaftar:* Navigasi langsung ke Daftar Master Aset.
  - *Aset Terscan:* Navigasi ke view dinamis daftar aset yang sudah berstatus opname.
  - *Belum Di-scan:* Navigasi ke view dinamis daftar aset pending yang belum tersentuh.
- **Multi-color Progress Bar Chart:** Grafik batang proporsional status fisik aset (Baik, Rusak Ringan, Rusak Berat, Hilang) dengan dukungan switch sudut pandang (Status Aset vs Status Label).
- **Live Activity Feed:** Feed 3 aktivitas pemindaian terakhir yang diperbarui secara otomatis.

#### C. Daftar Master Data Aset
- **Tabel Responsif:** Menampilkan ID Asset, Sub-Number, Business Area, Deskripsi Aset, Tanggal Kapitalisasi, Ruangan (*Room*), dan tombol aksi.
- **Pencarian & Multi-Filter:** Pencarian teks bebas (ID/Deskripsi), filter ruangan dinamis, dan filter cabang regional.
- **Paginasi Data:** Client-side pagination (15 item/halaman) dengan navigasi halaman intuitif.
- **Tambah Aset Baru:** Modal formulir untuk menambah unit aset baru ke database Google Sheets (action: `addMasterAsset`).

#### D. Engine Pemindaian & Verifikasi Opname (Core Flow)
- **3 Metode Input Terpadu:**
  1. *Kamera Langsung:* Pemindaian barcode/QR realtime via library `html5-qrcode`.
  2. *Unggah Foto Barcode:* Pembacaan barcode dari berkas gambar yang tersimpan.
  3. *Input Manual ID Aset:* Pencarian cepat berdasarkan nomor ID aset SAP.
- **Proteksi Duplikasi Scan:** Pengecekan otomatis apakah ID Asset dan Sub-Number sudah pernah diverifikasi pada periode berjalan.
- **Modal Form Verifikasi Opname:**
  - Konfirmasi/penyesuaian Ruangan Aktual vs Ruangan SAP.
  - Pemilihan status kondisi fisik aset: *Baik*, *Rusak Ringan*, *Rusak Berat*, *Hilang*.
  - Pemilihan status label barcode: *Baik*, *Rusak*, *Tidak Ada*.
  - *Conditional Mandatory Attachment:* Wajib melampirkan foto temuan kamera dan catatan keterangan jika aset atau label dalam kondisi rusak.
  - Kompresi foto bukti otomatis (JPEG quality 0.7) sebelum transmisi.
  - Audio Feedback: Suara notifikasi suara sukses atau peringatan error.

#### E. Log Riwayat Pemindaian & Audit Trail
- **Log Komprehensif:** Riwayat mencatat No, Tanggal Scan, Nomor Aset, Sub-number, Cabang, Deskripsi, Lokasi SAP, Lokasi Aktual, Waktu Scan, Status Aset, Status Label, Metode (Scan/Manual), Lampiran Foto Temuan, dan Keterangan.
- **Pratinjau Foto Temuan:** Modal popup untuk melihat foto bukti kondisi aset.
- **Export Excel Otomatis:** Ekspor seluruh atau subset data riwayat ke berkas `.xlsx` terformat menggunakan library SheetJS.
- **Pembersihan Log:** Opsi pengosongan riwayat lokal dengan dialog konfirmasi bertahap.

#### F. Rekapitulasi & Pengaturan Sistem
- **Rekapitulasi Ruangan & Cabang:** Pemetaan volume aset per lokasi untuk memudahkan penelusuran fisik.
- **Ubah Kata Sandi Petugas:** Form pembaruan kata sandi akun petugas aktif (action: `updatePassword`).
- **Background Sync Engine:** Sinkronisasi senyap (*silent poll*) setiap 10 detik untuk memastikan data multi-device tetap mutakhir tanpa menginterupsi interaksi pengguna.

---

### 2.2 Alur Pengguna (User Flow)

```
[Buka Aplikasi]
       │
       ▼
[Cek Sesi Petugas di LocalStorage?]
 ├── TIDAK ──► [Kunci Modal Login] ──► [Input NPK & Sandi] ──► [POST /api/proxy (checkLogin)]
 │                                                                       │ (Sukses)
 └── YA ─────────────────────────────────────────────────────────────────┴──► [Dashboard Utama]
                                                                                   │
      ┌────────────────────────┬───────────────────────────┬───────────────────────┤
      ▼                        ▼                           ▼                       ▼
 [Pilih Cabang]        [Pilih Metode Scan]         [Buka Master Aset]       [Lihat Riwayat & Export]
      │                        │                           │                       │
 [Filter Data]     ┌───────────┼───────────┐         [Tambah / Cari]       [Download File .xlsx]
                   ▼           ▼           ▼               │
               (Kamera)     (Upload)    (Manual)           │
                   └───────────┬───────────┘               │
                               ▼                           │
                     [Aset Ditemukan di DB?]               │
                      ├── TIDAK ──► [Tampilkan Alert]      │
                      └── YA                               │
                          │                                │
                          ▼                                ▼
                 [Modal Form Opname] ◄─────────────────────┘
                 - Status Fisik & Label
                 - Lokasi Aktual
                 - Foto Bukti (Kondisi Rusak)
                          │
                          ▼
                 [Simpan Log Opname]
                          │
                          ▼
                 [POST /api/proxy (addLog)]
                          │
                          ▼
                 [Audio Beep + Update Log & KPI]
```

---

## 3. Current Technical Architecture

### 3.1 Struktur File Hasil Decoupling

Arsitektur kode telah dipisahkan secara modular (*clean decoupling*) tanpa mengubah fungsionalitas, ID DOM, atau struktur logika:

```
asv-daihatsu-lampung/
├── index.html          # Markup HTML semantik murni, struktur UI, & deklarasi CDN
├── css/
│   └── style.css       # Definisi font Inter, custom scrollbar, dan animasi laser scanner
├── js/
│   └── script.js       # Core Application Logic, State Manager, DOM Manipulation, & API Client
├── api/
│   └── proxy.js        # Vercel Serverless Function (BFF / Proxy ke Google Apps Script)
├── PRD.md              # Dokumen spesifikasi produk & arsitektur teknis
└── vercel.json         # Konfigurasi routing & environment deployment (jika ada)
```

### 3.2 Rincian Modul & Tanggung Jawab

| File / Modul | Peran & Tanggung Jawab |
|---|---|
| `index.html` | Struktur visual kerangka aplikasi (Header, Sidebar, 5 Views utama, 6 Modals). Mengimpor Tailwind CSS CDN, Font Awesome, SheetJS, HTML5-QRCode, `css/style.css`, dan `js/script.js`. |
| `css/style.css` | Import font Google Inter, styling custom scrollbar webkit, serta keyframe animation `.animate-laser` untuk visual scanner. |
| `js/script.js` | Seluruh state aplikasi (`assets`, `historyLogs`, `activeOpnameAsset`, filter flags), event listeners, DOM builders, modul kamera `Html5Qrcode`, ekspor XLSX, dan otentikasi. |
| `api/proxy.js` | Menengahi panggilan API frontend menuju Google Apps Script Web App URL (`GAS_WEB_APP_URL`). Mengamankan token rahasia (`GAS_SECRET_TOKEN`) dari browser client serta mengelola CORS dan HTTP 302 redirect. |

### 3.3 Alur Data & State Management

1. **State Store Client-Side (`js/script.js`):**
   - `assets`: Array objek master aset Astra Daihatsu yang dimuat dari server.
   - `historyLogs`: Array log audit verifikasi stock opname.
   - `activeOpnameAsset`: Objek aset yang sedang diverifikasi di dalam modal.
   - `asv_active_user`: Objek JSON tersimpan di `localStorage` berisi sesi petugas aktif.
   - `branchSelector`: Filter cabang aktif (`ALL`, `D660`, `D661`, `D662`, `D663`, `D664`).
2. **Komunikasi API Proxy (`/api/proxy`):**
   - `GET /api/proxy?action=getMaster`: Mengambil seluruh database master aset dari spreadsheet.
   - `GET /api/proxy?action=getLogs`: Mengambil data seluruh log opname yang tersimpan.
   - `POST /api/proxy` (`action: "checkLogin"`): Otentikasi username/NPK & password.
   - `POST /api/proxy` (`action: "addLog"`): Menyimpan entri baru verifikasi aset beserta foto bukti base64.
   - `POST /api/proxy` (`action: "addMasterAsset"`): Menambahkan aset baru ke sheet master.
   - `POST /api/proxy` (`action: "updatePassword"`): Memperbarui kata sandi akun petugas.

---

## 4. Security & Quality Checklist

### 4.1 Audit Implementasi Saat Ini

| Area Keamanan / Kualitas | Status | Catatan Audit & Evaluasi |
|---|:---:|---|
| **Pemisahan Kredensial Backend** | ✅ Aman | Frontend tidak menyimpan secret token Google Apps Script secara terbuka. Token diinjeksi melalui Vercel Environment Variables (`GAS_SECRET_TOKEN`) di `api/proxy.js`. |
| **Proteksi Auth Gate di Client** | ✅ Aman | Modal login tidak dapat ditutup melalui tombol silang, klik backdrop, maupun tombol Escape keyboard sebelum autentikasi terverifikasi. |
| **Sanitasi DOM & Injeksi HTML** | ⚠️ Waspada | Terdapat beberapa bagian template string `innerHTML` untuk rendering tabel yang mengambil nilai properti spreadsheet. Disarankan mengimplementasikan escaping entity HTML secara konsisten untuk mencegah potensi Stored XSS jika spreadsheet disunting pihak eksternal. |
| **Validasi Ukuran Foto Bukti** | ✅ Aman | Foto bukti dari kamera dikompresi ke format JPEG kualitas 0.7 melalui HTML Canvas sebelum diunggah, mencegah pembengkakan memori dan payload request timeout. |
| **Integritas Penyimpanan Sesi** | ℹ️ Cukup | Sesi login disimpan di `localStorage`. Untuk tahap enterprise berikutnya, dapat dipertimbangkan migrasi ke token berwaktu kedaluwarsa (*expiring JWT*) atau session cookies bertipe `HttpOnly`. |
| **Penanganan Duplikasi Data** | ✅ Aman | Terdapat validasi ID & Sub-number di client sebelum pengiriman data opname ke backend. |

---

## 5. Future Roadmap & Development Ideas (Non-breaking Improvements)

### Phase 1: Performance & UX Polish (Jangka Pendek)
- **HTML Entity Escaping Helper:** Menambahkan fungsi utilitas pembersih string global (`escapeHtml()`) pada seluruh render tabel tanpa mengubah struktur komponen.
- **Optimasi Bundle Offline (PWA):** Menambahkan `manifest.json` dan Service Worker dasar agar aset CSS, JS, dan ikon dapat dimuat secara instan (*cache-first*) saat sinyal seluler di area gudang/ruangan minim sinyal.
- **Tabel Virtualized / Lazy Rendering:** Mempercepat rendering jika master aset mencapai di atas 10.000 baris.

### Phase 2: Offline-First Capability (Jangka Menengah)
- **Offline Storage Queue (IndexedDB):** Mengizinkan petugas tetap melakukan scan dan input saat sambungan internet terputus di dalam bunker/basement, lalu data akan disinkronisasikan otomatis (*auto-flush queue*) begitu jaringan internet kembali stabil.
- **Batch Scanning Mode:** Mode pemindaian cepat di mana kamera terus aktif dan membunyikan beep berturut-turut untuk ruangan dengan ratusan unit aset berjejer.

### Phase 3: Advanced Asset Analytics (Jangka Panjang)
- **Cetak Label QR Mandiri (Web Print):** Fitur cetak ulang barcode/QR code langsung dari aplikasi web untuk aset yang berstatus "Label Rusak" atau "Label Hilang".
- **Dashboard Eksekutif Regional:** Halaman perbandingan performa audit lintas cabang (D660 s/d D664) dengan ringkasan nilai aset yang mengalami depresiasi atau write-off.
- **Audit Geolocation Tagging:** Penyimpanan koordinat GPS lokasi pemindaian untuk verifikasi keabsahan fisik opname cabang.

---
*Dokumen ini diperbarui secara berkala mengikuti arsitektur rilis resmi ASV Astra Daihatsu Lampung.*

