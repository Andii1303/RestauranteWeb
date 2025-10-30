document.addEventListener('DOMContentLoaded', () => {
  initReservasUI();
});



// (Limpieza) Se removieron bloques comentados sin uso

// === Reservas: listado del día y verificación de asistencia ===
function initReservasUI() {
  const inputFecha = document.getElementById('res-fecha');
  const btnBuscar = document.getElementById('res-buscar');
  const cont = document.getElementById('lista-reservas');
  if (!inputFecha || !btnBuscar || !cont) return;

  // Default: hoy
  const hoy = new Date();
  const pad = n => String(n).padStart(2, '0');
  const yyyy = hoy.getFullYear();
  const mm = pad(hoy.getMonth() + 1);
  const dd = pad(hoy.getDate());
  inputFecha.value = `${yyyy}-${mm}-${dd}`;

  btnBuscar.addEventListener('click', () => cargarReservasDelDia());
  cargarReservasDelDia();

  async function cargarReservasDelDia() {
    cont.textContent = '';
    const fecha = inputFecha.value;
    if (!fecha) return;
    const url = `/api/reservas/for-day?fecha=${encodeURIComponent(fecha)}&inicio=00:00&fin=23:59&includeItems=1`;
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      const items = Array.isArray(data) ? data : (Array.isArray(data.items) ? data.items : []);
      if (!items.length) {
        const p = document.createElement('p');
        p.className = 'text-muted text-center';
        p.textContent = 'No hay reservas para esta fecha.';
        cont.appendChild(p);
        return;
      }
      const h = (tag, { className, text, attrs } = {}, children = []) => {
        const el = document.createElement(tag);
        if (className) el.className = className;
        if (text != null) el.textContent = text;
        if (attrs) Object.entries(attrs).forEach(([k,v]) => el.setAttribute(k, String(v)));
        (Array.isArray(children) ? children : [children]).forEach(ch => { if (ch) el.appendChild(ch); });
        return el;
      };

      items.forEach(rv => {
        const col = h('div', { className: 'col-md-6' });
        const card = h('div', { className: 'card shadow-sm' });
        const body = h('div', { className: 'card-body' });
        const title = h('h5', { className: 'card-title', text: `Reserva #${rv.id}` });
        const subt = h('div', { className: 'text-muted mb-2', text: `Mesas: ${(rv.mesas||[]).join(', ') || '—'}` });
        const horario = h('div', { className: 'mb-2', text: `${fmtHora(rv.inicio)} - ${fmtHora(rv.fin)}` });
        const cliente = h('div', { className: 'mb-3', text: rv.cliente ? `Cliente: ${rv.cliente}` : 'Cliente: —' });
        
        // Badge de estado cocina
        const st = (rv.cocina_status || 'PENDIENTE').toUpperCase();
        const color = st === 'LISTO' ? 'success' : (st === 'PREPARANDO' ? 'info' : 'warning');
        const badgeSt = h('span', { className: `badge text-bg-${color} mb-2 me-2`, text: `Cocina: ${st}` });

        // Lista de menú solicitado (agregado de factura principal + extras hija)
        const menuTitle = h('h6', { className: 'mt-2', text: 'Pedido (menú):' });
        const ul = h('ul', { className: 'mb-3' });
        ul.appendChild(h('li', { className: 'text-muted', text: 'Cargando…' }));
        // Cargar menú consolidado por reserva (factura principal + extras)
        cargarMenuReserva(rv.id, ul).catch(()=>{
          ul.textContent = '';
          ul.appendChild(h('li', { className: 'text-muted', text: 'Sin items registrados.' }));
        });
        const actions = h('div', { className: 'd-flex gap-2 align-items-center' });
        const btnDone = h('button', { className: 'btn btn-sm btn-outline-success', text: 'Terminado' });
        const btnPrep = h('button', { className: 'btn btn-sm btn-outline-primary', text: 'Preparando' });
        if (st === 'LISTO') { btnDone.disabled = true; card.classList.add('border-success','opacity-75'); }
        btnPrep.addEventListener('click', async () => {
          btnPrep.disabled = true;
          try {
            const resp = await fetch(`/api/reservas/${rv.id}/kitchen`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'PREPARANDO' }) });
            if (resp.ok) {
              badgeSt.className = 'badge text-bg-info mb-2 me-2';
              badgeSt.textContent = 'Cocina: PREPARANDO';
            }
          } finally {
            btnPrep.disabled = false;
          }
        });
        btnDone.addEventListener('click', async () => {
          btnDone.disabled = true;
          btnPrep.disabled = true;
          try {
            const resp = await fetch(`/api/reservas/${rv.id}/kitchen`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'LISTO' }) });
            if (resp.ok) {
              badgeSt.className = 'badge text-bg-success mb-2 me-2';
              badgeSt.textContent = 'Cocina: LISTO';
              card.classList.add('border-success','opacity-75');
              // Mover tarjeta al final
              setTimeout(() => { cont.appendChild(col); }, 50);
            }
          } catch (e) {
            console.error('Error marcando cocina LISTO', e);
          }
        });
        actions.appendChild(btnPrep);
        actions.appendChild(btnDone);

        body.appendChild(title);
        body.appendChild(subt);
        body.appendChild(badgeSt);
        body.appendChild(horario);
        body.appendChild(cliente);
        body.appendChild(menuTitle);
        body.appendChild(ul);
        body.appendChild(actions);
        card.appendChild(body);
        col.appendChild(card);
        cont.appendChild(col);
      });
    } catch (err) {
      const p = document.createElement('p');
      p.className = 'text-danger';
      p.textContent = 'No se pudo cargar las reservas.';
      cont.appendChild(p);
      console.error('Reservas cocina error', err);
    }
  }

  function fmtHora(s) {
    if (!s) return '—';
    const d = new Date(s);
    if (isNaN(d)) return String(s);
    const pad = n => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  async function cargarMenuReserva(reservaId, ulEl){
    try {
      const r = await fetch(`/api/reservas/${reservaId}/menu`);
      const j = await r.json();
      const arr = Array.isArray(j) ? j : (Array.isArray(j.items) ? j.items : []);
      ulEl.textContent = '';
      if (!arr.length) {
        ulEl.appendChild(h('li', { className: 'text-muted', text: 'Sin items registrados.' }));
        return;
      }
      arr.forEach(mi => {
        ulEl.appendChild(h('li', { text: `${mi.nombre} x${mi.cantidad}` }));
      });
    } catch (e) {
      ulEl.textContent = '';
      ulEl.appendChild(h('li', { className: 'text-muted', text: 'Sin items registrados.' }));
    }
  }
}