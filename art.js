// Ilustraciones de referencia por tipo de prenda (SVG línea) + fotos propias por producto.
// Si el producto tiene foto (p.photo, dataURL), se muestra la foto; si no, la ilustración de su categoría.
window.ART = (() => {
  const line = (d, extra = "") => `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}${extra}</svg>`;
  const shapes = {
    Blusas: line(`<path d="M35 18c3 6 9 9 15 9s12-3 15-9l14 8-6 16-8-3v40H35V39l-8 3-6-16z"/><path d="M50 27v8"/><path d="M41 60c6 3 12 3 18 0"/>`),
    Pantalones: line(`<path d="M32 14h36l4 72H56l-6-42-6 42H28z"/><path d="M32 24h36"/><path d="M50 24v10"/>`),
    Vestidos: line(`<path d="M38 14h24l-4 18 14 50H28l14-50z"/><path d="M42 20h16"/><path d="M34 60c10 4 22 4 32 0"/>`),
    Faldas: line(`<path d="M36 22h28l14 58H22z"/><path d="M36 22c4 4 24 4 28 0"/><path d="M44 22l-6 58M56 22l6 58"/>`),
    Sandalias: line(`<path d="M22 70c-4-8 4-22 18-26l26-6c10-2 16 4 14 14l-4 18z"/><path d="M40 44l12 24M52 42l10 22M34 52l24-6"/><path d="M22 70h54"/>`),
    Tacones: line(`<path d="M20 70c6-10 18-14 30-16l10-26c2-4 8-6 12-2 6 6 6 14 2 20L60 66l-4 6H20z"/><path d="M34 72v14"/><path d="M60 46l12 2"/>`),
    Tenis: line(`<path d="M14 66c0-6 8-8 18-10l10-12c4-4 8-4 12-2l6 4c8 4 18 6 24 12 4 4 2 10-4 10H18c-3 0-4-1-4-2z"/><path d="M42 44l8 8M48 40l8 8"/><path d="M14 66h66"/>`),
    Bolsos: line(`<path d="M24 38h52l-6 46H30z"/><path d="M36 38c0-14 28-14 28 0"/><path d="M24 50h52"/><path d="M50 56v8"/>`),
    Carteras: line(`<rect x="18" y="36" width="64" height="36" rx="6"/><path d="M18 50h64"/><circle cx="50" cy="56" r="4"/><path d="M30 36c6-10 34-10 40 0"/>`),
    Accesorios: line(`<circle cx="36" cy="54" r="14"/><circle cx="64" cy="54" r="14"/><circle cx="36" cy="36" r="3"/><circle cx="64" cy="36" r="3"/><path d="M36 39v1M64 39v1"/>`),
    default: line(`<path d="M30 20h40v60H30z"/><path d="M38 34h24M38 46h24M38 58h16"/>`)
  };
  const tints = { Blusas: "#F6E7EA", Pantalones: "#DFE5EC", Vestidos: "#EFE4EE", Faldas: "#F1E8DE", Sandalias: "#EDE6DC", Tacones: "#F3E4E2", Tenis: "#ECEFF1", Bolsos: "#EAE0D4", Carteras: "#F2E6E6", Accesorios: "#F4EFE2", default: "#EEEEEC" };
  const shapeOf = (p) => shapes[p.cat] ? p.cat : "default";
  function thumb(p, cls = "") {
    if (p.photo) return `<div class="art ${cls}" style="background-image:url('${p.photo}')"></div>`;
    const k = shapeOf(p);
    return `<div class="art ${cls}" style="background:${tints[k]}">${shapes[k]}</div>`;
  }
  // Comprime una foto a 480px para guardarla en el navegador
  function compress(file) {
    return new Promise((res, rej) => {
      const img = new Image(); const url = URL.createObjectURL(file);
      img.onload = () => { const s = Math.min(1, 480 / Math.max(img.width, img.height)); const c = document.createElement("canvas"); c.width = img.width * s; c.height = img.height * s; c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL("image/jpeg", .82)); };
      img.onerror = rej; img.src = url;
    });
  }
  // Íconos decorativos extra (fondo del login)
  const deco = {
    Gancho: line(`<path d="M50 30c0-6 10-6 10-12s-5-8-10-8-10 3-10 8"/><path d="M50 30L14 62c-3 3-1 8 3 8h66c4 0 6-5 3-8z"/>`),
    Corazon: line(`<path d="M50 80S18 60 18 38c0-10 8-18 17-18 7 0 12 4 15 10 3-6 8-10 15-10 9 0 17 8 17 18 0 22-32 42-32 42z"/>`),
    Destello: line(`<path d="M50 14c3 18 8 25 26 28-18 3-23 10-26 28-3-18-8-25-26-28 18-3 23-10 26-28z"/>`),
    Labial: line(`<rect x="38" y="52" width="24" height="32" rx="3"/><path d="M40 52V36l20-10v26"/><path d="M38 64h24"/>`),
    Lentes: line(`<circle cx="32" cy="56" r="13"/><circle cx="68" cy="56" r="13"/><path d="M45 54c3-3 7-3 10 0"/><path d="M19 52l-6-10M81 52l6-10"/>`)
  };
  const icon = (k) => shapes[k] || deco[k] || shapes.default;
  return { thumb, compress, icon };
})();
