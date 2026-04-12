# 📐 BLUEPRINT FITUR — Kapper's Barbershop ERP System  
### Dokumen Referensi Pengembangan Lanjutan  
*Terakhir diperbarui: 11 April 2026*

---

## 📁 ARSITEKTUR PROYEK SAAT INI

```
barber2-test/
├── index.html          → Landing Page publik (booking, layanan, galeri, barbers)
├── admin.html          → Dashboard Admin SPA (semua tab dalam 1 file)
├── login.html          → Login page admin (Supabase Auth)
├── css/
│   ├── style.css       → Global design system + landing page styles
│   └── admin.css       → Admin dashboard styles + responsive breakpoints
├── js/
│   ├── supabase.js     → Supabase client init + semua DB CRUD functions
│   ├── app.js          → Landing page logic (booking form, fetch services/capster/gallery)
│   ├── admin.js        → Admin dashboard logic (tab nav, semua CRUD, kasir/POS)
│   └── login.js        → Login form handler
└── assets/             → Static assets (gambar, dll)
```

### Tech Stack
- **Frontend**: Vanilla HTML/CSS/JS (tanpa framework)
- **Backend/DB**: Supabase (PostgreSQL + Auth + REST API)
- **CDN Libraries**: Chart.js, SweetAlert2, html2canvas, Phosphor Icons
- **Font**: Plus Jakarta Sans (Google Fonts)

---

## 🗄️ SKEMA DATABASE SUPABASE (TABEL YANG SUDAH ADA)

| Tabel | Kolom Utama | Keterangan |
|-------|------------|------------|
| `bookings` | `id` (uuid), `service_id` (text), `barber_id` (text), `booking_date` (date), `time_slot` (text), `customer_name` (text), `customer_phone` (text), `status` (text: pending/completed/cancelled), `created_at` | Reservasi pelanggan |
| `employees` | `id` (uuid), `name` (text), `role_title` (text), `salary_type` (text: percentage/fixed), `salary_value` (numeric), `ig_username` (text), `tiktok_username` (text), `is_active` (boolean), `created_at` | Data kapster/staff |
| `services` | `id` (uuid), `name` (text), `description` (text), `price` (numeric), `created_at` | Daftar layanan |
| `products` | `id` (uuid), `name` (text), `price` (numeric), `stock` (int), `created_at` | Produk fisik (pomade dll) |
| `transactions` | `id` (uuid), `booking_id` (uuid FK→bookings), `total_amount` (numeric), `commission_amount` (numeric), `items` (jsonb), `created_at` | Riwayat transaksi kasir |
| `expenses` | `id` (uuid), `description` (text), `amount` (numeric), `expense_date` (date), `created_at` | Pengeluaran operasional |
| `gallery` | `id` (uuid), `title` (text), `image_url` (text), `created_at` | Portofolio galeri |
| `promos` | `id` (uuid), `code` (varchar), `discount_value` (int4), `valid_until` (date), `created_at` | Voucher promo |
| `site_settings` | `id` (uuid), *(kolom perlu dicek/buat)* | Pengaturan website |

### Auth Setup
- Menggunakan **Supabase Auth (email/password)**
- Admin email hardcoded: `owner@barber.com`
- Role check di `admin.js` → `ADMIN_EMAILS` array
- Non-admin = Kasir (akses terbatas)

---

## 🔴 FITUR 1: DASHBOARD CHART (GRAFIK KEUANGAN)

### Status: Canvas HTML sudah ada, tapi TIDAK di-render

### Deskripsi
Element `<canvas id="financeChart">` sudah ada di `admin.html` (dalam `tab-laporan`), library **Chart.js** sudah di-load via CDN, tapi **tidak ada kode JS** yang merender chart-nya.

### Lokasi File
- **HTML**: `admin.html` line ~205 → `<canvas id="financeChart"></canvas>`
- **JS**: `admin.js` fungsi `fetchLaporan()` — tambahkan logic chart di sini
- **CDN**: `<script src="https://cdn.jsdelivr.net/npm/chart.js">` sudah loaded

### Spesifikasi Teknis

