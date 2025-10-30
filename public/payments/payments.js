
function fmtQ(v){ return 'Q' + Number(v||0).toFixed(2); }

// Utilidad para leer query params
function getQueryParam(name) {
  const url = new URL(window.location.href);
  return url.searchParams.get(name);
}

// Estado global para modo factura
let FACTURA_MODE = false;
let FACTURA_ID = null;
let FACTURA_ITEMS = [];

async function fetchFacturaDetalles(facturaId, opts = {}) {
  try {
    const unpaidOnly = opts.unpaidOnly ? '1' : '0';
    const r = await fetch(`/api/facturas/${facturaId}/detalles${opts && opts.unpaidOnly ? `?unpaidOnly=${unpaidOnly}` : ''}`);
    if (!r.ok) throw new Error('No se pudo obtener detalles de la factura');
    const j = await r.json();
    if (!j.ok) throw new Error(j.message || 'Error en detalles de factura');
    return j;
  } catch (e) {
    alert('Error cargando detalles de factura: ' + e.message);
    return { items: [], total: 0 };
  }
}

function renderSummaryFactura(items, total) {
  const container = document.getElementById('order-summary');
  container.textContent = '';
  (items || []).forEach(it => {
    const row = document.createElement('div');
    row.className = 'd-flex justify-content-between mb-2';
    const left = document.createElement('div');
    left.textContent = it.nombre + ' ';
    const small = document.createElement('small');
    small.className = 'text-muted';
    small.textContent = 'x' + it.cantidad;
    left.appendChild(small);
    const right = document.createElement('div');
    right.textContent = fmtQ(it.cantidad * it.precio_unit);
    row.appendChild(left);
    row.appendChild(right);
    container.appendChild(row);
  });
  document.getElementById('order-total').textContent = fmtQ(total);
}

function getCart(){ try{ return JSON.parse(localStorage.getItem('carritoV2')||'{}') || {items:{}} }catch{return {items:{}}} }

function renderSummary(){
  if (FACTURA_MODE) {
    renderSummaryFactura(FACTURA_ITEMS, FACTURA_ITEMS.reduce((acc, it) => acc + (Number(it.cantidad||0) * Number(it.precio_unit||0)), 0));
    return;
  }
  const cart = getCart();
  const container = document.getElementById('order-summary');
  container.textContent = '';
  let total = 0; let items = 0;
  for(const k of Object.keys(cart.items||{})){
    const it = cart.items[k];
    const row = document.createElement('div');
    row.className = 'd-flex justify-content-between mb-2';
    const left = document.createElement('div');
    left.textContent = it.nombre + ' ';
    const small = document.createElement('small');
    small.className = 'text-muted';
    small.textContent = 'x' + it.qty;
    left.appendChild(small);
    const right = document.createElement('div');
    right.textContent = fmtQ(it.qty * it.price);
    row.appendChild(left);
    row.appendChild(right);
    container.appendChild(row);
    total += (Number(it.qty||0) * Number(it.price||0)); items += Number(it.qty||0);
  }
  document.getElementById('order-total').textContent = fmtQ(total);
}

document.addEventListener('DOMContentLoaded', async () => {
  // Detectar si venimos con factura_id (modo extra/mesero)
  const facturaIdParam = getQueryParam('factura_id');
  const isExtra = getQueryParam('extra') === '1';
  if (facturaIdParam) {
    FACTURA_MODE = true;
    FACTURA_ID = facturaIdParam;
    // Mostrar mensaje si es extra
    if (isExtra) {
      const resumen = document.getElementById('order-summary');
      const msg = document.createElement('div');
      msg.className = 'alert alert-info';
      msg.textContent = 'Estás pagando un extra añadido a la factura original.';
      resumen.parentElement.insertBefore(msg, resumen);
    }
    // Cargar detalles de la factura (si es extra, solo ítems no pagados)
    const detalles = await fetchFacturaDetalles(facturaIdParam, { unpaidOnly: !!isExtra });
    FACTURA_ITEMS = detalles.items || [];
    renderSummary();
  } else {
    renderSummary();
  }

  const metodo = document.getElementById('metodo-pago');
  metodo.addEventListener('change', () => {
    const cd = document.getElementById('card-details');
    if (metodo.value === 'tarjeta') { cd.classList.add('d-block'); cd.classList.remove('d-none'); }
    else { cd.classList.add('d-none'); cd.classList.remove('d-block'); }
  });

  document.getElementById('submit-payment').addEventListener('click', async (e) => {
    e.preventDefault();
    const name = document.getElementById('cliente-nombre').value.trim();
    if(!name){ alert('Ingrese nombre'); return; }

    let payload;
    if (FACTURA_MODE) {
      if (!FACTURA_ITEMS.length) { alert('No hay ítems pendientes por pagar en esta factura.'); return; }
      // Pago directo de factura existente
      payload = {
        factura_id: Number(FACTURA_ID),
        status: 'PAGADA',
        cliente: {
          nombre: name,
          dni: document.getElementById('cliente-dni').value.trim() || null,
          telefono: document.getElementById('cliente-telefono').value.trim() || null,
          email: document.getElementById('cliente-email').value.trim() || null,
        },
        items: FACTURA_ITEMS.map(it => ({
          menu_item_id: it.menu_item_id ?? null,
          nombre: it.nombre,
          cantidad: Number(it.cantidad||0),
          precio_unit: Number(it.precio_unit||0),
          item_type: it.item_type || 'PLATO'
        }))
      };
    } else {
      // Carrito normal
      const facturaId = localStorage.getItem('facturaId');
      const raw = localStorage.getItem('carritoV2');
      let cart = raw ? JSON.parse(raw) : { items: {} };
      const itemsArr = [];
      for (const k of Object.keys(cart.items||{})){
        const it = cart.items[k];
        itemsArr.push({
          menu_item_id: it.id ?? null,
          nombre: it.nombre,
          cantidad: Number(it.qty||0),
          precio_unit: Number(it.price||0),
          item_type: 'PLATO'
        });
      }
      payload = {
        factura_id: facturaId ? Number(facturaId) : undefined,
        status: 'PAGADA',
        cliente: {
          nombre: name,
          dni: document.getElementById('cliente-dni').value.trim() || null,
          telefono: document.getElementById('cliente-telefono').value.trim() || null,
          email: document.getElementById('cliente-email').value.trim() || null,
        },
        items: itemsArr
      };
    }

    try {
      const r = await fetch('/api/facturas/checkout', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)});
      if (!r.ok) throw new Error('Error al procesar el pago (HTTP '+r.status+')');
      // Limpieza
      localStorage.removeItem('carritoV2');
      localStorage.removeItem('cartCount');
      localStorage.removeItem('facturaId');
      localStorage.removeItem('mesasMixId');
      window.location.href = '/payments/pago-confirmacion.html';
    } catch (err) {
      alert('No se pudo completar el pago: '+ err.message);
    }
  });
});