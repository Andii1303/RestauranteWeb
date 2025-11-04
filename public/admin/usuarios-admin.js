/**
 * Admin: Usuarios (frontend)
 *
 * - Listado y mantenimiento de usuarios del sistema.
 */
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
  tbody.textContent = '';
  usuarios.forEach(usuario => {
    const tr = document.createElement('tr');
    const c1 = document.createElement('td'); c1.textContent = String(usuario.id);
    const c2 = document.createElement('td'); c2.textContent = usuario.nombre;
    const c3 = document.createElement('td'); c3.textContent = usuario.correo;
    const c4 = document.createElement('td'); c4.textContent = usuario.contraseña;
    const c5 = document.createElement('td'); c5.textContent = usuario.rol;
    const c6 = document.createElement('td');
    const btnE = document.createElement('button'); btnE.className = 'btn btn-sm btn-primary me-2'; btnE.textContent = 'Editar'; btnE.dataset.action = 'edit'; btnE.dataset.id = String(usuario.id);
    const btnD = document.createElement('button'); btnD.className = 'btn btn-sm btn-danger'; btnD.textContent = 'Eliminar'; btnD.dataset.action = 'del'; btnD.dataset.id = String(usuario.id);
    c6.appendChild(btnE); c6.appendChild(btnD);
    tr.appendChild(c1); tr.appendChild(c2); tr.appendChild(c3); tr.appendChild(c4); tr.appendChild(c5); tr.appendChild(c6);
    tbody.appendChild(tr);
  });
  tbody.onclick = (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    const action = btn.dataset.action;
    if (action === 'edit') editarUsuario(id);
    else if (action === 'del') eliminarUsuario(id);
  };
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