```javascript
// Tambahkan di akhir fungsi fetchLaporan() setelah semua kalkulasi selesai
// Data yang sudah tersedia di scope: totalOmzet, totalKomisi, totalPengeluaran, profit

// Opsi 1: Bar Chart sederhana (summary bulan ini)
const ctx = document.getElementById('financeChart').getContext('2d');

// Destroy chart lama jika ada (penting supaya ga numpuk)
if (this.financeChartInstance) this.financeChartInstance.destroy();

this.financeChartInstance = new Chart(ctx, {
    type: 'bar', // atau 'doughnut' untuk pie chart
    data: {
        labels: ['Omzet', 'Komisi', 'Pengeluaran', 'Laba Bersih'],
        datasets: [{
            label: 'Rp',
            data: [totalOmzet, totalKomisi, totalPengeluaran, profit],
            backgroundColor: ['#0F172A', '#ef4444', '#f97316', '#22c55e'],
            borderRadius: 8
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
            y: {
                ticks: {
                    callback: v => 'Rp ' + v.toLocaleString()
                }
            }
        }
    }
});
```

```javascript
// Opsi 2: Line Chart trend harian (lebih advanced)
// Group transaksi per tanggal → tampilkan line chart 30 hari terakhir
const dailyData = {};
data.forEach(trx => {
    const dateKey = new Date(trx.created_at).toLocaleDateString();
    if (!dailyData[dateKey]) dailyData[dateKey] = 0;
    dailyData[dateKey] += parseFloat(trx.total_amount);
});

// Render sebagai line chart dengan labels = tanggal, data = total per hari
```

### Variabel yang Perlu Ditambah di adminLogic Object
```javascript
financeChartInstance: null, // Tambahkan di bagian atas adminLogic object
```

### Catatan Penting
- Selalu `destroy()` chart lama sebelum render ulang (anti memory leak)
- Container chart punya `height: 300px` di HTML inline style
- Pastikan `maintainAspectRatio: false` supaya chart ikut container

---

## 🔴 FITUR 2: INTEGRASI PROMO/VOUCHER KE BOOKING FORM

### Status: CRUD Voucher sudah jadi di admin, tapi belum bisa dipakai pelanggan

### Deskripsi
Pelanggan harus bisa memasukkan kode voucher saat booking di landing page (`index.html`). Sistem memvalidasi kode, cek expired, lalu apply diskon ke tampilan summary.

### Lokasi File  
- **HTML**: `index.html` → Tambah input field di Step 4 (Summary/Konfirmasi)
- **JS**: `app.js` → Tambah logic validasi voucher
- **DB**: `supabase.js` → Tambah fungsi `validatePromo(code)`

### Spesifikasi Teknis

#### 1. Tambah fungsi DB baru di `supabase.js`:
```javascript
async validatePromo(code) {
    try {
        const { data, error } = await supabaseClient
            .from('promos')
            .select('*')
            .eq('code', code.toUpperCase())
            .gte('valid_until', new Date().toISOString().split('T')[0])
            .single();
        
        if (error) throw error;
        return { success: true, data };
    } catch (error) {
        return { success: false, error: 'Kode promo tidak valid atau sudah kadaluarsa.' };
    }
}
```

#### 2. Tambah UI di `index.html` (Step 4 - Summary):
```html
<!-- Di dalam booking-step 4, sebelum tombol Konfirmasi -->
<div class="form-group">
    <label>Punya Kode Voucher? (Opsional)</label>
    <div style="display:flex; gap:0.5rem;">
        <input type="text" id="promo-code-input" class="form-control" 
               placeholder="Masukkan kode promo" style="text-transform:uppercase;">
        <button type="button" class="btn btn-outline" id="btn-apply-promo">Pakai</button>
    </div>
    <div id="promo-result" style="margin-top:0.5rem; font-size:0.85rem;"></div>
</div>
```

