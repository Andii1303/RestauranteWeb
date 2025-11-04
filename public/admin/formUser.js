/**
 * Admin: Formulario de Usuario (frontend)
 *
 * - Maneja creación/edición de usuarios.
 * - Valida campos y envía datos a endpoints de usuarios.
 */
// Evitar volver a Admin.html con el botón atrás (neutraliza historial reciente)
(function preventBackToAdmin(){
	try { history.replaceState(null, document.title, location.href); } catch {}
	window.addEventListener('popstate', function(){
		try { history.pushState(null, document.title, location.href); } catch {}
	});
})();

async function fetchRoles() {
	const r = await fetch('/roles', { credentials: 'include'});
	if(!r.ok) throw new Error('No se pudieron cargar roles');
	return r.json();
}

async function createUser(payload) {
	const r = await fetch('/users', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		credentials: 'include',
		body: JSON.stringify(payload)
	});
	const data = await r.json().catch(()=>({}));
	if(!r.ok) throw new Error(data.error || data.message || 'Error creando usuario');
	return data;
}

(async function init(){
	const form = document.getElementById('userForm');
	const msg = document.getElementById('msg');
	const roleSelect = document.getElementById('roleSelect');

	// Cargar roles
	try {
		const roles = await fetchRoles();
		roles.forEach(role => {
			const opt = document.createElement('option');
			opt.value = role; opt.textContent = role;
			roleSelect.appendChild(opt);
		});
	} catch(err) {
		msg.textContent = err.message;
		msg.className = 'msg err';
	}

	form.addEventListener('submit', async (e) => {
		e.preventDefault();
		msg.textContent = ''; msg.className='msg';
		const fd = new FormData(form);
		const payload = Object.fromEntries(fd.entries());
		const btn = form.querySelector('button');
		btn.disabled = true; btn.textContent='Creando...';
		try {
			const res = await createUser(payload);
			msg.textContent = 'Usuario creado: ' + (res.user?.email || payload.email);
			msg.className = 'msg ok';
			form.reset();
			roleSelect.selectedIndex = 0;
		} catch(err) {
			msg.textContent = err.message;
			msg.className = 'msg err';
		} finally {
			btn.disabled = false; btn.textContent='Crear Usuario';
		}
	});
})();
