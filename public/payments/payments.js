function fmtQ(v){ return 'Q' + Number(v||0).toFixed(2); }
function getCart(){ try{ return JSON.parse(localStorage.getItem('carritoV2')||'{}') || {items:{}} }catch{return {items:{}}} }

function renderSummary(){
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

document.addEventListener('DOMContentLoaded', () => {
  renderSummary();
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

    // Preparar payload
    const facturaId = localStorage.getItem('facturaId');
    const raw = localStorage.getItem('carritoV2');
    let cart = raw ? JSON.parse(raw) : { items: {} };
    const itemsArr = [];
    // Siempre enviamos items para que el backend reemplace y no quede basura
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

    const payload = {
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