#### 3. Logic di `app.js`:
```javascript
let appliedPromo = null; // state untuk promo yang diapply

document.getElementById('btn-apply-promo').addEventListener('click', async () => {
    const code = document.getElementById('promo-code-input').value.trim();
    if (!code) return;
    
    const res = await window.db.validatePromo(code);
    const resultEl = document.getElementById('promo-result');
    
    if (res.success) {
        appliedPromo = res.data;
        resultEl.innerHTML = `✅ Potongan <strong>Rp ${res.data.discount_value.toLocaleString()}</strong> berhasil diapply!`;
        resultEl.style.color = '#22c55e';
        // Update summary price display (kurangi dari harga layanan)
    } else {
        appliedPromo = null;
        resultEl.innerHTML = `❌ ${res.error}`;
        resultEl.style.color = '#ef4444';
    }
});

// Saat submit booking, sertakan info promo di payload:
// payload.promo_code = appliedPromo ? appliedPromo.code : null;
// payload.discount_amount = appliedPromo ? appliedPromo.discount_value : 0;
```

#### 4. Tambah kolom di tabel `bookings` (Supabase SQL):
```sql
ALTER TABLE bookings ADD COLUMN promo_code TEXT DEFAULT NULL;
ALTER TABLE bookings ADD COLUMN discount_amount NUMERIC DEFAULT 0;
```

---

## 🔴 FITUR 3: FILTER & SEARCH DI BOOKING TABLE

### Status: Tabel booking load semua data tanpa filter

### Deskripsi
Admin bisa filter booking berdasarkan tanggal, status, dan nama pelanggan.

### Lokasi File
- **HTML**: `admin.html` → `tab-bookingjadwal` section, tambah filter bar di atas tabel
- **JS**: `admin.js` → Modifikasi `renderTable()` atau buat `filterBookings()`

### Spesifikasi Teknis

#### 1. Tambah Filter Bar HTML (di atas tabel booking):
```html
<!-- Di dalam tab-bookingjadwal, setelah admin-topbar, sebelum table-container -->
<div style="display:flex; gap:0.75rem; margin-bottom:1.5rem; flex-wrap:wrap; align-items:center;">
    <input type="date" id="filter-booking-date" class="form-control" 
           style="width:auto;" title="Filter Tanggal">
    <select id="filter-booking-status" class="form-control" style="width:auto;">
        <option value="">Semua Status</option>
        <option value="pending">Pending</option>
        <option value="completed">Completed</option>
        <option value="cancelled">Cancelled</option>
    </select>
    <input type="text" id="filter-booking-search" class="form-control" 
           placeholder="Cari nama pelanggan..." style="flex:1; min-width:200px;">
    <button class="btn btn-outline" onclick="adminLogic.applyBookingFilter()">
        <i class="ph ph-funnel"></i> Filter
    </button>
    <button class="btn btn-outline" onclick="adminLogic.clearBookingFilter()">
        <i class="ph ph-x"></i> Reset
    </button>
</div>
```

#### 2. Logic di `admin.js`:
```javascript
applyBookingFilter() {
    const dateFilter = document.getElementById('filter-booking-date').value;
    const statusFilter = document.getElementById('filter-booking-status').value;
    const searchFilter = document.getElementById('filter-booking-search').value.toLowerCase();
    
    let filtered = this.bookingsCache;
    
    if (dateFilter) {
        filtered = filtered.filter(b => b.booking_date === dateFilter);
    }
    if (statusFilter) {
        filtered = filtered.filter(b => b.status === statusFilter);
    }
    if (searchFilter) {
        filtered = filtered.filter(b => 
            b.customer_name.toLowerCase().includes(searchFilter) ||
            b.customer_phone.includes(searchFilter)
        );
    }
    
    this.renderTable(filtered);
},

clearBookingFilter() {
    document.getElementById('filter-booking-date').value = '';
    document.getElementById('filter-booking-status').value = '';
    document.getElementById('filter-booking-search').value = '';
    this.renderTable(this.bookingsCache);
}
```

### Catatan
- Filter bekerja di **client-side** (data sudah di-cache di `bookingsCache`)
- Tidak perlu query ulang ke Supabase
- `renderTable()` sudah siap terima array yang di-filter

---

## 🔴 FITUR 4: SITE SETTINGS TERSAMBUNG KE SUPABASE

### Status: Form pengaturan ada di admin, tapi TIDAK save/load dari database

