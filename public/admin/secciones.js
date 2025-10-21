function mostrarSeccion(id) {
  const secciones = document.querySelectorAll('.seccion');
  secciones.forEach(sec => sec.style.display = 'none');
  const activa = document.getElementById(id);
  if (activa) {
    activa.style.display = 'block';
    try {
      window.dispatchEvent(new CustomEvent('seccion-mostrada', { detail: { id } }));
    } catch {}
  }
}
