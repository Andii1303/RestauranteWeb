/**
 * Login (frontend)
 *
 * Flujo:
 * - Envía email/password a /auth/login.
 * - Muestra errores en caja o alert si no hay caja.
 * - Redirige según rol devuelto por el backend.
 */

console.log('[login.js] Script cargado');

const form = document.getElementById('loginForm');
const errorBox = document.getElementById('loginError');

// Muestra error en caja visual o en alert si no existe
function showError(msg){
	if (errorBox){
		errorBox.textContent = msg || 'Correo o contraseña incorrectos';
		errorBox.classList.remove('d-none');
	} else {
		alert(msg || 'Correo o contraseña incorrectos');
	}
}

// Redirige según rol entregado por backend
function redirectByRole(role){
	console.log('[login.js] redirectByRole:', role);
	if (role === 'ADMIN') { console.log('[login.js] -> /admin/Admin.html'); return window.location.replace('/admin/Admin.html'); }
	if (role === 'COCINERO') { console.log('[login.js] -> /kitchen/cocinero.html'); return window.location.replace('/kitchen/cocinero.html'); }
	if (role === 'MESERO') { console.log('[login.js] -> /waiter/mesero.html'); return window.location.replace('/waiter/mesero.html'); }
	console.log('[login.js] -> /cliente/menu.html (fallback)');
	return window.location.replace('/cliente/menu.html');
}

if (!form){
	console.error('[login.js] No se encontró #loginForm');
} else {
	form.addEventListener('submit', async (e) => {
		e.preventDefault();
		if (errorBox) errorBox.classList.add('d-none');
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

