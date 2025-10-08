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
