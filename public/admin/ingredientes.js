// Helpers de UI
function toast(msg, type = 'info') {
  alert(msg); // simple por ahora
}

let unidades = [];
let catalogoIngredientes = [];
let ingresos = [];

async function cargarUnidades() {
  try {
  const res = await fetch('/api/units', { credentials: 'include' });
  if (res.status === 401 || res.status === 403) { window.location.href = '/login/login.html'; return; }
  if (!res.ok) throw new Error('No se pudieron cargar unidades');
    unidades = await res.json();
    const sel = document.getElementById('unidad');
    sel.innerHTML = '<option value="">Seleccione una unidad…</option>' +
      unidades.map(u => `<option value="${u.id}">${u.name} (${u.code})</option>`).join('');
  } catch (err) {
    console.error(err);
    toast('Error cargando unidades', 'error');
  }
}

async function listarIngredientes() {
  try {
  const res = await fetch('/api/ingredients', { credentials: 'include' });
  if (res.status === 401 || res.status === 403) { window.location.href = '/login/login.html'; return; }
  if (!res.ok) throw new Error('Error al listar ingredientes');
    const data = await res.json();
    catalogoIngredientes = data.map(d => ({ id: d.id, name: d.name, unit_code: d.unit_code }));
    // cargar select del modal de ingresos
    const sel = document.getElementById('ingresoIngrediente');
    if (sel) sel.innerHTML = catalogoIngredientes.map(i => `<option value="${i.id}">${i.name} (${i.unit_code || ''})</option>`).join('');
    renderTablaIngredientes(data);
  } catch (err) {
    console.error(err);
    toast('No se pudo cargar ingredientes. Verifique su sesión.', 'error');
  }
}

function renderTablaIngredientes(ingredientes) {
  const tbody = document.getElementById('tablaIngredientes');
  tbody.innerHTML = '';
  ingredientes.forEach(ing => {
    const fila = document.createElement('tr');
    fila.innerHTML = `
      <td>${ing.id}</td>
      <td>${ing.name}</td>
      <td>${ing.unit_name} (${ing.unit_code})</td>
      <td>${ing.stock_qty}</td>
      <td>${ing.min_qty}</td>
      <td>${ing.active ? 'Sí' : 'No'}</td>
      <td>
        <button class="btn btn-sm btn-primary me-2" data-action="edit" data-id="${ing.id}">Editar</button>
        <button class="btn btn-sm btn-danger" data-action="del" data-id="${ing.id}">Eliminar</button>
      </td>
    `;
    tbody.appendChild(fila);
  });

  // Delegación de eventos
  tbody.onclick = async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const id = btn.getAttribute('data-id');
    const action = btn.getAttribute('data-action');
    if (action === 'edit') {
      await cargarIngredienteEnFormulario(Number(id));
    } else if (action === 'del') {
      if (confirm('¿Eliminar (desactivar) ingrediente?')) await eliminarIngrediente(Number(id));
    }
  };
}

async function cargarIngredienteEnFormulario(id) {
  try {
    // No hay endpoint individual; reutilizamos listado y buscamos
    const res = await fetch('/api/ingredients', { credentials: 'include' });
    const data = await res.json();
    const ing = data.find(x => x.id === id);
    if (!ing) return toast('Ingrediente no encontrado', 'warn');
    document.getElementById('ingredienteId').value = ing.id;
    document.getElementById('nombreIngrediente').value = ing.name;
    document.getElementById('unidad').value = ing.unit_id;
    document.getElementById('cantidad').value = ing.stock_qty;
    document.getElementById('minimo').value = ing.min_qty;
    mostrarSeccion('ingredientes');
  } catch (err) {
    console.error(err);
  }
}

