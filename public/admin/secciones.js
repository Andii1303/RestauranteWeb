/**
 * Admin: Navegación de secciones (frontend)
 *
 * - Orquesta qué vista mostrar (ingredientes, menú, usuarios, etc.).
 * - Expone `mostrarSeccion(id)` global para otros scripts.
 */
function mostrarSeccion(id) {
  const secciones = document.querySelectorAll('.seccion');
  secciones.forEach(sec => sec.classList.add('d-none'));
  const activa = document.getElementById(id);
  if (activa) {
    activa.classList.remove('d-none');
    try {
      window.dispatchEvent(new CustomEvent('seccion-mostrada', { detail: { id } }));
    } catch {}
  }
}
