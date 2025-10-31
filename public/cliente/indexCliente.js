/**
 * Página de inicio (efectos y render demo)
 *
 * - Anima y pinta tarjetas demo si existe window.platos.
 * - Efectos de scroll para navbar.
 */
// Datos de ejemplo para los platos del menú

document.addEventListener("DOMContentLoaded", () => {
  const menuGrid = document.getElementById("home-menu-grid");
  const lista = Array.isArray(window.platos) ? window.platos : null;
  if (!menuGrid || !lista) return; // si no hay datos, salir silenciosamente

  lista.forEach((plato, index) => {
    const col = document.createElement("div");
    col.className = "col animate-fade-in";

    col.innerHTML = `
      <div class="card shadow-sm h-100">
        <img src="${plato.imagen}" class="card-img-top" alt="${plato.nombre}">
        <div class="card-body">
          <h5 class="card-title">${plato.nombre}</h5>
          <p class="card-text">${plato.descripcion}</p>
        </div>
      </div>
    `;

    // Añadir con pequeño retraso para efecto escalonado
    setTimeout(() => {
      menuGrid.appendChild(col);
    }, index * 150);
  });
});

//nav bar estatico 
  window.addEventListener("scroll", () => {
    const navbar = document.getElementById("mainNavbar");
    if (window.scrollY > 50) {
      navbar.classList.add("navbar-shrink");
    } else {
      navbar.classList.remove("navbar-shrink");
    }
  });

  //cambio de color en el navbar 
    window.addEventListener("scroll", () => {
    const navbar = document.getElementById("mainNavbar");
    if (window.scrollY > 50) {
      navbar.classList.add("navbar-scrolled");
    } else {
      navbar.classList.remove("navbar-scrolled");
    }
  });