async function guardarIngrediente(evt) {
  evt.preventDefault();
  const id = document.getElementById('ingredienteId').value;
  const name = document.getElementById('nombreIngrediente').value.trim();
  const unit_id = Number(document.getElementById('unidad').value);
  const stock_qty = Number(document.getElementById('cantidad').value || 0);
  const min_qty = Number(document.getElementById('minimo').value || 0);
  if (!name || !unit_id) return toast('Nombre y unidad son requeridos', 'warn');
  const payload = { name, unit_id, stock_qty, min_qty };
  try {
    let res;
    if (id) {
      res = await fetch(`/api/ingredients/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });
    } else {
      res = await fetch('/api/ingredients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });
    }
    if (res.status === 401 || res.status === 403) { window.location.href = '/login/login.html'; return; }
    if (!res.ok) throw new Error('Error al guardar');
    toast('Ingrediente guardado', 'success');
    (evt.target || document.getElementById('formIngrediente')).reset();
    document.getElementById('ingredienteId').value = '';
    await listarIngredientes();
  } catch (err) {
    console.error(err);
    toast('No se pudo guardar ingrediente', 'error');
  }
}

async function eliminarIngrediente(id) {
  try {
  const res = await fetch(`/api/ingredients/${id}`, { method: 'DELETE', credentials: 'include' });
  if (res.status === 401 || res.status === 403) { window.location.href = '/login/login.html'; return; }
    if (!res.ok) throw new Error('Error al eliminar');
    toast('Ingrediente eliminado', 'success');
    await listarIngredientes();
  } catch (err) {
    console.error(err);
    toast('No se pudo eliminar', 'error');
  }
}

// Eventos
document.getElementById('formIngrediente')?.addEventListener('submit', guardarIngrediente);

// Init al abrir sección (también al cargar)
(async function initIngredientes() {
  await cargarUnidades();
  await listarIngredientes();
})();



// ===== Ingresos (batch, sección aparte) =====
// Limpiar ingresos y tabla al cambiar de sección

// ===== Ingresos (batch, sección aparte, IDs únicos) =====
// Reaccionar al cambio de sección de forma explícita
window.addEventListener('seccion-mostrada', () => {
  const ingresoSec = document.getElementById('ingresoIngredientes');
  if (ingresoSec && ingresoSec.style.display !== 'none') {
    ingresos = [];
    renderTablaIngresos();
    const sel = document.getElementById('batch-ingresoIngrediente');
    if (sel) sel.innerHTML = catalogoIngredientes.map(i => `<option value="${i.id}">${i.name} (${i.unit_code || ''})</option>`).join('');
  }
});

document.getElementById('batch-agregarIngresoIngrediente')?.addEventListener('click', () => {
  const ingId = Number(document.getElementById('batch-ingresoIngrediente').value);
  const qty = Number(document.getElementById('batch-ingresoCantidad').value);
  if (!ingId || !(qty > 0)) return toast('Selecciona ingrediente y cantidad > 0');
  const cat = catalogoIngredientes.find(i => i.id === ingId);
  const idx = ingresos.findIndex(x => x.id === ingId);
  if (idx >= 0) ingresos[idx].qty += qty; else ingresos.push({ id: ingId, qty, name: cat?.name, unit_code: cat?.unit_code });
  renderTablaIngresos();
});

function renderTablaIngresos() {
  const tbody = document.getElementById('batch-tablaIngresos');
  if (!tbody) return;
  tbody.innerHTML = '';
  ingresos.forEach((r, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.name ?? ''}</td>
      <td>${r.qty}</td>
      <td>${r.unit_code ?? ''}</td>
      <td><button class="btn btn-sm btn-outline-danger" data-index="${idx}">Quitar</button></td>
    `;
    tbody.appendChild(tr);
  });
  tbody.onclick = (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const idx = Number(btn.getAttribute('data-index'));
    ingresos.splice(idx, 1);
    renderTablaIngresos();
  };
}

document.getElementById('batch-guardarIngresosBtn')?.addEventListener('click', async () => {
  if (!ingresos.length) return toast('No hay ingresos para guardar');
  try {
    const res = await fetch('/api/ingredients/ingress', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ items: ingresos.map(x => ({ id: x.id, qty: x.qty })) })
    });
    if (res.status === 401 || res.status === 403) { window.location.href = '/login/login.html'; return; }
    if (!res.ok) throw new Error('Error al guardar ingresos');
    toast('Ingresos guardados', 'success');
    ingresos = [];
    renderTablaIngresos();
    // Volver a la gestión de ingredientes
    mostrarSeccion('ingredientes');
    await listarIngredientes();
  } catch (err) {
    console.error(err);
    toast('No se pudieron guardar ingresos', 'error');
  }
});