### Deskripsi
Pengaturan website (nama barbershop, slogan, no WA, jam buka, alamat) harus tersimpan di Supabase dan dibaca oleh `index.html` secara dinamis.

### Lokasi File
- **HTML Admin**: `admin.html` → `tab-pengaturan` (form sudah ada, button save sudah ada)
- **HTML Landing**: `index.html` → Inject text dari DB ke elemen yang relevan
- **JS Admin**: `admin.js` → `adminLogic.saveSettings()` (belum ada implementasi)
- **JS Landing**: `app.js` → Tambah `initSiteSettings()`
- **DB**: `supabase.js` → Tambah `getSiteSettings()` dan `saveSiteSettings()`

### Spesifikasi Teknis

#### 1. Tabel `site_settings` (pastikan ada di Supabase):
```sql
-- Gunakan pattern Key-Value atau single row:
-- Opsi: Single Row (recommended karena simple)
CREATE TABLE site_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    shop_name TEXT DEFAULT 'Kappers Tawny',
    hero_text TEXT DEFAULT 'Premium Gentlemen Grooming Experience',
    wa_number TEXT DEFAULT '6281234567890',
    receipt_footer TEXT DEFAULT 'Terima kasih atas kunjungannya!',
    op_hours TEXT DEFAULT '10:00 - 22:00',
    op_days TEXT DEFAULT 'Senin - Minggu',
    address TEXT DEFAULT 'Jl. Potong Rambut No. 99',
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insert row pertama:
INSERT INTO site_settings (shop_name) VALUES ('Kappers Tawny');
```

#### 2. Fungsi DB di `supabase.js`:
```javascript
async getSiteSettings() {
    try {
        const { data, error } = await supabaseClient
            .from('site_settings')
            .select('*')
            .limit(1)
            .single();
        if (error) throw error;
        return { success: true, data };
    } catch (error) {
        return { success: false, error: error.message };
    }
},

async saveSiteSettings(payload) {
    try {
        // Upsert: update row pertama, atau insert jika belum ada
        const { data: existing } = await supabaseClient
            .from('site_settings').select('id').limit(1).single();
        
        if (existing) {
            const { error } = await supabaseClient
                .from('site_settings').update(payload).eq('id', existing.id);
            if (error) throw error;
        } else {
            const { error } = await supabaseClient
                .from('site_settings').insert([payload]);
            if (error) throw error;
        }
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}
```

#### 3. Admin Logic (`admin.js`):
```javascript
async saveSettings() {
    const payload = {
        shop_name: document.getElementById('set-shop_name').value,
        hero_text: document.getElementById('set-hero_text').value,
        wa_number: document.getElementById('set-wa_number').value,
        receipt_footer: document.getElementById('set-receipt_footer').value,
        op_hours: document.getElementById('set-op_hours').value,
        op_days: document.getElementById('set-op_days').value,
        address: document.getElementById('set-address').value
    };
    
    Swal.showLoading();
    const res = await window.db.saveSiteSettings(payload);
    if (res.success) {
        Swal.fire('Tersimpan', 'Pengaturan website berhasil diperbarui.', 'success');
    } else {
        Swal.fire('Error', res.error, 'error');
    }
},

// Panggil saat init() untuk pre-fill form dari DB:
async loadSettings() {
    const res = await window.db.getSiteSettings();
    if (res.success && res.data) {
        const d = res.data;
        const fields = ['shop_name','hero_text','wa_number','receipt_footer','op_hours','op_days','address'];
        fields.forEach(f => {
            const el = document.getElementById('set-' + f);
            if (el && d[f]) el.value = d[f];
        });
    }
}
```

#### 4. Landing Page (`app.js`):
```javascript
async function initSiteSettings() {
    if (!window.db || !window.db.getSiteSettings) return;
    const res = await window.db.getSiteSettings();
    if (res.success && res.data) {
        // Inject ke elemen landing page (sesuaikan ID/selector)
        // Contoh: document.querySelector('.hero h1').innerText = res.data.hero_text;
        // Contoh: adminWANumber = res.data.wa_number; (ganti yang hardcoded)
    }
}
```

