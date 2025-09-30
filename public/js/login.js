document.querySelector('form').addEventListener('submit', async function (e) {
  e.preventDefault();

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value.trim();

  if (!email || !password) {
    alert('Completa todos los campos');
    return;
  }

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (res.ok) {
      window.location.href = data.redirect;
    } else {
      alert(data.error);
    }
  } catch (err) {
    console.error(err);
    alert('Error al conectar con el servidor');
  }
});


//login
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  const emailEl = document.getElementById('email');
  const passEl = document.getElementById('password');
  const msg = document.getElementById('msg');

  if (!form || !emailEl || !passEl) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.textContent = '';
    const payload = { email: emailEl.value.trim(), password: passEl.value };
    try {
      const res = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.message || 'Credenciales inválidas');
      // Login OK → redirigir al panel admin
      window.location.href = '/manager/';
    } catch (err) {
      msg.textContent = err.message || 'Error al iniciar sesión';
    }
  });
});