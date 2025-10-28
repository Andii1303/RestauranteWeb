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

	const roundTo30 = (d) => {
		const mins = d.getMinutes();
		const rounded = mins < 30 ? 30 : 60;
		if (rounded === 60) {
			d.setHours(d.getHours() + 1);
			d.setMinutes(0);
		} else {
			d.setMinutes(30);
		}
		return d;
	};
	const start = roundTo30(new Date());
	const end = new Date(start.getTime() + 30 * 60000);
	const fmt = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
	const sv = fmt(start);
	const ev = fmt(end);
	if (slots.includes(sv)) inicioSel.value = sv;
	if (slots.includes(ev)) finSel.value = ev;

		// Asegurar que fin > inicio siempre (si el inicio no cae en slots, ambos podrían quedar en 08:00)
		const iVal = inicioSel.value || slots[0];
		let iIdx = slots.indexOf(iVal);
		if (iIdx < 0) iIdx = 0;
		let fIdx = Math.max(iIdx + 1, 1);
		if (fIdx >= slots.length) fIdx = slots.length - 1;
		if (!finSel.value || finSel.value <= iVal) {
			inicioSel.value = slots[iIdx];
			finSel.value = slots[fIdx];
		}
}

async function ensureDefaultMesas() {
	try {
		// Mapeo de mesas con su capacidad según la imagen
		const mesas = Array.from(document.querySelectorAll('.mesa-img')).map(el => {
			const nombre = el.dataset.mesaId;
			let capacidad = 4;
			if (nombre.includes('2')) capacidad = 2;
			else if (nombre.includes('6')) capacidad = 6;
			else if (nombre.includes('8')) capacidad = 8;
			return { nombre, capacidad };
		});
		await fetch('/api/mesas/ensure-defaults', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ mesas, deleteMissing: true })
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
		const mm = String(today.getMonth() + 1).padStart(2, '0');
		const dd = String(today.getDate()).padStart(2, '0');
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
		// Evitar llamadas con rango inválido
		if (inicio >= fin) {
			// Limpiar estados de "no disponible" si quedaron marcados
			document.querySelectorAll('.mesa-img').forEach(el => {
				el.classList.remove('mesa-disabled');
				el.title = '';
			});
			return;
		}
		try {
			const url = `/api/mesas/availability?fecha=${encodeURIComponent(fecha)}&inicio=${encodeURIComponent(inicio)}&fin=${encodeURIComponent(fin)}`;
			const r = await fetch(url);
			if (!r.ok) throw new Error('HTTP ' + r.status);
			const json = await r.json();
			const unavailable = new Set((json.unavailable_nombres || []).map(String));
			document.querySelectorAll('.mesa-img').forEach(el => {
				const name = el.dataset.mesaId;
				if (unavailable.has(name)) {
					el.classList.add('mesa-disabled');
					el.title = 'Mesa no disponible en el horario seleccionado';
				} else {
					el.classList.remove('mesa-disabled');
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
	setTimeout(refreshAvailability, 0);

	// Estado de mesas seleccionadas
	const selected = new Set(JSON.parse(localStorage.getItem('mesasSeleccionadas') || '[]'));

	function persistSelected() {
		localStorage.setItem('mesasSeleccionadas', JSON.stringify(Array.from(selected)));
	}

	function updateMesaStyles() {
		document.querySelectorAll('.mesa-img').forEach(el => {
			const name = el.dataset.mesaId;
			if (selected.has(name)) {
				el.classList.add('mesa-selected');
			} else {
				el.classList.remove('mesa-selected');
			}
		});
	}

	function getDialogElements() {
		const dlg = document.getElementById('mesa-dialog');
		return {
			dlg,
			title: dlg?.querySelector('#dlg-title'),
			estado: dlg?.querySelector('#dlg-estado'),
			capacidad: dlg?.querySelector('#dlg-capacidad'),
			extras: dlg?.querySelector('#dlg-extras'),
			btnSel: dlg?.querySelector('#dlg-select'),
			btnCancel: dlg?.querySelector('#dlg-cancel'),
		};
	}

	async function openMesaDialog(mesaNombre) {
		const fecha = (document.getElementById('reserva-fecha')?.value || '').trim();
		const hi = (document.getElementById('reserva-inicio')?.value || '').trim();
		const hf = (document.getElementById('reserva-fin')?.value || '').trim();
		if (!fecha || !hi || !hf) {
			alert('Seleccione fecha, hora de check-in y check-out');
			return;
		}
		if (hi >= hf) {
			alert('El check-out debe ser mayor al check-in');
			return;
		}
		const { dlg, title, estado, capacidad, extras, btnSel, btnCancel } = getDialogElements();
		if (!dlg) return;
		dlg.classList.add('open');
		title.textContent = `Mesa ${mesaNombre}`;
		estado.textContent = 'Cargando...';
		capacidad.textContent = '-';
		extras.textContent = '-';
		btnSel.disabled = true;
		btnSel.textContent = selected.has(mesaNombre) ? 'Deseleccionar' : 'Seleccionar';

		btnCancel.onclick = () => {
			dlg.classList.remove('open');
		};
		btnSel.onclick = () => {
			if (selected.has(mesaNombre)) selected.delete(mesaNombre);
			else selected.add(mesaNombre);
			persistSelected();
			updateMesaStyles();
			dlg.classList.remove('open');
		};

		try {
			const r = await fetch(`/api/mesas/${encodeURIComponent(mesaNombre)}/details?fecha=${encodeURIComponent(fecha)}&inicio=${encodeURIComponent(hi)}&fin=${encodeURIComponent(hf)}`);
			const json = await r.json();
			const disp = json.disponible ? 'Disponible' : 'No disponible';
			estado.textContent = disp;
			capacidad.textContent = String(json.capacidad || 4);
			extras.textContent = String(json.extras_max || 2);
			btnSel.disabled = !json.disponible;
		} catch (e) {
			const { estado } = getDialogElements();
			if (estado) estado.textContent = 'Error al cargar detalles de la mesa';
			btnSel.disabled = true;
		}
	}

	document.addEventListener('click', async (e) => {
		const mesa = e.target.closest('.mesa-img');
		if (!mesa || mesa.classList.contains('mesa-disabled')) return;
		const mesaNombre = mesa.getAttribute('data-mesa-id');
		openMesaDialog(mesaNombre);
	});

	const btnContinuar = document.getElementById('btn-continuar');
	btnContinuar?.addEventListener('click', async () => {
		if (selected.size === 0) {
			alert('Seleccione al menos una mesa');
			return;
		}
		const fecha = (document.getElementById('reserva-fecha')?.value || '').trim();
		const hi = (document.getElementById('reserva-inicio')?.value || '').trim();
		const hf = (document.getElementById('reserva-fin')?.value || '').trim();
		if (!fecha || !hi || !hf) {
			alert('Seleccione fecha, hora de check-in y check-out');
			return;
		}
		if (hi >= hf) {
			alert('El check-out debe ser mayor al check-in');
			return;
		}
		const reservaInicio = `${fecha} ${hi}:00`;
		const reservaFin = `${fecha} ${hf}:00`;
		const mesasCsv = Array.from(selected).join(',');
		try {
			const res = await fetch(`/api/facturas/draft-from-mesa`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					mesas_csv: mesasCsv,
					reserva_inicio: reservaInicio,
					reserva_fin: reservaFin,
				}),
			});
			const json = await res.json();
			if (!res.ok) throw new Error(json?.message || 'Error HTTP ' + res.status);
			localStorage.setItem('facturaId', json.factura_id);
			localStorage.setItem('mesasMixId', json.mesas_mix_id);
			localStorage.setItem('mesasSeleccionadas', JSON.stringify(Array.from(selected)));
			localStorage.setItem('reservaFecha', fecha);
			localStorage.setItem('reservaCheckIn', hi);
			localStorage.setItem('reservaCheckOut', hf);
			window.location.href = '/cliente/menu.html';
		} catch (err) {
			alert('No se pudo iniciar la reserva: ' + err.message);
		}
	});

	updateMesaStyles();
});