### Catatan Penting
- Nomor WA saat ini **hardcoded** di `app.js` line 485: `const adminWANumber = "6289630462036";` → harus diganti baca dari settings
- Struk kasir di `admin.js` juga pakai default text → harus baca dari settings

---

## 🔴 FITUR 5: EXPORT LAPORAN (CSV/PDF)

### Status: Belum ada

### Deskripsi
Owner bisa export laporan keuangan bulanan ke file CSV atau PDF.

### Lokasi File
- **HTML**: `admin.html` → Tambah tombol export di `tab-laporan` topbar
- **JS**: `admin.js` → Tambah fungsi `exportCSV()` dan `exportPDF()`

### Spesifikasi Teknis

#### 1. Tambah tombol di topbar Laporan:
```html
<button class="btn btn-outline" onclick="adminLogic.exportCSV()" title="Download CSV">
    <i class="ph ph-file-csv"></i> Export CSV
</button>
<button class="btn btn-outline" onclick="adminLogic.exportPDF()" title="Download PDF">
    <i class="ph ph-file-pdf"></i> Export PDF
</button>
```

#### 2. Export CSV (Vanilla JS, tanpa library):
```javascript
exportCSV() {
    const rows = [['Tanggal', 'Kapster', 'Layanan', 'Total', 'Komisi', 'Produk']];
    
    // Ambil data dari DOM atau dari cache transaksi
    document.querySelectorAll('#lap-table-body tr').forEach(tr => {
        const cells = tr.querySelectorAll('td');
        if (cells.length >= 5) {
            rows.push([...cells].map(td => td.innerText.replace(/\n/g, ' ').trim()));
        }
    });
    
    const csvContent = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `Laporan_Kappers_${document.getElementById('lap-filter-month').value || 'All'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}
