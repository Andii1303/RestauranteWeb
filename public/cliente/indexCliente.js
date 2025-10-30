document.addEventListener("DOMContentLoaded", () => {
  const menuGrid = document.getElementById("home-menu-grid");

<<<<<<< HEAD
=======
  const platos = [
    {
      nombre: "Tacos Especiales",
      descripcion: "Deliciosos tacos con ingredientes frescos y salsa picante.",
      imagen: "../Imajenes/Comida/Tacos.png"
    },
  ];

>>>>>>> d12dd9ef57d5540e4858e085dc7565f0be56a4b7
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