document.addEventListener("DOMContentLoaded", () => {
  const menuGrid = document.getElementById("home-menu-grid");

  platos.forEach((plato, index) => {
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