```

#### 3. Export PDF (pakai html2canvas yang sudah di-load):
```javascript
async exportPDF() {
    // html2canvas sudah loaded di admin.html
    const target = document.getElementById('tab-laporan');
    
    Swal.fire({ title: 'Generating PDF...', didOpen: () => Swal.showLoading() });
    
    const canvas = await html2canvas(target, { scale: 2, useCORS: true });
    const imgData = canvas.toDataURL('image/png');
    
    // Buka di tab baru untuk print/save
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html><head><title>Laporan Keuangan Kappers</title>
        <style>body{margin:0;} img{width:100%;}</style></head>
        <body><img src="${imgData}"><script>window.print();</script></body></html>
    `);
    printWindow.document.close();
    
    Swal.close();
}
```

---

## 🟡 FITUR 6: NOTIFIKASI BOOKING BARU (REALTIME)

### Status: Belum ada

### Deskripsi
Admin menerima **notifikasi real-time** saat ada booking baru masuk, tanpa harus manual refresh.

### Lokasi File
- **JS**: `admin.js` → Tambah Supabase Realtime listener di `init()`
- **HTML**: `admin.html` → Tambah notification badge/bell icon

### Spesifikasi Teknis

#### 1. Supabase Realtime Subscription:
```javascript
// Di init(), setelah setup selesai:
setupRealtimeSubscription() {
    if (!window.supabaseClient) return;
    
    const channel = window.supabaseClient
        .channel('booking-changes')
        .on('postgres_changes', 
            { event: 'INSERT', schema: 'public', table: 'bookings' },
            (payload) => {
                console.log('New booking:', payload.new);
                
                // Play notification sound (opsional)
                // new Audio('/assets/notification.mp3').play();
                
                // Show toast notification
                Swal.fire({
                    toast: true,
                    position: 'top-end',
                    icon: 'info',
                    title: `Booking Baru dari ${payload.new.customer_name}!`,
                    text: `Layanan: ${payload.new.service_id}`,
                    showConfirmButton: false,
                    timer: 5000,
                    timerProgressBar: true
                });
                
                // Auto-refresh data
                this.fetchData();
            }
        )
        .subscribe();
    
    // Simpan reference untuk cleanup
    this.realtimeChannel = channel;
}
```

#### 2. Notification Badge (HTML):
```html
<!-- Di admin-mobile-header atau sidebar -->
<span id="notif-badge" class="notif-badge" style="display:none;">0</span>
```

#### 3. Requirement Supabase:
- **Enable Realtime** pada tabel `bookings` di Supabase Dashboard
- Settings → Realtime → Enable for `bookings` table

---

## 🟡 FITUR 7: CALENDAR VIEW (JADWAL VISUAL)

### Status: Belum ada

### Deskripsi
Tampilan kalender jadwal booking per hari/minggu, bisa lihat slot yang terisi dan kosong.

### Rekomendasi Library
- **FullCalendar.js** (CDN: `https://cdn.jsdelivr.net/npm/fullcalendar@6`)
- Atau buat custom grid calendar sederhana

### Lokasi File
- **HTML**: `admin.html` → Buat tab baru atau subtab di `tab-bookingjadwal`
- **JS**: `admin.js` → Tambah fungsi render calendar

### Spesifikasi Teknis

#### 1. Tambah CDN di `admin.html`:
```html
<link href="https://cdn.jsdelivr.net/npm/fullcalendar@6/index.global.min.css" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/fullcalendar@6/index.global.min.js"></script>
```

#### 2. Container HTML:
```html
<div id="booking-calendar" style="margin-top:1.5rem;"></div>
```

#### 3. Init Calendar:
```javascript
initCalendar() {
    const calEl = document.getElementById('booking-calendar');
    if (!calEl) return;
    
    const events = this.bookingsCache.map(b => ({
        title: `${b.customer_name} - ${b.service_id}`,
        start: `${b.booking_date}T${b.time_slot}`,
        color: b.status === 'pending' ? '#f59e0b' : 
               b.status === 'completed' ? '#22c55e' : '#ef4444',
        extendedProps: { booking: b }
    }));
    
    const calendar = new FullCalendar.Calendar(calEl, {
        initialView: 'dayGridWeek', // atau 'dayGridMonth'
        locale: 'id',
        events: events,
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,dayGridWeek,listDay'
        },
        eventClick: (info) => {
            const b = info.event.extendedProps.booking;
            Swal.fire({
                title: b.customer_name,
                html: `Layanan: ${b.service_id}<br>Jam: ${b.time_slot}<br>Status: ${b.status}`,
                icon: 'info'
            });
        }
    });
    
    calendar.render();
}
```

---

## 🟡 FITUR 8: LOW STOCK ALERT (PERINGATAN STOK MENIPIS)

### Status: Belum ada

### Deskripsi
Tampilkan warning otomatis di dashboard ketika produk/pomade stoknya ≤ 3.

### Lokasi File
- **JS**: `admin.js` → Panggil di `init()` atau `fetchMasterData()`
- **HTML**: `admin.html` → Render di dashboard sebagai alert card

### Spesifikasi Teknis

```javascript
checkLowStock() {
    const lowStockProducts = this.masterCache.products.filter(p => p.stock <= 3);
    
    if (lowStockProducts.length > 0) {
        const alertHtml = lowStockProducts.map(p => 
            `⚠️ <strong>${p.name}</strong> — Sisa stok: <strong style="color:red">${p.stock}</strong>`
        ).join('<br>');
        
        // Tampilkan di dashboard atau sebagai toast
        Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'warning',
            title: 'Stok Menipis!',
            html: alertHtml,
            showConfirmButton: true,
            confirmButtonText: 'OK',
            timer: 10000
        });
    }
}
// Panggil setelah fetchMasterData() selesai
```

---

## 🟡 FITUR 9: DATA PAGINATION

### Status: Semua tabel load ALL data sekaligus

### Deskripsi
Tambah pagination (10-25 baris per halaman) untuk semua tabel yang bisa punya data banyak.

### Spesifikasi Teknis

```javascript
// Pattern pagination universal:
renderPaginatedTable(data, tbody, perPage = 15, page = 1, renderRow) {
    const start = (page - 1) * perPage;
    const end = start + perPage;
    const pageData = data.slice(start, end);
    const totalPages = Math.ceil(data.length / perPage);
    
    tbody.innerHTML = '';
    pageData.forEach(item => tbody.appendChild(renderRow(item)));
    
    // Render pagination controls
    return `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:1rem 1.5rem;">
            <span style="color:var(--text-secondary); font-size:0.85rem;">
                Menampilkan ${start+1}-${Math.min(end, data.length)} dari ${data.length}
            </span>
            <div style="display:flex; gap:0.25rem;">
                ${page > 1 ? `<button class="btn btn-outline btn-sm" onclick="...goToPage(${page-1})">←</button>` : ''}
                ${page < totalPages ? `<button class="btn btn-outline btn-sm" onclick="...goToPage(${page+1})">→</button>` : ''}
            </div>
        </div>
    `;
}
```

### Target Tabel:
- `bookings-table-body` (Booking)
- `lap-table-body` (Transaksi)
- `table-pelanggan-body` (Pelanggan)

---

## 🟢 FITUR 10: CUSTOMER REVIEW / RATING

### Status: Belum ada

### Deskripsi
Pelanggan bisa memberikan rating (1-5 bintang) + review text setelah selesai cukur. Ditampilkan di landing page sebagai testimonial.

### Tabel Baru di Supabase:
```sql
CREATE TABLE reviews (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    booking_id UUID REFERENCES bookings(id),
    customer_name TEXT NOT NULL,
    rating INT CHECK (rating >= 1 AND rating <= 5),
    review_text TEXT,
    is_approved BOOLEAN DEFAULT false,  -- Admin moderasi
    created_at TIMESTAMPTZ DEFAULT now()
);
```

### Flow:
1. Setelah transaksi selesai (kasir submit) → kirim link review via WA ke pelanggan
2. Link mengarah ke halaman review sederhana (bisa di `index.html#review`)
3. Admin approve/reject review di tab baru di admin dashboard
4. Review yang approved tampil di landing page sebagai testimoni carousel

### Landing Page Display:
```html
<section class="reviews" id="reviews">
    <div class="container">
        <div class="section-header">
            <h2>Kata Mereka</h2>
            <p>Review dari pelanggan setia Kappers</p>
        </div>
        <div id="reviews-carousel" class="reviews-grid">
            <!-- Dynamically populated -->
        </div>
    </div>
</section>
```

---

## 🟢 FITUR 11: BOOKING CONFIRMATION / REMINDER WA

### Status: WA hanya kirim saat booking (dari pelanggan ke admin)

### Deskripsi
Kirim **WA reminder otomatis** ke pelanggan H-1 sebelum jadwal booking. Atau minimal, tombol "Kirim Reminder" manual di admin.

### Spesifikasi (Manual Button):
```javascript
// Di renderTable(), tambah tombol reminder untuk booking pending:
sendReminder(bookingId) {
    const booking = this.bookingsCache.find(b => b.id === bookingId);
    if (!booking) return;
    
    let phone = booking.customer_phone;
    if (phone.startsWith('0')) phone = '62' + phone.substring(1);
    
    const msg = `Halo ${booking.customer_name}! 👋\n\n` +
        `Ini reminder booking Anda di *Kapper's Barbershop*:\n` +
        `📅 Tanggal: ${booking.booking_date}\n` +
        `⏰ Jam: ${booking.time_slot}\n` +
        `💇 Layanan: ${booking.service_id}\n\n` +
        `Sampai jumpa ya! ✂️`;
    
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
}
```

### Tombol di tabel:
```html
<button class="btn btn-outline btn-sm" onclick="adminLogic.sendReminder('${booking.id}')" 
        style="border-color:#25D366; color:#25D366;" title="Kirim Reminder WA">
    <i class="ph ph-whatsapp-logo"></i>
