let ingredientes = [];
let idIngrediente = 1;

document.getElementById('formIngrediente').addEventListener('submit', function(e) {
  e.preventDefault();

  const id = document.getElementById('ingredienteId').value;
  const nombre = document.getElementById('nombreIngrediente').value;
  const unidad = document.getElementById('unidad').value;
  const cantidad = document.getElementById('cantidad').value;
  const categoria = document.getElementById('categoria').value;

  if (id) {
    const index = ingredientes.findIndex(i => i.id == id);
    ingredientes[index] = { id: Number(id), nombre, unidad, cantidad, categoria };
  } else {
    ingredientes.push({ id: idIngrediente++, nombre, unidad, cantidad, categoria });
  }

  actualizarTablaIngredientes();
  this.reset();
  document.getElementById('ingredienteId').value = '';
});

function actualizarTablaIngredientes() {
  const tbody = document.getElementById('tablaIngredientes');
  tbody.innerHTML = '';
  ingredientes.forEach(ingrediente => {
    const fila = document.createElement('tr');
    fila.innerHTML = `
      <td>${ingrediente.id}</td>
      <td>${ingrediente.nombre}</td>
      <td>${ingrediente.unidad}</td>
      <td>${ingrediente.cantidad}</td>
      <td>${ingrediente.categoria}</td>
      <td>
        <button class="btn btn-sm btn-primary me-2" onclick="editarIngrediente(${ingrediente.id})">Editar</button>
        <button class="btn btn-sm btn-danger" onclick="eliminarIngrediente(${ingrediente.id})">Eliminar</button>
      </td>
    `;
    tbody.appendChild(fila);
  });
}

function editarIngrediente(id) {
  const ingrediente = ingredientes.find(i => i.id === id);
  document.getElementById('ingredienteId').value = ingrediente.id;
  document.getElementById('nombreIngrediente').value = ingrediente.nombre;
  document.getElementById('unidad').value = ingrediente.unidad;
  document.getElementById('cantidad').value = ingrediente.cantidad;
  document.getElementById('categoria').value = ingrediente.categoria;
}

function eliminarIngrediente(id) {
  ingredientes = ingredientes.filter(i => i.id !== id);
  actualizarTablaIngredientes();
}
