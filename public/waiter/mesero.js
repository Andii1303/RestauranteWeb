// Estado local simple (para secciones no críticas)
let ordenes = JSON.parse(localStorage.getItem('ordenes')) || [];
let mesasLocal = JSON.parse(localStorage.getItem('mesas')) || Array.from({ length: 10 }, (_, i) => ({
  id: i + 1,
  estado: 'Libre',
  nombre: '',
  apellido: '',
  hora: '',
  alimentos: []
}));

function guardarMesas() { localStorage.setItem('mesas', JSON.stringify(mesasLocal)); }

// Helper DOM
function h(tag, { className, text, attrs } = {}, children = []) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  if (attrs) Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)));
  (Array.isArray(children) ? children : [children]).forEach(ch => { if (ch) el.appendChild(ch); });
  return el;
}

// Menú (se carga bajo demanda al agregar a factura)
let MENU_CACHE = [];
async function ensureMenuCache() {
  if (MENU_CACHE.length) return MENU_CACHE;
  try {
    const r = await fetch('/api/menu-items');
    MENU_CACHE = await r.json();
  } catch { MENU_CACHE = []; }
  return MENU_CACHE;
}
function findMenuById(id) {
  const nid = Number(id);
  return (MENU_CACHE || []).find(it => Number(it.id) === nid);
}

// Utilidades de tiempo para reservas
function pad2(n) { return String(n).padStart(2, '0'); }
function dtParts(iso) {
  if (!iso) return { date: '—', time: '—' };
  let d = new Date(iso);
  if (iso.endsWith('Z') || /[+-]\d\d:\d\d$/.test(iso)) d = new Date(d.getTime() + d.getTimezoneOffset() * 60000);
  if (Number.isNaN(d.getTime())) return { date: '—', time: '—' };
  return { date: `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`, time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}` };
}
function computeEstado(inicioIso, finIso) {
  function toLocal(dtStr) {
    if (!dtStr) return null;
    let d = new Date(dtStr);
    if (dtStr.endsWith('Z') || /[+-]\d\d:\d\d$/.test(dtStr)) d = new Date(d.getTime() + d.getTimezoneOffset() * 60000);
    return d;
  }
  const now = new Date();
  const i = toLocal(inicioIso); const f = toLocal(finIso);
  if (!i || !f || Number.isNaN(i.getTime()) || Number.isNaN(f.getTime())) return { label: 'Reservado', badge: 'bg-secondary' };
  if (now < i) return { label: 'Reservado', badge: 'bg-warning text-dark' };
  if (now >= i && now <= f) return { label: 'Ocupado', badge: 'bg-success' };
  return { label: 'Finalizado', badge: 'bg-secondary' };
}
function slots() { const a = []; for (let h = 0; h <= 23; h++) for (let m of [0, 30]) a.push(pad2(h) + ':' + pad2(m)); return a; }

// Navegación de secciones
window.mostrarSeccion = function (id) {
  document.querySelectorAll('.seccion').forEach(sec => sec.classList.add('d-none'));
  document.getElementById(id)?.classList.remove('d-none');
  if (id === 'reserva') cargarReservas();
  if (id === 'ver') renderizarVistaMesas();
  if (id === 'ordenes') renderizarOrdenes();
};

// Vista Mesas (desde API)
async function renderizarVistaMesas() {
  const cont = document.getElementById('vista-mesas'); if (!cont) return;
  cont.textContent = '';
  try {
    const r = await fetch('/api/mesas');
    const j = await r.json();
    if (!j?.ok || !Array.isArray(j.items)) throw new Error('sin datos');
    if (!j.items.length) { cont.textContent = 'No hay mesas registradas.'; return; }
    j.items.forEach(mesa => {
      const col = h('div', { className: 'col-md-3 mb-3' });
      const card = h('div', { className: 'card' + (mesa.activa ? ' border-success' : ' border-danger') });
      const body = h('div', { className: 'card-body text-center' });
      body.appendChild(h('h5', { className: 'card-title', text: mesa.nombre || `Mesa ${mesa.id}` }));
      body.appendChild(h('p', { className: 'card-text', text: `Capacidad: ${mesa.capacidad}` }));
      const estado = mesa.activa ? 'Libre' : 'Ocupada';
      const badgeClass = mesa.activa ? 'bg-success' : 'bg-danger';
      body.appendChild(h('span', { className: `badge ${badgeClass} mb-2`, text: estado }));
      card.appendChild(body); col.appendChild(card); cont.appendChild(col);
    });
  } catch {
    cont.textContent = 'No se pudieron cargar las mesas.';
  }
}

// Vista Órdenes (simple desde localStorage)
function renderizarOrdenes() {
  const cont = document.getElementById('contenedor-ordenes'); if (!cont) return;
  cont.textContent = '';
  (ordenes || []).forEach(orden => {
    const col = h('div', { className: 'col-md-6 mb-3' });
    const card = h('div', { className: 'card border-secondary' });
    const body = h('div', { className: 'card-body' });
    body.appendChild(h('h5', { className: 'card-title', text: `Orden #${orden.id}` }));
    body.appendChild(h('p', { className: 'card-text', text: `Mesa: ${orden.mesa}` }));
    body.appendChild(h('p', { className: 'card-text', text: `Cliente: ${orden.cliente}` }));
    body.appendChild(h('p', { className: 'card-text', text: 'Alimentos:' }));
    const ul = h('ul', { className: 'list-group' });
    (orden.alimentos || []).forEach(item => ul.appendChild(h('li', { className: 'list-group-item', text: item })));
    body.appendChild(ul); card.appendChild(body); col.appendChild(card); cont.appendChild(col);
  });
}

