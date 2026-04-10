document.addEventListener("DOMContentLoaded", () => {
    
    // Check if user is already logged in
    async function checkSession() {
        if(window.supabaseClient) {
            const { data: { session } } = await window.supabaseClient.auth.getSession();
            if (session) {
                // If logged in, send directly to admin dashboard
                window.location.href = "admin.html";
            }
        }
    }
    
    checkSession();

    const loginForm = document.getElementById('login-form');
    const btnLogin = document.getElementById('btn-login');

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;

            btnLogin.innerText = "Memverifikasi...";
            btnLogin.disabled = true;

            try {
                const { data, error } = await window.supabaseClient.auth.signInWithPassword({
                    email: email,
                    password: password
                });

                if (error) {
                    Swal.fire('Login Gagal!', error.message, 'error');
                } else {
                    Swal.fire({
                        title: 'Login Berhasil!',
                        text: 'Mengalihkan ke Dashboard...',
                        icon: 'success',
                        timer: 1500,
                        showConfirmButton: false
                    }).then(() => {
                        window.location.href = "admin.html";
                    });
                }
            } catch (err) {
                Swal.fire('Error', 'Gateway Timeout', 'error');
            }

            btnLogin.innerText = "Login Akses";
            btnLogin.disabled = false;
        });
    }
});
