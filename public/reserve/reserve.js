// Helper para generar horarios HH:MM en intervalos de 30'
function buildSlots(startH = 8, endH = 22) {
	const slots = [];
	for (let h = startH; h <= endH; h++) {
		for (let m of [0, 30]) {
			const hh = String(h).padStart(2, '0');
			const mm = String(m).padStart(2, '0');
			slots.push(`${hh}:${mm}`);
		}
	}
	return slots;
}

function populateTimeSelects() {
	const inicioSel = document.getElementById('reserva-inicio');
	const finSel = document.getElementById('reserva-fin');
	if (!inicioSel || !finSel) return;
	const slots = buildSlots(8, 22);
	inicioSel.innerHTML = slots.map(s => `<option value="${s}">${s}</option>`).join('');
	finSel.innerHTML = slots.map(s => `<option value="${s}">${s}</option>`).join('');
	// Selecciones por defecto: ahora redondeado a 30' y +30' para fin
	const roundTo30 = (d) => {
		const mins = d.getMinutes();
		const rounded = mins < 30 ? 30 : 60;
		if (rounded === 60) { d.setHours(d.getHours()+1); d.setMinutes(0);} else { d.setMinutes(30);} return d;
	};
	const start = roundTo30(new Date());
	const end = new Date(start.getTime() + 30*60000);
	const fmt = (d)=> `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
	const sv = fmt(start); const ev = fmt(end);
	if (slots.includes(sv)) inicioSel.value = sv;
	if (slots.includes(ev)) finSel.value = ev;
}

async function ensureDefaultMesas() {
	try {
		const mesas = Array.from(document.querySelectorAll('.mesa-img')).map(el => ({ nombre: el.dataset.mesaId, capacidad: 4 }));
		await fetch('/api/mesas/ensure-defaults', {
			method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mesas })
		});
	} catch (e) {
		console.warn('No se pudieron asegurar mesas por defecto', e);
	}
}

document.addEventListener('DOMContentLoaded', () => {
	// Fecha mínima: hoy
	const f = document.getElementById('reserva-fecha');
	if (f) {
		const today = new Date();
		const yyyy = today.getFullYear();
		const mm = String(today.getMonth()+1).padStart(2,'0');
		const dd = String(today.getDate()).padStart(2,'0');
		f.min = `${yyyy}-${mm}-${dd}`;
		f.value = `${yyyy}-${mm}-${dd}`;
	}
	populateTimeSelects();
	ensureDefaultMesas();

		async function refreshAvailability() {
			const fecha = document.getElementById('reserva-fecha')?.value;
			const inicio = document.getElementById('reserva-inicio')?.value;
			const fin = document.getElementById('reserva-fin')?.value;
			if (!fecha || !inicio || !fin) return;
			try {
				const url = `/api/mesas/availability?fecha=${encodeURIComponent(fecha)}&inicio=${encodeURIComponent(inicio)}&fin=${encodeURIComponent(fin)}`;
				const r = await fetch(url);
				if (!r.ok) throw new Error('HTTP '+r.status);
				const json = await r.json();
				const unavailable = new Set((json.unavailable_nombres || []).map(String));
				document.querySelectorAll('.mesa-img').forEach(el => {
					const name = el.dataset.mesaId;
					if (unavailable.has(name)) {
						el.classList.add('mesa-disabled');
						el.style.filter = 'grayscale(1)';
						el.style.pointerEvents = 'none';
						el.title = 'Mesa no disponible en el horario seleccionado';
					} else {
						el.classList.remove('mesa-disabled');
						el.style.filter = '';
						el.style.pointerEvents = '';
						el.title = '';
					}
				});
			} catch (e) {
				console.warn('No se pudo obtener disponibilidad', e);
			}
		}

		// Actualizar disponibilidad al cambiar fecha/horas
		document.getElementById('reserva-fecha')?.addEventListener('change', refreshAvailability);
		document.getElementById('reserva-inicio')?.addEventListener('change', refreshAvailability);
		document.getElementById('reserva-fin')?.addEventListener('change', refreshAvailability);
		// Primera carga
		setTimeout(refreshAvailability, 0);

	// Click en mesa: crear BORRADOR de factura y redirigir al menú
	document.addEventListener('click', async (e) => {
		const mesa = e.target.closest('.mesa-img');
		if (!mesa) return;
			if (mesa.classList.contains('mesa-disabled')) return;
		const mesaNombre = mesa.getAttribute('data-mesa-id') || 'MESA_4';
		// Validar selección de fecha y horas
		const fecha = (document.getElementById('reserva-fecha')?.value || '').trim();
		const hi = (document.getElementById('reserva-inicio')?.value || '').trim();
		const hf = (document.getElementById('reserva-fin')?.value || '').trim();
		if (!fecha || !hi || !hf) { alert('Seleccione fecha, hora de check-in y check-out'); return; }
		if (hi >= hf) { alert('El check-out debe ser mayor al check-in'); return; }
		// Construir ISO locales (sin zona) para enviar al backend
		const reservaInicio = `${fecha} ${hi}:00`;
		const reservaFin = `${fecha} ${hf}:00`;
		try {
			const res = await fetch(`/api/facturas/draft-from-mesa`, {
				method: 'POST', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ mesa_nombre: mesaNombre, reserva_inicio: reservaInicio, reserva_fin: reservaFin })
			});
			if (!res.ok) {
				const txt = await res.text().catch(() => '');
				throw new Error('HTTP ' + res.status + (txt ? ' - ' + txt : ''));
			}
			const json = await res.json();
			// Guarda el id de factura y mix
			localStorage.setItem('facturaId', json.factura_id);
			localStorage.setItem('mesasMixId', json.mesas_mix_id);
			localStorage.setItem('reservaMesaNombre', mesaNombre);
			localStorage.setItem('reservaFecha', fecha);
			localStorage.setItem('reservaCheckIn', hi);
			localStorage.setItem('reservaCheckOut', hf);
			// Redirige al menú para seleccionar comida
			window.location.href = '/cliente/menu.html';
		} catch (err) {
			alert('No se pudo iniciar la reserva: ' + err.message);
		}
	});
});

