document.addEventListener('DOMContentLoaded', () => {
  cargarOrdenes();
  initReservasUI();
});

// --- Función para cargar órdenes ---
function cargarOrdenes() {
  fetch('/api/ordenes')
    .then(res => res.json())
    .then(data => {
      const contenedor = document.getElementById('lista-ordenes');
      contenedor.textContent = '';

      const h = (tag, { className, text, attrs } = {}, children = []) => {
        const el = document.createElement(tag);
        if (className) el.className = className;
        if (text != null) el.textContent = text;
        if (attrs) Object.entries(attrs).forEach(([k,v]) => el.setAttribute(k, String(v)));
        (Array.isArray(children) ? children : [children]).forEach(ch => { if (ch) el.appendChild(ch); });
        return el;
      };

      data.forEach(orden => {
        const col = h('div', { className: 'col-md-6' });
        const card = h('div', { className: 'card border-primary' });
        const header = h('div', { className: 'card-header bg-primary text-white', text: (orden.tipo === 'mesa' ? `Mesa #${orden.numero}` : 'Pedido en línea') });
        const body = h('div', { className: 'card-body' });
        body.appendChild(h('h5', { className: 'card-title', text: 'Platillos:' }));
        const ul = h('ul');
        (orden.platillos || []).forEach(p => ul.appendChild(h('li', { text: p })));
        body.appendChild(ul);
        const label = h('label', { className: 'form-label mt-2', attrs: { for: `estado-${orden.id}` }, text: 'Estado:' });
        const select = h('select', { className: 'form-select estado-orden', attrs: { id: `estado-${orden.id}` } });
        select.dataset.id = String(orden.id);
        const opts = [
          { v: 'pendiente', t: 'Pendiente' },
          { v: 'preparando', t: 'Preparando' },
          { v: 'lista', t: 'Lista' }
        ];
        opts.forEach(o => {
          const opt = h('option', { text: o.t, attrs: { value: o.v } });
          if (orden.estado === o.v) opt.selected = true;
          select.appendChild(opt);
        });
        body.appendChild(label);
        body.appendChild(select);
        card.appendChild(header);
        card.appendChild(body);
        col.appendChild(card);
        contenedor.appendChild(col);
      });

      document.querySelectorAll('.estado-orden').forEach(select => {
        select.addEventListener('change', e => {
          const id = e.target.dataset.id;
          const estado = e.target.value;

          fetch(`/api/ordenes/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ estado })
          })
          .then(res => {
            if (res.ok) {
              console.log(`Orden ${id} actualizada a ${estado}`);
            } else {
              console.error(`Error al actualizar orden ${id}`);
            }
          });
        });
      });
    });
}


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
      const items = data?.items || [];
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

        // Lista de menú solicitado (agregado de factura principal + extras hija)
        const menuTitle = h('h6', { className: 'mt-2', text: 'Pedido (menú):' });
        const ul = h('ul', { className: 'mb-3' });
        const menu = Array.isArray(rv.menu) ? rv.menu : [];
        if (!menu.length) {
          ul.appendChild(h('li', { className: 'text-muted', text: 'Sin items registrados.' }));
        } else {
          menu.forEach(mi => {
            const linea = `${mi.nombre} x${mi.cantidad}`;
            ul.appendChild(h('li', { text: linea }));
          });
        }
        const actions = h('div', { className: 'd-flex gap-2 align-items-center' });
        const btn = h('button', { className: 'btn btn-sm btn-success', text: 'Marcar asistencia' });
        const badge = h('span', { className: 'badge text-bg-secondary d-none', text: 'Asistencia verificada' });
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          try {
            const resp = await fetch(`/api/reservas/${rv.id}/attendance`, {
              method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attended: true })
            });
            if (resp.ok) {
              badge.classList.remove('d-none');
              btn.classList.add('d-none');
            } else {
              console.warn('No se pudo marcar asistencia, HTTP', resp.status);
            }
          } catch (e) {
            console.error('Error marcando asistencia', e);
          } finally {
            btn.disabled = false;
          }
        });
        actions.appendChild(btn);
        actions.appendChild(badge);

        body.appendChild(title);
        body.appendChild(subt);
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
}