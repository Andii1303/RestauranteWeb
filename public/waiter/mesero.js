//cambiar a BD
let ordenes = JSON.parse(localStorage.getItem('ordenes')) || [];

document.addEventListener('DOMContentLoaded', () => {
  // Helper para crear nodos sin usar innerHTML
  function h(tag, { className, text, attrs } = {}, children = []){
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    if (attrs) Object.entries(attrs).forEach(([k,v]) => el.setAttribute(k, String(v)));
    (Array.isArray(children) ? children : [children]).forEach(ch => { if (ch) el.appendChild(ch); });
    return el;
  }
  // Cargar mesas desde localStorage o inicializar
  let mesas = JSON.parse(localStorage.getItem('mesas')) || Array.from({ length: 15 }, (_, i) => ({
    id: i + 1,
    estado: 'Libre',
    nombre: '',
    apellido: '',
    hora: '',
    alimentos: []
  }));

  function guardarMesas() {
    localStorage.setItem('mesas', JSON.stringify(mesas));
  }

  // Seguridad al cambiar de pestaña
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      const confirmExit = confirm('¿Estás seguro que deseas salir de la vista mesero? Esto cerrará tu sesión.');
        if (confirmExit) {
          alert('Sesión cerrada. Redirigiendo al inicio...');
          window.location.href = '/login/login.html';
      }
    }
  });

  // Mostrar sección activa
  window.mostrarSeccion = function (id) {
    document.querySelectorAll('.seccion').forEach(sec => sec.classList.add('d-none'));
    document.getElementById(id).classList.remove('d-none');
    if (id === 'ver') renderizarVistaMesas();
    if (id === 'agregar') renderizarAlimentos();
    if (id === 'reserva') cargarReservas();
  };

  // Renderizar mesas ocupadas
  function renderizarMesas() {
    const contenedor = document.getElementById('contenedor-mesas');
    if (!contenedor) return;
    contenedor.textContent = '';

    mesas.filter(m => m.estado === 'Ocupada').forEach((mesa, index) => {
      const col = h('div', { className: 'col-md-4 mb-3' });
      const card = h('div', { className: 'card border-danger' });
      const body = h('div', { className: 'card-body' });
      body.appendChild(h('h5', { className: 'card-title', text: `Mesa ${mesa.id}` }));
      const pEstado = h('p', { className: 'card-text' });
      pEstado.appendChild(document.createTextNode('Estado: '));
      const strong = h('strong', { text: mesa.estado });
      pEstado.appendChild(strong);
      body.appendChild(pEstado);
      body.appendChild(h('p', { className: 'card-text', text: `Cliente: ${mesa.nombre} ${mesa.apellido}` }));
      body.appendChild(h('p', { className: 'card-text', text: `Hora: ${mesa.hora}` }));
      const btnEditar = h('button', { className: 'btn btn-sm btn-warning me-2', text: 'Editar' });
      btnEditar.addEventListener('click', () => window.editarMesa(index));
      const btnFinal = h('button', { className: 'btn btn-sm btn-success', text: 'Finalizado' });
      btnFinal.addEventListener('click', () => window.finalizarMesa(index));
      const btnOrden = h('button', { className: 'btn btn-sm btn-info me-2', text: 'Generar Orden' });
      btnOrden.addEventListener('click', () => window.generarOrden(index));
      body.appendChild(btnEditar);
      body.appendChild(btnFinal);
      body.appendChild(btnOrden);
      card.appendChild(body);
      col.appendChild(card);
      contenedor.appendChild(col);
    });

    actualizarOpcionesMesa();
    guardarMesas();
  }

  // Actualizar opciones del desplegable
  function actualizarOpcionesMesa() {
    const select = document.getElementById('mesa-select');
    if (!select) return;
    select.innerHTML = '';

    mesas.slice(0, 10).forEach(mesa => {
      const option = document.createElement('option');
      option.value = mesa.id;
      option.textContent = `Mesa ${mesa.id}`;
      option.disabled = mesa.estado === 'Ocupada';
      select.appendChild(option);
    });
  }

  // Asignar mesa
  const form = document.getElementById('form-mesa');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      const nombre = document.getElementById('nombre').value.trim();
      const apellido = document.getElementById('apellido').value.trim();
      const mesaId = parseInt(document.getElementById('mesa-select').value);
      const hora = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      const mesa = mesas.find(m => m.id === mesaId);
      if (mesa.estado === 'Libre' && nombre && apellido) {
        mesa.estado = 'Ocupada';
        mesa.nombre = nombre;
        mesa.apellido = apellido;
        mesa.hora = hora;
        renderizarMesas();
        form.reset();
      }
    });
  }

  // Editar cliente
  window.editarMesa = function (index) {
    const mesa = mesas[index];
    const nuevoNombre = prompt('Nuevo nombre:', mesa.nombre);
    const nuevoApellido = prompt('Nuevo apellido:', mesa.apellido);
    if (nuevoNombre && nuevoApellido) {
      mesa.nombre = nuevoNombre;
      mesa.apellido = nuevoApellido;
      mesa.hora = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      renderizarMesas();
    }
  };

  // Finalizar mesa
  window.finalizarMesa = function (index) {
    const mesa = mesas[index];
    mesa.estado = 'Libre';
    mesa.nombre = '';
    mesa.apellido = '';
    mesa.hora = '';
    mesa.alimentos = [];
    renderizarMesas();
  };

  // Vista general de mesas
  function renderizarVistaMesas() {
    const contenedor = document.getElementById('vista-mesas');
    if (!contenedor) return;
    contenedor.textContent = '';

    mesas.forEach(mesa => {
      const col = h('div', { className: 'col-md-3 mb-3' });
      const card = h('div', { className: `card ${mesa.estado === 'Ocupada' ? 'border-danger' : 'border-success'}` });
      const body = h('div', { className: 'card-body' });
      body.appendChild(h('h5', { className: 'card-title', text: `Mesa ${mesa.id}` }));
      const pEstado = h('p', { className: 'card-text' });
      pEstado.appendChild(document.createTextNode('Estado: '));
      pEstado.appendChild(h('strong', { text: mesa.estado }));
      body.appendChild(pEstado);
      if (mesa.estado === 'Ocupada') {
        body.appendChild(h('p', { className: 'card-text', text: `Cliente: ${mesa.nombre} ${mesa.apellido}` }));
        body.appendChild(h('p', { className: 'card-text', text: `Hora: ${mesa.hora}` }));
        body.appendChild(h('p', { className: 'card-text', text: `Alimentos: ${mesa.alimentos.join(', ') || 'Ninguno'}` }));
      }
      card.appendChild(body);
      col.appendChild(card);
      contenedor.appendChild(col);
    });
  }

  // Agregar alimentos por mesa
  function renderizarAlimentos() {
    const contenedor = document.getElementById('contenedor-alimentos');
    if (!contenedor) return;
    contenedor.textContent = '';

    mesas.filter(m => m.estado === 'Ocupada').forEach((mesa, index) => {
      const col = h('div', { className: 'col-md-6 mb-3' });
      const card = h('div', { className: 'card border-primary' });
      const body = h('div', { className: 'card-body' });
      body.appendChild(h('h5', { className: 'card-title', text: `Mesa ${mesa.id}` }));
      body.appendChild(h('p', { className: 'card-text', text: `Cliente: ${mesa.nombre} ${mesa.apellido}` }));
      const form = h('form', { className: 'd-flex mb-2' });
      const input = h('input', { attrs: { type: 'text', placeholder: 'Agregar alimento', required: 'required' }, className: 'form-control me-2' });
      const btn = h('button', { className: 'btn btn-sm btn-primary', text: 'Agregar', attrs: { type: 'submit' } });
      form.appendChild(input);
      form.appendChild(btn);
      form.addEventListener('submit', (e) => window.agregarAlimento(e, index));
      body.appendChild(form);
      const ul = h('ul', { className: 'list-group' });
      (mesa.alimentos || []).forEach(alimento => {
        ul.appendChild(h('li', { className: 'list-group-item', text: alimento }));
      });
      body.appendChild(ul);
      card.appendChild(body);
      col.appendChild(card);
      contenedor.appendChild(col);
    });
  }

  // Agregar alimento manualmente
  window.agregarAlimento = function (e, index) {
    e.preventDefault();
    const input = e.target.querySelector('input');
    const valor = input.value.trim();
    if (valor) {
      mesas[index].alimentos.push(valor);
      input.value = '';
      renderizarAlimentos();
      guardarMesas();
    }
  };

  // Inicializar
  renderizarMesas();

  // --- Reservas del día ---
  function slots() {
    const a=[]; for (let h=0; h<=23; h++){ for (let m of [0,30]) a.push(String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')); }
    return a;
  }
  function setUpFiltros() {
    const f = document.getElementById('w-fecha');
    const i = document.getElementById('w-inicio');
    const fn = document.getElementById('w-fin');
    if (!f || !i || !fn) return;
    const today = new Date();
    const y = today.getFullYear(), m = String(today.getMonth()+1).padStart(2,'0'), d=String(today.getDate()).padStart(2,'0');
    f.value = `${y}-${m}-${d}`;
    const s = slots();
    i.innerHTML = s.map(x=>`<option>${x}</option>`).join('');
    fn.innerHTML = s.map(x=>`<option>${x}</option>`).join('');
    i.value = '08:00'; fn.value = '23:00';
  }
  async function cargarReservas() {
    setUpFiltros();
    await fetchReservas();
  }
  async function fetchReservas(){
    const cont = document.getElementById('w-reservas'); if (!cont) return;
    const fecha = document.getElementById('w-fecha')?.value;
    const inicio = document.getElementById('w-inicio')?.value;
    const fin = document.getElementById('w-fin')?.value;
    cont.textContent='';
    if (!fecha || !inicio || !fin || inicio>=fin) return;
    try{
      const r = await fetch(`/api/reservas/for-day?fecha=${encodeURIComponent(fecha)}&inicio=${encodeURIComponent(inicio)}&fin=${encodeURIComponent(fin)}`, { credentials:'include' });
      const j = await r.json();
      (j.items||[]).forEach(it=>{
        const col = h('div',{className:'col-md-4'});
        const card = h('div',{className:'card shadow-sm w-card'});
        const body = h('div',{className:'card-body'});
        body.appendChild(h('h6',{className:'card-title', text:`Reserva #${it.id}`}));
        body.appendChild(h('p',{className:'card-text', text:`Cliente: ${it.cliente||'—'}`}));
        body.appendChild(h('p',{className:'card-text', text:`Mesas: ${it.mesas.join(', ')||'—'}`}));
        body.appendChild(h('p',{className:'card-text', text:`${(it.inicio||'').replace('T',' ')} a ${(it.fin||'').replace('T',' ')}`}));
        card.appendChild(body); col.appendChild(card); cont.appendChild(col);
      });
    }catch(e){
      const warn = document.createElement('div'); warn.className='alert alert-warning'; warn.textContent='No se pudieron cargar reservas'; cont.appendChild(warn);
    }
  }
  document.getElementById('w-filtrar')?.addEventListener('click', fetchReservas);
});

