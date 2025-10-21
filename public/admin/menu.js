function toast(msg) { alert(msg); }

async function listarPlatos() {
  try {
    const res = await fetch('/api/admin/menu-items', { credentials: 'include' });
    if (res.status === 401 || res.status === 403) {
      window.location.href = '/login/login.html';
      return;
    }
    if (!res.ok) throw new Error('No autorizado o error de servidor');
    const data = await res.json();
    renderTablaPlatos(data);
  } catch (err) {
    console.error(err);
    toast('No se pudieron cargar los ítems de menú');
  }
}

function renderTablaPlatos(items) {
  const tbody = document.getElementById('tablaPlatos');
  tbody.innerHTML = '';
  items.forEach(it => {
    const fila = document.createElement('tr');
    fila.innerHTML = `
      <td>${it.id}</td>
      <td>${it.name}</td>
      <td>${it.description ?? ''}</td>
      <td>Q${Number(it.price).toFixed(2)}</td>
      <td>${it.photo_url ? `<img src="${it.photo_url}" alt="Foto" style="width:60px;height:40px;object-fit:cover;">` : ''}</td>
      <td>${it.active ? 1 : 0}</td>
      <td>
        <button class="btn btn-sm btn-primary me-2" data-action="edit" data-id="${it.id}">Editar</button>
        ${it.active ? `<button class="btn btn-sm btn-danger" data-action="del" data-id="${it.id}">Desactivar</button>` : `<button class="btn btn-sm btn-success" data-action="activar" data-id="${it.id}">Activar</button>`}
      </td>
    `;
    tbody.appendChild(fila);
  });

  tbody.onclick = async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const id = btn.getAttribute('data-id');
    const action = btn.getAttribute('data-action');
    if (action === 'edit') await cargarPlatoEnFormulario(Number(id));
    if (action === 'del') {
      if (confirm('¿Desactivar este ítem?')) await eliminarPlato(Number(id));
    }
    if (action === 'activar') {
      if (confirm('¿Activar este ítem?')) await activarPlato(Number(id));
    }
  };
async function activarPlato(id) {
  try {
    const res = await fetch(`/api/menu-items/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ active: 1 })
    });
    if (!res.ok) throw new Error('Error al activar');
    toast('Ítem activado');
    await listarPlatos();
  } catch (err) {
    console.error(err);
    toast('No se pudo activar');
  }
}
}

async function cargarPlatoEnFormulario(id) {
  // reutilizamos listado
  const res = await fetch('/api/admin/menu-items', { credentials: 'include' });
  const data = await res.json();
  const it = data.find(x => x.id === id);
  if (!it) return toast('Ítem no encontrado');
  document.getElementById('platoId').value = it.id;
  document.getElementById('platoNombre').value = it.name;
  document.getElementById('platoDescripcion').value = it.description ?? '';
  document.getElementById('platoPrecio').value = it.price;
  document.getElementById('platoFotografia').value = it.photo_url ?? '';
  // Cargar receta inline de este plato
  try {
    const r = await fetch(`/api/menu-items/${id}/recipe`, { credentials: 'include' });
    if (r.ok) {
      const arr = await r.json();
      recetaInline = (arr || []).map(x => ({ ingredient_id: x.ingredient_id, qty: x.qty, name: x.name, unit_code: x.unit_code }));
      renderTablaRecetaInline();
    } else {
      recetaInline = [];
      renderTablaRecetaInline();
    }
  } catch {}
}

async function guardarPlato(evt) {
  evt.preventDefault();
  const id = document.getElementById('platoId').value;
  const name = document.getElementById('platoNombre').value.trim();
  const description = document.getElementById('platoDescripcion').value.trim();
  const price = Number(document.getElementById('platoPrecio').value || 0);
  const photo_url = document.getElementById('platoFotografia').value.trim() || null;
  if (!name) return toast('Nombre requerido');
  const payload = { type: 'PLATO', name, description, price, photo_url };
  try {
    let res;
    if (id) {
      res = await fetch(`/api/menu-items/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(payload)
      });
    } else {
      res = await fetch('/api/menu-items', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(payload)
      });
    }
    if (res.status === 401 || res.status === 403) { window.location.href = '/login/login.html'; return; }
    if (!res.ok) throw new Error('Error al guardar');
    // Guardar receta inline
    let menuId = id ? Number(id) : null;
    if (!menuId) {
      const created = await res.json();
      menuId = created?.id;
    }
    if (menuId != null) {
      const r = await fetch(`/api/menu-items/${menuId}/recipe`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', 
        body: JSON.stringify({ ingredients: recetaInline.map(x => ({ ingredient_id: x.ingredient_id, qty: x.qty })) })
      });
      if (!r.ok) { toast('Plato guardado, pero no se pudo guardar la receta'); }
    }
    toast('Plato guardado');
    (evt.target || document.getElementById('formPlato')).reset();
    document.getElementById('platoId').value = '';
    recetaInline = [];
    renderTablaRecetaInline();
    await listarPlatos();
  } catch (err) {
    console.error(err);
    toast('No se pudo guardar');
  }
}