</button>
```

---

## 🟢 FITUR 12: DASHBOARD ANALYTICS

### Status: Dashboard hanya tampilkan angka total

### Deskripsi
Tambah insight analytics: layanan paling laris, kapster paling produktif, jam tersibuk.

### Lokasi: Dashboard tab → tambah section baru di bawah 5 Antrean Terdekat

```javascript
renderAnalytics(data) {
    // 1. Layanan Paling Laris
    const serviceCounts = {};
    data.forEach(b => {
        if (b.status === 'completed') {
            serviceCounts[b.service_id] = (serviceCounts[b.service_id] || 0) + 1;
        }
    });
    const topService = Object.entries(serviceCounts).sort((a, b) => b[1] - a[1])[0];
    
    // 2. Jam Tersibuk
    const hourCounts = {};
    data.forEach(b => {
        hourCounts[b.time_slot] = (hourCounts[b.time_slot] || 0) + 1;
    });
    const peakHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];
    
    // 3. Kapster Paling Produktif
    const barberCounts = {};
    data.filter(b => b.status === 'completed').forEach(b => {
        barberCounts[b.barber_id] = (barberCounts[b.barber_id] || 0) + 1;
    });
    const topBarber = Object.entries(barberCounts).sort((a, b) => b[1] - a[1])[0];
    
    // Render ke HTML cards
}
```

---

## 🟢 FITUR 13: MULTI-ADMIN / ROLE MANAGEMENT

### Status: Admin hardcoded 1 email di code

### Deskripsi
Bisa menambah akun staff dengan level akses berbeda (Owner, Manager, Kasir).

### Pendekatan:
1. Buat tabel `admin_roles` di Supabase:
```sql
CREATE TABLE admin_roles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    role TEXT DEFAULT 'kasir' CHECK (role IN ('owner', 'manager', 'kasir')),
    display_name TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO admin_roles (email, role, display_name) 
