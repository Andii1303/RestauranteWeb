document.addEventListener('DOMContentLoaded', () => {
  cargarOrdenes();
});

// --- Función para cargar órdenes ---
function cargarOrdenes() {
  fetch('/api/ordenes')
    .then(res => res.json())
    .then(data => {
      const contenedor = document.getElementById('lista-ordenes');
      contenedor.innerHTML = '';

      data.forEach(orden => {
        const card = document.createElement('div');
        card.className = 'col-md-6';

        card.innerHTML = `
          <div class="card border-primary">
            <div class="card-header bg-primary text-white">
              ${orden.tipo === 'mesa' ? `Mesa #${orden.numero}` : 'Pedido en línea'}
            </div>
            <div class="card-body">
              <h5 class="card-title">Platillos:</h5>
              <ul>${orden.platillos.map(p => `<li>${p}</li>`).join('')}</ul>
              <label for="estado-${orden.id}" class="form-label mt-2">Estado:</label>
              <select class="form-select estado-orden" id="estado-${orden.id}" data-id="${orden.id}">
                <option value="pendiente" ${orden.estado === 'pendiente' ? 'selected' : ''}>Pendiente</option>
                <option value="preparando" ${orden.estado === 'preparando' ? 'selected' : ''}>Preparando</option>
                <option value="lista" ${orden.estado === 'lista' ? 'selected' : ''}>Lista</option>
              </select>
            </div>
          </div>
        `;

        contenedor.appendChild(card);
      });

      document.querySelectorAll('.estado-orden').forEach(select => {
        select.addEventListener('change', e => {
          const id = e.target.dataset.id;
          const estado = e.target.value;

          fetch(`/api/ordenes/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ estado })
          })
          .then(res => {
            if (res.ok) {
              console.log(`Orden ${id} actualizada a ${estado}`);
            } else {
              console.error(`Error al actualizar orden ${id}`);
            }
          });
        });
      });
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
  window.location.replace("/login/login.html");
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
    window.location.replace("/login/login.html");
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