document.addEventListener('DOMContentLoaded', () => {
  cargarOrdenes();
});

// --- Función para cargar órdenes ---
function cargarOrdenes() {
  fetch('/api/ordenes')
    .then(res => res.json())
    .then(data => {
      const contenedor = document.getElementById('lista-ordenes');
      contenedor.textContent = '';

      const h = (tag, { className, text, attrs } = {}, children = []) => {
        const el = document.createElement(tag);
        if (className) el.className = className;
        if (text != null) el.textContent = text;
        if (attrs) Object.entries(attrs).forEach(([k,v]) => el.setAttribute(k, String(v)));
        (Array.isArray(children) ? children : [children]).forEach(ch => { if (ch) el.appendChild(ch); });
        return el;
      };

      data.forEach(orden => {
        const col = h('div', { className: 'col-md-6' });
        const card = h('div', { className: 'card border-primary' });
        const header = h('div', { className: 'card-header bg-primary text-white', text: (orden.tipo === 'mesa' ? `Mesa #${orden.numero}` : 'Pedido en línea') });
        const body = h('div', { className: 'card-body' });
        body.appendChild(h('h5', { className: 'card-title', text: 'Platillos:' }));
        const ul = h('ul');
        (orden.platillos || []).forEach(p => ul.appendChild(h('li', { text: p })));
        body.appendChild(ul);
        const label = h('label', { className: 'form-label mt-2', attrs: { for: `estado-${orden.id}` }, text: 'Estado:' });
        const select = h('select', { className: 'form-select estado-orden', attrs: { id: `estado-${orden.id}` } });
        select.dataset.id = String(orden.id);
        const opts = [
          { v: 'pendiente', t: 'Pendiente' },
          { v: 'preparando', t: 'Preparando' },
          { v: 'lista', t: 'Lista' }
        ];
        opts.forEach(o => {
          const opt = h('option', { text: o.t, attrs: { value: o.v } });
          if (orden.estado === o.v) opt.selected = true;
          select.appendChild(opt);
        });
        body.appendChild(label);
        body.appendChild(select);
        card.appendChild(header);
        card.appendChild(body);
        col.appendChild(card);
        contenedor.appendChild(col);
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


// (Limpieza) Se removieron bloques comentados sin uso