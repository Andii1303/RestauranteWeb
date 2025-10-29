document.addEventListener('DOMContentLoaded', () => {
  const carritoContenido = document.getElementById('carrito-contenido');
  const vaciarBtn = document.getElementById('vaciar-carrito');
  const totalItemsEl = document.getElementById('total-items');
  const totalPrecioEl = document.getElementById('total-precio');
  const contComprando = document.getElementById('continuar-comprando');
  const pagarBtn = document.getElementById('pagar-carrito');
  const cancelarBtn = document.getElementById('cancelar-reserva');
  const tpl = document.getElementById('tpl-carrito-item');

  let carrito = { items: {} };

  contComprando.addEventListener('click', () => { window.location.href = '/cliente/menu.html'; });
  pagarBtn.addEventListener('click', () => { window.location.href = '/payments/pagar.html'; });
  cancelarBtn.addEventListener('click', async () => {
    const proceed = window.confirm('¿Cancelar la reserva actual y eliminar la factura?');
    if (!proceed) return;
    const fid = localStorage.getItem('facturaId');
    try {
      if (fid) {
        const resp = await fetch(`/api/facturas/${encodeURIComponent(fid)}`, { method: 'DELETE' });
        if (!resp.ok) {
          // Si no se puede borrar (p.ej. ya pagada), intentar marcar CANCELADA como fallback
          if (resp.status === 409) {
            try {
              await fetch('/api/facturas/checkout', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ factura_id: Number(fid), status: 'CANCELADA' })
              });
            } catch {}
          } else {
            console.warn('No se pudo eliminar la factura, status=', resp.status);
          }
        }
      }
    } catch (err) {
      console.error('Error cancelando factura', err);
    } finally {
      // Limpiar estado local y UI
      try { localStorage.removeItem('facturaId'); } catch {}
      try { localStorage.removeItem('carritoV2'); } catch {}
      try { localStorage.removeItem('cartCount'); } catch {}
      carrito = { items: {} };
      renderCarrito();
      CartLib.updateBadge();
      // Ir al flujo de reservas para iniciar otra
      window.location.href = '/reserve/reserve.html';
    }
  });

  function fmtQ(n){ return Number(n||0).toFixed(2); }

  function renderCarrito() {
    carritoContenido.textContent = '';
    const entries = Object.entries(carrito.items || {});
    if (entries.length === 0) {
      const p = document.createElement('p');
      p.className = 'text-center';
      p.textContent = 'Tu carrito está vacío.';
      carritoContenido.appendChild(p);
      totalItemsEl.textContent = '0';
      totalPrecioEl.textContent = 'Q0.00';
      return;
    }

    entries.forEach(([key, producto]) => {
      const node = tpl.content.cloneNode(true);
      const title = node.querySelector('[data-el="title"]');
      const decr = node.querySelector('[data-el="decr"]');
      const incr = node.querySelector('[data-el="incr"]');
      const qty = node.querySelector('[data-el="qty"]');
      const price = node.querySelector('[data-el="price"]');
      const subtotal = node.querySelector('[data-el="subtotal"]');
      const remove = node.querySelector('[data-el="remove"]');

      title.textContent = producto.nombre;
      qty.textContent = String(producto.qty);
      price.textContent = fmtQ(producto.price);
      subtotal.textContent = fmtQ(Number(producto.price||0) * Number(producto.qty||0));

      incr.addEventListener('click', async () => {
        if (!carrito.items[key]) return;
        carrito.items[key].qty += 1;
        await CartLib.sync(localStorage.getItem('facturaId'), carrito);
        renderCarrito();
        CartLib.updateBadge();
      });

      decr.addEventListener('click', async () => {
        if (!carrito.items[key]) return;
        carrito.items[key].qty -= 1;
        if (carrito.items[key].qty <= 0) delete carrito.items[key];
        await CartLib.sync(localStorage.getItem('facturaId'), carrito);
        renderCarrito();
        CartLib.updateBadge();
      });

      remove.addEventListener('click', async () => {
        delete carrito.items[key];
        await CartLib.sync(localStorage.getItem('facturaId'), carrito);
        renderCarrito();
        CartLib.updateBadge();
      });

      carritoContenido.appendChild(node);
    });

    totalItemsEl.textContent = String(CartLib.count(carrito));
    totalPrecioEl.textContent = 'Q' + CartLib.total(carrito).toFixed(2);
  }

  vaciarBtn.addEventListener('click', async () => {
    const fid = localStorage.getItem('facturaId');
    carrito = await CartLib.clear(fid);
    renderCarrito();
    CartLib.updateBadge();
  });

  (async () => {
    const fid = localStorage.getItem('facturaId');
    carrito = await CartLib.hydrate(fid);
    renderCarrito();
    CartLib.updateBadge();
  })();
});