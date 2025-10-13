//cambiar a BD
let ordenes = JSON.parse(localStorage.getItem('ordenes')) || [];

document.addEventListener('DOMContentLoaded', () => {
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
        window.location.href = '../views/login.html';
      }
    }
  });

  // Mostrar sección activa
  window.mostrarSeccion = function (id) {
    document.querySelectorAll('.seccion').forEach(sec => sec.classList.add('d-none'));
    document.getElementById(id).classList.remove('d-none');
    if (id === 'ver') renderizarVistaMesas();
    if (id === 'agregar') renderizarAlimentos();
  };

  // Renderizar mesas ocupadas
  function renderizarMesas() {
    const contenedor = document.getElementById('contenedor-mesas');
    if (!contenedor) return;
    contenedor.innerHTML = '';

    mesas.filter(m => m.estado === 'Ocupada').forEach((mesa, index) => {
      const card = document.createElement('div');
      card.className = 'col-md-4 mb-3';
      card.innerHTML = `
        <div class="card border-danger">
          <div class="card-body">
            <h5 class="card-title">Mesa ${mesa.id}</h5>
            <p class="card-text">Estado: <strong>${mesa.estado}</strong></p>
            <p class="card-text">Cliente: ${mesa.nombre} ${mesa.apellido}</p>
            <p class="card-text">Hora: ${mesa.hora}</p>
            <button class="btn btn-sm btn-warning me-2" onclick="editarMesa(${index})">Editar</button>
            <button class="btn btn-sm btn-success" onclick="finalizarMesa(${index})">Finalizado</button>
            <button class="btn btn-sm btn-info me-2" onclick="generarOrden(${index})">Generar Orden</button>
          </div>
        </div>
      `;
      contenedor.appendChild(card);
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
    contenedor.innerHTML = '';

    mesas.forEach(mesa => {
      const card = document.createElement('div');
      card.className = 'col-md-3 mb-3';
      card.innerHTML = `
        <div class="card ${mesa.estado === 'Ocupada' ? 'border-danger' : 'border-success'}">
          <div class="card-body">
            <h5 class="card-title">Mesa ${mesa.id}</h5>
            <p class="card-text">Estado: <strong>${mesa.estado}</strong></p>
            ${mesa.estado === 'Ocupada' ? `
              <p class="card-text">Cliente: ${mesa.nombre} ${mesa.apellido}</p>
              <p class="card-text">Hora: ${mesa.hora}</p>
              <p class="card-text">Alimentos: ${mesa.alimentos.join(', ') || 'Ninguno'}</p>
            ` : ''}
          </div>
        </div>
      `;
      contenedor.appendChild(card);
    });
  }

  // Agregar alimentos por mesa
  function renderizarAlimentos() {
    const contenedor = document.getElementById('contenedor-alimentos');
    if (!contenedor) return;
    contenedor.innerHTML = '';

    mesas.filter(m => m.estado === 'Ocupada').forEach((mesa, index) => {
      const card = document.createElement('div');
      card.className = 'col-md-6 mb-3';
      card.innerHTML = `
        <div class="card border-primary">
          <div class="card-body">
            <h5 class="card-title">Mesa ${mesa.id}</h5>
            <p class="card-text">Cliente: ${mesa.nombre} ${mesa.apellido}</p>
            <form onsubmit="agregarAlimento(event, ${index})" class="d-flex mb-2">
              <input type="text" class="form-control me-2" placeholder="Agregar alimento" required>
              <button type="submit" class="btn btn-sm btn-primary">Agregar</button>
            </form>
            <ul class="list-group">
              ${mesa.alimentos.map(alimento => `<li class="list-group-item">${alimento}</li>`).join('')}
            </ul>
          </div>
        </div>
      `;
      contenedor.appendChild(card);
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
  contenedor.innerHTML = '';

  ordenes.forEach(orden => {
    const card = document.createElement('div');
    card.className = 'col-md-6 mb-3';
    card.innerHTML = `
      <div class="card border-secondary">
        <div class="card-body">
          <h5 class="card-title">Orden #${orden.id}</h5>
          <p class="card-text">Mesa: ${orden.mesa}</p>
          <p class="card-text">Cliente: ${orden.cliente}</p>
          <p class="card-text">Alimentos:</p>
          <ul class="list-group">
            ${orden.alimentos.map(item => `<li class="list-group-item">${item}</li>`).join('')}
          </ul>
        </div>
      </div>
    `;
    contenedor.appendChild(card);
  });
}



 // --- Función para cerrar sesión ---
 /*
  function cerrarSesion() {
    // Eliminar datos de sesión
    localStorage.removeItem("usuario");
    sessionStorage.clear();

    // Evitar volver con "atrás"
    window.history.pushState(null, "", window.location.href);
    window.onpopstate = function() {
      window.history.go(1);
    };

    // Redirigir al login
    window.location.replace("../views/login.html");
  }

  // --- Confirmación antes de cerrar sesión ---
  document.getElementById("btnCerrarSesion").addEventListener("click", function() {
    const confirmar = confirm("¿Estás seguro de que quieres cerrar sesión?");
    if (confirmar) {
      cerrarSesion();
    }
  });

  // --- Verificación de sesión al cargar la página ---
  document.addEventListener("DOMContentLoaded", function() {
    const usuario = localStorage.getItem("usuario");
    if (!usuario) {
      window.location.replace("../views/login.html");
    }
  });

  // --- Expiración automática por inactividad ---
  let tiempoInactividad;
  const limiteInactividad = 10 * 60 * 1000; // 10 minutos

  function reiniciarTemporizador() {
    clearTimeout(tiempoInactividad);
    tiempoInactividad = setTimeout(() => {
      alert("Tu sesión ha expirado por inactividad.");
      cerrarSesion();
    }, limiteInactividad);
  }

  // Reiniciar temporizador al mover el mouse, presionar teclas, hacer clic o desplazarse
  window.onload = reiniciarTemporizador;
  document.onmousemove = reiniciarTemporizador;
  document.onkeydown = reiniciarTemporizador;
  document.onclick = reiniciarTemporizador;
  document.onscroll = reiniciarTemporizador;
  */