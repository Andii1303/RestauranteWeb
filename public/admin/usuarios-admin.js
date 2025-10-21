// Gestión de usuarios (panel admin)
// Esta versión es un placeholder. En pasos siguientes se conectará con /roles y /users del backend.
let usuarios = [];
let idUsuario = 1;

document.getElementById('formUsuario')?.addEventListener('submit', function (e) {
  e.preventDefault();
  const id = document.getElementById('usuario').value;
  const nombre = document.getElementById('nombre').value;
  const correo = document.getElementById('correo').value;
  const contraseña = document.getElementById('Contraseña').value;
  const rol = document.getElementById('rol').value;

  if (id) {
    const index = usuarios.findIndex(u => u.id == id);
    usuarios[index] = { id: Number(id), nombre, correo, contraseña, rol };
  } else {
    usuarios.push({ id: idUsuario++, nombre, correo, contraseña, rol });
  }
  actualizarTablaUsuarios();
  this.reset();
  document.getElementById('usuario').value = '';
});

function actualizarTablaUsuarios() {
  const tbody = document.getElementById('tablaUsuarios');
  if (!tbody) return;
  tbody.innerHTML = '';
  usuarios.forEach(usuario => {
    const fila = document.createElement('tr');
    fila.innerHTML = `
      <td>${usuario.id}</td>
      <td>${usuario.nombre}</td>
      <td>${usuario.correo}</td>
      <td>${usuario.contraseña}</td>
      <td>${usuario.rol}</td>
      <td>
        <button class="btn btn-sm btn-primary me-2" onclick="editarUsuario(${usuario.id})">Editar</button>
        <button class="btn btn-sm btn-danger" onclick="eliminarUsuario(${usuario.id})">Eliminar</button>
      </td>
    `;
    tbody.appendChild(fila);
  });
}

function editarUsuario(id) {
  const usuario = usuarios.find(u => u.id === id);
  document.getElementById('usuario').value = usuario.id;
  document.getElementById('nombre').value = usuario.nombre;
  document.getElementById('correo').value = usuario.correo;
  document.getElementById('Contraseña').value = usuario.contraseña;
  document.getElementById('rol').value = usuario.rol;
}

function eliminarUsuario(id) {
  usuarios = usuarios.filter(u => u.id !== id);
  actualizarTablaUsuarios();
}