VALUES ('owner@barber.com', 'owner', 'Sang Owner');
```

2. Ganti hardcoded check di `admin.js`:
```javascript
// Sebelum (hardcoded):
const ADMIN_EMAILS = ['owner@barber.com'];

// Sesudah (dari database):
const { data: roleData } = await supabaseClient
    .from('admin_roles')
    .select('*')
    .eq('email', session.user.email)
    .single();

const userRole = roleData ? roleData.role : null;
const isAdmin = userRole === 'owner' || userRole === 'manager';
```

3. Tab `Akun Admin` di admin panel bisa mengelola user dan assign role.

---

## 📋 PRIORITAS IMPLEMENTASI (ROADMAP)

```
PHASE 1 (Quick Wins — 1-2 jam per fitur):
├── ✅ Fitur 1: Dashboard Chart
├── ✅ Fitur 3: Filter & Search Booking
└── ✅ Fitur 8: Low Stock Alert

PHASE 2 (Medium — 2-4 jam per fitur):
├── ✅ Fitur 4: Site Settings Connected
├── ✅ Fitur 5: Export CSV/PDF
└── ✅ Fitur 2: Promo di Booking Form

PHASE 3 (Advanced — 4-8 jam per fitur):
├── ✅ Fitur 6: Realtime Notification
├── ✅ Fitur 7: Calendar View
├── ✅ Fitur 11: WA Reminder
└── ✅ Fitur 12: Dashboard Analytics

PHASE 4 (Premium — Butuh planning):
├── ✅ Fitur 9: Pagination
├── ✅ Fitur 10: Customer Reviews
└── ✅ Fitur 13: Multi-Admin Roles
```

---

## ⚠️ CATATAN PENTING UNTUK AI BERIKUTNYA

1. **Jangan ubah pattern return `{ success, data/error }`** — semua fungsi DB wajib return object ini
2. **Semua fungsi DB ada di `supabase.js`** dalam object `window.db` — jangan taruh di tempat lain
3. **Admin logic ada di `admin.js`** dalam object `adminLogic` — ikuti pola yang sama
4. **SweetAlert2 (`Swal`)** dipakai sebagai modal/alert di seluruh app — jangan pakai `alert()`
5. **Tab system** di admin pakai class `.tab-content.active` — jangan ubah ke router library
6. **Admin role check** pakai `ADMIN_EMAILS` array — nanti diganti DB-driven di fitur 13
7. **Chart.js** sudah loaded tapi belum dipakai — jangan load ulang
8. **html2canvas** sudah loaded — bisa langsung dipakai untuk export
9. **CSS menggunakan CSS Variables** dari `style.css :root` — ikuti theming yang ada
10. **Responsive breakpoints** di admin: 1200px, 992px, 768px, 480px