// Sección Reservas
function setUpFiltros() {
  const f = document.getElementById('w-fecha');
  const i = document.getElementById('w-inicio');
  const fn = document.getElementById('w-fin');
  if (!f || !i || !fn) return;
  const today = new Date();
  const y = today.getFullYear(), m = pad2(today.getMonth() + 1), d = pad2(today.getDate());
  f.value = `${y}-${m}-${d}`;
  const s = slots();
  i.innerHTML = s.map(x => `<option>${x}</option>`).join('');
  fn.innerHTML = s.map(x => `<option>${x}</option>`).join('');
  i.value = '08:00'; fn.value = '23:00';
}

async function cargarReservas() { setUpFiltros(); await fetchReservas(); }

async function fetchReservas() {
  const cont = document.getElementById('w-reservas'); if (!cont) return;
  const fecha = document.getElementById('w-fecha')?.value;
  const inicio = document.getElementById('w-inicio')?.value;
  const fin = document.getElementById('w-fin')?.value;
  cont.textContent = '';
  if (!fecha || !inicio || !fin || inicio >= fin) return;
  try {
    const ts = Date.now();
    const url = `/api/reservas/for-day?fecha=${encodeURIComponent(fecha)}&inicio=${encodeURIComponent(inicio)}&fin=${encodeURIComponent(fin)}&_t=${ts}`;
    const r = await fetch(url, { credentials: 'include', cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
    const j = await r.json();
    (j.items || []).forEach(it => {
      const col = h('div', { className: 'col-md-4' });
      const card = h('div', { className: 'card shadow-sm w-card' });
      const body = h('div', { className: 'card-body' });
      body.appendChild(h('h6', { className: 'card-title', text: `Reserva #${it.id}` }));
      body.appendChild(h('p', { className: 'card-text', text: `Cliente: ${it.cliente || '—'}` }));
      body.appendChild(h('p', { className: 'card-text', text: `Mesas: ${it.mesas.join(', ') || '—'}` }));
      const { date: dateIn, time: timeIn } = dtParts(it.inicio);
      const { time: timeOut } = dtParts(it.fin);
      const { label: occLabel, badge: occBadge } = computeEstado(it.inicio, it.fin);
      const pFecha = h('p', { className: 'card-text mb-1' }); pFecha.appendChild(document.createTextNode(`Fecha: ${dateIn}`)); body.appendChild(pFecha);
      body.appendChild(h('p', { className: 'card-text mb-1', text: `Check-in: ${timeIn}` }));
      body.appendChild(h('p', { className: 'card-text mb-2', text: `Check-out: ${timeOut}` }));
      const pEstado = h('p', { className: 'card-text' }); const badge = h('span', { className: `badge ${occBadge}`, text: occLabel });
      pEstado.appendChild(document.createTextNode('Estado: ')); pEstado.appendChild(badge); body.appendChild(pEstado);
      const actions = h('div', { className: 'd-flex gap-2 mt-2' });
      const isFinalizado = String(occLabel).toUpperCase() === 'FINALIZADO';
      const btnMenu = h('button', { className: 'btn btn-sm btn-outline-success', text: 'Agregar menú' });
      if (isFinalizado) { btnMenu.disabled = true; btnMenu.className = 'btn btn-sm btn-outline-secondary'; btnMenu.title = 'No disponible: la reserva ya finalizó'; }
      btnMenu.addEventListener('click', async () => {
        try {
          let facturaId = it.factura_id;
          if (!facturaId) {
            const qs = new URLSearchParams({ inicio: it.inicio || '', fin: it.fin || '', mesas: (it.mesas || []).join(',') });
            const rf = await fetch(`/api/reservas/${it.id}/factura?${qs.toString()}`);
            const jrRf = await rf.json();
            if (!jrRf?.ok || !jrRf?.factura_id) return alert('No se pudo resolver la factura de la reserva');
            facturaId = jrRf.factura_id; it.factura_id = facturaId;
          }
          const items = await ensureMenuCache();
          if (!Array.isArray(items) || items.length === 0) return alert('No hay items de menú activos');
          const preview = items.slice(0, 8).map(x => `#${x.id} ${x.name} - S/ ${x.price}`).join('\n');
          alert('Opciones (primeros):\n' + preview + (items.length > 8 ? '\n…' : ''));
          const idStr = prompt('ID del menú a agregar:'); if (idStr == null) return;
          const itSel = findMenuById(idStr); if (!itSel) return alert('ID inválido');
          const qtyStr = prompt(`Cantidad para \"${itSel.name}\" (precio S/ ${itSel.price})`, '1'); if (qtyStr == null) return;
          const cantidad = Math.max(1, Number(qtyStr) | 0);
          // Marcar como extra en el payload
          const payload = { menu_item_id: itSel.id, nombre: itSel.name, cantidad, precio_unit: Number(itSel.price) || 0, item_type: itSel.type || 'PLATO', extra: true };
          const r = await fetch(`/api/facturas/${facturaId}/detalles`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
          const jr = await r.json(); if (!jr?.ok && jr?.total == null) return alert(jr?.message || 'No se pudo agregar item');
          alert('Ítem agregado a la factura. Ahora serás dirigido al pago de extras.');
          // Redirigir a la pantalla de pago con el mismo factura_id y extra=1
          window.location.href = `/public/payments/pagar.html?factura_id=${encodeURIComponent(facturaId)}&extra=1`;
        } catch { alert('Error al agregar ítem'); }
      });
      actions.appendChild(btnMenu); body.appendChild(actions);
      card.appendChild(body); col.appendChild(card); cont.appendChild(col);
    });
  } catch {
    const warn = document.createElement('div'); warn.className = 'alert alert-warning'; warn.textContent = 'No se pudieron cargar reservas'; cont.appendChild(warn);
  }
}

// Inicio y eventos
document.addEventListener('DOMContentLoaded', () => {
  // Mostrar automáticamente reservas al entrar
  if (typeof window.mostrarSeccion === 'function') window.mostrarSeccion('reserva'); else setTimeout(() => window.mostrarSeccion?.('reserva'), 100);
  // Wire botón Filtrar
  document.getElementById('w-filtrar')?.addEventListener('click', fetchReservas);
  // Logout
  const btnLogout = document.getElementById('btnCerrarSesion');
  if (btnLogout) {
    btnLogout.addEventListener('click', async () => { try { await fetch('/auth/logout', { method: 'POST', credentials: 'include' }); } catch {} window.location.href = '/login/login.html'; });
  }
});
