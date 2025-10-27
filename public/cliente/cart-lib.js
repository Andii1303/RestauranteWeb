// Cart library: unified logic for local and server-backed carts
// API contract:
// - If facturaId is present: server is source of truth; always sync to server and hydrate from it.
// - If no facturaId: use localStorage only.

const CartLib = (() => {
  function _readLocal() {
    try {
      const raw = localStorage.getItem('carritoV2') || localStorage.getItem('carrito');
      let cart = raw ? JSON.parse(raw) : null;
      if (Array.isArray(cart)) {
        const items = {};
        for (const it of cart) {
          const key = (it.id != null ? String(it.id) : it.nombre);
          if (!items[key]) items[key] = { id: it.id ?? null, nombre: it.nombre, qty: 0, price: it.price ?? 0 };
          items[key].qty += 1;
        }
        cart = { items };
        localStorage.setItem('carritoV2', JSON.stringify(cart));
        localStorage.removeItem('carrito');
      }
      if (!cart || !cart.items) cart = { items: {} };
      return cart;
    } catch {
      return { items: {} };
    }
  }

  function _saveLocal(cart) {
    localStorage.setItem('carritoV2', JSON.stringify(cart));
    localStorage.setItem('cartCount', String(count(cart)));
  }

  function count(cart) {
    return Object.values(cart.items || {}).reduce((a, it) => a + (Number(it.qty)||0), 0);
  }

  function total(cart) {
    return Object.values(cart.items || {}).reduce((a, it) => a + ((Number(it.qty)||0) * (Number(it.price)||0)), 0);
  }

  async function hydrate(facturaId) {
    if (!facturaId) return _readLocal();
    try {
      const r = await fetch(`/api/facturas/${encodeURIComponent(facturaId)}/detalles`);
      if (!r.ok) return _readLocal();
      const json = await r.json();
      const items = json.items || [];
      const cart = { items: {} };
      for (const it of items) {
        const key = it.menu_item_id != null ? String(it.menu_item_id) : it.nombre;
        if (!cart.items[key]) {
          cart.items[key] = {
            id: it.menu_item_id ?? null,
            nombre: it.nombre,
            qty: 0,
            price: Number(it.precio_unit || 0)
          };
        }
        // Acumular cantidad si existen múltiples filas del mismo item en BD
        cart.items[key].qty += Number(it.cantidad || 0);
        // Asegurar precio (por si viene 0 en alguna fila)
        if (!cart.items[key].price) cart.items[key].price = Number(it.precio_unit || 0);
      }
      _saveLocal(cart);
      return cart;
    } catch {
      return _readLocal();
    }
  }

  async function sync(facturaId, cart) {
    if (!facturaId) { _saveLocal(cart); return cart; }
    const itemsArr = Object.values(cart.items || {}).map(it => ({
      menu_item_id: it.id ?? null,
      nombre: it.nombre,
      cantidad: Number(it.qty||0),
      precio_unit: Number(it.price||0),
      item_type: 'PLATO'
    }));
    try {
      await fetch(`/api/facturas/${encodeURIComponent(facturaId)}/detalles/sync`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: itemsArr })
      });
    } finally {
      _saveLocal(cart);
    }
    return cart;
  }

  async function addItem(facturaId, item) {
    // item: { id, name, price, type }
    if (!facturaId) {
      const cart = _readLocal();
      const key = item.id != null ? String(item.id) : item.name;
      if (!cart.items[key]) cart.items[key] = { id: item.id ?? null, nombre: item.name, qty: 0, price: Number(item.price||0) };
      cart.items[key].qty += 1;
      _saveLocal(cart);
      return cart;
    }
    // Server-backed: add detail, then hydrate
    const payload = {
      menu_item_id: item.id ?? null,
      nombre: item.name || 'Item',
      cantidad: 1,
      precio_unit: Number(item.price || 0),
      item_type: item.type || 'PLATO'
    };
    const r = await fetch(`/api/facturas/${encodeURIComponent(facturaId)}/detalles`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    if (!r.ok) throw new Error('No se pudo agregar a la factura');
    return await hydrate(facturaId);
  }

  async function clear(facturaId) {
    if (facturaId) {
      try { await fetch(`/api/facturas/${encodeURIComponent(facturaId)}/detalles`, { method: 'DELETE' }); } catch {}
    }
    const empty = { items: {} };
    _saveLocal(empty);
    return empty;
  }

  function updateBadge() {
    const el = document.getElementById('cart-count');
    if (!el) return;
    const cart = _readLocal();
    el.textContent = count(cart);
  }

  return { hydrate, sync, addItem, clear, updateBadge, count, total };
})();