async function eliminarPlato(id) {
  try {
    const res = await fetch(`/api/menu-items/${id}`, { method: 'DELETE', credentials: 'include' });
    if (!res.ok) throw new Error('Error al eliminar');
    toast('Ítem desactivado');
    await listarPlatos();
  } catch (err) {
    console.error(err);
    toast('No se pudo eliminar');
  }
}

document.getElementById('formPlato')?.addEventListener('submit', guardarPlato);

(async function initMenu() {
  await listarPlatos();
  await cargarIngredientesCatalogo();
  bindRecetaInline();
})();

// ===== Receta =====
let recetaActual = [];
let ingredientesCatalogo = [];
let recetaInline = [];

async function cargarIngredientesCatalogo() {
  try {
    const res = await fetch('/api/ingredients', { credentials: 'include' });
    if (res.status === 401 || res.status === 403) { window.location.href = '/login/login.html'; return []; }
    if (!res.ok) { toast('No se pudieron cargar ingredientes'); return []; }
    const data = await res.json();
    ingredientesCatalogo = data;
    const selInline = document.getElementById('recetaIngredienteInline');
    if (selInline) selInline.innerHTML = ['<option value="">-- Selecciona --</option>'].concat(
      data.map(i => `<option value="${i.id}">${i.name} (${i.unit_code})</option>`)
    ).join('');
    return data;
  } catch (err) {
    console.error(err);
    toast('Error al cargar ingredientes');
    return [];
  }
}

async function abrirModalReceta(menuId, menuName) {
// Modal de receta removido: ahora se usa la receta inline del formulario
}

// ==== Receta Inline (en el formulario) ====
function bindRecetaInline() {
  const btn = document.getElementById('agregarIngredienteRecetaInline');
  if (!btn) return;
  btn.onclick = (e) => {
    e.preventDefault();
    const ingId = Number(document.getElementById('recetaIngredienteInline').value);
    const qty = Number(document.getElementById('recetaCantidadInline').value);
    if (!ingId || !(qty > 0)) { toast('Selecciona ingrediente y cantidad > 0'); return; }
    const cat = ingredientesCatalogo.find(i => i.id === ingId);
    const i = recetaInline.findIndex(r => r.ingredient_id === ingId);
    if (i >= 0) recetaInline[i].qty = qty; else recetaInline.push({ ingredient_id: ingId, qty, unit_code: cat?.unit_code, name: cat?.name });
    renderTablaRecetaInline();
  };
}

function renderTablaRecetaInline() {
  const tbody = document.getElementById('tablaRecetaInline');
  if (!tbody) return;
  tbody.innerHTML = '';
  recetaInline.forEach((r, idx) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${r.name ?? ''}</td>
      <td>${r.qty}</td>
      <td>${r.unit_code ?? ''}</td>
      <td><button class="btn btn-sm btn-outline-danger" data-index="${idx}">Quitar</button></td>
    `;
    tbody.appendChild(row);
  });
  tbody.onclick = (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const idx = Number(btn.getAttribute('data-index'));
    recetaInline.splice(idx, 1);
    renderTablaRecetaInline();
  };
}

function renderTablaReceta(items) {
  const tbody = document.getElementById('tablaReceta');
  tbody.innerHTML = '';
  items.forEach((r, idx) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${r.name ?? ''}</td>
      <td>${r.qty}</td>
      <td>${r.unit_code ?? ''}</td>
      <td><button class="btn btn-sm btn-outline-danger" data-index="${idx}">Quitar</button></td>
    `;
    tbody.appendChild(row);
  });
  tbody.onclick = (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const idx = Number(btn.getAttribute('data-index'));
    recetaActual.splice(idx, 1);
    renderTablaReceta(recetaActual);
  };
}

