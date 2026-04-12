document.addEventListener("DOMContentLoaded", () => {
    console.log("Kapper's App Initialized");
    initLiveQueue();

    // === Navbar Scroll Effect ===
    const navbar = document.querySelector('.navbar');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 20) {
            navbar.style.padding = '0.75rem 0';
        } else {
            navbar.style.padding = '1.25rem 0';
        }
    });

    // === Mobile Menu Toggle ===
    const mobileToggle = document.getElementById('mobile-toggle');
    const navLinks = document.getElementById('nav-links');
    if (mobileToggle && navLinks) {
        mobileToggle.addEventListener('click', () => {
            navLinks.classList.toggle('active');
        });
        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => navLinks.classList.remove('active'));
        });
    }

    // === Multi-step Booking Form Logic ===
    let currentStep = 1;
    const totalSteps = 4;

    // Elements
    const steps = document.querySelectorAll('.booking-step');
    const dots = document.querySelectorAll('.step-dot');
    const progressFill = document.getElementById('progress-fill');
    const nextBtns = document.querySelectorAll('.next-btn');
    const prevBtns = document.querySelectorAll('.prev-btn');
    const confirmBtn = document.querySelector('.confirm-btn');

    // Summary Elements
    const sumService = document.getElementById('sum-service');
    const sumBarber = document.getElementById('sum-barber');
    const sumDatetime = document.getElementById('sum-datetime');
    const sumPrice = document.getElementById('sum-price');

    // Applied Promo State
    let appliedPromo = null;
    let basePrice = 0;

    // Site Settings State
    let currentSiteSettings = {
        wa_number: "6289630462036", // Default fallback
        shop_name: "Kapper's"
    };

    function rebindBarberListeners() {
        const radios = document.querySelectorAll('input[name="barber"]');
        radios.forEach(radio => radio.addEventListener('change', () => {
            const di = document.getElementById('booking-date');
            if (di && di.value) checkAvailableSlots();
        }));
    }

    // === Fetch Live Queue Status ===
    async function initLiveQueue() {
        const queueIndicator = document.getElementById('live-queue-indicator');
        if (!queueIndicator) return;

        if (window.db && window.db.getLiveQueueCount) {
            const count = await window.db.getLiveQueueCount();
            if (count > 0) {
                queueIndicator.innerHTML = `<i class="ph ph-warning-circle" style="color: #f97316;"></i> <span style="color: #f97316;">Antrian Tersisa Hari Ini: ${count} Pelanggan</span>`;
                queueIndicator.style.borderColor = '#f97316';
            } else {
                queueIndicator.innerHTML = `<i class="ph ph-check-circle" style="color: #22c55e;"></i> <span style="color: #22c55e;">Bangku Kosong (Bisa Langsung Cukur)</span>`;
                queueIndicator.style.borderColor = '#22c55e';
            }
        }
    }

    // === Fetch Services (Phase 7 - Sync Master Data) ===
    async function initServices() {
        const publicGrid = document.getElementById('public-services-grid');
        const bookingGrid = document.getElementById('booking-services-grid');
        if(!publicGrid || !bookingGrid) return;
        
        await new Promise(r => setTimeout(r, 600));

        if (window.db && window.db.getServices) {
            const res = await window.db.getServices();
            if (res.success && res.data.length > 0) {
                publicGrid.innerHTML = '';
                bookingGrid.innerHTML = '';
                
                res.data.forEach((srv, i) => {
                    let highlightClass = i === 1 ? 'highlight-card' : '';
                    let ribbon = i === 1 ? '<div class="badge-ribbon">Populer</div>' : '';
                    
                    // Inject to Public Showcase Grid
                    publicGrid.innerHTML += `
                        <div class="service-card ${highlightClass}">
                            ${ribbon}
                            <div class="service-icon"><i class="ph ph-scissors"></i></div>
                            <h3>${srv.name}</h3>
                            <p>${srv.description || "Layanan grooming profesional."}</p>
                            <div class="service-footer">
                                <span class="price">Rp ${parseFloat(srv.price).toLocaleString()}</span>
                            </div>
                        </div>
                    `;

                    // Inject to Booking Form Grid
                    // Text keterangan ditambahkan jika ada deskripsi
                    let descHtml = srv.description ? `<span style="font-size:0.75rem; color:var(--text-secondary); display:block; margin: 0 0 0.2rem 0; line-height:1.2;">(${srv.description})</span>` : '';
                    
                    bookingGrid.innerHTML += `
                        <label class="selectable-card">
                            <input type="radio" name="service" value="${srv.name}" data-price="${srv.price}">
                            <div class="sc-content">
                                <i class="ph ph-scissors"></i>
                                <strong>${srv.name}</strong>
                                ${descHtml}
                                <span style="font-weight:600; font-size:1rem; color:var(--accent-color)">Rp ${parseFloat(srv.price).toLocaleString()}</span>
                            </div>
                        </label>
                    `;
                });
                return;
            }
        }
    }

    // === Fetch Capster (Phase 6 - Sync Master Data) ===
    async function initCapsters() {
        // Only run if we are on the landing page where this container exists
        const container = document.getElementById('barber-options-container');
        const publicGrid = document.getElementById('public-barbers-grid');
        
        if(!container && !publicGrid) return;

        // Try wait for supabase client
        await new Promise(r => setTimeout(r, 500));

        if (window.db && window.db.getEmployees) {
            const res = await window.db.getEmployees();
            if (res.success && res.data.length > 0) {
                if(container) container.innerHTML = '';
                if(publicGrid) publicGrid.innerHTML = '';
                
                // Opsi Default Booking Form
                if(container) {
                    container.innerHTML += `
                        <label class="selectable-card">
                            <input type="radio" name="barber" value="any" checked>
                            <div class="sc-content barber-profile">
                                <div class="avatar" style="background:#64748B;">?</div>
                                <strong>Siapa Saja</strong>
                                <span>Capster Kosong</span>
                            </div>
                        </label>
                    `;
                }

                const colors = ['#0F172A', '#1E293B', '#334155', '#475569']; // Menggunakan warna senada tema
                
                // Get predefined timeslots from DOM to calculate schedule
                let definedSlots = [];
                document.querySelectorAll('.time-slot input').forEach(el => definedSlots.push(el.value));
                if (definedSlots.length === 0) definedSlots = ['10:00', '11:00', '13:00', '14:00', '15:00', '16:00', '17:00', '19:00', '20:00'];

                const todayRaw = new Date();
                const todayDateStr = todayRaw.toISOString().split("T")[0];
                const currentHour = todayRaw.getHours();

                // Because we need to await db calls inside the loop, we use for...of
                for (let i = 0; i < res.data.length; i++) {
                    const emp = res.data[i];
                    const initial = emp.name.charAt(0).toUpperCase();
                    const color = colors[i % colors.length];
                    const isActive = emp.is_active !== false;

                    let statusText = 'Tersedia';
                    let statusColor = 'var(--text-secondary)';
                    let isDisabledInput = '';
                    let opacityStyle = '';

                    if (!isActive) {
                        statusText = 'Sedang Libur (OFF)';
                        statusColor = '#ef4444';
                        isDisabledInput = 'disabled';
                        opacityStyle = 'opacity: 0.5; filter: grayscale(100%);';
                    } else if (window.db && window.db.getBookedSlots) {
                        try {
                            const bookedTimes = await window.db.getBookedSlots(todayDateStr, emp.name);
                            const openSlots = definedSlots.filter(s => {
                                const slotHour = parseInt(s.split(':')[0]);
                                return slotHour > currentHour && !bookedTimes.includes(s);
                            });

                            if (currentHour >= 20) {
                                statusText = 'Tutup Hari Ini';
                            } else if (openSlots.length > 0) {
                                statusText = `Kosong Jam ${openSlots[0]}`;
                                statusColor = '#22c55e'; // Green
                            } else {
                                statusText = 'Penuh Hari Ini';
                                statusColor = '#f97316'; // Orange
                                isDisabledInput = 'disabled';
                            }
                        } catch (e) { console.error(e); }
                    }
                    
                    // Inject to Booking Container
                    if(container) {
                        container.innerHTML += `
                            <label class="selectable-card" style="${opacityStyle}">
                                <input type="radio" name="barber" value="${emp.name}" ${isDisabledInput}>
                                <div class="sc-content barber-profile">
                                    <div class="avatar" style="background:${color};">${initial}</div>
                                    <strong>${emp.name}</strong>
                                    <span style="font-size:0.75rem; color:${statusColor}; font-weight:600;">${statusText}</span>
                                </div>
                            </label>
                        `;
                    }

                    // Inject to Public Showcase Grid
                    if(publicGrid) {
                        // Menggunakan background=0F172A agar senada dengan accent color landing page
                        const photoUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(emp.name)}&size=300&background=0F172A&color=fff&bold=true`;
                        let socialsHtml = '';
                        if (emp.ig_username && emp.ig_username.trim() !== '') {
                            socialsHtml += `<a href="https://instagram.com/${emp.ig_username.trim()}" target="_blank" title="Instagram"><i class="ph ph-instagram-logo"></i></a>`;
                        }
                        if (emp.tiktok_username && emp.tiktok_username.trim() !== '') {
                            socialsHtml += `<a href="https://tiktok.com/@${emp.tiktok_username.trim()}" target="_blank" title="TikTok"><i class="ph ph-tiktok-logo"></i></a>`;
                        }
                        
                        const roleTitle = emp.role_title ? emp.role_title : 'Senior Barber';

                        publicGrid.innerHTML += `
                            <div class="barber-card" style="${opacityStyle}">
                                <div class="barber-img-wrapper">
                                    <img src="${photoUrl}" alt="Foto ${emp.name}" class="barber-img">
                                </div>
                                <div class="barber-info">
                                    <h3>${emp.name}</h3>
                                    <p>${roleTitle}</p>
                                    <div style="font-size: 0.8rem; margin-top:0.3rem; margin-bottom:0.8rem; font-weight:bold; color:${statusColor};">${statusText}</div>
                                    <div class="barber-socials">
                                        ${socialsHtml}
                                    </div>
                                </div>
                            </div>
                        `;
                    }
                }

                if(container) rebindBarberListeners();
                return;
            }
        }
        
        // Fallback for Booking Form
        if(container) {
            container.innerHTML = `
                <label class="selectable-card">
                    <input type="radio" name="barber" value="any" checked>
                    <div class="sc-content barber-profile">
                        <div class="avatar" style="background:#64748B;">?</div>
                        <strong>Siapa Saja</strong>
                        <span>Hubungi Admin</span>
                    </div>
                </label>
            `;
            rebindBarberListeners();
        }
    }

    // === Fetch Gallery (Phase 8 - Sync Portfolio Data) ===
    async function initGallery() {
        const publicGrid = document.getElementById('public-gallery-grid');
        if(!publicGrid) return;

        if (window.db && window.db.getGallery) {
            const res = await window.db.getGallery();
            if (res.success && res.data.length > 0) {
                publicGrid.innerHTML = '';
                res.data.forEach(img => {
                    publicGrid.innerHTML += `
                        <div class="gallery-item">
                            <img src="${img.image_url}" alt="${img.title}">
                            <div class="gallery-overlay">
                                <h4>${img.title}</h4>
                            </div>
                        </div>
                    `;
                });
            } else {
                publicGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-secondary); padding: 2rem;">Belum ada foto portofolio.</div>`;
            }
        }
    }

    // === Initialize Settings and Promo Logic ===
    async function initSiteSettings() {
        if (!window.db || !window.db.getSiteSettings) return;
        const res = await window.db.getSiteSettings();
        if (res.success && res.data) {
            currentSiteSettings = res.data;
            const d = res.data;
            
            // Inject to landing page
            if(d.hero_text) {
                const heroTextEl = document.querySelector('.hero h1');
                if(heroTextEl) {
                    heroTextEl.innerHTML = d.hero_text.replace(/\n/g, '<br>');
                }
            }
            if(d.wa_number) {
               const footerWaEl = document.querySelector('.footer-contact p:nth-child(3)');
               if(footerWaEl) footerWaEl.innerHTML = `<i class="ph ph-whatsapp"></i> +${d.wa_number}`;
            }
            if(d.address) {
                const footerAddressEl = document.querySelector('.footer-contact p:nth-child(2)');
                if(footerAddressEl) footerAddressEl.innerHTML = `<i class="ph ph-map-pin"></i> ${d.address}`;
            }
            if(d.shop_name) {
                const mainLogo = document.querySelector('.logo');
                if(mainLogo) mainLogo.innerText = d.shop_name + '.';
            }
        }
    }

    // Handle Promo Application
    const btnApplyPromo = document.getElementById('btn-apply-promo');
    const promoCodeInput = document.getElementById('promo-code-input');
    const promoResultEl = document.getElementById('promo-result');

    if (btnApplyPromo) {
        btnApplyPromo.addEventListener('click', async () => {
            const code = promoCodeInput.value.trim();
            if (!code) return;
            
            btnApplyPromo.disabled = true;
            btnApplyPromo.innerText = 'Cek...';
            
            const res = await window.db.validatePromo(code);
            btnApplyPromo.disabled = false;
            btnApplyPromo.innerText = 'Pakai';
            
            if (res.success) {
                appliedPromo = res.data;
                promoResultEl.innerHTML = `✅ Potongan <strong>Rp ${res.data.discount_value.toLocaleString()}</strong> aktif!`;
                promoResultEl.style.color = '#22c55e';
                updateSummary();
            } else {
                appliedPromo = null;
                promoResultEl.innerHTML = `❌ ${res.error}`;
                promoResultEl.style.color = '#ef4444';
                updateSummary();
            }
        });
    }

    initServices();
    initCapsters();
    initGallery();
    initSiteSettings();

    function updateStep() {
        // Hide all steps, show current
        steps.forEach((step, index) => {
            if (index + 1 === currentStep) {
                step.classList.add('active');
            } else {
                step.classList.remove('active');
            }
        });

        // Update progress dots
        dots.forEach((dot, index) => {
            dot.classList.remove('active', 'completed');
            if (index + 1 < currentStep) {
                dot.classList.add('completed');
            } else if (index + 1 === currentStep) {
                dot.classList.add('active');
            }
        });

        // Update progress line (Width % = (currentStep - 1) / (totalSteps - 1) * 100)
        let progressVal = ((currentStep - 1) / (totalSteps - 1)) * 100;
        progressFill.style.width = progressVal + '%';

        // Summary Update Before Step 4
        if (currentStep === 4) {
            updateSummary();
        }
    }

    function getSelectedValue(name) {
        const selected = document.querySelector(`input[name="${name}"]:checked`);
        return selected ? selected.value : null;
    }

    function getSelectedLabel(name) {
        const selected = document.querySelector(`input[name="${name}"]:checked`);
        if (selected) {
            const strongNode = selected.nextElementSibling.querySelector('strong');
            return strongNode ? strongNode.innerText : selected.value;
        }
        return 'Not Selected';
    }

    function updateSummary() {
        const serviceL = getSelectedLabel('service');
        const barberL = getSelectedLabel('barber');

        const dateInput = document.getElementById('booking-date').value;
        const timeInput = getSelectedValue('time');

        // Extract base price using the data attribute of the selected radio
        const selectedRadio = document.querySelector('input[name="service"]:checked');
        basePrice = selectedRadio ? parseFloat(selectedRadio.getAttribute('data-price') || 0) : 0;

        sumService.innerText = serviceL;
        sumBarber.innerText = barberL;

        if (dateInput && timeInput) {
            sumDatetime.innerText = `${dateInput} pukul ${timeInput}`;
        } else {
            sumDatetime.innerText = "Jadwal belum lengkap";
        }

        // Calculate and display price with promo
        if (sumPrice) {
            if (basePrice > 0) {
                if (appliedPromo) {
                    const finalPrice = Math.max(0, basePrice - appliedPromo.discount_value);
                    sumPrice.innerHTML = `<span style="text-decoration:line-through; color:var(--text-secondary); font-size:0.9rem; font-weight:normal; margin-right:0.5rem;">Rp ${basePrice.toLocaleString()}</span> Rp ${finalPrice.toLocaleString()}`;
                } else {
                    sumPrice.innerText = `Rp ${basePrice.toLocaleString()}`;
                }
            } else {
                sumPrice.innerText = "-";
            }
        }
    }

    // Handlers
    nextBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Basic Validaion (Optional add conditions here)
            if (currentStep === 1 && !getSelectedValue('service')) {
                alert("Pilih layanan terlebih dahulu!");
                return;
            }
            if (currentStep === 3) {
                if (!document.getElementById('booking-date').value) {
                    alert("Pilih tanggal!"); return;
                }
                if (!getSelectedValue('time')) {
                    alert("Pilih jam!"); return;
                }
            }

            if (currentStep < totalSteps) {
                currentStep++;
                updateStep();
            }
        });
    });

    prevBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (currentStep > 1) {
                currentStep--;
                updateStep();
            }
        });
    });

    // Set Default Date to Today
    const dateInput = document.getElementById('booking-date');
    if (dateInput) {
        dateInput.min = new Date().toISOString().split("T")[0];
    }

    // === Anti Double-Booking Logic ===
    const barberRadios = document.querySelectorAll('input[name="barber"]');

    async function checkAvailableSlots() {
        if (!dateInput.value) return;

        const barberId = getSelectedValue('barber');
        const allTimeSlots = document.querySelectorAll('.time-slot');

        const todayRaw = new Date();
        const selectedDateRaw = new Date(dateInput.value);
        // Using toDateString to check if it's literally today
        const isToday = selectedDateRaw.toDateString() === todayRaw.toDateString();
        const currentHour = todayRaw.getHours();

        // Reset all slots to available first
        allTimeSlots.forEach(slot => {
            slot.classList.remove('disabled');
            const input = slot.querySelector('input');
            input.disabled = false;
            // remove (Penuh) or (Lewat) text if previously added
            const span = slot.querySelector('span');
            span.innerText = span.innerText.replace(' (Penuh)', '').replace(' (Lewat)', '');
        });

        // Disable passed hours if date is today
        if (isToday) {
            allTimeSlots.forEach(slot => {
                const input = slot.querySelector('input');
                const slotHour = parseInt(input.value.split(':')[0]);
                if (slotHour <= currentHour) {
                    slot.classList.add('disabled');
                    input.disabled = true;
                    input.checked = false;
                    const span = slot.querySelector('span');
                    span.innerText += ' (Lewat)';
                }
            });
        }

        if (window.db && window.db.getBookedSlots) {
            const bookedTimes = await window.db.getBookedSlots(dateInput.value, barberId);

            allTimeSlots.forEach(slot => {
                const input = slot.querySelector('input');
                if (bookedTimes.includes(input.value) && !input.disabled) {
                    slot.classList.add('disabled');
                    input.disabled = true;
                    input.checked = false; // uncheck if it was selected
                    const span = slot.querySelector('span');
                    if (!span.innerText.includes('(Penuh)')) {
                        span.innerText += ' (Penuh)';
                    }
                }
            });
        }

    }

    if (dateInput) {
        dateInput.addEventListener('change', checkAvailableSlots);
    }
    // barberRadios di-rebind secara dinamis oleh rebindBarberListeners()

    // Submit Booking to Supabase
    if (confirmBtn) {
        confirmBtn.addEventListener('click', async () => {
            const userName = document.getElementById('user-name').value;
            const userPhone = document.getElementById('user-phone').value;

            if (!userName || !userPhone) {
                Swal.fire('Form Tidak Lengkap', 'Mohon lengkapi Nama dan Nomor WhatsApp.', 'warning');
                return;
            }

            confirmBtn.innerText = "Memproses...";
            confirmBtn.disabled = true;

            const payload = {
                service_id: getSelectedValue('service'),
                barber_id: getSelectedValue('barber'),
                booking_date: document.getElementById('booking-date').value,
                time_slot: getSelectedValue('time'),
                customer_name: userName,
                customer_phone: userPhone,
                status: 'pending'
            };

            if (appliedPromo) {
                payload.promo_code = appliedPromo.code;
                payload.discount_amount = appliedPromo.discount_value;
            }

            // Setup WhatsApp Redirect String
            let finalPriceText = `Rp ${basePrice.toLocaleString()}`;
            let promoText = '';
            if (appliedPromo) {
                const finalP = Math.max(0, basePrice - appliedPromo.discount_value);
                finalPriceText = `~Rp ${basePrice.toLocaleString()}~ Rp ${finalP.toLocaleString()}`;
                promoText = `\n- *Promo Dipakai*: ${appliedPromo.code} (Diskon Rp ${appliedPromo.discount_value.toLocaleString()})`;
            }

            const adminWANumber = currentSiteSettings.wa_number.replace(/\D/g,''); // Get from settings, sanitized
            let waText = `Halo ${currentSiteSettings.shop_name}! Saya ${userName}, ingin konfirmasi pesanan:\n\n` +
                `- *Layanan*: ${getSelectedLabel('service')}\n` +
                `- *Harga*: ${finalPriceText}\n` +
                `- *Capster*: ${getSelectedLabel('barber')}\n` +
                `- *Jadwal*: ${payload.booking_date} Pukul ${payload.time_slot}${promoText}\n\n` +
                `Terima kasih!`;
            const waUrl = `https://wa.me/${adminWANumber}?text=${encodeURIComponent(waText)}`;

            // Call Supabase Wrapper
            if (window.db && window.db.insertBooking) {
                const res = await window.db.insertBooking(payload);
                if (res.success) {
                    Swal.fire({
                        title: 'Booking Berhasil!',
                        text: 'Membuka WhatsApp untuk konfirmasi akhir...',
                        icon: 'success',
                        timer: 2000,
                        showConfirmButton: false
                    }).then(() => {
                        window.open(waUrl, '_blank');
                        location.replace('#home');
                        location.reload();
                    });
                } else {
                    if (res.error && res.error.includes("Valid URL")) {
                        Swal.fire('Mode Demo', 'Booking berhasil disimulasikan (Supabase API belum diset). Mengalihkan ke WA...', 'info')
                            .then(() => {
                                window.open(waUrl, '_blank');
                                location.reload();
                            });
                    } else {
                        Swal.fire('Gagal!', res.error, 'error');
                    }
                    confirmBtn.innerText = "Konfirmasi & Pesan";
                    confirmBtn.disabled = false;
                }
            } else {
                console.log("Mock saved:", payload);
                Swal.fire('Mode Demo', 'Booking berhasil disimpan (Log Console). Mengalihkan ke WA...', 'info').then(() => {
                    window.open(waUrl, '_blank');
                    location.reload();
                });
            }
        });
    }
});
