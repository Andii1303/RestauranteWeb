let platos = [];
let idActual = 1;

document.getElementById('formPlato').addEventListener('submit', function(e) {
  e.preventDefault();

  const id = document.getElementById('platoId').value;
  const nombre = document.getElementById('nombre').value;
  const descripcion = document.getElementById('descripcion').value;
  const precio = document.getElementById('precio').value;
  const fotografia = document.getElementById('fotografia').value;

  if (id) {
    const index = platos.findIndex(p => p.id == id);
    platos[index] = { id: Number(id), nombre, descripcion, precio, fotografia };
  } else {
    platos.push({ id: idActual++, nombre, descripcion, precio, fotografia });
  }

  actualizarTabla();
  this.reset();
  document.getElementById('platoId').value = '';
});

function actualizarTabla() {
  const tbody = document.getElementById('tablaPlatos');
  tbody.innerHTML = '';
  platos.forEach(plato => {
    const fila = document.createElement('tr');
    fila.innerHTML = `
      <td>${plato.id}</td>
      <td>${plato.nombre}</td>
      <td>${plato.descripcion}</td>
      <td>Q${Number(plato.precio).toFixed(2)}</td>
      <td><img src="${plato.fotografia}" alt="Foto" style="width: 60px; height: 40px; object-fit: cover;"></td>
      <td>
        <button class="btn btn-sm btn-primary me-2" onclick="editarPlato(${plato.id})">Editar</button>
        <button class="btn btn-sm btn-danger" onclick="eliminarPlato(${plato.id})">Eliminar</button>
      </td>
    `;
    tbody.appendChild(fila);
  });
}

function editarPlato(id) {
  const plato = platos.find(p => p.id === id);
  document.getElementById('platoId').value = plato.id;
  document.getElementById('nombre').value = plato.nombre;
  document.getElementById('descripcion').value = plato.descripcion;
  document.getElementById('precio').value = plato.precio;
  document.getElementById('fotografia').value = plato.fotografia;
}

function eliminarPlato(id) {
  platos = platos.filter(p => p.id !== id);
  actualizarTabla();
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
