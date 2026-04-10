// Konfigurasi Supabase
// PENTING: Ganti nilai ini dengan URL dan ANON KEY dari project Supabase Anda
const supabaseUrl = 'https://pychsdckpsnlxrposaui.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5Y2hzZGNrcHNubHhycG9zYXVpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NTE1OTEsImV4cCI6MjA5MTEyNzU5MX0._6YP8_vlu6oSLS4Ecs3qZ1J0pVUQC7GDkCWdbXZUNSA';

// Inisialisasi Klien Supabase
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

// Objek untuk mengelola fungsi Database
const db = {
    async insertBooking(bookingData) {
        try {
            const { data, error } = await supabaseClient
                .from('bookings')
                .insert([bookingData])
                .select();

            if (error) throw error;
            return { success: true, data };
        } catch (error) {
            console.error("Error inserting booking:", error);
            return { success: false, error: error.message };
        }
    },

    // Fungsi untuk mengambil jadwal yang sudah terisi (Untuk validasi Double Booking)
    async getBookedSlots(date, barberId) {
        try {
            let query = supabaseClient
                .from('bookings')
                .select('time_slot')
                .eq('booking_date', date)
                .neq('status', 'cancelled');

            if (barberId && barberId !== 'any') {
                query = query.eq('barber_id', barberId);
            }

            const { data, error } = await query;
            if (error) throw error;
            return data.map(b => b.time_slot);
        } catch (error) {
            console.error("Error fetching booked slots:", error);
            return [];
        }
    },

    // Fetch live queue count for today
    async getLiveQueueCount() {
        try {
            const today = new Date().toISOString().split("T")[0];
            const { count, error } = await supabaseClient
                .from('bookings')
                .select('*', { count: 'exact', head: true })
                .eq('booking_date', today)
                .eq('status', 'pending');
            if (error) throw error;
            return count || 0;
        } catch (error) {
            console.error("Error fetching live queue:", error);
            return 0;
        }
    },

    // ==========================================
    // ADMIN FUNCTIONS
    // ==========================================
    
    // Fetch all bookings for the admin dashboard
    async getAllBookings() {
        try {
            const { data, error } = await supabaseClient
                .from('bookings')
                .select('*')
                .order('booking_date', { ascending: false })
                .order('time_slot', { ascending: true });
                
            if (error) throw error;
            return { success: true, data };
        } catch (error) {
            console.error("Error fetching all bookings:", error);
            return { success: false, error: error.message };
        }
    },

    // Update marking booking status (pending/completed/cancelled)
    async updateBookingStatus(id, newStatus) {
        try {
            const { data, error } = await supabaseClient
                .from('bookings')
                .update({ status: newStatus })
                .eq('id', id);
                
            if (error) throw error;
            return { success: true, data };
        } catch (error) {
            console.error("Error updating booking status:", error);
            return { success: false, error: error.message };
        }
    },

    // Update actual barber assigned during checkout
    async updateBookingBarber(id, newBarberId) {
        try {
            const { error } = await supabaseClient
                .from('bookings')
                .update({ barber_id: newBarberId })
                .eq('id', id);
                
            if (error) throw error;
            return { success: true };
        } catch (error) {
            console.error("Error updating booking barber:", error);
            return { success: false, error: error.message };
        }
    },

    // ==========================================
    // MASTER DATA (PHASE 6 & 7)
    // ==========================================

    async getServices() {
        try {
            const { data, error } = await supabaseClient.from('services').select('*').order('created_at', { ascending: true });
            if(error) throw error;
            return { success: true, data };
        } catch (error) { return { success: false, error: error.message }; }
    },
    
    async addService(payload) {
        try {
            const { data, error } = await supabaseClient.from('services').insert([payload]);
            if(error) throw error;
            return { success: true };
        } catch (error) { return { success: false, error: error.message }; }
    },

    async deleteService(id) {
        try {
            const { error } = await supabaseClient.from('services').delete().eq('id', id);
            if(error) throw error;
            return { success: true };
        } catch (error) { return { success: false, error: error.message }; }
    },

    async updateService(id, payload) {
        try {
            const { error } = await supabaseClient.from('services').update(payload).eq('id', id);
            if(error) throw error;
            return { success: true };
        } catch (error) { return { success: false, error: error.message }; }
    },

    async getEmployees() {
        try {
            const { data, error } = await supabaseClient.from('employees').select('*').order('created_at', { ascending: true });
            if(error) throw error;
            return { success: true, data };
        } catch (error) { return { success: false, error: error.message }; }
    },
    
    async addEmployee(payload) {
        try {
            const { data, error } = await supabaseClient.from('employees').insert([payload]);
            if(error) throw error;
            return { success: true };
        } catch (error) { return { success: false, error: error.message }; }
    },
    
    async deleteEmployee(id) {
        try {
            const { error } = await supabaseClient.from('employees').delete().eq('id', id);
            if(error) throw error;
            return { success: true };
        } catch (error) { return { success: false, error: error.message }; }
    },

    async updateEmployee(id, payload) {
        try {
            const { error } = await supabaseClient.from('employees').update(payload).eq('id', id);
            if(error) throw error;
            return { success: true };
        } catch (error) { return { success: false, error: error.message }; }
    },

    async toggleEmployeeStatus(id, isActive) {
        try {
            const { error } = await supabaseClient.from('employees').update({ is_active: isActive }).eq('id', id);
            if(error) throw error;
            return { success: true };
        } catch (error) { return { success: false, error: error.message }; }
    },

    async getProducts() {
        try {
            const { data, error } = await supabaseClient.from('products').select('*').order('created_at', { ascending: true });
            if(error) throw error;
            return { success: true, data };
        } catch (error) { return { success: false, error: error.message }; }
    },
    
    async addProduct(payload) {
        try {
            const { data, error } = await supabaseClient.from('products').insert([payload]);
            if(error) throw error;
            return { success: true };
        } catch (error) { return { success: false, error: error.message }; }
    },

    async deleteProduct(id) {
        try {
            const { error } = await supabaseClient.from('products').delete().eq('id', id);
            if(error) throw error;
            return { success: true };
        } catch (error) { return { success: false, error: error.message }; }
    },

    async updateProduct(id, payload) {
        try {
            const { error } = await supabaseClient.from('products').update(payload).eq('id', id);
            if(error) throw error;
            return { success: true };
        } catch (error) { return { success: false, error: error.message }; }
    },

    // ==========================================
    // EXPENSES MANAGEMENT
    // ==========================================

    async getExpenses() {
        try {
            const { data, error } = await supabaseClient.from('expenses').select('*').order('expense_date', { ascending: false });
            if(error) throw error;
            return { success: true, data };
        } catch (error) { return { success: false, error: error.message }; }
    },

    async addExpense(payload) {
        try {
            const { data, error } = await supabaseClient.from('expenses').insert([payload]);
            if(error) throw error;
            return { success: true };
        } catch (error) { return { success: false, error: error.message }; }
    },

    async deleteExpense(id) {
        try {
            const { error } = await supabaseClient.from('expenses').delete().eq('id', id);
            if(error) throw error;
            return { success: true };
        } catch (error) { return { success: false, error: error.message }; }
    },

    // ==========================================
    // TRANSACTION ENGINE (PHASE 6)
    // ==========================================

    async createTransaction(payload) {
        try {
            // 1. Insert Transaction Data
            const { data, error } = await supabaseClient.from('transactions').insert([payload]);
            if(error) throw error;
            
            // 2. Update Booking Status to Completed
            const updateRes = await this.updateBookingStatus(payload.booking_id, 'completed');
            if(!updateRes.success) throw new Error(updateRes.error);

            // Note: Stok pengurangan produk bisa ditangani di backend trigger/func.
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },
    // ==========================================
    // GALLERY ENGINE (PHASE 8)
    // ==========================================
    async getGallery() {
        try {
            const { data, error } = await supabaseClient.from('gallery').select('*').order('created_at', { ascending: false });
            if (error) throw error;
            return { success: true, data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    async addGalleryItem(payload) {
        try {
            const { error } = await supabaseClient.from('gallery').insert([payload]);
            if (error) throw error;
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    async deleteGalleryItem(id) {
        try {
            const { error } = await supabaseClient.from('gallery').delete().eq('id', id);
            if (error) throw error;
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    async getTransactions() {
        try {
            const { data, error } = await supabaseClient
                .from('transactions')
                .select('*, bookings(service_id, barber_id, customer_name)')
                .order('created_at', { ascending: false });
            if (error) throw error;
            return { success: true, data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
};

window.db = db; // Attach ke window agar bisa diakses di app.js
window.supabaseClient = supabaseClient; // Attach klien untuk fungsi Auth

