console.log('[login.js] Script cargado');

const form = document.getElementById('loginForm');
const errorBox = document.getElementById('loginError');

function showError(msg){
	if (errorBox){
		errorBox.textContent = msg || 'Correo o contraseña incorrectos';
		errorBox.style.display = 'block';
	} else {
		alert(msg || 'Correo o contraseña incorrectos');
	}
}

function redirectByRole(role){
	if (role === 'ADMIN') return window.location.replace('/admin/Admin.html');
	if (role === 'COCINERO') return window.location.replace('/kitchen/kitchen.html');
	if (role === 'MESERO') return window.location.replace('/staff/');
	// CLIENTE y fallback
	return window.location.replace('/cliente/menu.html');
}

if (!form){
	console.error('[login.js] No se encontró #loginForm');
} else {
	form.addEventListener('submit', async (e) => {
		e.preventDefault();
		if (errorBox) errorBox.style.display = 'none';
		const emailEl = document.getElementById('email');
		const passEl = document.getElementById('password');
		const email = (emailEl?.value || '').trim();
		const password = (passEl?.value || '').trim();
		if (!email || !password){
			showError('Completa correo y contraseña');
			return;
		}
		try {
			const res = await fetch('/auth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email, password })
			});
			let data = null;
			try { data = await res.json(); } catch {}
			if (!res.ok){
				showError((data && (data.message || data.error)) || 'Correo o contraseña incorrectos');
				return;
			}
			if (data && data.data && data.data.role){
				redirectByRole(data.data.role);
			} else {
				showError('Respuesta inesperada del servidor');
			}
		} catch (err){
			console.error('[login.js] Error en fetch', err);
			showError('No se pudo conectar con el servidor');
		}
	});
}

