document.addEventListener("DOMContentLoaded", () => {
    // Wait for Supabase to instantiate
    setTimeout(() => {
        adminLogic.init();
    }, 500);
});

const adminLogic = {
    bookingsCache: [],
    masterCache: {
        employees: [],
        services: [],
        products: []
    },
    financeChartInstance: null,
    realtimeChannel: null,
    calendarInstance: null,
    posState: {
        bookingId: null,
        capster: null,
        servicePrice: 50000,
        selectedProducts: [],
        allProducts: [],
        employees: []
    },

    async init() {
        console.log("Admin Dashboard Initialized");

        let isAdmin = false;

        // === Check Auth Session Middlewware ===
        if (window.supabaseClient) {
            const { data: { session } } = await window.supabaseClient.auth.getSession();
            if (!session) {
                // Kick out if not logged in
                window.location.replace("login.html");
                return;
            }

            // Check Admin Role
            const ADMIN_EMAILS = ['owner@barber.com'];
            if (session.user && ADMIN_EMAILS.includes(session.user.email)) {
                isAdmin = true;
            }

            // Update Greeting UI
            const elGreeting = document.getElementById('user-greeting');
            if (elGreeting) {
                if (isAdmin) {
                    elGreeting.innerText = "Sang Owner";
                } else {
                    let userName = "Staf Kasir";
                    if (session.user && session.user.email) {
                        const prefix = session.user.email.split('@')[0];
                        userName = prefix.charAt(0).toUpperCase() + prefix.slice(1);
                    }
                    elGreeting.innerText = `${userName}`;
                }
            }
        }

        // Apply Kasir Role Restrictions
        if (!isAdmin) {
            // Hide Sidebar Menus for kasir
            const hiddenTargets = ['tab-master', 'tab-laporan', 'tab-galeri', 'tab-promo', 'tab-pengaturan', 'tab-akun'];
            hiddenTargets.forEach(target => {
                const link = document.querySelector(`[data-target="${target}"]`);
                if (link) link.parentElement.style.display = 'none';
                const tab = document.getElementById(target);
                if (tab) tab.remove();
            });

            // Set role label
            const roleEl = document.getElementById('user-role');
            if (roleEl) roleEl.innerText = 'Staf Kasir';
        }

        // Setup Tab Navigation Logic
        this.setupTabNavigation();

        // Setup Forms (Admin Only)
        if (isAdmin) {
            this.setupMasterForms();
            this.setupPromoForm();
        }

        // Fetch all data in PARALLEL for speed (no more sequential bottleneck)
        const globalFetches = [
            this.fetchData(),
            this.fetchPelanggan(),
            this.loadSettings()
        ];

        if (isAdmin) {
            globalFetches.push(
                this.fetchMasterData(),
                this.fetchLaporan(),
                this.fetchGalleryData(),
                this.fetchPromos()
            );
        }

        await Promise.all(globalFetches);

        // Setup Mobile Sidebar Toggle
        const btnSidebar = document.getElementById('btn-mobile-sidebar');
        const sidebar = document.querySelector('.sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        if (btnSidebar && sidebar) {
            const toggleSidebar = (forceClose = false) => {
                if (forceClose) {
                    sidebar.classList.remove('active');
                    if (overlay) overlay.classList.remove('active');
                } else {
                    sidebar.classList.toggle('active');
                    if (overlay) overlay.classList.toggle('active');
                }
            };

            btnSidebar.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleSidebar();
            });

            // Close sidebar when clicking overlay
            if (overlay) {
                overlay.addEventListener('click', () => toggleSidebar(true));
            }

            // Close sidebar when clicking outside (in mobile view)
            document.addEventListener('click', (e) => {
                if (window.innerWidth <= 992 && !sidebar.contains(e.target) && !btnSidebar.contains(e.target)) {
                    toggleSidebar(true);
                }
            });
        }

        // Setup Logout Listener
        const btnLogout = document.getElementById('btn-logout');
        if (btnLogout) {
            btnLogout.addEventListener('click', async (e) => {
                e.preventDefault();

                // Show loading state
                Swal.fire({
                    title: 'Memproses...',
                    text: 'Sedang keluar dari akun...',
                    allowOutsideClick: false,
                    didOpen: () => {
                        Swal.showLoading();
                    }
                });

                try {
                    await window.supabaseClient.auth.signOut();
                    window.location.replace('login.html');
                } catch (error) {
                    Swal.fire('Error', 'Gagal logout: ' + error.message, 'error');
                }
            });
        }

        // Realtime booking subscription
        this.setupRealtimeSubscription();
    },

    setupTabNavigation() {
        const sidebarLinks = document.querySelectorAll('#admin-sidebar a[data-target]');
        const tabContents = document.querySelectorAll('.tab-content');

        sidebarLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();

                // Remove active class from all links and tabs
                sidebarLinks.forEach(l => l.parentElement.classList.remove('active'));
                tabContents.forEach(tab => tab.classList.remove('active'));

                // Add active class to clicked link
                link.parentElement.classList.add('active');

                // Show target tab
                const targetId = link.getAttribute('data-target');
                const targetTab = document.getElementById(targetId);
                if (targetTab) {
                    targetTab.classList.add('active');
                }
                // Hide source sidebar on mobile
                if (window.innerWidth <= 992) {
                    document.querySelector('.sidebar').classList.remove('active');
                    const ov = document.getElementById('sidebar-overlay');
                    if (ov) ov.classList.remove('active');
                }
            });
        });
    },

    setupRealtimeSubscription() {
        if (!window.supabaseClient) return;
        
        this.realtimeChannel = window.supabaseClient
            .channel('booking-changes')
            .on('postgres_changes', 
                { event: 'INSERT', schema: 'public', table: 'bookings' },
                (payload) => {
                    console.log('New booking:', payload.new);
                    
                    Swal.fire({
                        toast: true,
                        position: 'top-end',
                        icon: 'info',
                        title: `Tada! Booking Baru`,
                        html: `Pelanggan: <strong>${payload.new.customer_name}</strong><br>Layanan: ${payload.new.service_id || '-'}`,
                        showConfirmButton: false,
                        timer: 5000,
                        timerProgressBar: true
                    });
                    
                    // Auto-refresh data and calendar
                    this.fetchData();
                }
            )
            .subscribe();
    },

    async fetchData() {
        if (!window.db || !window.db.getAllBookings) {
            console.error("Database functions not ready or API Key missing.");
            document.getElementById('bookings-table-body').innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2rem;">Error: Sistem Database (Supabase) belum terkonfigurasi di js/supabase.js</td></tr>`;
            return;
        }

        const tbody = document.getElementById('bookings-table-body');
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2rem;"><i class="ph ph-spinner ph-spin"></i> Mengambil data...</td></tr>`;

        const res = await window.db.getAllBookings();

        if (res.success) {
            const pendingList = res.data.filter(b => b.status === 'pending');
            const otherList = res.data.filter(b => b.status !== 'pending');
            const sortedData = [...pendingList, ...otherList];

            this.bookingsCache = sortedData;
            this.renderTable(sortedData);
            this.updateStats(sortedData);
            this.renderUpcoming(sortedData);
            
            // Re-render calendar safely if initialized on the element
            if(document.getElementById('booking-calendar')) {
                this.initCalendar(sortedData);
            }
        } else {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2rem; color: red;">Error: ${res.error}</td></tr>`;
        }
    },

    updateStats(data) {
        document.getElementById('stat-total').innerText = data.length;
        const pending = data.filter(d => d.status === 'pending').length;
        const completed = data.filter(d => d.status === 'completed').length;
        document.getElementById('stat-pending').innerText = pending;
        document.getElementById('stat-completed').innerText = completed;
    },

    renderTable(data) {
        const tbody = document.getElementById('bookings-table-body');
        tbody.innerHTML = "";

        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 3rem;">Belum ada pesanan masuk.</td></tr>`;
            return;
        }

        data.forEach(booking => {
            const tr = document.createElement('tr');

            // Format Layanan dan Capster untuk tampilan bersih
            const serviceDisplay = booking.service_id.toUpperCase();
            const capsterDisplay = booking.barber_id === 'any' ? 'Bebas' : booking.barber_id.toUpperCase();

            tr.innerHTML = `
                <td>
                    <strong>${booking.booking_date}</strong><br>
                    <span style="color:var(--text-secondary); font-size:0.875rem;">Pukul ${booking.time_slot}</span>
                </td>
                <td>
                    <strong>${booking.customer_name}</strong><br>
                    <span style="color:var(--text-secondary); font-size:0.875rem;">${booking.customer_phone}</span>
                </td>
                <td>${serviceDisplay}</td>
                <td>${capsterDisplay}</td>
                <td><span class="status ${booking.status}">${booking.status}</span></td>
                <td>
                    ${booking.status === 'pending' ? `
                        <button class="btn btn-outline btn-sm action-btn" onclick="adminLogic.openPos('${booking.id}')" style="border-color:#22c55e; color:#22c55e;" title="Selesaikan & Buka Kasir"><i class="ph ph-check"></i></button>
                        <button class="btn btn-outline btn-sm action-btn" onclick="adminLogic.updateStatus('${booking.id}', 'cancelled')" style="border-color:#ef4444; color:#ef4444;" title="Batalkan Pesanan"><i class="ph ph-x"></i></button>
                    ` : `<span style="font-size:0.8rem; color:var(--text-secondary);">No Action</span>`}
                </td>
            `;
            tbody.appendChild(tr);
        });
    },

    async updateStatus(id, newStatus) {
        Swal.fire({
            title: 'Konfirmasi',
            text: `Ubah status pesanan menjadi ${newStatus.toUpperCase()}?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Ya, Ubah',
            cancelButtonText: 'Batal'
        }).then(async (result) => {
            if (result.isConfirmed) {
                const res = await window.db.updateBookingStatus(id, newStatus);
                if (res.success) {
                    Swal.fire('Berhasil!', 'Status telah diupdate.', 'success');
                    this.fetchData(); // reload table
                } else {
                    Swal.fire('Gagal!', res.error, 'error');
                }
            }
        });
    },

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
                (b.customer_name && b.customer_name.toLowerCase().includes(searchFilter)) ||
                (b.customer_phone && b.customer_phone.includes(searchFilter))
            );
        }
        
        this.renderTable(filtered);
        this.initCalendar(filtered);
    },

    clearBookingFilter() {
        document.getElementById('filter-booking-date').value = '';
        document.getElementById('filter-booking-status').value = '';
        document.getElementById('filter-booking-search').value = '';
        this.renderTable(this.bookingsCache);
        this.initCalendar(this.bookingsCache);
    },

    toggleViewMode(mode) {
        const btnTable = document.getElementById('btn-view-table');
        const btnCalendar = document.getElementById('btn-view-calendar');
        const secTable = document.getElementById('view-section-table');
        const secCalendar = document.getElementById('view-section-calendar');

        if (mode === 'table') {
            btnTable.classList.remove('btn-outline');
            btnTable.classList.add('btn-primary');
            btnCalendar.classList.remove('btn-primary');
            btnCalendar.classList.add('btn-outline');
            
            secTable.style.display = 'block';
            secCalendar.style.display = 'none';
        } else {
            btnCalendar.classList.remove('btn-outline');
            btnCalendar.classList.add('btn-primary');
            btnTable.classList.remove('btn-primary');
            btnTable.classList.add('btn-outline');
            
            secTable.style.display = 'none';
            secCalendar.style.display = 'block';

            this.initCalendar();
        }
    },

    initCalendar(dataOverride = null) {
        const calEl = document.getElementById('booking-calendar');
        if (!calEl) return;
        
        const data = dataOverride || this.bookingsCache;
        
        const events = data.map(b => {
             let timeStart = b.time_slot ? b.time_slot : "00:00";
             if(timeStart.includes("-")) timeStart = timeStart.split("-")[0].trim();
             
             let truncTitle = b.customer_name;
             if(truncTitle.length > 12) truncTitle = truncTitle.substring(0, 12) + "..";
             
             return {
                title: `${truncTitle} (${b.barber_id === 'any' ? 'Bbs' : b.barber_id})`,
                start: `${b.booking_date}T${timeStart}`,
                color: b.status === 'pending' ? '#f59e0b' : 
                       b.status === 'completed' ? '#22c55e' : '#ef4444',
                extendedProps: { booking: b }
            }
        });
        
        if (this.calendarInstance) {
            this.calendarInstance.destroy();
        }
        
        if(typeof FullCalendar !== "undefined") {
            this.calendarInstance = new FullCalendar.Calendar(calEl, {
                initialView: 'dayGridMonth',
                locale: 'id',
                events: events,
                headerToolbar: {
                    left: 'prev,next today',
                    center: 'title',
                    right: 'dayGridMonth,timeGridWeek,listDay'
                },
                buttonText: {
                    today: 'Hari Ini',
                    month: 'Bulan',
                    week: 'Minggu',
                    list: 'Agenda'
                },
                eventClick: (info) => {
                    const b = info.event.extendedProps.booking;
                    Swal.fire({
                        title: b.customer_name,
                        html: `<b>Layanan:</b> ${b.service_id || '-'}<br><b>Kapster:</b> ${b.barber_id || '-'}<br><b>Jam:</b> ${b.time_slot || '-'}<br><b>Status:</b> ${b.status.toUpperCase()}`,
                        icon: 'info'
                    });
                }
            });
            this.calendarInstance.render();
        }
    },

    // ===================================
    // MASTER DATA (PHASE 6)
    // ===================================

    setupMasterForms() {
        const fEmp = document.getElementById('form-employee');
        const fProd = document.getElementById('form-product');
        const fSrv = document.getElementById('form-service');

        if (fEmp) {
            fEmp.addEventListener('submit', async (e) => {
                e.preventDefault();
                const payload = {
                    name: document.getElementById('emp-name').value,
                    salary_type: document.getElementById('emp-type').value,
                    salary_value: document.getElementById('emp-value').value,
                    role_title: document.getElementById('emp-role') ? (document.getElementById('emp-role').value || 'Senior Barber') : 'Senior Barber',
                    ig_username: document.getElementById('emp-ig') ? document.getElementById('emp-ig').value : null,
                    tiktok_username: document.getElementById('emp-tiktok') ? document.getElementById('emp-tiktok').value : null
                };
                Swal.showLoading();
                const res = await window.db.addEmployee(payload);
                if (res.success) {
                    fEmp.reset();
                    Swal.fire('Tersimpan', 'Pegawai berhasil ditambahkan', 'success');
                    this.fetchMasterData();
                } else Swal.fire('Error', res.error, 'error');
            });
        }

        if (fSrv) {
            fSrv.addEventListener('submit', async (e) => {
                e.preventDefault();
                const payload = {
                    name: document.getElementById('srv-name').value,
                    description: document.getElementById('srv-desc').value,
                    price: document.getElementById('srv-price').value
                };
                Swal.showLoading();
                const res = await window.db.addService(payload);
                if (res.success) {
                    fSrv.reset();
                    Swal.fire('Tersimpan', 'Layanan berhasil ditambahkan', 'success');
                    this.fetchMasterData();
                } else Swal.fire('Error', res.error, 'error');
            });
        }

        if (fProd) {
            fProd.addEventListener('submit', async (e) => {
                e.preventDefault();
                const payload = {
                    name: document.getElementById('prod-name').value,
                    price: document.getElementById('prod-price').value,
                    stock: document.getElementById('prod-stock').value
                };
                Swal.showLoading();
                const res = await window.db.addProduct(payload);
                if (res.success) {
                    fProd.reset();
                    Swal.fire('Tersimpan', 'Produk berhasil ditambahkan', 'success');
                    this.fetchMasterData();
                } else Swal.fire('Error', res.error, 'error');
            });
        }

        const fExp = document.getElementById('form-expense');
        if (fExp) {
            // Set default date to today
            document.getElementById('exp-date').value = new Date().toISOString().split('T')[0];
            fExp.addEventListener('submit', async (e) => {
                e.preventDefault();
                const payload = {
                    description: document.getElementById('exp-desc').value,
                    amount: document.getElementById('exp-amount').value,
                    expense_date: document.getElementById('exp-date').value
                };
                Swal.showLoading();
                const res = await window.db.addExpense(payload);
                if (res.success) {
                    fExp.reset();
                    document.getElementById('exp-date').value = new Date().toISOString().split('T')[0];
                    Swal.fire('Tersimpan', 'Pengeluaran berhasil dicatat', 'success');
                    this.fetchLaporan();
                } else Swal.fire('Error', res.error, 'error');
            });
        }
    },

    async fetchMasterData() {
        if (!window.db) return;

        // Fetch Employees
        const elRes = await window.db.getEmployees();
        const tbodyEmp = document.getElementById('table-employees');
        if (elRes.success) {
            this.masterCache.employees = elRes.data;
            tbodyEmp.innerHTML = '';
            if (elRes.data.length === 0) tbodyEmp.innerHTML = `<tr><td colspan="3" style="text-align:center">Belum ada pegawai.</td></tr>`;
            elRes.data.forEach(e => {
                const tr = document.createElement('tr');
                const tag = e.salary_type === 'percentage' ? `${e.salary_value}%` : `Rp ${e.salary_value.toLocaleString()}`;
                const isActive = e.is_active !== false;
                const statusBadge = isActive ? `<span class="status completed" style="background:rgba(34,197,94,0.1); color:#22c55e;">AKTIF</span>` : `<span class="status pending" style="background:rgba(100,116,139,0.1); color:#64748B;">LIBUR</span>`;
                tr.innerHTML = `
                    <td><strong>${e.name}</strong><br><div style="margin-top:0.3rem">${statusBadge} <span style="font-size:0.75rem; color:var(--text-secondary)">${tag}</span></div></td>
                    <td>
                        <button class="btn btn-outline btn-sm action-btn" onclick="adminLogic.toggleMaster('${e.id}', ${isActive})" style="color:${isActive ? '#f97316' : '#22c55e'}; border-color:${isActive ? '#f97316' : '#22c55e'}; margin-right:0.25rem;" title="${isActive ? 'Set Libur' : 'Set Aktif'}"><i class="ph ph-power"></i></button>
                        <button class="btn btn-outline btn-sm action-btn" onclick="adminLogic.editMaster('employee', '${e.id}')" style="color:var(--accent-color); border-color:var(--accent-color); margin-right:0.25rem;" title="Edit Data"><i class="ph ph-pencil-simple"></i></button>
                        <button class="btn btn-outline btn-sm action-btn" onclick="adminLogic.deleteMaster('employee', '${e.id}')" style="color:red; border-color:red" title="Hapus Data"><i class="ph ph-trash"></i></button>
                    </td>
                `;
                tbodyEmp.appendChild(tr);
            });
        }

        // Fetch Services
        const srvRes = await window.db.getServices();
        const tbodySrv = document.getElementById('table-services');
        if (srvRes.success) {
            this.masterCache.services = srvRes.data;
            tbodySrv.innerHTML = '';
            if (srvRes.data.length === 0) tbodySrv.innerHTML = `<tr><td colspan="3" style="text-align:center">Belum ada layanan reguler terdaftar.</td></tr>`;
            srvRes.data.forEach(s => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${s.name}</strong></td>
                    <td style="color:var(--accent-color); font-weight:600">Rp ${parseFloat(s.price).toLocaleString()}</td>
                    <td>
                        <button class="btn btn-outline btn-sm action-btn" onclick="adminLogic.editMaster('service', '${s.id}')" style="color:var(--accent-color); border-color:var(--accent-color); margin-right:0.25rem;" title="Edit Data"><i class="ph ph-pencil-simple"></i></button>
                        <button class="btn btn-outline btn-sm action-btn" onclick="adminLogic.deleteMaster('service', '${s.id}')" style="color:red; border-color:red" title="Hapus Data"><i class="ph ph-trash"></i></button>
                    </td>
                `;
                tbodySrv.appendChild(tr);
            });
        }

        // Fetch Products
        const prodRes = await window.db.getProducts();
        const tbodyProd = document.getElementById('table-products');
        if (prodRes.success) {
            this.masterCache.products = prodRes.data;
            tbodyProd.innerHTML = '';
            if (prodRes.data.length === 0) tbodyProd.innerHTML = `<tr><td colspan="4" style="text-align:center">Belum ada produk.</td></tr>`;
            prodRes.data.forEach(p => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${p.name}</strong></td>
                    <td>Rp ${p.price.toLocaleString()}</td>
                    <td>${p.stock}</td>
                    <td>
                        <button class="btn btn-outline btn-sm action-btn" onclick="adminLogic.editMaster('product', '${p.id}')" style="color:var(--accent-color); border-color:var(--accent-color); margin-right:0.25rem;" title="Edit Data"><i class="ph ph-pencil-simple"></i></button>
                        <button class="btn btn-outline btn-sm action-btn" onclick="adminLogic.deleteMaster('product', '${p.id}')" style="color:red; border-color:red" title="Hapus Data"><i class="ph ph-trash"></i></button>
                    </td>
                `;
                tbodyProd.appendChild(tr);
            });
        }
    },

    async editMaster(type, id) {
        let item, formHtml, preConfirm;
        if (type === 'employee') {
            item = this.masterCache.employees.find(e => e.id === id);
            formHtml = `
                <input id="edit-emp-name" class="swal2-input" value="${item.name}" placeholder="Nama Kapster" style="width:80%">
                <input id="edit-emp-role" class="swal2-input" value="${item.role_title || ''}" placeholder="Jabatan Opsional (Default: Senior Barber)" style="width:80%">
                <input id="edit-emp-ig" class="swal2-input" value="${item.ig_username || ''}" placeholder="Username IG (Opsional)" style="width:80%">
                <input id="edit-emp-tiktok" class="swal2-input" value="${item.tiktok_username || ''}" placeholder="Username TikTok (Opsional)" style="width:80%">
                <select id="edit-emp-type" class="swal2-select" style="width:80%">
                    <option value="percentage" ${item.salary_type === 'percentage' ? 'selected' : ''}>Sistem Bagi Hasil (%)</option>
                    <option value="fixed" ${item.salary_type === 'fixed' ? 'selected' : ''}>Gaji Pokok (Rp)</option>
                </select>
                <input id="edit-emp-value" type="number" class="swal2-input" value="${item.salary_value}" placeholder="Nominal" style="width:80%">
            `;
            preConfirm = () => ({
                name: document.getElementById('edit-emp-name').value,
                salary_type: document.getElementById('edit-emp-type').value,
                salary_value: document.getElementById('edit-emp-value').value,
                role_title: document.getElementById('edit-emp-role').value || 'Senior Barber',
                ig_username: document.getElementById('edit-emp-ig').value || null,
                tiktok_username: document.getElementById('edit-emp-tiktok').value || null
            });
        } else if (type === 'service') {
            item = this.masterCache.services.find(s => s.id === id);
            formHtml = `
                <input id="edit-srv-name" class="swal2-input" value="${item.name}" placeholder="Nama Layanan" style="width:80%">
                <input id="edit-srv-desc" class="swal2-input" value="${item.description || ''}" placeholder="Deskripsi" style="width:80%">
                <input id="edit-srv-price" type="number" class="swal2-input" value="${item.price}" placeholder="Harga" style="width:80%">
            `;
            preConfirm = () => ({
                name: document.getElementById('edit-srv-name').value,
                description: document.getElementById('edit-srv-desc').value,
                price: document.getElementById('edit-srv-price').value
            });
        } else if (type === 'product') {
            item = this.masterCache.products.find(p => p.id === id);
            formHtml = `
                <input id="edit-prod-name" class="swal2-input" value="${item.name}" placeholder="Nama Produk" style="width:80%">
                <input id="edit-prod-price" type="number" class="swal2-input" value="${item.price}" placeholder="Harga (Rp)" style="width:80%">
                <input id="edit-prod-stock" type="number" class="swal2-input" value="${item.stock}" placeholder="Stok Produk" style="width:80%">
            `;
            preConfirm = () => ({
                name: document.getElementById('edit-prod-name').value,
                price: document.getElementById('edit-prod-price').value,
                stock: document.getElementById('edit-prod-stock').value
            });
        }

        Swal.fire({
            title: `Edit Data`,
            html: formHtml,
            showCancelButton: true,
            confirmButtonText: 'Simpan',
            cancelButtonText: 'Batal',
            preConfirm: preConfirm
        }).then(async (result) => {
            if (result.isConfirmed) {
                Swal.showLoading();
                let res;
                if (type === 'employee') res = await window.db.updateEmployee(id, result.value);
                if (type === 'service') res = await window.db.updateService(id, result.value);
                if (type === 'product') res = await window.db.updateProduct(id, result.value);

                if (res.success) {
                    Swal.fire('Tersimpan', 'Data berhasil diupdate', 'success');
                    this.fetchMasterData();
                } else {
                    Swal.fire('Error', res.error, 'error');
                }
            }
        });
    },

    async toggleMaster(id, currentStatus) {
        const newStatus = !currentStatus;
        const confirmText = newStatus ? 'Aktifkan Kapster ini?' : 'Set Kapster ini menjadi Libur / Off?';

        Swal.fire({
            title: 'Konfirmasi Status',
            text: confirmText,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Ya, Ubah',
            cancelButtonText: 'Batal'
        }).then(async (result) => {
            if (result.isConfirmed) {
                Swal.showLoading();
                const res = await window.db.toggleEmployeeStatus(id, newStatus);
                if (res.success) {
                    Swal.fire('Berhasil', 'Status berhasil diubah', 'success');
                    this.fetchMasterData();
                } else Swal.fire('Error', res.error, 'error');
            }
        });
    },

    async deleteMaster(type, id) {
        if (confirm(`Yakin ingin menghapus ${type} ini?`)) {
            Swal.showLoading();
            let res;
            if (type === 'employee') res = await window.db.deleteEmployee(id);
            if (type === 'product') res = await window.db.deleteProduct(id);
            if (type === 'service') res = await window.db.deleteService(id);

            if (res.success) {
                Swal.close();
                this.fetchMasterData();
            } else {
                Swal.fire('Gagal', res.error, 'error');
            }
        }
    },

    // ===================================
    // KASIR & POS (PHASE 6)
    // ===================================

    async openPos(id) {
        const booking = this.bookingsCache.find(b => b.id === id);
        // Reset Modal State
        this.posState.bookingId = id;
        this.posState.capster = booking.barber_id;
        this.posState.selectedProducts = [];
        this.posState.servicePrice = 50000;

        // Fetch Master Data
        const srvData = await window.db.getServices();
        if (srvData.success) {
            this.posState.services = srvData.data;
            if (booking.service_id) {
                const matched = this.posState.services.find(s => s.name.toLowerCase() === booking.service_id.toLowerCase());
                if (matched) this.posState.servicePrice = matched.price;
            }
        }
        document.getElementById('pos-service-price').value = this.posState.servicePrice;

        const prodData = await window.db.getProducts();
        if (prodData.success) this.posState.allProducts = prodData.data;

        const empData = await window.db.getEmployees();
        if (empData.success) this.posState.employees = empData.data;

        // Populate Actual Capster Dropdown
        const capSelect = document.getElementById('pos-actual-capster');
        if (capSelect) {
            capSelect.innerHTML = '<option value="">-- Wajib Dipilih --</option>';
            this.posState.employees.forEach(e => {
                capSelect.innerHTML += `<option value="${e.name}">${e.name}</option>`;
            });
            // Select automatically if it's not "any"
            if (booking.barber_id && booking.barber_id !== 'any') {
                // Find matching employee by name (since value is name)
                const matched = this.posState.employees.find(e => e.name.toLowerCase() === booking.barber_id.toLowerCase());
                if (matched) capSelect.value = matched.name;
                else capSelect.value = booking.barber_id;
            }
        }

        // Render Info
        document.getElementById('pos-booking-info').innerHTML = `
            <p style="margin-bottom:0.2rem"><strong>Pelanggan:</strong> ${booking.customer_name} (${booking.customer_phone})</p>
            <p style="margin-bottom:0.2rem"><strong>Layanan:</strong> ${(booking.service_id || 'Tanpa Layanan').toUpperCase()}</p>
            <p><strong>Kapster:</strong> ${(booking.barber_id === 'any' ? 'Bebas' : (booking.barber_id || 'Tidak Ada').toUpperCase())}</p>
        `;

        const sel = document.getElementById('pos-product-select');
        sel.innerHTML = '<option value="">-- Pilih Produk Fisik --</option>';
        this.posState.allProducts.forEach(p => {
            sel.innerHTML += `<option value="${p.id}">${p.name} - Rp ${p.price.toLocaleString()}</option>`;
        });

        this.renderPosProducts();
        this.calcPosTotal();

        document.getElementById('pos-modal').classList.add('active');
    },

    closePos() {
        document.getElementById('pos-modal').classList.remove('active');
    },

    addPosProduct() {
        const sel = document.getElementById('pos-product-select');
        if (!sel.value) return;
        const prod = this.posState.allProducts.find(p => p.id === sel.value);
        if (prod) {
            this.posState.selectedProducts.push(prod);
            this.renderPosProducts();
            this.calcPosTotal();
        }
    },

    removePosProduct(index) {
        this.posState.selectedProducts.splice(index, 1);
        this.renderPosProducts();
        this.calcPosTotal();
    },

    renderPosProducts() {
        const list = document.getElementById('pos-product-list');
        list.innerHTML = '';
        if (this.posState.selectedProducts.length === 0) {
            list.innerHTML = `<li style="color:var(--text-secondary); border-bottom:none;">Tidak ada produk tambahan</li>`;
        }
        this.posState.selectedProducts.forEach((p, idx) => {
            list.innerHTML += `
               <li>
                   <span>${p.name} <small>(Rp ${p.price.toLocaleString()})</small></span>
                   <button class="btn btn-sm btn-outline" style="color:red; border-color:red" onclick="adminLogic.removePosProduct(${idx})"><i class="ph ph-trash"></i></button>
               </li>
            `;
        });
    },

    calcPosTotal() {
        let total = parseInt(document.getElementById('pos-service-price').value) || 0;
        this.posState.selectedProducts.forEach(p => total += parseFloat(p.price));
        document.getElementById('pos-total').innerText = total.toLocaleString();
        return total;
    },

    async submitPos() {
        const actualCapster = document.getElementById('pos-actual-capster').value;
        if (!actualCapster) {
            Swal.fire('Perhatian', 'Mohon pilih "Kapster Bertugas" untuk kalkulasi komisi laporan!', 'warning');
            return;
        }

        const totalAmount = this.calcPosTotal();
        const basePrice = parseInt(document.getElementById('pos-service-price').value) || 0;

        let commissionAmount = 0;
        // Cari Master Pegawai sesuai Actual Barber Name
        const emp = this.posState.employees.find(e => e.name.toLowerCase() === actualCapster.toLowerCase());

        if (emp) {
            if (emp.salary_type === 'percentage') {
                commissionAmount = basePrice * (emp.salary_value / 100);
            }
        }

        // Update booking DB actual barber jika berbeda/dari 'any'
        if (this.posState.capster !== actualCapster) {
            await window.db.updateBookingBarber(this.posState.bookingId, actualCapster);
        }

        const payload = {
            booking_id: this.posState.bookingId,
            total_amount: totalAmount,
            commission_amount: commissionAmount,
            items: this.posState.selectedProducts
        };

        Swal.showLoading();
        const res = await window.db.createTransaction(payload);
        if (res.success) {
            this.closePos();
            this.fetchData();
            this.fetchLaporan();

            // Generator Struk WhatsApp
            const booking = this.bookingsCache.find(b => b.id === this.posState.bookingId);
            let phone = booking.customer_phone || "";

            // Bypass Whatsapp prompt if it's a Walk-In without actual phone number
            if (phone === '-' || phone === '') {
                Swal.fire('Sukses!', 'Transaksi Tamu Walk-In selesai.', 'success');
                return;
            }

            // Format phone to international if starts with 0
            if (phone.startsWith('0')) phone = '62' + phone.substring(1);

            let receipt = `🧾 *STRUK KASIR KAPPER'S BARBERSHOP* ✂️\n`;
            receipt += `-----------------------------------\n`;
            receipt += `Halo *${booking.customer_name}*,\n`;
            receipt += `Terima kasih telah mempercayakan gaya rambutnya kepada kami!\n\n`;

            receipt += `*Detail Layanan:*\n`;
            receipt += `- ${booking.service_id || 'Layanan Reguler'} : Rp ${basePrice.toLocaleString('id-ID')}\n`;
            receipt += `- Kapster : *${actualCapster}*\n\n`;

            if (this.posState.selectedProducts.length > 0) {
                receipt += `*Produk / Pomade:*\n`;
                this.posState.selectedProducts.forEach(p => {
                    receipt += `- ${p.name} : Rp ${parseInt(p.price).toLocaleString('id-ID')}\n`;
                });
                receipt += `\n`;
            }

            receipt += `💰 *TOTAL PEMBAYARAN : Rp ${totalAmount.toLocaleString('id-ID')}*\n`;
            receipt += `-----------------------------------\n`;
            receipt += `Tampil Maksimal Setiap Hari. Sampai jumpa lagi! 🔥`;

            const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(receipt)}`;

            Swal.fire({
                title: 'Transaksi Berhasil! 🎉',
                text: 'Pilih metode untuk memberikan struk bukti lunas:',
                icon: 'success',
                showDenyButton: true,
                showCancelButton: true,
                confirmButtonColor: '#25D366',
                denyButtonColor: '#0f172a',
                cancelButtonColor: '#64748B',
                confirmButtonText: '<i class="ph ph-whatsapp-logo"></i> Kirim WA',
                denyButtonText: '<i class="ph ph-printer"></i> Cetak Thermal',
                cancelButtonText: 'Tutup Saja'
            }).then((result) => {
                if (result.isConfirmed) {
                    window.open(waUrl, '_blank');
                } else if (result.isDenied) {
                    // Thermal Print Logic
                    const printArea = document.getElementById('print-area');

                    let html = `<div class="print-center">
                        <strong style="font-size:16px;">KAPPER'S BARBERSHOP</strong><br>
                        Premium Grooming<br>
                        <div class="print-line"></div>
                    </div>`;

                    html += `<strong>Pelanggan:</strong> ${booking.customer_name}<br>`;
                    html += `<strong>Kapster:</strong> ${actualCapster}<br>`;
                    html += `<strong>Layanan:</strong><br>`;
                    html += `<div class="print-flex"><span>${booking.service_id || 'Layanan Reguler'}</span><span>Rp ${basePrice.toLocaleString('id-ID')}</span></div>`;

                    if (this.posState.selectedProducts.length > 0) {
                        html += `<strong>Produk:</strong><br>`;
                        this.posState.selectedProducts.forEach(p => {
                            html += `<div class="print-flex"><span>${p.name}</span><span>Rp ${parseInt(p.price).toLocaleString('id-ID')}</span></div>`;
                        });
                    }

                    html += `<div class="print-line"></div>`;
                    html += `<div class="print-flex"><strong style="font-size:14px;">TOTAL:</strong> <strong style="font-size:14px;">Rp ${totalAmount.toLocaleString('id-ID')}</strong></div>`;
                    html += `<div class="print-line"></div>`;
                    html += `<div class="print-center"><small>Terima kasih atas kunjungan Anda!</small></div>`;

                    printArea.innerHTML = html;
                    window.print();
                }
            });

        } else {
            Swal.fire('Gagal Menyimpan Kasir', res.error, 'error');
        }
    },

    // ===================================
    // WALK-IN CUSTOMER FEATURE
    // ===================================

    async createWalkIn() {
        Swal.showLoading();
        const srvRes = await window.db.getServices();
        const empRes = await window.db.getEmployees();
        Swal.close();

        let srvOptions = '';
        if (srvRes.success) srvRes.data.forEach(s => srvOptions += `<option value="${s.name}">${s.name}</option>`);

        let empOptions = '<option value="any">Bebas / Random</option>';
        if (empRes.success) empRes.data.forEach(e => empOptions += `<option value="${e.name}">${e.name}</option>`);

        Swal.fire({
            title: 'Tamu Walk-In 🚶‍♂️',
            html: `
                <p style="font-size:0.9rem; color:var(--text-secondary); margin-bottom:1rem;">Otomatis membuat antrean dan langsung masuk ke sistem Kasir.</p>
                <input id="swal-wi-name" class="swal2-input" placeholder="Nama Pelanggan (Boleh Kosong)" value="Tamu Walk-In" style="height:2.5rem; font-size:1rem;">
                <select id="swal-wi-service" class="swal2-select" style="display:flex; width:70%; margin:1em auto; font-size:1rem; padding:0.5rem">
                    ${srvOptions}
                </select>
                <select id="swal-wi-barber" class="swal2-select" style="display:flex; width:70%; margin:1em auto; font-size:1rem; padding:0.5rem">
                    ${empOptions}
                </select>
            `,
            showCancelButton: true,
            confirmButtonText: 'Buat & Lanjut Kasir',
            cancelButtonText: 'Batal',
            preConfirm: () => {
                return {
                    name: document.getElementById('swal-wi-name').value || 'Tamu Walk-In',
                    service: document.getElementById('swal-wi-service').value,
                    barber: document.getElementById('swal-wi-barber').value
                }
            }
        }).then(async (res) => {
            if (res.isConfirmed) {
                const vals = res.value;
                const d = new Date();
                const dString = d.toISOString().split("T")[0];
                const hString = d.getHours().toString().padStart(2, '0') + ':00';

                const payload = {
                    service_id: vals.service,
                    barber_id: vals.barber,
                    booking_date: dString,
                    time_slot: hString,
                    customer_name: vals.name,
                    customer_phone: '-',
                    status: 'pending' // Assign directly to pending so admin can checkout
                };

                Swal.showLoading();
                const insertRes = await window.db.insertBooking(payload);
                if (insertRes.success && insertRes.data) {
                    await this.fetchData();
                    const newId = insertRes.data[0].id;
                    this.openPos(newId);
                } else {
                    Swal.fire('Gagal Menyimpan', insertRes.error || "Gagal database", 'error');
                }
            }
        });
    },

    // ===================================
    // LAPORAN KEUANGAN (PHASE 6)
    // ===================================

    async fetchLaporan() {
        if (!window.db) return;

        // Set default filter to current month if not set
        const filterMonth = document.getElementById('lap-filter-month');
        if (filterMonth && !filterMonth.value) {
            const now = new Date();
            filterMonth.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        }

        const res = await window.db.getTransactions();
        const expRes = await window.db.getExpenses();

        const tbody = document.getElementById('lap-table-body');
        const capBody = document.getElementById('lap-capster-body');

        if (!res.success) {
            tbody.innerHTML = `<tr><td colspan="5" style="color:red; text-align:center;">${res.error}</td></tr>`;
            return;
        }

        let data = res.data;
        let expData = expRes.success ? expRes.data : [];

        // Apply Month Filter if selected
        if (filterMonth && filterMonth.value) {
            // filterMonth.value is "YYYY-MM" (e.g. "2026-04")
            data = data.filter(trx => trx.created_at.startsWith(filterMonth.value));
            expData = expData.filter(exp => exp.expense_date.startsWith(filterMonth.value));
        }
        let totalOmzet = 0;
        let totalKomisi = 0;
        let totalPengeluaran = 0;
        const capsterStats = {};

        tbody.innerHTML = '';
        capBody.innerHTML = '';

        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;">Belum ada riwayat pemasukan.</td></tr>`;
            capBody.innerHTML = `<tr><td colspan="3" style="text-align:center;">Belum ada rekap.</td></tr>`;
        } else {
            data.forEach(trx => {
                totalOmzet += parseFloat(trx.total_amount);
                totalKomisi += parseFloat(trx.commission_amount);

                let itemsStr = '-';
                if (trx.items && trx.items.length > 0) {
                    itemsStr = trx.items.map(i => i.name).join(', ');
                }

                // Ekstraksi Database Relasional (Supabase Join)
                let serviceObj = trx.bookings ? (trx.bookings.service_id || 'N/A') : 'N/A';
                let barberObj = trx.bookings ? (trx.bookings.barber_id || 'Unknown') : 'Unknown';
                if (barberObj === 'any') barberObj = 'Bebas / Random';

                // Tabulasi Kinerja Kapster
                if (!capsterStats[barberObj]) {
                    capsterStats[barberObj] = { count: 0, commission: 0 };
                }
                capsterStats[barberObj].count += 1;
                capsterStats[barberObj].commission += parseFloat(trx.commission_amount);

                const d = new Date(trx.created_at);
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${d.toLocaleDateString()}<br><small style="color:var(--text-secondary)">${d.toLocaleTimeString()}</small></td>
                    <td><strong>${barberObj.toUpperCase()}</strong><br><small style="color:var(--text-secondary)">${serviceObj.toUpperCase()}</small></td>
                    <td style="color:var(--text-primary); font-weight:600">Rp ${parseFloat(trx.total_amount).toLocaleString()}</td>
                    <td style="color:#ef4444">Rp ${parseFloat(trx.commission_amount).toLocaleString()}</td>
                    <td><small>${itemsStr}</small></td>
                `;
                tbody.appendChild(tr);
            });

            // Render Tabel Capster Stats
            Object.keys(capsterStats).forEach(capsterName => {
                const stat = capsterStats[capsterName];
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong style="color:var(--text-primary)">${capsterName.toUpperCase()}</strong></td>
                    <td><span class="status completed">${stat.count} Pelanggan</span></td>
                    <td style="color:var(--accent-color); font-weight:600">Rp ${stat.commission.toLocaleString()}</td>
                `;
                capBody.appendChild(tr);
            });
        }

        // Render Expenses
        const expBody = document.getElementById('lap-expense-body');
        if (expBody) {
            expBody.innerHTML = '';
            if (expData.length === 0) {
                expBody.innerHTML = `<tr><td colspan="4" style="text-align:center;">Belum ada pengeluaran.</td></tr>`;
            } else {
                expData.forEach(exp => {
                    totalPengeluaran += parseFloat(exp.amount);
                    const d = new Date(exp.expense_date);
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${d.toLocaleDateString()}</td>
                        <td><strong>${exp.description}</strong></td>
                        <td style="color:#f97316; font-weight:600">Rp ${parseFloat(exp.amount).toLocaleString()}</td>
                        <td><button class="btn btn-outline btn-sm action-btn" onclick="adminLogic.deleteExpense('${exp.id}')" style="color:red; border-color:red"><i class="ph ph-trash"></i></button></td>
                    `;
                    expBody.appendChild(tr);
                });
            }
        }

        const profit = totalOmzet - totalKomisi - totalPengeluaran;
        document.getElementById('lap-omzet').innerText = `Rp ${totalOmzet.toLocaleString()}`;
        document.getElementById('lap-komisi').innerText = `Rp ${totalKomisi.toLocaleString()}`;

        const elPengeluaran = document.getElementById('lap-pengeluaran');
        if (elPengeluaran) elPengeluaran.innerText = `Rp ${totalPengeluaran.toLocaleString()}`;

        document.getElementById('lap-profit').innerText = `Rp ${profit.toLocaleString()}`;

        // === RENDER LINE CHART ===
        this.renderFinanceChart(data, expData);
    },

    renderFinanceChart(transactions, expenses) {
        const ctx = document.getElementById('financeChart');
        if (!ctx) return;

        // Destroy previous instance to prevent memory leak
        if (this.financeChartInstance) {
            this.financeChartInstance.destroy();
            this.financeChartInstance = null;
        }

        // Group transactions by date
        const dailyOmzet = {};
        const dailyKomisi = {};
        transactions.forEach(trx => {
            const dateKey = new Date(trx.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
            dailyOmzet[dateKey] = (dailyOmzet[dateKey] || 0) + parseFloat(trx.total_amount || 0);
            dailyKomisi[dateKey] = (dailyKomisi[dateKey] || 0) + parseFloat(trx.commission_amount || 0);
        });

        // Group expenses by date
        const dailyExpense = {};
        expenses.forEach(exp => {
            const dateKey = new Date(exp.expense_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
            dailyExpense[dateKey] = (dailyExpense[dateKey] || 0) + parseFloat(exp.amount || 0);
        });

        // Merge all unique dates and sort
        const allDates = [...new Set([...Object.keys(dailyOmzet), ...Object.keys(dailyExpense)])];
        // Sort by extracting day number (rough sort for same month)
        allDates.sort((a, b) => parseInt(a) - parseInt(b));

        const labels = allDates.length > 0 ? allDates : ['Belum ada data'];
        const omzetData = allDates.map(d => dailyOmzet[d] || 0);
        const komisiData = allDates.map(d => dailyKomisi[d] || 0);
        const expenseData = allDates.map(d => dailyExpense[d] || 0);
        const profitData = allDates.map((d, i) => omzetData[i] - komisiData[i] - expenseData[i]);

        this.financeChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Omzet',
                        data: omzetData,
                        borderColor: '#6366f1',
                        backgroundColor: 'rgba(99, 102, 241, 0.1)',
                        fill: true,
                        tension: 0.4,
                        borderWidth: 2.5,
                        pointRadius: 4,
                        pointBackgroundColor: '#6366f1'
                    },
                    {
                        label: 'Komisi',
                        data: komisiData,
                        borderColor: '#f97316',
                        backgroundColor: 'rgba(249, 115, 22, 0.05)',
                        fill: false,
                        tension: 0.4,
                        borderWidth: 2,
                        borderDash: [5, 5],
                        pointRadius: 3,
                        pointBackgroundColor: '#f97316'
                    },
                    {
                        label: 'Pengeluaran',
                        data: expenseData,
                        borderColor: '#ef4444',
                        backgroundColor: 'rgba(239, 68, 68, 0.05)',
                        fill: false,
                        tension: 0.4,
                        borderWidth: 2,
                        borderDash: [3, 3],
                        pointRadius: 3,
                        pointBackgroundColor: '#ef4444'
                    },
                    {
                        label: 'Laba Bersih',
                        data: profitData,
                        borderColor: '#22c55e',
                        backgroundColor: 'rgba(34, 197, 94, 0.1)',
                        fill: true,
                        tension: 0.4,
                        borderWidth: 2.5,
                        pointRadius: 4,
                        pointBackgroundColor: '#22c55e'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            usePointStyle: true,
                            pointStyle: 'circle',
                            padding: 20,
                            color: '#94a3b8',
                            font: { family: 'Plus Jakarta Sans', size: 12 }
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        titleFont: { family: 'Plus Jakarta Sans', weight: '600' },
                        bodyFont: { family: 'Plus Jakarta Sans' },
                        padding: 12,
                        cornerRadius: 8,
                        callbacks: {
                            label: (ctx) => `${ctx.dataset.label}: Rp ${ctx.parsed.y.toLocaleString()}`
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(148, 163, 184, 0.08)' },
                        ticks: { color: '#94a3b8', font: { family: 'Plus Jakarta Sans', size: 11 } }
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(148, 163, 184, 0.08)' },
                        ticks: {
                            color: '#94a3b8',
                            font: { family: 'Plus Jakarta Sans', size: 11 },
                            callback: (v) => v >= 1000000 ? `${(v/1000000).toFixed(1)}jt` : v >= 1000 ? `${(v/1000).toFixed(0)}rb` : v
                        }
                    }
                }
            }
        });
    },

    async deleteExpense(id) {
        if (confirm(`Yakin ingin menghapus pengeluaran ini?`)) {
            Swal.showLoading();
            const res = await window.db.deleteExpense(id);
            if (res.success) {
                Swal.close();
                this.fetchLaporan();
            } else {
                Swal.fire('Gagal', res.error, 'error');
            }
        }
    },

    // ================== GALLERY ENGINE ==================
    async fetchGalleryData() {
        if (!window.db || !document.getElementById('gallery-admin-grid')) return;
        const res = await window.db.getGallery();
        const grid = document.getElementById('gallery-admin-grid');
        if (res.success) {
            grid.innerHTML = '';
            if (res.data.length === 0) {
                grid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--text-secondary);">Belum ada foto galeri.</div>`;
            } else {
                res.data.forEach(img => {
                    grid.innerHTML += `
                        <div style="background:var(--bg-primary); padding:0.5rem; border:1px solid var(--border-light); border-radius:var(--radius-sm); text-align:center;">
                            <img src="${img.image_url}" alt="${img.title}" style="width:100%; height:180px; object-fit:cover; border-radius:var(--radius-sm); margin-bottom:0.5rem; border:1px solid rgba(0,0,0,0.1);">
                            <strong style="display:block; margin-bottom:0.5rem; font-size:0.95rem; color:var(--text-primary);">${img.title}</strong>
                            <button class="btn btn-outline btn-sm action-btn" onclick="adminLogic.deleteGallery('${img.id}')" style="color:red; border-color:red; width:100%;"><i class="ph ph-trash"></i> Hapus Foto</button>
                        </div>
                    `;
                });
            }
        }
    },

    async addGalleryMaster() {
        const { value: formValues } = await Swal.fire({
            title: 'Upload Foto Galeri',
            html:
                `<div style="text-align:left; font-size:0.9rem; margin-bottom:0.5rem;">Judul Potongan (Misal: French Crop):</div>` +
                '<input id="swal-img-title" class="swal2-input" placeholder="Nama Gaya Rambut" style="margin-top:0;">' +
                `<div style="text-align:left; font-size:0.9rem; margin-top:1rem; margin-bottom:0.5rem;">Link URL Gambar:</div>` +
                '<input id="swal-img-url" class="swal2-input" placeholder="https://..." style="margin-top:0;">',
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonText: '<i class="ph ph-upload-simple"></i> Simpan',
            cancelButtonText: 'Batal',
            preConfirm: () => {
                const title = document.getElementById('swal-img-title').value;
                const url = document.getElementById('swal-img-url').value;
                if (!title || !url) {
                    Swal.showValidationMessage('Semua kolom wajib diisi');
                }
                return { title, image_url: url };
            }
        });

        if (formValues) {
            Swal.showLoading();
            const res = await window.db.addGalleryItem({
                title: formValues.title,
                image_url: formValues.image_url
            });
            if (res.success) {
                Swal.fire('Berhasil', 'Foto galeri berhasil diupload', 'success');
                this.fetchGalleryData();
            } else {
                Swal.fire('Error', res.error, 'error');
            }
        }
    },

    async deleteGallery(id) {
        if (confirm('Yakin ingin menghapus foto portofolio ini dari Landing Page?')) {
            Swal.showLoading();
            const res = await window.db.deleteGalleryItem(id);
            if (res.success) {
                Swal.close();
                this.fetchGalleryData();
            } else Swal.fire('Error', res.error, 'error');
        }
    },

    // ===================================
    // DASHBOARD: 5 UPCOMING BOOKINGS
    // ===================================

    renderUpcoming(data) {
        const tbody = document.getElementById('dashboard-upcoming-body');
        if (!tbody) return;

        // Filter only pending, sort by date + time ascending, take top 5
        const upcoming = data
            .filter(b => b.status === 'pending')
            .sort((a, b) => {
                const dateA = new Date(`${a.booking_date}T${a.time_slot}`);
                const dateB = new Date(`${b.booking_date}T${b.time_slot}`);
                return dateA - dateB;
            })
            .slice(0, 5);

        tbody.innerHTML = '';

        if (upcoming.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:2rem; color:var(--text-secondary);">Tidak ada antrean menunggu saat ini.</td></tr>`;
            return;
        }

        upcoming.forEach(booking => {
            const serviceDisplay = (booking.service_id || 'N/A').toUpperCase();
            const capsterDisplay = booking.barber_id === 'any' ? 'Bebas' : (booking.barber_id || 'N/A').toUpperCase();
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <strong>${booking.booking_date}</strong><br>
                    <span style="color:var(--text-secondary); font-size:0.85rem;">Pukul ${booking.time_slot}</span>
                </td>
                <td><strong>${booking.customer_name}</strong></td>
                <td>${serviceDisplay}</td>
                <td>${capsterDisplay}</td>
                <td><span class="status ${booking.status}">${booking.status}</span></td>
            `;
            tbody.appendChild(tr);
        });
    },

    // ===================================
    // PELANGGAN DATABASE AGGREGATION
    // ===================================

    async fetchPelanggan() {
        const tbody = document.getElementById('table-pelanggan-body');
        if (!tbody) return;
        
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:2rem;"><i class="ph ph-spinner ph-spin"></i> Mengkalkulasi database...</td></tr>`;

        if (!window.db || !window.db.getAllBookings) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;">Sistem database belum terkonfigurasi.</td></tr>`;
            return;
        }

        const res = await window.db.getAllBookings();
        if (!res.success) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:red;">${res.error}</td></tr>`;
            return;
        }

        // Aggregate by customer phone (unique identifier)
        const customers = {};
        res.data.forEach(b => {
            const key = b.customer_phone || b.customer_name;
            if (!customers[key]) {
                customers[key] = {
                    name: b.customer_name,
                    phone: b.customer_phone || '-',
                    visits: 0,
                    completedVisits: 0
                };
            }
            customers[key].visits++;
            if (b.status === 'completed') customers[key].completedVisits++;
        });

        const sorted = Object.values(customers).sort((a, b) => b.completedVisits - a.completedVisits);

        tbody.innerHTML = '';

        if (sorted.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;">Belum ada data pelanggan.</td></tr>`;
            return;
        }

        sorted.forEach(c => {
            let loyaltyBadge;
            if (c.completedVisits >= 10) {
                loyaltyBadge = `<span class="status" style="background:linear-gradient(135deg,#fcd34d,#f59e0b); color:#78350f;">🏆 VIP GOLD</span>`;
            } else if (c.completedVisits >= 5) {
                loyaltyBadge = `<span class="status" style="background:rgba(99,102,241,0.15); color:#6366f1;">⭐ LOYAL</span>`;
            } else if (c.completedVisits >= 2) {
                loyaltyBadge = `<span class="status completed">MEMBER</span>`;
            } else {
                loyaltyBadge = `<span class="status pending">BARU</span>`;
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${c.name}</strong></td>
                <td>${c.phone}</td>
                <td style="text-align:center; font-weight:600;">${c.completedVisits}</td>
                <td>${loyaltyBadge}</td>
            `;
            tbody.appendChild(tr);
        });
    },

    // ===================================
    // PROMO & VOUCHER CRUD
    // ===================================

    setupPromoForm() {
        const fPromo = document.getElementById('form-promo');
        if (fPromo) {
            fPromo.addEventListener('submit', async (e) => {
                e.preventDefault();
                const payload = {
                    code: document.getElementById('add-promo-code').value.toUpperCase(),
                    discount_value: parseInt(document.getElementById('add-promo-value').value),
                    valid_until: document.getElementById('add-promo-date').value
                };
                Swal.showLoading();
                const res = await window.db.addPromo(payload);
                if (res.success) {
                    fPromo.reset();
                    Swal.fire('Tersimpan', 'Voucher promo berhasil ditambahkan.', 'success');
                    this.fetchPromos();
                } else Swal.fire('Error', res.error, 'error');
            });
        }
    },

    async fetchPromos() {
        if (!window.db || !window.db.getPromos) return;
        const tbody = document.getElementById('table-promo-body');
        if (!tbody) return;

        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;"><i class="ph ph-spinner ph-spin"></i> Memuat promo...</td></tr>`;
        
        const res = await window.db.getPromos();
        tbody.innerHTML = '';

        if (!res.success) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:red;">${res.error}</td></tr>`;
            return;
        }

        if (res.data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-secondary);">Belum ada voucher promo aktif.</td></tr>`;
            return;
        }

        res.data.forEach(p => {
            const isExpired = new Date(p.valid_until) < new Date();
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <strong style="letter-spacing:0.05em; font-family:monospace; font-size:1.05rem;">${p.code}</strong>
                    ${isExpired ? '<br><span class="status cancelled" style="margin-top:0.25rem;">EXPIRED</span>' : '<br><span class="status completed" style="margin-top:0.25rem;">AKTIF</span>'}
                </td>
                <td style="font-weight:600; color:var(--accent-color);">Rp ${parseInt(p.discount_value).toLocaleString()}</td>
                <td>${new Date(p.valid_until).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</td>
                <td><button class="btn btn-outline btn-sm action-btn" onclick="adminLogic.deletePromo('${p.id}')" style="color:red; border-color:red;" title="Hapus Voucher"><i class="ph ph-trash"></i></button></td>
            `;
            tbody.appendChild(tr);
        });
    },

    async deletePromo(id) {
        if (confirm('Yakin ingin menghapus voucher promo ini?')) {
            Swal.showLoading();
            const res = await window.db.deletePromo(id);
            if (res.success) {
                Swal.close();
                this.fetchPromos();
            } else Swal.fire('Error', res.error, 'error');
        }
    },

    // ===================================
    // SITE SETTINGS - SAVE & LOAD
    // ===================================

    async saveSettings() {
        if (!window.db || !window.db.saveSiteSettings) {
            Swal.fire('Error', 'Fungsi database belum siap.', 'error');
            return;
        }

        const payload = {
            shop_name: document.getElementById('set-shop_name')?.value || '',
            hero_text: document.getElementById('set-hero_text')?.value || '',
            wa_number: document.getElementById('set-wa_number')?.value || '',
            receipt_footer: document.getElementById('set-receipt_footer')?.value || '',
            op_hours: document.getElementById('set-op_hours')?.value || '',
            op_days: document.getElementById('set-op_days')?.value || '',
            address: document.getElementById('set-address')?.value || ''
        };

        Swal.fire({ title: 'Menyimpan...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

        const res = await window.db.saveSiteSettings(payload);
        if (res.success) {
            this.updateGlobalSettingsUI(payload);
            Swal.fire({
                icon: 'success',
                title: 'Tersimpan!',
                text: 'Pengaturan website berhasil diperbarui. Perubahan akan terlihat di halaman publik.',
                timer: 2500,
                showConfirmButton: false
            });
        } else {
            Swal.fire('Gagal Menyimpan', res.error, 'error');
        }
    },

    async loadSettings() {
        if (!window.db || !window.db.getSiteSettings) return;

        const res = await window.db.getSiteSettings();
        if (res.success && res.data) {
            const d = res.data;
            const fields = ['shop_name', 'hero_text', 'wa_number', 'receipt_footer', 'op_hours', 'op_days', 'address'];
            fields.forEach(f => {
                const el = document.getElementById('set-' + f);
                if (el && d[f]) {
                    if (el.tagName === 'TEXTAREA') {
                        el.value = d[f];
                    } else {
                        el.value = d[f];
                    }
                }
            });
            this.updateGlobalSettingsUI(d);
        }
    },

    updateGlobalSettingsUI(d) {
        if (d.shop_name) {
            const parts = d.shop_name.trim().split(' ');
            const first = parts.shift() || 'KAPPERS';
            const rest = parts.join(' ');
            
            const brand1 = document.getElementById('ui-shop-name-1');
            const brand2 = document.getElementById('ui-shop-name-2');
            if (brand1) brand1.textContent = first.toUpperCase();
            if (brand2) brand2.textContent = rest.toUpperCase();
            
            const receiptName = document.getElementById('receipt-shop-name');
            if (receiptName) receiptName.textContent = d.shop_name;
        }
        
        if (d.address) {
            const receiptAddr = document.getElementById('receipt-shop-address');
            if (receiptAddr) receiptAddr.textContent = d.address;
        }
        
        if (d.receipt_footer) {
            const receiptFooter = document.getElementById('receipt-footer-text');
            if (receiptFooter) receiptFooter.textContent = d.receipt_footer;
        }
    }
};