// Renderizar órdenes
window.generarOrden = function (index) {
  const mesa = mesas[index];
  if (mesa.estado === 'Ocupada' && mesa.alimentos.length > 0) {
    const nuevaOrden = {
      id: ordenes.length + 1,
      mesa: mesa.id,
      cliente: `${mesa.nombre} ${mesa.apellido}`,
      alimentos: [...mesa.alimentos]
    };
    ordenes.push(nuevaOrden);
    localStorage.setItem('ordenes', JSON.stringify(ordenes));
    alert(`Orden #${nuevaOrden.id} generada para Mesa ${mesa.id}`);
    renderizarOrdenes();
  } else {
    alert('La mesa debe estar ocupada y tener alimentos para generar una orden.');
  }
};

function renderizarOrdenes() {
  const contenedor = document.getElementById('contenedor-ordenes');
  if (!contenedor) return;
  contenedor.textContent = '';

  ordenes.forEach(orden => {
    const col = h('div', { className: 'col-md-6 mb-3' });
    const card = h('div', { className: 'card border-secondary' });
    const body = h('div', { className: 'card-body' });
    body.appendChild(h('h5', { className: 'card-title', text: `Orden #${orden.id}` }));
    body.appendChild(h('p', { className: 'card-text', text: `Mesa: ${orden.mesa}` }));
    body.appendChild(h('p', { className: 'card-text', text: `Cliente: ${orden.cliente}` }));
    body.appendChild(h('p', { className: 'card-text', text: 'Alimentos:' }));
    const ul = h('ul', { className: 'list-group' });
    (orden.alimentos || []).forEach(item => ul.appendChild(h('li', { className: 'list-group-item', text: item })));
    body.appendChild(ul);
    card.appendChild(body);
    col.appendChild(card);
    contenedor.appendChild(col);
  });
}



// (Limpieza) Se removieron bloques comentados sin uso