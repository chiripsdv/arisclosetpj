// Ilustraciones de referencia por tipo de prenda (SVG línea) + fotos propias por producto.
// Si el producto tiene foto (p.photo, dataURL), se muestra la foto; si no, la ilustración de su categoría.
window.ART = (() => {
  const line = (d, extra = "") => `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}${extra}</svg>`;
  const shapes = {
    Blusas: line(`<path d="M35 18c3 6 9 9 15 9s12-3 15-9l14 8-6 16-8-3v40H35V39l-8 3-6-16z"/><path d="M50 27v8"/><path d="M41 60c6 3 12 3 18 0"/>`),
    Camisas: line(`<path d="M36 16l14 6 14-6 15 9-6 15-7-2v42H34V38l-7 2-6-15z"/><path d="M50 22v58"/><path d="M50 22l-6 8h12z"/><circle cx="50" cy="40" r="1.2" fill="currentColor"/><circle cx="50" cy="52" r="1.2" fill="currentColor"/><circle cx="50" cy="64" r="1.2" fill="currentColor"/>`),
    Pantalones: line(`<path d="M32 14h36l4 72H56l-6-42-6 42H28z"/><path d="M32 24h36"/><path d="M50 24v10"/>`),
    Vestidos: line(`<path d="M38 14h24l-4 18 14 50H28l14-50z"/><path d="M42 20h16"/><path d="M34 60c10 4 22 4 32 0"/>`),
    Calzado: line(`<path d="M14 66c0-6 8-8 18-10l10-12c4-4 8-4 12-2l6 4c8 4 18 6 24 12 4 4 2 10-4 10H18c-3 0-4-1-4-2z"/><path d="M42 44l8 8M48 40l8 8"/><path d="M14 66h66"/>`),
    Accesorios: line(`<path d="M40 14h20v36l10 10c4 4 2 12-4 14-6 2-14 0-18-4l-8-8z"/><path d="M40 20h20"/><path d="M40 50l-6 6"/>`),
    Botas: line(`<path d="M36 12h22v40l20 14c4 3 2 10-4 10H30V12z"/><path d="M36 20h22M36 30h22M36 40h22"/>`),
    default: line(`<path d="M30 20h40v60H30z"/><path d="M38 34h24M38 46h24M38 58h16"/>`)
  };
  const tints = { Blusas: "#F6E7EA", Camisas: "#ECEFF4", Pantalones: "#DFE5EC", Vestidos: "#EFE4EE", Calzado: "#EDE6DC", Accesorios: "#ECEAE4", default: "#EEEEEC" };
  const shapeOf = (p) => (p.name || "").toLowerCase().includes("bota") ? "Botas" : (shapes[p.cat] ? p.cat : "default");
  function thumb(p, cls = "") {
    if (p.photo) return `<div class="art ${cls}" style="background-image:url('${p.photo}')"></div>`;
    const k = shapeOf(p);
    return `<div class="art ${cls}" style="background:${tints[shapes[k] ? (k === "Botas" ? "Calzado" : k) : "default"]}">${shapes[k]}</div>`;
  }
  // Comprime una foto a 480px para guardarla en el navegador
  function compress(file) {
    return new Promise((res, rej) => {
      const img = new Image(); const url = URL.createObjectURL(file);
      img.onload = () => { const s = Math.min(1, 480 / Math.max(img.width, img.height)); const c = document.createElement("canvas"); c.width = img.width * s; c.height = img.height * s; c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL("image/jpeg", .82)); };
      img.onerror = rej; img.src = url;
    });
  }
  return { thumb, compress };
})();
