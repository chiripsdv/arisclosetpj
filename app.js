/* Ari's Closet · demo PWA. Todo se guarda en localStorage del navegador.
   En producción la capa "DB" se reemplaza por Supabase (mismas funciones). */
(() => {
"use strict";
const KEY = "aris-demo-v4";
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uid = () => Math.random().toString(36).slice(2, 9);
const dayOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const today = () => dayOf(new Date());
const DEFAULT_RELAY = "https://ntfy.sh";
const fmtT = (iso) => new Date(iso).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
const fmtD = (iso) => new Date(iso).toLocaleDateString("es", { day: "numeric", month: "short" });
const fmtDL = (d) => d.toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

/* ---------- DB (localStorage) ---------- */
let DB = null;
function load() {
  try { DB = JSON.parse(localStorage.getItem(KEY)); } catch { DB = null; }
  if (!DB) { DB = JSON.parse(JSON.stringify(window.SEED)); DB.sales = []; DB.expenses = []; DB.moves = []; ensureCodes(); seedHistory(); save(); }
  migrate();
}
// Asegura campos nuevos en datos guardados (socios, códigos de barra, ajustes)
function migrate() {
  DB.partners = DB.partners || JSON.parse(JSON.stringify(window.SEED.partners));
  DB.settings = Object.assign({ waCountry: "505", relay: DEFAULT_RELAY }, DB.settings);
  DB.products.forEach(p => { if (!p.partner) p.partner = DB.partners[0].id; });
  ensureCodes();
}
// Código de barras por variante: 7 dígitos, determinístico para los datos de ejemplo
function ensureCodes() {
  let next = 0;
  DB.products.forEach(p => p.variants.forEach(v => { if (v.code && /^\d+$/.test(v.code)) next = Math.max(next, +v.code); }));
  DB.products.forEach((p, pi) => p.variants.forEach((v, vi) => {
    if (v.code) return;
    const c = `20${String(pi + 1).padStart(3, "0")}${String(vi + 1).padStart(2, "0")}`;
    v.code = codeTaken(c) ? String(Math.max(next, 2000000) + 1) : c;
    next = Math.max(next, +v.code);
  }));
}
function codeTaken(c) { return DB.products.some(p => p.variants.some(v => v.code === c)); }
function newCode() { let n = 2000000; DB.products.forEach(p => p.variants.forEach(v => { if (/^\d+$/.test(v.code || "")) n = Math.max(n, +v.code); })); return String(n + 1); }
function save() { localStorage.setItem(KEY, JSON.stringify(DB)); }
function reset() { localStorage.removeItem(KEY); location.hash = ""; load(); render(); toast("Datos del demo reiniciados"); }
const money = (n) => `${DB.settings.currency} ${Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

function seedHistory() {
  // 14 días de ventas y gastos de ejemplo para que los reportes tengan datos
  const sellers = DB.users;
  const now = new Date();
  for (let d = 13; d >= 0; d--) {
    const n = 3 + Math.floor(Math.random() * 6);
    for (let i = 0; i < n; i++) {
      let dt = new Date(now); dt.setDate(now.getDate() - d); dt.setHours(9 + Math.floor(Math.random() * 9), Math.floor(Math.random() * 60));
      if (d === 0 && dt > now) dt = new Date(now.getTime() - Math.random() * 4 * 3600e3);
      const p = DB.products[Math.floor(Math.random() * DB.products.length)];
      const v = p.variants[Math.floor(Math.random() * p.variants.length)];
      const qty = ["Accesorios", "Carteras"].includes(p.cat) ? 1 + Math.floor(Math.random() * 3) : 1;
      const sub = p.price * qty;
      const r = Math.random();
      const disc = r < 0.2 ? { type: "manual", pct: 10, amount: Math.round(sub * .1), by: null } : r < 0.3 ? { type: "codigo", code: "ARI15", pct: 15, amount: Math.round(sub * .15) } : null;
      const seller = sellers[Math.floor(Math.random() * sellers.length)];
      DB.sales.push({ id: uid(), n: 0, at: dt.toISOString(), day: dayOf(dt), seller: seller.id, items: [{ pid: p.id, vid: v.id, partner: p.partner, name: p.name, size: v.size, color: v.color, qty, price: p.price, cost: p.cost }],
        subtotal: sub, discount: disc, total: sub - (disc ? disc.amount : 0), pay: DB.payMethods[Math.floor(Math.random() * 3)], status: "cerrada" });
    }
    if (d % 3 === 0) {
      const dt = new Date(now); dt.setDate(now.getDate() - d);
      const cats = ["Servicios", "Mercadería", "Transporte", "Otros"];
      DB.expenses.push({ id: uid(), at: dt.toISOString(), day: dayOf(dt), cat: cats[d % 4], amount: [350, 2300, 180, 420][d % 4], note: ["Luz e internet", "Compra a proveedor", "Envíos", "Bolsas y etiquetas"][d % 4], partner: ["shared", "s1", "s2", "shared"][d % 4], by: "u1" });
    }
  }
  DB.sales.sort((a, b) => a.at.localeCompare(b.at)).forEach((s, i) => s.n = 400 + i);
}

/* ---------- Sesión ---------- */
const SESSION = "aris-demo-session";
let me = null;
const role = () => DB.roles[me.role];
const can = (k) => !!role()[k];
function login(u) { me = u; sessionStorage.setItem(SESSION, u.id); location.hash = role().views[0]; render(); listenScanner(); }
function logout() { me = null; sessionStorage.removeItem(SESSION); stopScanner(); location.hash = ""; render(); }

/* ---------- Estado UI ---------- */
const S = { cart: [], disc: null, pay: "Efectivo", q: "", invFilter: "Todo", invQ: "", repRange: "hoy", sim: false, custom: false, partner: "all" };
const prodById = (id) => DB.products.find(p => p.id === id);
const varById = (id) => { for (const p of DB.products) { const v = p.variants.find(v => v.id === id); if (v) return { p, v }; } return null; };
const userById = (id) => DB.users.find(u => u.id === id) || { name: "—" };
const salesOf = (day) => DB.sales.filter(s => s.day === day && s.status === "cerrada");
const lowStock = () => DB.products.flatMap(p => p.variants.filter(v => v.stock <= DB.settings.lowStock).map(v => ({ p, v })));
/* ---------- Socios ---------- */
const partnerById = (id) => DB.partners.find(p => p.id === id) || { id, name: id === "shared" ? "Compartido" : "—", share: 0, color: "#7A7A76" };
const itemPartner = (i) => i.partner || (prodById(i.pid) || {}).partner || DB.partners[0].id;
// Parte de una venta que corresponde a un socio (el descuento del ticket se prorratea)
function scopeSale(x, pid) {
  const items = x.items.filter(i => itemPartner(i) === pid);
  if (!items.length) return null;
  if (items.length === x.items.length) return x;
  const sub = items.reduce((a, i) => a + i.price * i.qty, 0), f = x.subtotal ? x.total / x.subtotal : 1, total = Math.round(sub * f);
  return { ...x, items, subtotal: sub, total, discount: x.discount ? { ...x.discount, amount: sub - total } : null };
}
const scoped = (list) => S.partner === "all" ? list : list.map(x => scopeSale(x, S.partner)).filter(Boolean);
const expShare = (e, pid) => e.partner === pid ? e.amount : (!e.partner || e.partner === "shared") ? Math.round(e.amount * (partnerById(pid).share || 0) / 100) : 0;
const scopedExp = (list) => S.partner === "all" ? list : list.map(e => ({ ...e, amount: expShare(e, S.partner) })).filter(e => e.amount > 0);
const inPartner = (p) => S.partner === "all" || p.partner === S.partner;
const lowStockP = () => lowStock().filter(x => inPartner(x.p));
const pDot = (id) => `<span class="pdot" style="background:${esc(partnerById(id).color || "#7A7A76")}"></span>`;
const partnerChip = (id) => `<span class="chip pchip">${pDot(id)}${esc(partnerById(id).name)}</span>`;
const partnerSeg = () => DB.partners.length > 1 ? `<div class="seg partner-seg" role="group" aria-label="Socio">${[["all", "Consolidado"], ...DB.partners.map(p => [p.id, p.name])].map(([k, l]) => `<button data-partner="${k}" class="${S.partner === k ? "on" : ""}">${k !== "all" ? pDot(k) : ""}${esc(l)}</button>`).join("")}</div>` : "";
const partnerOpts = (sel, withShared) => (withShared ? `<option value="shared" ${sel === "shared" ? "selected" : ""}>Compartido (según %)</option>` : "") + DB.partners.map(p => `<option value="${p.id}" ${sel === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("");

/* ---------- Iconos ---------- */
const I = {
  panel: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/></svg>',
  venta: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>',
  inventario: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 7.3L12 3 3.5 7.3v9.4L12 21l8.5-4.3z"/><path d="M3.5 7.3L12 11.6l8.5-4.3"/><path d="M12 11.6V21"/></svg>',
  gastos: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20"/><path d="M6 15h4"/></svg>',
  reportes: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 14l4-4 4 3 5-6"/></svg>',
  catalogos: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 13.4L13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>',
  usuarios: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/></svg>',
  search: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7A7A76" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  plus: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  x: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
  trend: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M22 7l-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/></svg>',
  ticket: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3h16v18l-2.7-2-2.6 2-2.7-2-2.7 2-2.6-2L4 21z"/><path d="M8 8h8M8 12h8"/></svg>',
  disc: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6"/><circle cx="9" cy="9" r="1"/><circle cx="15" cy="15" r="1"/></svg>',
  cash: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="3"/><circle cx="12" cy="12" r="3"/></svg>',
  card: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20"/></svg>',
  transfer: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>',
  warn: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D6001C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>',
  lock: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  down: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M4 21h16"/></svg>',
  out: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>',
  cam: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 8v8M10 8v8M13.5 8v8M17 8v8"/></svg>',
  back: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  edit: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  phone: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/></svg>',
  barcode: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><path d="M4 5v14M7 5v14M10.5 5v14M13 5v14M16.5 5v14M20 5v14"/></svg>',
  share: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>',
  print: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><rect x="2" y="9" width="20" height="9" rx="2"/><path d="M6 14h12v8H6z"/></svg>',
  install: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M12 7v7M9 11l3 3 3-3"/></svg>',
  wa: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.6.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 12 12 0 0 0 4.6 4.1c1.7.7 2.4.8 3.2.7a2.8 2.8 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3z"/></svg>'
};
const NAV = [["panel","Panel"],["venta","Vender"],["inventario","Inventario"],["gastos","Gastos"],["reportes","Reportes"],["catalogos","Catálogos"],["usuarios","Usuarios"]];

/* ---------- Render raíz ---------- */
const app = $("#app");
function view() { const h = location.hash.replace("#", "") || role().views[0]; return role().views.includes(h) ? h : role().views[0]; }
function render() {
  if (scannerParams()) return;
  if (!me) { app.innerHTML = loginView(); bindLogin(); return; }
  const v = view();
  const low = lowStock().length;
  const todayTotal = salesOf(today()).reduce((a, s) => a + s.total, 0);
  app.innerHTML = `
  <div class="shell ${v === "venta" && S.cart.length ? "has-cart" : ""}">
    <aside class="sidebar">
      <div class="brand"><img src="icons/logo.png" alt=""><div><div class="brand-name">${esc(DB.settings.store)}</div><div class="brand-sub">${esc(role().label)}</div></div></div>
      <nav class="nav">${NAV.filter(([k]) => role().views.includes(k)).map(([k, l]) => `<a href="#${k}" class="${v === k ? "active" : ""}">${I[k]}<span>${l}</span>${tabBadge(k, low)}</a>`).join("")}</nav>
      <div class="side-foot">
        ${installHTML()}
        <div class="cashbox"><small>Caja de hoy</small><b>${money(todayTotal)}</b><small>${salesOf(today()).length} tickets</small></div>
        <div class="me"><span class="avatar ${me.role === "propietaria" ? "red" : ""}">${esc(me.name.slice(0, 2).toUpperCase())}</span><div><b>${esc(me.name)}</b><span>${esc(role().label)}</span></div><button title="Salir" data-act="logout">${I.out}</button></div>
      </div>
    </aside>
    <div class="main">
      ${({ panel: panelView, venta: ventaView, inventario: invView, gastos: gastosView, reportes: repView, catalogos: catView, usuarios: usersView })[v]()}
    </div>
    <div class="dock">
      ${v === "venta" && S.cart.length ? cartBarHTML() : ""}
      <nav class="tabbar">${NAV.filter(([k]) => role().views.includes(k)).slice(0, 5).map(([k, l]) => `<a href="#${k}" class="${v === k ? "active" : ""}">${I[k]}<span>${l}</span>${tabBadge(k, low)}</a>`).join("")}</nav>
    </div>
  </div>`;
  bind();
  if (S.cartOpen) {
    if (v === "venta" && S.cart.length && window.innerWidth <= 900) {
      const old = $(".cs-items"), top = old ? old.scrollTop : 0;
      $("#modal-root").innerHTML = cartScreenHTML();
      $(".cs-items").scrollTop = top;
      document.body.classList.add("lock");
    } else { S.cartOpen = false; if (!$(".ticket")) closeModal(); }
  }
}
const cartCount = () => S.cart.reduce((a, c) => a + c.qty, 0);
const tabBadge = (k, low) => k === "venta" && S.cart.length ? `<span class="badge dark">${cartCount()}</span>` : k === "inventario" && low ? `<span class="badge">${low}</span>` : "";
// Barra del carrito (teléfono): pegada a la navegación, nunca tapa productos
function cartBarHTML() {
  const { total } = cartCalc(), n = cartCount();
  const recent = S.lastAdd && Date.now() - S.lastAdd.at < 1800;
  const thumbs = S.cart.slice(-3).reverse().map(c => ART.thumb(prodById(c.pid) || { cat: "" }, "cb-thumb")).join("");
  return `<div class="cartbar ${recent ? "bump" : ""}">
    <button class="cb-info" data-act="opencart" aria-label="Ver carrito, ${n} ${n === 1 ? "artículo" : "artículos"}">
      <span class="cb-thumbs">${thumbs}${S.cart.length > 3 ? `<span class="cb-more">+${S.cart.length - 3}</span>` : ""}</span>
      <span class="cb-txt"><b>${n} ${n === 1 ? "artículo" : "artículos"}${S.disc ? ` · −${S.disc.pct} %` : ""}</b><span class="cb-sub">${recent ? "+ " + esc(S.lastAdd.name) : "Ver carrito"}</span></span>
    </button>
    <button class="cb-pay" data-act="opencart">Cobrar <b>${money(total)}</b></button>
  </div>`;
}
const topbar = (title, sub, right = "") => `<header class="topbar"><div><h1>${title}</h1><div class="sub">${sub}</div></div><div class="grow"></div>${right}<button class="btn icon hide-d" data-act="logout" title="Salir">${I.out}</button></header>`;

/* ---------- Login ---------- */
function loginView() {
  return `<div class="login"><form class="login-card" id="loginForm">
    <img src="icons/logo.png" alt="Ari's Closet">
    <h1>Bienvenida</h1>
    <p>Entrá con tu usuario para abrir caja</p>
    <div class="field"><label>Usuario</label><select name="u">${DB.users.filter(u => u.active).map(u => `<option value="${u.id}">${esc(u.name)} · ${esc(DB.roles[u.role].label)}</option>`).join("")}</select></div>
    <div class="field"><label>Contraseña</label><input name="p" type="password" value="1234" required></div>
    <button class="btn dark lg block" type="submit">Entrar</button>
    <p class="hint">Demo: la contraseña de todos es <b>1234</b>. PIN de autorización de Ariana: <b>1234</b>.</p>
    ${installHTML()}
  </form></div>`;
}
function bindLogin() {
  $("#loginForm").onsubmit = (e) => { e.preventDefault(); const f = new FormData(e.target); const u = DB.users.find(x => x.id === f.get("u")); if (u && u.pass === f.get("p")) login(u); else toast("Contraseña incorrecta", true); };
}

/* ---------- Panel ---------- */
function panelView() {
  const t = today(), s = scoped(salesOf(t));
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 7);
  const lastWeek = scoped(salesOf(dayOf(yesterday))).reduce((a, x) => a + x.total, 0);
  const total = s.reduce((a, x) => a + x.total, 0), disc = s.reduce((a, x) => a + (x.discount ? x.discount.amount : 0), 0);
  const cost = s.reduce((a, x) => a + x.items.reduce((b, i) => b + i.cost * i.qty, 0), 0);
  const exp = scopedExp(DB.expenses.filter(e => e.day === t)).reduce((a, e) => a + e.amount, 0);
  const delta = lastWeek ? Math.round((total - lastWeek) / lastWeek * 100) : 0;
  const mine = me.role === "vendedor";
  const list = (mine ? s.filter(x => x.seller === me.id) : s).slice().sort((a, b) => b.at.localeCompare(a.at) || b.n - a.n);
  const bySeller = DB.users.map(u => ({ u, t: s.filter(x => x.seller === u.id).reduce((a, x) => a + x.total, 0) })).filter(x => x.t > 0).sort((a, b) => b.t - a.t);
  const max = Math.max(1, ...bySeller.map(x => x.t));
  const hours = Array.from({ length: 12 }, (_, i) => s.filter(x => new Date(x.at).getHours() === 9 + i).reduce((a, x) => a + x.total, 0));
  const hmax = Math.max(1, ...hours);
  const byPartner = DB.partners.map(p => { const ps = salesOf(t).map(x => scopeSale(x, p.id)).filter(Boolean); return { p, t: ps.reduce((a, x) => a + x.total, 0), q: ps.reduce((a, x) => a + x.items.reduce((b, i) => b + i.qty, 0), 0) }; });
  const pmax = Math.max(1, ...byPartner.map(x => x.t));
  return topbar("Panel", S.partner === "all" ? fmtDL(new Date()) : `${esc(partnerById(S.partner).name)} · ${fmtDL(new Date())}`, `
    ${!mine ? `<label class="toggle hide-m" title="Genera una venta de otro dispositivo cada pocos segundos"><input type="checkbox" id="simToggle" ${S.sim ? "checked" : ""}> Simular ventas de otros dispositivos</label>` : ""}
    <a href="#venta" class="btn red">${I.plus}<span class="hide-m">Nueva venta</span></a>`) + `
  <div class="content">
    ${partnerSeg()}
    <section class="kpis">
      <div class="card kpi"><div class="lbl">Ventas de hoy<span class="ico">${I.trend}</span></div><div class="val">${money(total)}</div><div class="foot">${lastWeek ? `<span class="chip ${delta >= 0 ? "green" : "red"}">${delta >= 0 ? "+" : ""}${delta} %</span> vs. hace una semana` : "Sin referencia semanal"}</div></div>
      <div class="card kpi"><div class="lbl">Tickets<span class="ico">${I.ticket}</span></div><div class="val">${s.length}</div><div class="foot">Promedio ${money(s.length ? total / s.length : 0)}</div></div>
      <div class="card kpi"><div class="lbl">Descuentos<span class="ico red">${I.disc}</span></div><div class="val red">${money(disc)}</div><div class="foot">${s.filter(x => x.discount).length} ventas · ${total ? (disc / (total + disc) * 100).toFixed(1) : 0} %</div></div>
      ${can("canSeeProfit") ? `<div class="card kpi"><div class="lbl">Utilidad estimada<span class="ico">${I.cash}</span></div><div class="val">${money(total - cost - exp)}</div><div class="foot">Gastos de hoy ${money(exp)}</div></div>`
        : `<div class="card kpi"><div class="lbl">Artículos vendidos<span class="ico">${I.inventario}</span></div><div class="val">${s.reduce((a, x) => a + x.items.reduce((b, i) => b + i.qty, 0), 0)}</div><div class="foot">${lowStockP().length} variantes en stock bajo</div></div>`}
    </section>
    <div class="grid-2">
      <section class="card">
        <div class="card-h"><h2>${mine ? "Mis ventas de hoy" : "Ventas en vivo"} <span class="live">EN VIVO</span></h2><span class="hint live-count">${list.length} ${list.length === 1 ? "venta" : "ventas"} · ${money(list.reduce((a, x) => a + x.total, 0))}</span><a href="#reportes" class="btn sm ${role().views.includes("reportes") ? "" : "hide-m hide-d"}">Reportes</a></div>
        <div class="tbl-wrap live-list"><table><thead><tr><th>Hora</th><th>Ticket</th><th>Vendedora</th><th>Artículos</th><th>Descuento</th><th class="r">Total</th></tr></thead><tbody>
        ${list.length ? list.map((x, i) => `<tr class="${i === 0 ? "hl" : ""}"><td><b>${fmtT(x.at)}</b></td><td style="color:var(--muted)">#${x.n}</td><td><span class="who"><span class="avatar ${x.seller === "u1" ? "red" : x.seller === "u3" ? "grey" : ""}">${esc(userById(x.seller).name[0])}</span>${esc(userById(x.seller).name)}</span></td><td>${esc(x.items.map(i => `${i.qty > 1 ? i.qty + " × " : ""}${i.name} ${i.size}`).join(", "))}</td><td>${discChip(x.discount)}</td><td class="r"><b>${money(x.total)}</b></td></tr>`).join("") : `<tr><td colspan="6" class="empty">Todavía no hay ventas hoy. ¡Registrá la primera!</td></tr>`}
        </tbody></table></div>
      </section>
      <div class="stack">
        <section class="card"><div class="card-h"><h2>${I.warn} Stock bajo</h2><span class="badge">${lowStockP().length}</span></div>
          <div class="card-b list" style="padding-top:4px;padding-bottom:4px">${lowStockP().slice(0, 5).map(({ p, v }) => `<div class="row"><span><span class="t">${esc(p.name)}</span><span class="s">${esc(v.size)} · ${esc(v.color)}</span></span><span class="chip ${v.stock === 0 ? "solid-red" : v.stock <= 1 ? "red" : ""}">${v.stock}</span></div>`).join("") || `<div class="empty">Todo con stock suficiente</div>`}</div>
          ${can("canStockIn") ? `<div style="padding:0 18px 18px"><button class="btn outline block" data-act="stockin">${I.plus} Registrar entrada</button></div>` : ""}
        </section>
        ${DB.partners.length > 1 && S.partner === "all" ? `<section class="card"><div class="card-h"><h2>Por socio</h2><span class="hint">hoy</span></div><div class="card-b" style="display:flex;flex-direction:column;gap:14px">
          ${byPartner.map(x => `<div style="display:flex;flex-direction:column;gap:6px"><div class="row" style="padding:0;border:none"><span class="who">${pDot(x.p.id)}${esc(x.p.name)} <span class="hint">${x.q} pzas</span></span><b>${money(x.t)}</b></div><div class="bar"><i style="width:${x.t / pmax * 100}%;background:${esc(x.p.color)}"></i></div></div>`).join("")}
        </div></section>` : ""}
        ${!mine ? `<section class="card"><div class="card-h"><h2>Por vendedora</h2></div><div class="card-b" style="display:flex;flex-direction:column;gap:14px">
          ${bySeller.map(x => `<div style="display:flex;flex-direction:column;gap:6px"><div class="row" style="padding:0;border:none"><span>${esc(x.u.name)}</span><b>${money(x.t)}</b></div><div class="bar"><i class="${x.u.role === "propietaria" ? "red" : ""}" style="width:${x.t / max * 100}%"></i></div></div>`).join("") || `<div class="empty">Sin ventas todavía</div>`}
        </div></section>
        <section class="card"><div class="card-h"><h2>Ventas por hora</h2><span class="hint">9 h – 20 h</span></div><div class="card-b"><div class="mini-chart">${hours.map((h, i) => `<i class="${h === hmax && h > 0 ? "red" : ""}" style="height:${h / hmax * 100}%" title="${9 + i}:00 · ${money(h)}"></i>`).join("")}</div></div></section>` : ""}
      </div>
    </div>
  </div>`;
}
const discChip = (d) => d ? `<span class="chip red">${d.type === "codigo" ? "Código " + esc(d.code) : d.type === "pin" ? d.pct + " % con PIN" : d.pct + " % manual"}</span>` : `<span style="color:var(--faint)">—</span>`;

/* ---------- Punto de venta ---------- */
function cartCalc() {
  const subtotal = S.cart.reduce((a, c) => a + c.price * c.qty, 0);
  let amount = 0;
  if (S.disc) amount = Math.round(subtotal * S.disc.pct / 100);
  return { subtotal, amount, total: subtotal - amount };
}
function ventaView() {
  const q = S.q.trim().toLowerCase();
  const prods = DB.products.filter(p => !q || (p.name + p.brand + p.cat + p.variants.map(v => v.code + v.size + v.color).join("")).toLowerCase().includes(q));
  const { subtotal, amount, total } = cartCalc();
  const lim = role().maxDisc;
  const n = (DB.sales.reduce((a, s) => Math.max(a, s.n), 400) + 1);
  return topbar("Nueva venta", `Ticket #${n} · ${esc(me.name)}`, `<button class="btn" data-act="camscan" title="Escanear con la cámara de este equipo">${I.cam}<span class="hide-m">Cámara</span></button><button class="btn hide-m ${phoneOnline() ? "scan-on" : ""}" data-act="pair" id="scanBadge" title="Usar un celular como escáner de esta computadora">${I.phone}<span>${phoneOnline() ? "Celular conectado" : "Escanear con celular"}</span></button>`) + `
  <div class="content pos">
    <section class="stack" style="gap:12px">
      <div class="search full">${I.search}<input id="posQ" placeholder="Buscar producto, talla, color o código de barras" value="${esc(S.q)}" autocomplete="off" enterkeyhint="search"></div>
      <div class="prod-grid">${prods.map(p => `<div class="prod">${ART.thumb(p, "big")}<b>${esc(p.name)}</b><span class="hint">${esc(p.brand)} · ${esc(p.cat)}</span><span class="pr">${money(p.price)}</span>
        ${DB.partners.length > 1 ? `<span class="hint who" style="gap:6px">${pDot(p.partner)}${esc(partnerById(p.partner).name)}</span>` : ""}<div class="vars">${p.variants.map(v => `<button data-add="${v.id}" ${v.stock <= 0 ? "disabled" : ""} class="${v.stock <= DB.settings.lowStock ? "low" : ""}" title="Código ${esc(v.code)} · stock ${v.stock}">${esc(v.size)} ${esc(v.color)} · ${v.stock}</button>`).join("")}</div></div>`).join("") || `<div class="empty">Sin resultados</div>`}</div>
    </section>
    <aside class="card cart-panel hide-m" style="padding:16px">${cartHTML()}</aside>
  </div>`;
}
function cartItemsHTML() {
  return S.cart.length ? S.cart.map(c => `<div class="cart-item ${S.lastScan && S.lastScan.vid === c.vid && Date.now() - S.lastScan.at < 1500 ? "flash" : ""}">${ART.thumb(prodById(c.pid), "sm")}<div class="i"><b>${esc(c.name)}</b><span>${esc(c.size)} · ${esc(c.color)} · ${money(c.price)}</span></div>
    <div class="qty"><button data-qty="${c.vid}|-1" aria-label="Quitar uno">−</button><b>${c.qty}</b><button class="plus" data-qty="${c.vid}|1" aria-label="Agregar uno">+</button></div></div>`).join("") : `<div class="empty">Tocá una talla o escaneá el código</div>`;
}
function cartFootHTML() {
  const { subtotal, amount, total } = cartCalc();
  const lim = role().maxDisc;
  return `<div class="cf-disc">
      <div class="row" style="padding:0;border:none"><span style="font-weight:600;display:inline-flex;gap:8px;align-items:center;color:var(--red)">${I.disc}<span style="color:var(--ink)">Descuento</span></span><span class="chip">Tu límite ${lim} %</span></div>
      <div class="disc-opts">
        <button data-disc="5" class="${S.disc && S.disc.type === "manual" && S.disc.pct === 5 ? "on" : ""}">5 %</button>
        <button data-disc="10" class="${S.disc && S.disc.type === "manual" && S.disc.pct === 10 ? "on" : ""}" ${lim < 10 ? "disabled" : ""}>10 %</button>
        <button data-act="code" class="${S.disc && S.disc.type === "codigo" ? "on" : ""}">Código</button>
        <button data-act="pin" class="pin ${S.disc && S.disc.type === "pin" ? "on" : ""}">${I.lock} Con PIN</button>
      </div>
      ${S.disc ? `<div class="hint">Aplicado: ${S.disc.type === "codigo" ? "código " + esc(S.disc.code) + " (" + S.disc.pct + " %)" : S.disc.pct + " %" + (S.disc.type === "pin" ? " autorizado por " + esc(userById(S.disc.by).name) : "")} · <a href="#" data-act="nodisc" style="color:var(--red);font-weight:600">quitar</a></div>` : ""}
    </div>
    <div class="totals"><div><span>Subtotal</span><span>${money(subtotal)}</span></div>${amount ? `<div class="d"><span>Descuento ${S.disc.pct} %</span><span>− ${money(amount)}</span></div>` : ""}</div>
    <div class="pay">${DB.payMethods.map(m => `<button data-pay="${esc(m)}" class="${S.pay === m ? "on" : ""}">${m === "Efectivo" ? I.cash : m === "Tarjeta" ? I.card : I.transfer}<span>${esc(m)}</span></button>`).join("")}</div>
    <button class="cobrar" data-act="cobrar" ${!S.cart.length ? "disabled" : ""}><span>Cobrar</span><span>${money(total)}</span></button>`;
}
function cartHTML() {
  const n = cartCount();
  return `<div class="row" style="padding:0 0 8px;border:none"><span class="section-title">Carrito · ${n} ${n === 1 ? "artículo" : "artículos"}</span>${S.cart.length ? `<button class="btn ghost sm" data-act="clearcart">Vaciar</button>` : ""}</div>
    ${cartItemsHTML()}
    <div class="cart-foot-d">${cartFootHTML()}</div>`;
}
// Teléfono: el carrito es una pantalla completa con la lista desplazable y el cobro fijo abajo
function cartScreenHTML() {
  const n = cartCount();
  return `<div class="cart-screen" role="dialog" aria-modal="true" aria-label="Carrito">
    <header class="cs-h">
      <button class="btn icon ghost" data-close aria-label="Volver a productos">${I.back}</button>
      <div class="cs-title"><b>Carrito</b><span>${n} ${n === 1 ? "artículo" : "artículos"} · ${S.cart.length} ${S.cart.length === 1 ? "producto" : "productos"}</span></div>
      <button class="btn ghost sm" data-act="clearcart">Vaciar</button>
    </header>
    <div class="cs-items">${cartItemsHTML()}<button class="cs-more" data-close>${I.plus} Seguir agregando</button></div>
    <div class="cs-foot">${cartFootHTML()}</div>
  </div>`;
}
function addToCart(vid, scanned) {
  const r = varById(vid); if (!r) return;
  if ($(".ticket")) closeModal();
  const inCart = S.cart.find(c => c.vid === vid);
  const have = inCart ? inCart.qty : 0;
  if (have + 1 > r.v.stock) return toast(`Solo hay ${r.v.stock} en stock`, true);
  if (inCart) inCart.qty++; else S.cart.push({ pid: r.p.id, vid, partner: r.p.partner, code: r.v.code, name: r.p.name, size: r.v.size, color: r.v.color, qty: 1, price: r.p.price, cost: r.p.cost });
  render();
  S.lastAdd = { at: Date.now(), name: `${r.p.name} ${r.v.size}` };
  clearTimeout(S._cbT); S._cbT = setTimeout(() => { const el = $(".cartbar .cb-sub"); if (el) el.textContent = "Ver carrito"; const bar = $(".cartbar"); if (bar) bar.classList.remove("bump"); }, 1800);
  if (scanned) { S.lastScan = { vid, at: Date.now() }; toast(`✓ ${r.p.name} ${r.v.size} ${r.v.color} · ${money(r.p.price)}`); }
}
function setQty(vid, d) {
  const c = S.cart.find(c => c.vid === vid); if (!c) return;
  const r = varById(vid);
  if (c.qty + d > r.v.stock) return toast(`Solo hay ${r.v.stock} en stock`, true);
  c.qty += d; if (c.qty <= 0) S.cart = S.cart.filter(x => x !== c);
  render();
}
function applyManual(pct) {
  if (pct > role().maxDisc) return toast(`Tu límite es ${role().maxDisc} %. Pedí autorización con PIN.`, true);
  S.disc = S.disc && S.disc.type === "manual" && S.disc.pct === pct ? null : { type: "manual", pct };
  render();
}
function checkMargin() {
  // Regla: ningún artículo por debajo de costo + margen mínimo
  const { subtotal, amount } = cartCalc(); if (!amount) return true;
  const f = 1 - amount / subtotal;
  const bad = S.cart.find(c => c.price * f < c.cost * (1 + DB.settings.minMargin / 100));
  if (bad) { toast(`El descuento deja "${bad.name}" por debajo del precio mínimo`, true); return false; }
  return true;
}
function cobrar() {
  if (!S.cart.length || !checkMargin()) return;
  const { subtotal, amount, total } = cartCalc();
  const now = new Date();
  const sale = { id: uid(), n: DB.sales.reduce((a, s) => Math.max(a, s.n), 400) + 1, at: now.toISOString(), day: today(), seller: me.id, items: S.cart.map(c => ({ ...c })), subtotal,
    discount: S.disc ? { ...S.disc, amount } : null, total, pay: S.pay, status: "cerrada" };
  // Descontar stock en la misma "transacción"
  for (const c of S.cart) { const r = varById(c.vid); r.v.stock -= c.qty; DB.moves.push({ id: uid(), at: sale.at, vid: c.vid, partner: c.partner, type: "venta", qty: -c.qty, by: me.id, ref: sale.n }); }
  if (S.disc && S.disc.type === "codigo") { const dc = DB.discountCodes.find(d => d.code === S.disc.code); if (dc) dc.uses++; }
  DB.sales.push(sale); save();
  S.cart = []; S.disc = null; S.pay = "Efectivo"; S.cartOpen = false;
  render();
  showTicket(sale);
}
function ticketText(s) {
  const L = [DB.settings.store.toUpperCase(), "Ticket #" + s.n, new Date(s.at).toLocaleString("es"), "Atendió: " + userById(s.seller).name, "".padEnd(32, "-")];
  s.items.forEach(i => L.push(`${i.qty} x ${i.name} ${i.size} ${i.color}`.slice(0, 32), `${money(i.price * i.qty)}`.padStart(32)));
  L.push("".padEnd(32, "-"), `Subtotal ${money(s.subtotal)}`.padStart(32));
  if (s.discount) L.push(`Descuento ${s.discount.pct}% -${money(s.discount.amount)}`.padStart(32));
  L.push(`TOTAL ${money(s.total)}`.padStart(32), `Pago: ${s.pay}`, "", "¡Gracias por tu compra!", "Encontrá tu estilo único");
  return L.join("\n");
}
function showTicket(s) {
  const txt = ticketText(s);
  const split = DB.partners.map(p => ({ p, x: scopeSale(s, p.id) })).filter(o => o.x);
  modal(`<div class="modal-h"><h3>Venta registrada</h3><button class="btn icon ghost" data-close>${I.x}</button></div>
    <div style="display:flex;gap:12px;align-items:center"><span class="avatar" style="width:40px;height:40px;background:var(--green)">✓</span><div><b style="font-size:18px">${money(s.total)}</b><div class="hint">Ticket #${s.n} · ${esc(s.pay)}${s.discount ? " · descuento " + s.discount.pct + " %" : ""}</div></div></div>
    ${split.length > 1 ? `<div class="split">${split.map(o => `<span class="who">${pDot(o.p.id)}${esc(o.p.name)} <b>${money(o.x.total)}</b></span>`).join("")}</div>` : ""}
    <div class="ticket">${esc(txt)}</div>
    <div class="field"><label for="waPhone">WhatsApp de la clienta (opcional)</label><div class="phone-in"><span>+${esc(DB.settings.waCountry)}</span><input id="waPhone" type="tel" inputmode="numeric" autocomplete="tel" placeholder="8888 8888" value="${esc(s.phone || "")}"></div></div>
    <div class="ticket-actions">
      <button class="btn red" data-act="wa" data-sale="${s.id}">${I.wa} Enviar por WhatsApp</button>
      ${navigator.share ? `<button class="btn" data-act="share" data-sale="${s.id}">${I.share} Compartir</button>` : ""}
      <button class="btn" data-act="print" data-sale="${s.id}">${I.print} Imprimir</button>
      <a href="#venta" class="btn dark" data-close>Nueva venta</a>
    </div>`);
}
function waSend(id) {
  const s = DB.sales.find(x => x.id === id); if (!s) return;
  let ph = ($("#waPhone") ? $("#waPhone").value : "").replace(/\D/g, "");
  const cc = String(DB.settings.waCountry || "").replace(/\D/g, "");
  if (ph && cc && !(ph.startsWith(cc) && ph.length > 8)) ph = cc + ph;
  if (ph) { s.phone = ph.startsWith(cc) ? ph.slice(cc.length) : ph; save(); }
  window.open(`https://wa.me/${ph}?text=${encodeURIComponent(ticketText(s))}`, "_blank", "noopener");
}
async function shareTicket(id) {
  const s = DB.sales.find(x => x.id === id); if (!s) return;
  try { await navigator.share({ title: `${DB.settings.store} · Ticket #${s.n}`, text: ticketText(s) }); } catch {}
}
function printTicket(id) {
  const s = DB.sales.find(x => x.id === id); if (!s) return;
  $("#print-root").innerHTML = `<pre class="print-ticket">${esc(ticketText(s))}</pre>`;
  window.print();
}

/* ---------- Inventario ---------- */
function invView() {
  const q = S.invQ.trim().toLowerCase();
  let prods = DB.products.filter(p => inPartner(p) && (!q || (p.name + p.brand + p.cat + p.variants.map(v => v.code).join(" ")).toLowerCase().includes(q)));
  if (S.invFilter === "Stock bajo") prods = prods.filter(p => p.variants.some(v => v.stock <= DB.settings.lowStock));
  else if (S.invFilter !== "Todo") { const shoes = ["Sandalias", "Tacones", "Tenis"], bags = ["Bolsos", "Carteras", "Accesorios"]; prods = prods.filter(p => S.invFilter === "Calzado" ? shoes.includes(p.cat) : S.invFilter === "Bolsos y accesorios" ? bags.includes(p.cat) : !shoes.includes(p.cat) && !bags.includes(p.cat)); }
  const pieces = DB.products.filter(inPartner).reduce((a, p) => a + p.variants.reduce((b, v) => b + v.stock, 0), 0);
  const value = DB.products.filter(inPartner).reduce((a, p) => a + p.variants.reduce((b, v) => b + v.stock * p.cost, 0), 0);
  return topbar("Inventario", `${pieces} piezas${can("canSeeProfit") ? " · valor al costo " + money(value) : ""}`, can("canStockIn") ? `<button class="btn" data-act="labels" title="Imprimir etiquetas con código de barras">${I.barcode}<span class="hide-m">Etiquetas</span></button><button class="btn" data-act="stockin">${I.plus}<span class="hide-m">Entrada</span></button>${can("canEditCatalog") ? `<button class="btn dark" data-act="newprod">${I.plus}<span class="hide-m">Producto</span></button>` : ""}` : "") + `
  <div class="content" style="gap:12px">
    ${partnerSeg()}
    <div class="search full">${I.search}<input id="invQ" placeholder="Producto, marca, categoría o código" value="${esc(S.invQ)}"></div>
    <div class="seg">${["Todo", "Ropa", "Calzado", "Bolsos y accesorios", "Stock bajo"].map(f => `<button data-inv="${f}" class="${S.invFilter === f ? "on" + (f === "Stock bajo" ? " red" : "") : ""}">${f}${f === "Stock bajo" ? " · " + lowStockP().length : ""}</button>`).join("")}</div>
    <div class="inv-grid">${prods.map(p => { const st = p.variants.reduce((a, v) => a + v.stock, 0); return `<div class="card inv-item"><div class="inv-top"><button class="art-btn" data-photo="${p.id}" title="${can("canEditCatalog") ? "Cambiar foto" : ""}" ${can("canEditCatalog") ? "" : "disabled"}>${ART.thumb(p, "sm")}</button><div class="i"><b>${esc(p.name)}</b><span>${esc(p.brand)} · ${money(p.price)}${can("canSeeProfit") ? " · costo " + money(p.cost) : ""}</span>${DB.partners.length > 1 ? `<span class="who" style="gap:6px;margin-top:3px">${pDot(p.partner)}${esc(partnerById(p.partner).name)}</span>` : ""}</div><div class="n"><b>${st}</b><span>en stock</span></div></div>
      <div class="vchips">${p.variants.map(v => `<span class="chip ${v.stock === 0 ? "solid-red" : v.stock <= DB.settings.lowStock ? "red" : ""}" title="Código ${esc(v.code)}">${esc(v.size)} ${esc(v.color)} · ${v.stock}</span>`).join("")}</div>${can("canEditCatalog") ? `<button class="btn sm edit-btn" data-editprod="${p.id}">${I.edit} Editar</button>` : ""}</div>`; }).join("") || `<div class="empty">Sin productos</div>`}</div>
  </div>`;
}
function stockInModal(preVid) {
  const pre = preVid ? varById(preVid) : null;
  const pid0 = pre ? pre.p.partner : (S.partner !== "all" ? S.partner : DB.partners[0].id);
  const optsFor = (pid, sel) => DB.products.filter(p => p.partner === pid).flatMap(p => p.variants.map(v => `<option value="${v.id}" ${sel === v.id ? "selected" : ""}>${esc(p.name)} · ${esc(v.size)} ${esc(v.color)} (stock ${v.stock})</option>`)).join("") || `<option value="">Este socio no tiene productos</option>`;
  modal(`<div class="modal-h"><h3>Registrar entrada</h3><button class="btn icon ghost" data-close>${I.x}</button></div>
  <form id="f" class="form">
  <div class="field full"><label for="siPartner">Socio dueño de la mercadería</label><select name="partner" id="siPartner">${partnerOpts(pid0)}</select></div>
  <div class="field full"><label for="siCode">Código de barras</label><div class="phone-in"><span>${I.barcode}</span><input id="siCode" inputmode="numeric" placeholder="Escaneá con el celular o escribí el código y Enter"></div></div>
  <div class="field full"><label for="siVid">Producto y variante</label><select name="vid" id="siVid" required>${optsFor(pid0, preVid)}</select></div>
  <div class="field"><label>Cantidad</label><input name="qty" type="number" min="1" value="1" required></div>
  <div class="field"><label>Motivo</label><select name="type"><option value="compra">Compra a proveedor</option><option value="ajuste">Ajuste de inventario</option><option value="devolucion">Devolución de cliente</option></select></div>
  <button class="btn dark lg full" type="submit">Guardar entrada</button></form>`, (f) => {
    const r = varById(f.get("vid")); if (!r) { toast("Elegí una variante", true); return false; }
    const q = +f.get("qty"); r.v.stock += q;
    DB.moves.push({ id: uid(), at: new Date().toISOString(), vid: r.v.id, partner: r.p.partner, type: f.get("type"), qty: q, by: me.id }); save(); render(); toast(`+${q} ${r.p.name} ${r.v.size} ${r.v.color} · ${partnerById(r.p.partner).name}`);
  });
  $("#siPartner").onchange = (e) => { $("#siVid").innerHTML = optsFor(e.target.value); };
  $("#siCode").onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); const r = findByCode(e.target.value); if (r) selectStockVariant(r); else toast(`Código ${e.target.value} no registrado`, true); } };
  S._stockOpts = optsFor;
}
function selectStockVariant(r) {
  if (!$("#siVid")) return;
  $("#siPartner").value = r.p.partner;
  $("#siVid").innerHTML = S._stockOpts(r.p.partner, r.v.id);
  $("#siCode").value = r.v.code;
  const q = $("#f input[name=qty]"); if (q && $("#siVid").dataset.last === r.v.id) q.value = +q.value + 1;
  $("#siVid").dataset.last = r.v.id;
  toast(`${r.p.name} ${r.v.size} ${r.v.color} · ${partnerById(r.p.partner).name}`);
}
function editProdModal(id) {
  const p = prodById(id); if (!p) return;
  const sold = (vid) => DB.sales.some(x => x.items.some(i => i.vid === vid));
  const vrow = (v, i) => `<div class="vrow" data-vrow="${v ? v.id : "new"}">
      <input name="v_size" value="${esc(v ? v.size : "")}" placeholder="Talla" aria-label="Talla" required>
      <input name="v_color" value="${esc(v ? v.color : "")}" placeholder="Color" aria-label="Color" required>
      <input name="v_code" value="${esc(v ? v.code : newCode())}" placeholder="Código" aria-label="Código de barras" inputmode="numeric">
      <span class="vstock" title="El stock se cambia con Registrar entrada">${v ? v.stock + " uds." : "nueva"}</span>
      <button type="button" class="btn ghost sm" data-delvrow title="Quitar variante" ${v && (v.stock > 0 || sold(v.id)) ? "disabled" : ""}>${I.x}</button>
    </div>`;
  modal(`<div class="modal-h"><h3>Editar producto</h3><button class="btn icon ghost" data-close>${I.x}</button></div>
  <form id="f" class="form">
    <div class="field full"><label>Nombre</label><input name="name" required value="${esc(p.name)}"></div>
    <div class="field"><label>Categoría</label><select name="cat">${DB.categories.map(c => `<option ${c === p.cat ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></div>
    <div class="field"><label>Marca</label><select name="brand">${DB.brands.map(c => `<option ${c === p.brand ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></div>
    <div class="field"><label>Costo</label><input name="cost" type="number" min="0" required value="${p.cost}"></div>
    <div class="field"><label>Precio de venta</label><input name="price" type="number" min="0" required value="${p.price}"></div>
    <div class="field full"><label>Socio dueño</label><select name="partner">${partnerOpts(p.partner)}</select></div>
    <div class="field full"><label>Tallas y colores</label>
      <div id="vrows" class="vrows">${p.variants.map(vrow).join("")}</div>
      <button type="button" class="btn sm" id="addVrow" style="align-self:flex-start">${I.plus} Agregar variante</button>
      <span class="hint">El stock no se edita aquí: se cambia con <b>Registrar entrada</b> para que quede en el historial. Solo se pueden quitar variantes sin stock y sin ventas.</span>
    </div>
    <button class="btn dark lg full" type="submit">Guardar cambios</button>
    <button type="button" class="btn ghost full" data-act="delprod" data-pid="${p.id}" ${p.variants.some(v => v.stock > 0 || sold(v.id)) ? "disabled title='Tiene stock o ventas registradas'" : ""}>Eliminar producto</button>
  </form>`, (f) => {
    const rows = [...document.querySelectorAll("#vrows .vrow")].map(r => ({ id: r.dataset.vrow, size: r.querySelector("[name=v_size]").value.trim(), color: r.querySelector("[name=v_color]").value.trim(), code: r.querySelector("[name=v_code]").value.trim() }));
    if (!rows.length) { toast("El producto necesita al menos una variante", true); return false; }
    const codes = rows.map(r => r.code).filter(Boolean);
    if (new Set(codes).size !== codes.length) { toast("Hay códigos repetidos", true); return false; }
    const clash = codes.find(c => DB.products.some(x => x.id !== p.id && x.variants.some(v => v.code === c)));
    if (clash) { toast(`El código ${clash} ya lo usa otro producto`, true); return false; }
    Object.assign(p, { name: f.get("name").trim(), cat: f.get("cat"), brand: f.get("brand"), cost: +f.get("cost"), price: +f.get("price"), partner: f.get("partner") });
    p.variants = rows.map(r => { const v = p.variants.find(x => x.id === r.id) || { id: uid(), stock: 0 }; return Object.assign(v, { size: r.size, color: r.color, code: r.code || newCode() }); });
    save(); render(); toast("Producto actualizado");
  });
  $("#addVrow").onclick = () => { $("#vrows").insertAdjacentHTML("beforeend", vrow(null)); $("#vrows .vrow:last-child input").focus(); };
  $("#vrows").onclick = (e) => { const b = e.target.closest("[data-delvrow]"); if (b && !b.disabled) b.closest(".vrow").remove(); };
}
function newProdModal() {
  modal(`<div class="modal-h"><h3>Nuevo producto</h3><button class="btn icon ghost" data-close>${I.x}</button></div>
  <form id="f" class="form">
  <div class="field full"><label>Nombre</label><input name="name" required placeholder="Ej. Falda plisada"></div>
  <div class="field"><label>Categoría</label><select name="cat">${DB.categories.map(c => `<option>${esc(c)}</option>`).join("")}</select></div>
  <div class="field"><label>Marca</label><select name="brand">${DB.brands.map(c => `<option>${esc(c)}</option>`).join("")}</select></div>
  <div class="field full"><label>Socio dueño</label><select name="partner">${partnerOpts(S.partner !== "all" ? S.partner : DB.partners[0].id)}</select></div>
  <div class="field"><label>Costo</label><input name="cost" type="number" min="0" required></div>
  <div class="field"><label>Precio de venta</label><input name="price" type="number" min="0" required></div>
  <div class="field"><label>Tallas (separadas por coma)</label><input name="sizes" value="S, M, L" required></div>
  <div class="field"><label>Colores (separados por coma)</label><input name="colors" value="Negro" required></div>
  <div class="field full"><label>Stock inicial por variante</label><input name="stock" type="number" min="0" value="0"></div>
  <button class="btn dark lg full" type="submit">Crear producto</button></form>`, (f) => {
    const sizes = f.get("sizes").split(",").map(s => s.trim()).filter(Boolean), colors = f.get("colors").split(",").map(s => s.trim()).filter(Boolean);
    const p = { id: uid(), partner: f.get("partner"), name: f.get("name"), cat: f.get("cat"), brand: f.get("brand"), cost: +f.get("cost"), price: +f.get("price"), variants: [] };
    DB.products.push(p);
    sizes.forEach(s => colors.forEach(c => p.variants.push({ id: uid(), size: s, color: c, stock: +f.get("stock"), code: newCode() })));
    DB.products.pop();
    DB.products.push(p); save(); render(); toast(`Producto "${p.name}" creado con ${p.variants.length} variantes`);
  });
}

/* ---------- Gastos ---------- */
function gastosView() {
  const list = scopedExp(DB.expenses).slice().sort((a, b) => b.at.localeCompare(a.at));
  const month = today().slice(0, 7);
  const mt = scopedExp(DB.expenses).filter(e => e.day.startsWith(month)).reduce((a, e) => a + e.amount, 0);
  const byCat = DB.expenseCats.map(c => ({ c, t: scopedExp(DB.expenses).filter(e => e.day.startsWith(month) && e.cat === c).reduce((a, e) => a + e.amount, 0) })).filter(x => x.t > 0).sort((a, b) => b.t - a.t);
  return topbar("Gastos", `Este mes: ${money(mt)}`, `<button class="btn dark" data-act="newexp">${I.plus}<span class="hide-m">Registrar gasto</span></button>`) + `
  <div class="content">${partnerSeg()}${S.partner !== "all" ? `<div class="hint">Gastos propios de ${esc(partnerById(S.partner).name)} más su ${partnerById(S.partner).share} % de los gastos compartidos.</div>` : ""}<div class="grid-2">
    <section class="card"><div class="card-h"><h2>Movimientos</h2></div><div class="tbl-wrap"><table><thead><tr><th>Fecha</th><th>Categoría</th><th>Detalle</th><th>Socio</th><th>Registró</th><th class="r">Monto</th></tr></thead><tbody>
    ${list.map(e => `<tr><td>${fmtD(e.at)}</td><td><span class="chip">${esc(e.cat)}</span></td><td>${esc(e.note)}</td><td>${partnerChip(e.partner || "shared")}</td><td>${esc(userById(e.by).name)}</td><td class="r"><b>${money(e.amount)}</b></td></tr>`).join("") || `<tr><td colspan="6" class="empty">Sin gastos</td></tr>`}</tbody></table></div></section>
    <section class="card"><div class="card-h"><h2>Por categoría</h2><span class="hint">este mes</span></div><div class="card-b" style="display:flex;flex-direction:column;gap:14px">
    ${byCat.map(x => `<div style="display:flex;flex-direction:column;gap:6px"><div class="row" style="padding:0;border:none"><span>${esc(x.c)}</span><b>${money(x.t)}</b></div><div class="bar"><i style="width:${x.t / mt * 100}%"></i></div></div>`).join("") || `<div class="empty">Sin gastos este mes</div>`}</div></section>
  </div></div>`;
}
function newExpModal() {
  modal(`<div class="modal-h"><h3>Registrar gasto</h3><button class="btn icon ghost" data-close>${I.x}</button></div>
  <form id="f" class="form"><div class="field"><label>Categoría</label><select name="cat">${DB.expenseCats.map(c => `<option>${esc(c)}</option>`).join("")}</select></div>
  <div class="field"><label>Monto</label><input name="amount" type="number" min="1" required></div>
  <div class="field full"><label>¿De quién es el gasto?</label><select name="partner">${partnerOpts("shared", true)}</select></div>
  <div class="field full"><label>Detalle</label><input name="note" placeholder="Ej. Pago de luz noviembre" required></div>
  <div class="field full"><label>Comprobante (foto)</label><input name="photo" type="file" accept="image/*" capture="environment"></div>
  <button class="btn dark lg full" type="submit">Guardar gasto</button></form>`, (f) => {
    DB.expenses.push({ id: uid(), at: new Date().toISOString(), day: today(), cat: f.get("cat"), amount: +f.get("amount"), note: f.get("note"), partner: f.get("partner"), by: me.id }); save(); render(); toast("Gasto registrado");
  });
}

/* ---------- Reportes ---------- */
function rangeDays() {
  const n = S.repRange === "hoy" ? 1 : S.repRange === "semana" ? 7 : 30;
  const out = []; for (let i = n - 1; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); out.push(dayOf(d)); } return out;
}
function repData() {
  const days = rangeDays(), set = new Set(days);
  const s = scoped(DB.sales.filter(x => set.has(x.day) && x.status === "cerrada")), e = scopedExp(DB.expenses.filter(x => set.has(x.day)));
  const total = s.reduce((a, x) => a + x.total, 0), gross = s.reduce((a, x) => a + x.subtotal, 0), cost = s.reduce((a, x) => a + x.items.reduce((b, i) => b + i.cost * i.qty, 0), 0), exp = e.reduce((a, x) => a + x.amount, 0), disc = s.reduce((a, x) => a + (x.discount ? x.discount.amount : 0), 0);
  // líneas: el descuento del ticket se prorratea por línea según su peso
  const lines = []; s.forEach(x => { const f = x.subtotal ? x.total / x.subtotal : 1; x.items.forEach(i => lines.push({ ...i, sale: x, gross: i.price * i.qty, net: Math.round(i.price * i.qty * f), disc: Math.round(i.price * i.qty * (1 - f)), costT: i.cost * i.qty, partner: itemPartner(i), cat: (prodById(i.pid) || {}).cat || "—", brand: (prodById(i.pid) || {}).brand || "—" })); });
  const group = (key) => { const m = {}; lines.forEach(l => { const k = key(l); m[k] = m[k] || { k, q: 0, gross: 0, disc: 0, net: 0, cost: 0, n: new Set() }; const g = m[k]; g.q += l.qty; g.gross += l.gross; g.disc += l.disc; g.net += l.net; g.cost += l.costT; g.n.add(l.sale.id); }); return Object.values(m).map(g => ({ ...g, n: g.n.size, margin: g.net - g.cost, pct: g.net ? (g.net - g.cost) / g.net * 100 : 0 })).sort((a, b) => b.net - a.net); };
  return { days, s, e, total, gross, cost, exp, disc, lines, group };
}
function repView() {
  const D = repData(); const { days, s, e, total, gross, cost, exp, disc } = D;
  const tab = S.repTab || "resumen"; const P = can("canSeeProfit");
  const tabs = [["resumen", "Resumen"], ...(DB.partners.length > 1 ? [["socios", "Socios"]] : []), ["producto", "Por producto"], ["categoria", "Categorías"], ["vendedora", "Vendedoras"], ["tickets", "Tickets"], ["inventario", "Inventario"], ["movimientos", "Movimientos"]];
  const mcell = (g) => P ? `<td class="r">${money(g.margin)}</td><td class="r"><span class="chip ${g.pct >= 40 ? "green" : g.pct >= 20 ? "" : "red"}">${g.pct.toFixed(0)} %</span></td>` : "";
  const mhead = P ? `<th class="r">Margen</th><th class="r">%</th>` : "";
  const tbl = (head, rows, empty = "Sin datos") => `<div class="tbl-wrap"><table><thead><tr>${head}</tr></thead><tbody>${rows.join("") || `<tr><td colspan="12" class="empty">${empty}</td></tr>`}</tbody></table></div>`;
  const perDay = days.map(d => s.filter(x => x.day === d).reduce((a, x) => a + x.total, 0)); const pmax = Math.max(1, ...perDay);
  let body = "";
  if (tab === "resumen") {
    const byPay = DB.payMethods.map(m => ({ m, t: s.filter(x => x.pay === m).reduce((a, x) => a + x.total, 0) }));
    const hours = Array.from({ length: 12 }, (_, i) => s.filter(x => new Date(x.at).getHours() === 9 + i).reduce((a, x) => a + x.total, 0)); const hmax = Math.max(1, ...hours);
    const topL = D.group(l => l.name).slice(0, 5);
    body = `<section class="kpis">
      <div class="card kpi"><div class="lbl">Venta bruta</div><div class="val">${money(gross)}</div><div class="foot">${s.length} tickets · ${D.lines.reduce((a, l) => a + l.qty, 0)} piezas</div></div>
      <div class="card kpi"><div class="lbl">Descuentos</div><div class="val red">− ${money(disc)}</div><div class="foot">${gross ? (disc / gross * 100).toFixed(1) : 0} % de la venta bruta</div></div>
      <div class="card kpi"><div class="lbl">Venta neta</div><div class="val">${money(total)}</div><div class="foot">Ticket promedio ${money(s.length ? total / s.length : 0)}</div></div>
      ${P ? `<div class="card kpi"><div class="lbl">Utilidad bruta</div><div class="val" style="color:var(--green)">${money(total - cost)}</div><div class="foot">Margen ${total ? ((total - cost) / total * 100).toFixed(0) : 0} % · costo ${money(cost)}</div></div>` : `<div class="card kpi"><div class="lbl">Piezas por ticket</div><div class="val">${s.length ? (D.lines.reduce((a, l) => a + l.qty, 0) / s.length).toFixed(1) : 0}</div><div class="foot">promedio</div></div>`}
    </section>
    ${P ? `<section class="card"><div class="card-h"><h2>Estado de resultados del período</h2></div><div class="card-b list" style="padding-top:4px;padding-bottom:4px">
      <div class="row"><span>Venta bruta</span><b>${money(gross)}</b></div><div class="row"><span>− Descuentos</span><b style="color:var(--red)">− ${money(disc)}</b></div><div class="row"><span>= Venta neta</span><b>${money(total)}</b></div>
      <div class="row"><span>− Costo de mercadería vendida</span><b>− ${money(cost)}</b></div><div class="row"><span>= Utilidad bruta</span><b>${money(total - cost)}</b></div>
      <div class="row"><span>− Gastos operativos (${e.length})</span><b>− ${money(exp)}</b></div><div class="row" style="border-top:2px solid var(--ink)"><span style="font-weight:700">= Utilidad neta</span><b style="color:${total - cost - exp >= 0 ? "var(--green)" : "var(--red)"};font-size:16px">${money(total - cost - exp)}</b></div></div></section>` : ""}
    <section class="card"><div class="card-h"><h2>Ventas por día</h2></div><div class="card-b"><div class="mini-chart" style="height:120px">${perDay.map((v, i) => `<i class="${i === perDay.length - 1 ? "red" : ""}" style="height:${v / pmax * 100}%" title="${days[i]} · ${money(v)}"></i>`).join("")}</div><div class="row" style="border:none;padding:6px 0 0"><span class="hint">${fmtD(days[0])}</span><span class="hint">${fmtD(days[days.length - 1])}</span></div></div></section>
    <div class="grid-2" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">
      <section class="card"><div class="card-h"><h2>Más vendidos</h2></div>${tbl(`<th>Producto</th><th class="r">Uds.</th><th class="r">Neto</th>`, topL.map(g => `<tr><td><b>${esc(g.k)}</b></td><td class="r">${g.q}</td><td class="r">${money(g.net)}</td></tr>`))}</section>
      <section class="card"><div class="card-h"><h2>Ventas por hora</h2><span class="hint">9 h – 20 h</span></div><div class="card-b"><div class="mini-chart" style="height:100px">${hours.map((h, i) => `<i class="${h === hmax && h > 0 ? "red" : ""}" style="height:${h / hmax * 100}%" title="${9 + i}:00 · ${money(h)}"></i>`).join("")}</div></div></section>
      <section class="card"><div class="card-h"><h2>Formas de pago</h2></div><div class="card-b" style="display:flex;flex-direction:column;gap:14px">${byPay.map(x => `<div style="display:flex;flex-direction:column;gap:6px"><div class="row" style="padding:0;border:none"><span>${esc(x.m)}</span><b>${money(x.t)} <span class="hint">${total ? (x.t / total * 100).toFixed(0) : 0} %</span></b></div><div class="bar"><i style="width:${total ? x.t / total * 100 : 0}%"></i></div></div>`).join("")}</div></section>
    </div>`;
  } else if (tab === "socios") {
    const set = new Set(days), all = DB.sales.filter(x => set.has(x.day) && x.status === "cerrada"), allE = DB.expenses.filter(x => set.has(x.day));
    const rows = DB.partners.map(p => {
      const ps = all.map(x => scopeSale(x, p.id)).filter(Boolean);
      const gross = ps.reduce((a, x) => a + x.subtotal, 0), net = ps.reduce((a, x) => a + x.total, 0), c = ps.reduce((a, x) => a + x.items.reduce((b, i) => b + i.cost * i.qty, 0), 0);
      const own = allE.filter(x => x.partner === p.id).reduce((a, x) => a + x.amount, 0), shared = allE.filter(x => !x.partner || x.partner === "shared").reduce((a, x) => a + Math.round(x.amount * (p.share || 0) / 100), 0);
      const stockC = DB.products.filter(x => x.partner === p.id).reduce((a, x) => a + x.variants.reduce((b, v) => b + v.stock * x.cost, 0), 0);
      return { p, n: ps.length, q: ps.reduce((a, x) => a + x.items.reduce((b, i) => b + i.qty, 0), 0), gross, disc: gross - net, net, c, own, shared, util: net - c - own - shared, stockC };
    });
    const tot = (k) => rows.reduce((a, r) => a + r[k], 0);
    body = `<section class="kpis" style="grid-template-columns:repeat(${Math.min(4, rows.length)},minmax(0,1fr))">${rows.map(r => `<div class="card kpi"><div class="lbl"><span class="who">${pDot(r.p.id)}${esc(r.p.name)}</span><span class="chip">${tot("net") ? (r.net / tot("net") * 100).toFixed(0) : 0} %</span></div><div class="val">${money(r.net)}</div><div class="foot">${r.q} piezas · ${r.n} tickets${P ? ` · utilidad <b style="color:${r.util >= 0 ? "var(--green)" : "var(--red)"}">${money(r.util)}</b>` : ""}</div></div>`).join("")}</section>
    <section class="card"><div class="card-h"><h2>Liquidación por socio</h2><span class="hint">${days.length === 1 ? "hoy" : "últimos " + days.length + " días"}</span></div>${tbl(`<th>Socio</th><th class="r">Tickets</th><th class="r">Piezas</th><th class="r">Bruto</th><th class="r">Desc.</th><th class="r">Venta neta</th>${P ? `<th class="r">Costo</th><th class="r">Util. bruta</th><th class="r">Gastos propios</th><th class="r">Gastos compartidos</th><th class="r">Utilidad neta</th><th class="r">Inventario al costo</th>` : ""}`,
      rows.map(r => `<tr><td><span class="who">${pDot(r.p.id)}<b>${esc(r.p.name)}</b></span></td><td class="r">${r.n}</td><td class="r">${r.q}</td><td class="r">${money(r.gross)}</td><td class="r" style="color:var(--red)">${r.disc ? "− " + money(r.disc) : "—"}</td><td class="r"><b>${money(r.net)}</b></td>${P ? `<td class="r">${money(r.c)}</td><td class="r">${money(r.net - r.c)}</td><td class="r">${money(r.own)}</td><td class="r">${money(r.shared)} <span class="hint">${r.p.share} %</span></td><td class="r"><b style="color:${r.util >= 0 ? "var(--green)" : "var(--red)"}">${money(r.util)}</b></td><td class="r">${money(r.stockC)}</td>` : ""}</tr>`).concat([`<tr class="tot"><td><b>Consolidado</b></td><td class="r">${all.length}</td><td class="r">${tot("q")}</td><td class="r">${money(tot("gross"))}</td><td class="r" style="color:var(--red)">− ${money(tot("disc"))}</td><td class="r"><b>${money(tot("net"))}</b></td>${P ? `<td class="r">${money(tot("c"))}</td><td class="r">${money(tot("net") - tot("c"))}</td><td class="r">${money(tot("own"))}</td><td class="r">${money(tot("shared"))}</td><td class="r"><b>${money(tot("util"))}</b></td><td class="r">${money(tot("stockC"))}</td>` : ""}</tr>`]))}
      <div class="card-b hint">La <b>venta neta</b> es lo cobrado por la mercadería de cada socio (si un ticket tiene prendas de ambos, se reparte y el descuento se prorratea). Los gastos compartidos se reparten según el % de cada socio, configurable en Catálogos → Socios.</div></section>`;
  } else if (tab === "producto") {
    const g = D.group(l => l.name); const gv = D.group(l => `${l.name} · ${l.size} ${l.color}`);
    body = `<section class="card"><div class="card-h"><h2>Ventas por producto</h2><span class="hint">${g.length} productos</span></div>${tbl(`<th>Producto</th><th class="r">Uds.</th><th class="r">Tickets</th><th class="r">Bruto</th><th class="r">Desc.</th><th class="r">Neto</th>${P ? `<th class="r">Costo</th>` : ""}${mhead}`, g.map(x => `<tr><td><b>${esc(x.k)}</b></td><td class="r">${x.q}</td><td class="r">${x.n}</td><td class="r">${money(x.gross)}</td><td class="r" style="color:var(--red)">${x.disc ? "− " + money(x.disc) : "—"}</td><td class="r"><b>${money(x.net)}</b></td>${P ? `<td class="r">${money(x.cost)}</td>` : ""}${mcell(x)}</tr>`))}</section>
    <section class="card"><div class="card-h"><h2>Detalle por talla y color</h2></div>${tbl(`<th>Variante</th><th class="r">Uds.</th><th class="r">Neto</th>${mhead}`, gv.map(x => `<tr><td>${esc(x.k)}</td><td class="r">${x.q}</td><td class="r">${money(x.net)}</td>${mcell(x)}</tr>`))}</section>`;
  } else if (tab === "categoria") {
    const g = D.group(l => l.cat), gb = D.group(l => l.brand); const mx = Math.max(1, ...g.map(x => x.net));
    body = `<div class="grid-2" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr))">
    <section class="card"><div class="card-h"><h2>Por categoría</h2></div><div class="card-b" style="display:flex;flex-direction:column;gap:14px">${g.map(x => `<div style="display:flex;flex-direction:column;gap:6px"><div class="row" style="padding:0;border:none"><span><b>${esc(x.k)}</b> <span class="hint">${x.q} uds.</span></span><b>${money(x.net)}${P ? ` <span class="chip ${x.pct >= 40 ? "green" : ""}">${x.pct.toFixed(0)} %</span>` : ""}</b></div><div class="bar"><i style="width:${x.net / mx * 100}%"></i></div></div>`).join("") || `<div class="empty">Sin datos</div>`}</div></section>
    <section class="card"><div class="card-h"><h2>Por marca</h2></div>${tbl(`<th>Marca</th><th class="r">Uds.</th><th class="r">Neto</th>${mhead}`, gb.map(x => `<tr><td><b>${esc(x.k)}</b></td><td class="r">${x.q}</td><td class="r">${money(x.net)}</td>${mcell(x)}</tr>`))}</section></div>`;
  } else if (tab === "vendedora") {
    const rows = DB.users.map(u => { const m = s.filter(x => x.seller === u.id); const ls = D.lines.filter(l => l.sale.seller === u.id); const net = m.reduce((a, x) => a + x.total, 0), c = ls.reduce((a, l) => a + l.costT, 0); return { u, n: m.length, q: ls.reduce((a, l) => a + l.qty, 0), gross: m.reduce((a, x) => a + x.subtotal, 0), disc: m.reduce((a, x) => a + (x.discount ? x.discount.amount : 0), 0), nd: m.filter(x => x.discount).length, pin: m.filter(x => x.discount && x.discount.type === "pin").length, net, margin: net - c, pct: net ? (net - c) / net * 100 : 0 }; }).filter(x => x.n).sort((a, b) => b.net - a.net);
    body = `<section class="card"><div class="card-h"><h2>Desempeño por vendedora</h2></div>${tbl(`<th>Vendedora</th><th class="r">Tickets</th><th class="r">Piezas</th><th class="r">Bruto</th><th class="r">Descuentos</th><th class="r">Con desc.</th><th class="r">Con PIN</th><th class="r">Neto</th><th class="r">Ticket prom.</th>${mhead}`, rows.map(x => `<tr><td><span class="who"><span class="avatar ${x.u.role === "propietaria" ? "red" : x.u.role === "vendedor" ? "grey" : ""}">${esc(x.u.name[0])}</span><b>${esc(x.u.name)}</b></span></td><td class="r">${x.n}</td><td class="r">${x.q}</td><td class="r">${money(x.gross)}</td><td class="r" style="color:var(--red)">${x.disc ? "− " + money(x.disc) : "—"}</td><td class="r">${x.nd} <span class="hint">(${(x.nd / x.n * 100).toFixed(0)} %)</span></td><td class="r">${x.pin}</td><td class="r"><b>${money(x.net)}</b></td><td class="r">${money(x.net / x.n)}</td>${mcell(x)}</tr>`))}</section>
    <section class="card"><div class="card-h"><h2>Descuentos otorgados</h2><span class="hint">quién, cuánto y por qué</span></div>${tbl(`<th>Fecha</th><th>Ticket</th><th>Vendedora</th><th>Tipo</th><th class="r">%</th><th class="r">Monto</th><th>Autorizó</th>`, s.filter(x => x.discount).slice().reverse().map(x => `<tr><td>${fmtD(x.at)} ${fmtT(x.at)}</td><td>#${x.n}</td><td>${esc(userById(x.seller).name)}</td><td>${discChip(x.discount)}</td><td class="r">${x.discount.pct} %</td><td class="r" style="color:var(--red)">− ${money(x.discount.amount)}</td><td>${x.discount.type === "pin" ? esc(userById(x.discount.by).name) : x.discount.type === "codigo" ? "Código" : "Dentro de límite"}</td></tr>`), "Sin descuentos en el período")}</section>`;
  } else if (tab === "tickets") {
    body = `<section class="card"><div class="card-h"><h2>Tickets del período</h2><span class="hint">${s.length} ventas</span></div>${tbl(`<th>Fecha</th><th>Ticket</th><th>Vendedora</th><th>Artículos</th><th>Pago</th><th class="r">Bruto</th><th class="r">Desc.</th><th class="r">Total</th>`, s.slice().reverse().map(x => `<tr><td>${fmtD(x.at)} <span class="hint">${fmtT(x.at)}</span></td><td>#${x.n}</td><td>${esc(userById(x.seller).name)}</td><td>${esc(x.items.map(i => `${i.qty > 1 ? i.qty + " × " : ""}${i.name} ${i.size} ${i.color}`).join(", "))}</td><td><span class="chip">${esc(x.pay)}</span></td><td class="r">${money(x.subtotal)}</td><td class="r" style="color:var(--red)">${x.discount ? "− " + money(x.discount.amount) : "—"}</td><td class="r"><b>${money(x.total)}</b></td></tr>`))}</section>`;
  } else if (tab === "inventario") {
    const rows = DB.products.filter(inPartner).map(p => { const st = p.variants.reduce((a, v) => a + v.stock, 0); const sold = D.lines.filter(l => l.pid === p.id).reduce((a, l) => a + l.qty, 0); return { p, st, sold, costV: st * p.cost, priceV: st * p.price, low: p.variants.filter(v => v.stock <= DB.settings.lowStock).length, days: sold ? Math.round(st / (sold / days.length)) : null }; }).sort((a, b) => b.priceV - a.priceV);
    const tc = rows.reduce((a, r) => a + r.costV, 0), tp = rows.reduce((a, r) => a + r.priceV, 0), tu = rows.reduce((a, r) => a + r.st, 0);
    body = `<section class="kpis"><div class="card kpi"><div class="lbl">Piezas en stock</div><div class="val">${tu}</div><div class="foot">${DB.products.length} productos · ${DB.products.reduce((a, p) => a + p.variants.length, 0)} variantes</div></div>
      ${P ? `<div class="card kpi"><div class="lbl">Valor al costo</div><div class="val">${money(tc)}</div><div class="foot">dinero invertido en mercadería</div></div>` : ""}
      <div class="card kpi"><div class="lbl">Valor a precio de venta</div><div class="val">${money(tp)}</div><div class="foot">${P ? "ganancia potencial " + money(tp - tc) : "si se vende todo"}</div></div>
      <div class="card kpi"><div class="lbl">Variantes en stock bajo</div><div class="val red">${lowStock().length}</div><div class="foot">${lowStock().filter(x => x.v.stock === 0).length} agotadas</div></div></section>
    <section class="card"><div class="card-h"><h2>Inventario valorizado y rotación</h2><span class="hint">vendido en el período seleccionado</span></div>${tbl(`<th>Producto</th><th class="r">Stock</th><th class="r">Vendidas</th><th class="r">Días de stock</th>${P ? `<th class="r">Valor costo</th>` : ""}<th class="r">Valor venta</th><th>Alertas</th>`, rows.map(r => `<tr><td><b>${esc(r.p.name)}</b> <span class="hint">${esc(r.p.cat)}</span></td><td class="r">${r.st}</td><td class="r">${r.sold}</td><td class="r">${r.days == null ? "<span class='hint'>sin ventas</span>" : r.days < 7 ? `<span class="chip red">${r.days} d</span>` : r.days + " d"}</td>${P ? `<td class="r">${money(r.costV)}</td>` : ""}<td class="r">${money(r.priceV)}</td><td>${r.low ? `<span class="chip red">${r.low} variante${r.low > 1 ? "s" : ""}</span>` : `<span class="chip green">OK</span>`}</td></tr>`))}</section>`;
  } else if (tab === "movimientos") {
    const set = new Set(days); const mv = DB.moves.filter(m => set.has(dayOf(new Date(m.at))) && (S.partner === "all" || (m.partner || (varById(m.vid) || { p: {} }).p.partner) === S.partner)).slice().reverse();
    const lbl = { venta: "Venta", compra: "Compra", ajuste: "Ajuste", devolucion: "Devolución" };
    body = `<section class="card"><div class="card-h"><h2>Movimientos de inventario (kárdex)</h2><span class="hint">${mv.length} movimientos</span></div>${tbl(`<th>Fecha</th><th>Producto</th><th>Socio</th><th>Tipo</th><th class="r">Cantidad</th><th>Usuario</th><th>Ref.</th>`, mv.map(m => { const r = varById(m.vid); return `<tr><td>${fmtD(m.at)} <span class="hint">${fmtT(m.at)}</span></td><td><b>${r ? esc(r.p.name) : "—"}</b> <span class="hint">${r ? esc(r.v.size + " " + r.v.color) : ""}</span></td><td>${partnerChip(m.partner || (r ? r.p.partner : "s1"))}</td><td><span class="chip ${m.qty < 0 ? "" : "green"}">${lbl[m.type] || m.type}</span></td><td class="r" style="font-weight:700;color:${m.qty < 0 ? "var(--red)" : "var(--green)"}">${m.qty > 0 ? "+" : ""}${m.qty}</td><td>${esc(userById(m.by).name)}</td><td class="hint">${m.ref ? "Ticket #" + m.ref : "—"}</td></tr>`; }), "Sin movimientos registrados en el período (las ventas de ejemplo no generan kárdex; las nuevas sí)")}</section>`;
  }
  return topbar("Reportes", `${S.partner === "all" ? "Consolidado" : esc(partnerById(S.partner).name)} · ${days.length === 1 ? "hoy" : "últimos " + days.length + " días"} · ${s.length} ventas`, `<button class="btn" data-act="csv">${I.down}<span class="hide-m">Exportar CSV</span></button>`) + `
  <div class="content">
    <div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:space-between;align-items:center">
      ${tab !== "socios" ? partnerSeg() : ""}<div class="seg">${[["hoy", "Hoy"], ["semana", "7 días"], ["mes", "30 días"]].map(([k, l]) => `<button data-rep="${k}" class="${S.repRange === k ? "on" : ""}">${l}</button>`).join("")}</div>
      <div class="seg" style="overflow-x:auto;flex-wrap:nowrap">${tabs.map(([k, l]) => `<button data-reptab="${k}" class="${tab === k ? "on red" : ""}">${l}</button>`).join("")}</div>
    </div>
    ${body}
  </div>`;
}
function exportCSV() {
  const set = new Set(rangeDays());
  const rows = [["ticket", "fecha", "hora", "vendedora", "articulos", "subtotal", "descuento_tipo", "descuento_monto", "total", "pago"]];
  scoped(DB.sales.filter(x => set.has(x.day))).forEach(x => rows.push([x.n, x.day, fmtT(x.at), userById(x.seller).name, x.items.map(i => `${i.qty}x ${i.name} ${i.size} ${i.color}`).join(" | "), x.subtotal, x.discount ? x.discount.type : "", x.discount ? x.discount.amount : 0, x.total, x.pay]));
  const D = repData(); rows.push([], ["producto", "socio", "unidades", "bruto", "descuento", "neto", "costo", "margen", "margen_pct"]);
  D.group(l => l.name + "\u0001" + l.partner).forEach(g => rows.push([g.k.split("\u0001")[0], partnerById(g.k.split("\u0001")[1]).name, g.q, g.gross, g.disc, g.net, can("canSeeProfit") ? g.cost : "", can("canSeeProfit") ? g.margin : "", can("canSeeProfit") ? g.pct.toFixed(1) : ""]));
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" })); a.download = `ventas-${S.partner === "all" ? "consolidado" : partnerById(S.partner).name.replace(/\W+/g, "-").toLowerCase()}-${S.repRange}.csv`; a.click();
}

/* ---------- Catálogos ---------- */
function catView() {
  const list = (title, key, items, render) => `<section class="card"><div class="card-h"><h2>${title}</h2>${can("canEditCatalog") ? `<button class="btn sm" data-addcat="${key}">${I.plus} Agregar</button>` : ""}</div><div class="card-b list" style="padding-top:4px;padding-bottom:4px">${items.map((it, i) => `<div class="row">${render(it)}${can("canEditCatalog") ? `<button class="btn ghost sm" data-delcat="${key}|${i}">${I.x}</button>` : ""}</div>`).join("")}</div></section>`;
  return topbar("Catálogos", "Listas que usa toda la app", me.role === "propietaria" ? `<button class="btn ghost" data-act="reset" title="Vuelve a los datos de ejemplo">Reiniciar demo</button>` : "") + `
  <div class="content"><div class="grid-2" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">
    <section class="card"><div class="card-h"><h2>Ajustes</h2></div><form id="settingsForm" class="card-b form">
      <div class="field"><label>Nombre de la tienda</label><input name="store" value="${esc(DB.settings.store)}"></div>
      <div class="field"><label>Moneda</label><input name="currency" value="${esc(DB.settings.currency)}" maxlength="3"></div>
      <div class="field"><label>Alerta de stock bajo (≤)</label><input name="lowStock" type="number" min="0" value="${DB.settings.lowStock}"></div>
      <div class="field"><label>Margen mínimo sobre costo (%)</label><input name="minMargin" type="number" min="0" value="${DB.settings.minMargin}"></div>
      <div class="field"><label>Código de país para WhatsApp</label><input name="waCountry" inputmode="numeric" value="${esc(DB.settings.waCountry)}"></div>
      <div class="field"><label>Servidor del escáner celular</label><input name="relay" value="${esc(DB.settings.relay)}"></div>
      <div class="full"><button class="btn dark" type="submit" ${can("canEditCatalog") ? "" : "disabled"}>Guardar ajustes</button></div></form></section>
    <section class="card"><div class="card-h"><h2>Socios</h2>${can("canEditCatalog") ? `<button class="btn sm" data-act="newpartner">${I.plus} Agregar</button>` : ""}</div><div class="card-b list" style="padding-top:4px;padding-bottom:4px">
      ${DB.partners.map(p => { const np = DB.products.filter(x => x.partner === p.id).length; return `<div class="row"><span class="who">${pDot(p.id)}<span><span class="t">${esc(p.name)}</span><span class="s">${np} productos · asume ${p.share} % de gastos compartidos</span></span></span>${can("canEditCatalog") ? `<button class="btn ghost sm" data-editpartner="${p.id}">Editar</button>` : ""}</div>`; }).join("")}
      ${DB.partners.reduce((a, p) => a + (+p.share || 0), 0) !== 100 ? `<div class="err" style="padding:8px 0">Los % de gastos compartidos suman ${DB.partners.reduce((a, p) => a + (+p.share || 0), 0)} %; deberían sumar 100 %.</div>` : ""}
    </div></section>
    ${list("Códigos de descuento", "discountCodes", DB.discountCodes, d => `<span><span class="t">${esc(d.code)}</span><span class="s">${d.pct} % · ${d.uses} de ${d.maxUses} usos</span></span><span class="chip ${d.active && d.uses < d.maxUses ? "green" : "red"}">${d.active && d.uses < d.maxUses ? "Activo" : "Agotado"}</span>`)}
    <section class="card"><div class="card-h"><h2>Límites de descuento por rol</h2></div><div class="card-b list" style="padding-top:4px;padding-bottom:4px">${Object.entries(DB.roles).map(([k, r]) => `<div class="row"><span class="t">${esc(r.label)}</span>${me.role === "propietaria" ? `<span class="qty"><button data-lim="${k}|-5">−</button><b style="width:48px">${r.maxDisc} %</b><button class="plus" data-lim="${k}|5">+</button></span>` : `<span class="chip">${r.maxDisc} %</span>`}</div>`).join("")}</div></section>
    ${list("Categorías", "categories", DB.categories, c => `<span class="t">${esc(c)}</span>`)}
    ${list("Marcas", "brands", DB.brands, c => `<span class="t">${esc(c)}</span>`)}
    ${list("Formas de pago", "payMethods", DB.payMethods, c => `<span class="t">${esc(c)}</span>`)}
    ${list("Categorías de gasto", "expenseCats", DB.expenseCats, c => `<span class="t">${esc(c)}</span>`)}
  </div></div>`;
}
function addCatModal(key) {
  if (key === "discountCodes") {
    return modal(`<div class="modal-h"><h3>Nuevo código</h3><button class="btn icon ghost" data-close>${I.x}</button></div><form id="f" class="form">
      <div class="field"><label>Código</label><input name="code" required style="text-transform:uppercase"></div><div class="field"><label>Porcentaje</label><input name="pct" type="number" min="1" max="90" required></div>
      <div class="field full"><label>Usos máximos</label><input name="max" type="number" min="1" value="50"></div><button class="btn dark lg full">Crear</button></form>`, f => { DB.discountCodes.push({ code: f.get("code").toUpperCase().trim(), pct: +f.get("pct"), maxUses: +f.get("max"), uses: 0, active: true }); save(); render(); });
  }
  modal(`<div class="modal-h"><h3>Agregar</h3><button class="btn icon ghost" data-close>${I.x}</button></div><form id="f" class="form"><div class="field full"><label>Nombre</label><input name="v" required autofocus></div><button class="btn dark lg full">Agregar</button></form>`, f => { DB[key].push(f.get("v").trim()); save(); render(); });
}

function partnerModal(id) {
  const p = id ? partnerById(id) : { name: "", share: 0, color: "#4A6FA5" };
  const np = id ? DB.products.filter(x => x.partner === id).length : 0;
  modal(`<div class="modal-h"><h3>${id ? "Editar socio" : "Nuevo socio"}</h3><button class="btn icon ghost" data-close>${I.x}</button></div><form id="f" class="form">
    <div class="field full"><label>Nombre</label><input name="name" required value="${esc(p.name)}"></div>
    <div class="field"><label>% de gastos compartidos</label><input name="share" type="number" min="0" max="100" value="${+p.share || 0}"></div>
    <div class="field"><label>Color</label><input name="color" type="color" value="${esc(p.color || "#4A6FA5")}" style="padding:4px"></div>
    <button class="btn dark lg full">${id ? "Guardar" : "Crear socio"}</button>
    ${id && np === 0 && DB.partners.length > 1 ? `<button type="button" class="btn ghost full" data-delpartner="${id}">Eliminar socio</button>` : id ? `<div class="hint full">Tiene ${np} productos asignados; para eliminarlo primero pasá sus productos a otro socio.</div>` : ""}
  </form>`, f => {
    const v = { name: f.get("name").trim(), share: +f.get("share"), color: f.get("color") };
    if (id) Object.assign(DB.partners.find(x => x.id === id), v); else DB.partners.push({ id: "s" + uid(), ...v });
    save(); render(); toast(id ? "Socio actualizado" : "Socio creado");
  });
}

/* ---------- Usuarios ---------- */
function usersView() {
  return topbar("Usuarios", `${DB.users.filter(u => u.active).length} de 3 activos`, DB.users.length < 3 ? `<button class="btn dark" data-act="newuser">${I.plus}<span class="hide-m">Nuevo usuario</span></button>` : "") + `
  <div class="content"><section class="card"><div class="tbl-wrap"><table><thead><tr><th>Usuario</th><th>Correo</th><th>Rol</th><th>Límite desc.</th><th>Estado</th><th></th></tr></thead><tbody>
  ${DB.users.map(u => `<tr><td><span class="who"><span class="avatar ${u.role === "propietaria" ? "red" : u.role === "vendedor" ? "grey" : ""}">${esc(u.name.slice(0, 2).toUpperCase())}</span><b>${esc(u.name)}</b></span></td><td style="color:var(--muted)">${esc(u.email)}</td>
    <td>${u.id === me.id ? `<span class="chip">${esc(DB.roles[u.role].label)}</span>` : `<select data-role="${u.id}" style="height:32px;border:1px solid var(--line);border-radius:8px;padding:0 8px">${Object.entries(DB.roles).map(([k, r]) => `<option value="${k}" ${u.role === k ? "selected" : ""}>${esc(r.label)}</option>`).join("")}</select>`}</td>
    <td>${DB.roles[u.role].maxDisc} %</td><td><span class="chip ${u.active ? "green" : "red"}">${u.active ? "Activo" : "Inactivo"}</span></td>
    <td class="r">${u.id !== me.id ? `<button class="btn sm" data-toggle="${u.id}">${u.active ? "Desactivar" : "Activar"}</button>` : `<span class="hint">vos</span>`}</td></tr>`).join("")}
  </tbody></table></div></section>
  <section class="card"><div class="card-h"><h2>Qué puede hacer cada rol</h2></div><div class="tbl-wrap"><table><thead><tr><th>Acción</th>${Object.values(DB.roles).map(r => `<th>${esc(r.label)}</th>`).join("")}</tr></thead><tbody>
  ${[["Registrar ventas", () => true], ["Descuento dentro de su límite", () => true], ["Descuento mayor (con PIN)", r => r.maxDisc >= 100 ? "Autoriza" : "Pide PIN"], ["Panel en tiempo real", r => r.views.includes("panel") ? (r.canSeeProfit ? "Completo" : "Sin utilidad") : false], ["Entradas de inventario", r => r.canStockIn], ["Registrar gastos", r => r.canExpense], ["Reportes", r => r.views.includes("reportes")], ["Ver utilidad", r => r.canSeeProfit], ["Editar catálogos", r => r.canEditCatalog], ["Usuarios y límites", r => r.canUsers]].map(([a, f]) => `<tr><td>${a}</td>${Object.values(DB.roles).map(r => { const v = f(r); return `<td>${v === true ? `<span class="chip green">Sí</span>` : v === false ? `<span class="chip">No</span>` : `<span class="chip">${v}</span>`}</td>`; }).join("")}</tr>`).join("")}
  </tbody></table></div></section></div>`;
}
function newUserModal() {
  modal(`<div class="modal-h"><h3>Nuevo usuario</h3><button class="btn icon ghost" data-close>${I.x}</button></div><form id="f" class="form">
  <div class="field"><label>Nombre</label><input name="name" required></div><div class="field"><label>Correo</label><input name="email" type="email" required></div>
  <div class="field"><label>Rol</label><select name="role">${Object.entries(DB.roles).map(([k, r]) => `<option value="${k}">${esc(r.label)}</option>`).join("")}</select></div>
  <div class="field"><label>Contraseña</label><input name="pass" value="1234" required></div><button class="btn dark lg full">Crear usuario</button></form>`, f => { DB.users.push({ id: uid(), name: f.get("name"), email: f.get("email"), role: f.get("role"), pass: f.get("pass"), pin: "", active: true }); save(); render(); });
}

/* ---------- PIN / código ---------- */
function pinModal(onOk) {
  let pin = "";
  const draw = () => { $("#pindots").innerHTML = [0, 1, 2, 3].map(i => `<i class="${i < pin.length ? "on" : ""}"></i>`).join(""); };
  modal(`<div class="modal-h"><h3>Autorización</h3><button class="btn icon ghost" data-close>${I.x}</button></div>
  <p class="hint" style="margin:0">La propietaria o administradora ingresa su PIN para autorizar un descuento mayor al límite.</p>
  <div class="field"><label>Porcentaje de descuento</label><input id="pinPct" type="number" min="1" max="90" value="20"></div>
  <div class="pindots" id="pindots"></div>
  <div class="pinpad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, "", 0, "⌫"].map(k => `<button type="button" data-k="${k}" ${k === "" ? "disabled style='visibility:hidden'" : ""}>${k}</button>`).join("")}</div>`);
  draw();
  $(".pinpad").onclick = (e) => {
    const k = e.target.closest("button")?.dataset.k; if (k == null) return;
    if (k === "⌫") pin = pin.slice(0, -1); else if (pin.length < 4) pin += k;
    draw();
    if (pin.length === 4) {
      const auth = DB.users.find(u => u.active && u.pin === pin && DB.roles[u.role].maxDisc >= 15);
      const pct = Math.min(90, Math.max(1, +$("#pinPct").value || 0));
      if (auth && pct <= DB.roles[auth.role].maxDisc) { closeModal(); onOk(pct, auth); } else { toast(auth ? `El límite de ${auth.name} es ${DB.roles[auth.role].maxDisc} %` : "PIN incorrecto", true); pin = ""; draw(); }
    }
  };
}
function codeModal() {
  modal(`<div class="modal-h"><h3>Código promocional</h3><button class="btn icon ghost" data-close>${I.x}</button></div><form id="f" class="form"><div class="field full"><label>Código</label><input name="code" placeholder="ARI15" required style="text-transform:uppercase" autofocus></div><button class="btn dark lg full">Aplicar</button></form>`, f => {
    const c = f.get("code").toUpperCase().trim(); const dc = DB.discountCodes.find(d => d.code === c);
    if (!dc || !dc.active) return toast("Código no válido", true);
    if (dc.uses >= dc.maxUses) return toast("Este código ya alcanzó su máximo de usos", true);
    S.disc = { type: "codigo", code: c, pct: dc.pct }; render(); toast(`Código ${c}: ${dc.pct} % aplicado`);
  });
}

/* ---------- Modal / toast utils ---------- */
let modalSubmit = null;
function modal(html, onSubmit) {
  modalSubmit = onSubmit || null;
  $("#modal-root").innerHTML = `<div class="overlay"><div class="modal">${html}</div></div>`;
  const f = $("#f"); if (f) { f.onsubmit = (e) => { e.preventDefault(); const r = modalSubmit && modalSubmit(new FormData(f)); if (r !== false) closeModal(); }; const first = f.querySelector("input,select"); if (first && !matchMedia("(pointer:coarse)").matches) first.focus(); }
}
function closeModal() { stopCam(); $("#modal-root").innerHTML = ""; modalSubmit = null; document.body.classList.remove("lock"); }
let toastT;
function toast(msg, bad) { $("#toast-root").innerHTML = `<div class="toast ${bad ? "red" : ""}">${esc(msg)}</div>`; clearTimeout(toastT); toastT = setTimeout(() => $("#toast-root").innerHTML = "", 2800); }

/* ---------- Eventos ---------- */
function bind() {
  const posQ0 = $("#posQ"); if (posQ0) posQ0.onkeydown = (e) => { if (e.key !== "Enter") return; const r = findByCode(e.target.value); if (r) { S.q = ""; addToCart(r.v.id, true); const n = $("#posQ"); n && n.focus(); } else if (/^\d{5,}$/.test(e.target.value.trim())) handleScan(e.target.value.trim()); };
  const posQ = $("#posQ"); if (posQ) posQ.oninput = (e) => { S.q = e.target.value; const pos = e.target.selectionStart; render(); const n = $("#posQ"); n.focus(); n.setSelectionRange(pos, pos); };
  const invQ = $("#invQ"); if (invQ) invQ.oninput = (e) => { S.invQ = e.target.value; const pos = e.target.selectionStart; render(); const n = $("#invQ"); n.focus(); n.setSelectionRange(pos, pos); };
  const sim = $("#simToggle"); if (sim) sim.onchange = (e) => { S.sim = e.target.checked; toast(S.sim ? "Simulando ventas de otros dispositivos…" : "Simulación detenida"); };
  const sf = $("#settingsForm"); if (sf) sf.onsubmit = (e) => { e.preventDefault(); const f = new FormData(sf); Object.assign(DB.settings, { store: f.get("store"), currency: f.get("currency"), lowStock: +f.get("lowStock"), minMargin: +f.get("minMargin"), waCountry: f.get("waCountry").replace(/\D/g, ""), relay: f.get("relay").trim() || DEFAULT_RELAY }); stopScanner(); listenScanner(); save(); render(); toast("Ajustes guardados"); };
  app.querySelectorAll("[data-role]").forEach(s => s.onchange = (e) => { userById(e.target.dataset.role).role = e.target.value; save(); render(); toast("Rol actualizado"); });
}
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-act],[data-add],[data-qty],[data-disc],[data-pay],[data-inv],[data-rep],[data-reptab],[data-photo],[data-addcat],[data-delcat],[data-lim],[data-toggle],[data-partner],[data-editpartner],[data-delpartner],[data-assign],[data-editprod],[data-close]");
  if (!t) { if (e.target.classList.contains("overlay")) { closeModal(); if (S.cartOpen) render(); } return; }
  if (t.dataset.close != null) { if (t.closest(".cart-screen")) S.cartOpen = false; closeModal(); if (S.cartOpen) render(); return; }
  if (t.dataset.editprod) return editProdModal(t.dataset.editprod);
  if (t.dataset.partner) { S.partner = t.dataset.partner; return render(); }
  if (t.dataset.editpartner) return partnerModal(t.dataset.editpartner);
  if (t.dataset.delpartner) { DB.partners = DB.partners.filter(p => p.id !== t.dataset.delpartner); if (S.partner === t.dataset.delpartner) S.partner = "all"; save(); closeModal(); return render(); }
  if (t.dataset.add) return addToCart(t.dataset.add);
  if (t.dataset.qty) { const [v, d] = t.dataset.qty.split("|"); return setQty(v, +d); }
  if (t.dataset.disc) return applyManual(+t.dataset.disc);
  if (t.dataset.pay) { S.pay = t.dataset.pay; return render(); }
  if (t.dataset.inv) { S.invFilter = t.dataset.inv; return render(); }
  if (t.dataset.rep) { S.repRange = t.dataset.rep; return render(); }
  if (t.dataset.reptab) { S.repTab = t.dataset.reptab; return render(); }
  if (t.dataset.addcat) return addCatModal(t.dataset.addcat);
  if (t.dataset.delcat) { const [k, i] = t.dataset.delcat.split("|"); DB[k].splice(+i, 1); save(); return render(); }
  if (t.dataset.lim) { const [k, d] = t.dataset.lim.split("|"); DB.roles[k].maxDisc = Math.min(100, Math.max(0, DB.roles[k].maxDisc + +d)); save(); return render(); }
  if (t.dataset.photo) { const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*"; inp.onchange = async () => { const f = inp.files[0]; if (!f) return; try { prodById(t.dataset.photo).photo = await ART.compress(f); save(); render(); toast("Foto actualizada"); } catch { toast("No se pudo leer la imagen", true); } }; inp.click(); return; }
  if (t.dataset.toggle) { const u = userById(t.dataset.toggle); u.active = !u.active; save(); return render(); }
  const a = t.dataset.act;
  if (a === "opencart") { S.cartOpen = true; render(); }
  else if (a === "logout") logout();
  else if (a === "clearcart") { S.cart = []; S.disc = null; render(); }
  else if (a === "nodisc") { e.preventDefault(); S.disc = null; render(); }
  else if (a === "code") codeModal();
  else if (a === "pin") pinModal((pct, auth) => { S.disc = { type: "pin", pct, by: auth.id }; render(); toast(`${pct} % autorizado por ${auth.name}`); });
  else if (a === "cobrar") cobrar();
  else if (a === "print") printTicket(t.dataset.sale);
  else if (a === "wa") waSend(t.dataset.sale);
  else if (a === "share") shareTicket(t.dataset.sale);
  else if (a === "newpartner") partnerModal();
  else if (a === "delprod") { if (confirm("¿Eliminar este producto?")) { DB.products = DB.products.filter(x => x.id !== t.dataset.pid); save(); closeModal(); render(); toast("Producto eliminado"); } }
  else if (a === "labels") labelsModal();
  else if (a === "pair") pairModal();
  else if (a === "unpair") { localStorage.removeItem(SCAN_KEY); stopScanner(); pairModal(); }
  else if (a === "copylink") { navigator.clipboard && navigator.clipboard.writeText(S.pairUrl || "").then(() => toast("Enlace copiado"), () => {}); }
  else if (a === "camscan") camScanModal();
  else if (a === "install") doInstall();
  else if (a === "stockin") stockInModal();
  else if (a === "newprod") newProdModal();
  else if (a === "newexp") newExpModal();
  else if (a === "newuser") newUserModal();
  else if (a === "csv") exportCSV();
  else if (a === "reset") { if (confirm("¿Volver a los datos de ejemplo? Se borran las ventas registradas en este demo.")) reset(); }
});
window.addEventListener("hashchange", () => { if (scannerParams()) return startScannerMode(); if (me) render(); });
// Sincronía entre pestañas/ventanas del mismo navegador (en producción: Supabase Realtime)
window.addEventListener("storage", (e) => { if (e.key === KEY) { load(); if (me) { me = DB.users.find(u => u.id === me.id) || me; render(); } } });
// Simulación de ventas desde "otro dispositivo"
setInterval(() => {
  if (!S.sim || !me) return;
  const seller = DB.users.filter(u => u.id !== me.id && u.active); const u = seller[Math.floor(Math.random() * seller.length)];
  const avail = DB.products.flatMap(p => p.variants.filter(v => v.stock > 0).map(v => ({ p, v }))); if (!avail.length || !u) return;
  const { p, v } = avail[Math.floor(Math.random() * avail.length)];
  const sub = p.price; const d = Math.random() < .3 ? { type: "manual", pct: 10, amount: Math.round(sub * .1) } : null;
  v.stock--; DB.sales.push({ id: uid(), n: DB.sales.reduce((a, s) => Math.max(a, s.n), 400) + 1, at: new Date().toISOString(), day: today(), seller: u.id, items: [{ pid: p.id, vid: v.id, partner: p.partner, name: p.name, size: v.size, color: v.color, qty: 1, price: p.price, cost: p.cost }], subtotal: sub, discount: d, total: sub - (d ? d.amount : 0), pay: DB.payMethods[Math.floor(Math.random() * 3)], status: "cerrada" });
  save(); if (view() === "panel") { render(); toast(`${u.name} vendió ${p.name} ${v.size} · ${money(sub - (d ? d.amount : 0))}`); }
}, 9000);

/* ---------- Librerías bajo demanda ---------- */
const _libs = {};
const lib = (src) => _libs[src] || (_libs[src] = new Promise((res, rej) => { const el = document.createElement("script"); el.src = src; el.onload = res; el.onerror = () => { delete _libs[src]; rej(new Error("No se pudo cargar " + src)); }; document.head.appendChild(el); }));

/* ---------- Instalar PWA ---------- */
let deferredInstall = null;
const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredInstall = e; if (!$("#modal-root").innerHTML) render(); });
window.addEventListener("appinstalled", () => { deferredInstall = null; toast("App instalada"); render(); });
function installHTML() {
  if (isStandalone()) return "";
  if (deferredInstall) return `<button class="btn block install-btn" data-act="install">${I.install} Instalar app</button>`;
  if (isIOS) return `<p class="hint install-ios">${I.install} Para instalar en iPhone: tocá <b>Compartir</b> y luego <b>Agregar a inicio</b>.</p>`;
  return "";
}
async function doInstall() { if (!deferredInstall) return; deferredInstall.prompt(); try { await deferredInstall.userChoice; } catch {} deferredInstall = null; render(); }

/* ---------- Escaneo: lógica común ---------- */
let actx = null;
function beep(ok = true) {
  try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); const o = actx.createOscillator(), g = actx.createGain(); o.frequency.value = ok ? 1250 : 320; g.gain.value = .07; o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime + (ok ? .09 : .25)); } catch {}
}
function findByCode(code) { code = String(code || "").trim(); if (!code) return null; for (const p of DB.products) for (const v of p.variants) if (v.code === code) return { p, v }; return null; }
// Un código llega (del celular, la cámara o un lector USB) y va al carrito o a la entrada abierta
function handleScan(code, src) {
  code = String(code).trim(); if (!me) return;
  const r = findByCode(code);
  beep(!!r);
  if ($("#siVid")) { if (r) selectStockVariant(r); else toast(`Código ${code} no registrado`, true); return; }
  if (!r) { toast(`Código ${code} no está registrado`, true); if (can("canEditCatalog") && !$("#camReader")) assignCodeModal(code); return; }
  if (!role().views.includes("venta")) return;
  if (view() !== "venta") { location.hash = "venta"; }
  addToCart(r.v.id, true);
  if ($("#camLast")) $("#camLast").innerHTML = `✓ ${esc(r.p.name)} ${esc(r.v.size)} ${esc(r.v.color)}`;
}
function assignCodeModal(code) {
  const opts = DB.products.flatMap(p => p.variants.map(v => `<option value="${v.id}">${esc(p.name)} · ${esc(v.size)} ${esc(v.color)} (actual ${esc(v.code)})</option>`)).join("");
  modal(`<div class="modal-h"><h3>Código nuevo</h3><button class="btn icon ghost" data-close>${I.x}</button></div>
    <p class="hint" style="margin:0">El código <b>${esc(code)}</b> no está en el sistema. Si es el código de fábrica de una prenda, asignalo a su variante y la próxima vez se reconoce sola.</p>
    <form id="f" class="form"><div class="field full"><label>Asignar a</label><select name="vid">${opts}</select></div><button class="btn dark lg full">Asignar y agregar</button></form>`, f => {
    const r = varById(f.get("vid")); r.v.code = code; save(); toast(`Código asignado a ${r.p.name} ${r.v.size}`);
    if (role().views.includes("venta")) { if (view() !== "venta") location.hash = "venta"; setTimeout(() => addToCart(r.v.id, true), 0); }
  });
}

/* ---------- Cámara de este equipo (celular o webcam) ---------- */
let activeCam = null;
function stopCam() { if (activeCam) { const c = activeCam; activeCam = null; try { c.stop().then(() => c.clear()).catch(() => {}); } catch {} } }
const SCAN_FORMATS = () => { const F = window.Html5QrcodeSupportedFormats; return [F.CODE_128, F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_39, F.QR_CODE]; };
async function startCam(elId, onCode, onErr) {
  await lib("vendor/html5-qrcode.min.js");
  const cam = new Html5Qrcode(elId, { formatsToSupport: SCAN_FORMATS(), verbose: false, experimentalFeatures: { useBarCodeDetectorIfSupported: true } });
  let last = "", lastAt = 0;
  try {
    await cam.start({ facingMode: "environment" }, { fps: 12, qrbox: (w, h) => ({ width: Math.round(Math.min(w * .88, 340)), height: Math.round(Math.min(h * .45, 150)) }), aspectRatio: 1.333 },
      (text) => { const now = Date.now(); const same = text === last && now - lastAt < 1500; lastAt = now; if (same) return; last = text; try { navigator.vibrate && navigator.vibrate(60); } catch {} onCode(text); }, () => {});
    return cam;
  } catch (e) { onErr && onErr(e); return null; }
}
async function camScanModal() {
  modal(`<div class="modal-h"><h3>Escanear con la cámara</h3><button class="btn icon ghost" data-close>${I.x}</button></div>
    <div id="camReader" class="reader"></div>
    <div id="camLast" class="cam-last">Apuntá al código de barras de la prenda</div>
    <p class="hint" style="margin:0">Cada código leído se agrega al carrito. Podés seguir escaneando y cerrar cuando termines.</p>
    <button class="btn dark block" data-close>Listo</button>`);
  activeCam = await startCam("camReader", (code) => handleScan(code, "cámara"), (e) => { if ($("#camReader")) $("#camReader").innerHTML = `<div class="empty">No se pudo abrir la cámara. Revisá el permiso del navegador.<br><small>${esc(e && e.message || e)}</small></div>`; });
  if (!$("#camReader")) stopCam();
}

/* ---------- Celular como escáner de la computadora ---------- */
const SCAN_KEY = "aris-scanner-topic";
const relay = () => String(DB.settings.relay || DEFAULT_RELAY).replace(/\/$/, "");
let scanES = null, phoneSeen = 0;
const phoneOnline = () => Date.now() - phoneSeen < 75000;
function pairTopic(create) {
  let t = localStorage.getItem(SCAN_KEY);
  if (!t && create) { t = "aris-" + Array.from(crypto.getRandomValues(new Uint8Array(10)), b => (b % 36).toString(36)).join(""); localStorage.setItem(SCAN_KEY, t); }
  return t;
}
function listenScanner() {
  const t = pairTopic(false); if (!t || !me || scanES || !window.EventSource) return;
  scanES = new EventSource(`${relay()}/${t}/sse`);
  scanES.onmessage = (e) => { let d, m; try { d = JSON.parse(e.data); } catch { return; } if (d.event && d.event !== "message") return; try { m = JSON.parse(d.message); } catch { return; } onPhoneMsg(m); };
  scanES.onerror = () => { if ($("#pairStatus") && !phoneOnline()) $("#pairStatus").innerHTML = `<div class="pair-wait">Reconectando con el servidor…</div>`; };
}
function stopScanner() { if (scanES) { scanES.close(); scanES = null; } }
function onPhoneMsg(m) {
  const was = phoneOnline(); phoneSeen = Date.now();
  if (!was) { updateScanBadge(); if (!$("#pairStatus")) toast("Celular conectado como escáner"); }
  if ($("#pairStatus")) $("#pairStatus").innerHTML = pairStatusHTML();
  if (m.t === "scan" && m.code) handleScan(String(m.code), "celular");
}
function updateScanBadge() { const b = $("#scanBadge"); if (!b) return; b.classList.toggle("scan-on", phoneOnline()); b.querySelector("span").textContent = phoneOnline() ? "Celular conectado" : "Escanear con celular"; }
setInterval(updateScanBadge, 15000);
const pairStatusHTML = () => phoneOnline() ? `<div class="pair-ok">${I.phone} Celular conectado · listo para escanear</div>` : `<div class="pair-wait"><span class="spinner"></span> Esperando al celular…</div>`;
async function pairModal() {
  const t = pairTopic(true); listenScanner();
  const url = `${location.origin}${location.pathname}#escaner=${t}${relay() !== DEFAULT_RELAY ? "&r=" + encodeURIComponent(relay()) : ""}`;
  S.pairUrl = url;
  await lib("vendor/qrcode.js");
  const qr = qrcode(0, "M"); qr.addData(url); qr.make();
  modal(`<div class="modal-h"><h3>Escanear con el celular</h3><button class="btn icon ghost" data-close>${I.x}</button></div>
    <div class="pair">
      <div class="qr">${qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true, alt: "Código QR para vincular el celular" })}</div>
      <ol class="steps">
        <li>Con el celular, abrí la <b>cámara</b> y apuntá a este código QR.</li>
        <li>Tocá el enlace que aparece y <b>permití la cámara</b>.</li>
        <li>Apuntá al código de barras de cada prenda: <b>se agrega solo</b> al carrito de esta computadora.</li>
      </ol>
    </div>
    <div id="pairStatus">${pairStatusHTML()}</div>
    <p class="hint" style="margin:0">El vínculo queda guardado: la próxima vez solo abrí el escáner en el celular (podés agregarlo a la pantalla de inicio).</p>
    <div style="display:flex;gap:8px"><button class="btn block" data-act="copylink">Copiar enlace</button><button class="btn ghost block" data-act="unpair">Generar código nuevo</button></div>`);
}

/* ---------- Modo escáner (pantalla del celular) ---------- */
function scannerParams() {
  const h = location.hash; if (!h.startsWith("#escaner=")) return null;
  const q = new URLSearchParams(h.slice(1)); const topic = q.get("escaner");
  return topic && /^[a-z0-9-]{6,64}$/i.test(topic) ? { topic, relay: (q.get("r") || DEFAULT_RELAY).replace(/\/$/, "") } : null;
}
let scanMode = null;
async function startScannerMode() {
  const P = scannerParams(); if (!P || scanMode) return;
  scanMode = { P, sent: 0 };
  document.title = "Escáner · " + DB.settings.store;
  app.innerHTML = `<div class="scanner">
    <header class="scan-h"><img src="icons/logo.png" alt=""><div><b>Escáner de ${esc(DB.settings.store)}</b><span id="scStatus" class="sc-wait">Conectando con la computadora…</span></div></header>
    <div id="reader" class="reader"></div>
    <form class="scan-manual" id="scManualF"><input id="scManual" inputmode="numeric" placeholder="o escribí el código" aria-label="Código manual"><button class="btn dark">Enviar</button></form>
    <div class="scan-log" id="scLog"><div class="hint">Apuntá la cámara al código de barras. Cada lectura aparece en el carrito de la computadora.</div></div>
    <div class="scan-foot"><button class="btn block" id="scPause">Pausar cámara</button></div>
  </div>`;
  const status = (txt, ok) => { const el = $("#scStatus"); if (el) { el.textContent = txt; el.className = ok ? "sc-ok" : "sc-wait"; } };
  const send = async (msg) => { const r = await fetch(`${P.relay}/${P.topic}`, { method: "POST", body: JSON.stringify(msg) }); if (!r.ok) throw new Error("HTTP " + r.status); };
  const hello = () => send({ t: "hello", at: Date.now() }).then(() => status("Conectado · listo para escanear", true), () => status("Sin conexión con el servidor. Revisá internet.", false));
  hello(); scanMode.hb = setInterval(hello, 30000);
  const onCode = async (code) => {
    const r = findByCode(code);
    const row = document.createElement("div"); row.className = "scan-row";
    row.innerHTML = `<b>${r ? esc(r.p.name) + " · " + esc(r.v.size) + " " + esc(r.v.color) : "Código " + esc(code)}</b><span>enviando…</span>`;
    const log = $("#scLog"); if (log.querySelector(".hint")) log.innerHTML = ""; log.prepend(row);
    try { await send({ t: "scan", code, at: Date.now() }); row.querySelector("span").textContent = "✓ enviado"; row.classList.add("ok"); beep(true); scanMode.sent++; status(`Conectado · ${scanMode.sent} enviado${scanMode.sent === 1 ? "" : "s"}`, true); }
    catch { row.querySelector("span").textContent = "✗ no se envió"; row.classList.add("bad"); beep(false); }
  };
  $("#scManualF").onsubmit = (e) => { e.preventDefault(); const v = $("#scManual").value.trim(); if (v) { onCode(v); $("#scManual").value = ""; } };
  let paused = false;
  $("#scPause").onclick = async () => {
    if (!paused) { stopCam(); paused = true; $("#scPause").textContent = "Reanudar cámara"; }
    else { paused = false; $("#scPause").textContent = "Pausar cámara"; activeCam = await startCam("reader", onCode, camErr); }
  };
  const camErr = (e) => { $("#reader").innerHTML = `<div class="empty">No se pudo abrir la cámara.<br>Permití el acceso a la cámara en el navegador o escribí el código abajo.<br><small>${esc(e && e.message || e)}</small></div>`; };
  activeCam = await startCam("reader", onCode, camErr);
}

/* ---------- Etiquetas con código de barras ---------- */
function labelsModal() {
  modal(`<div class="modal-h"><h3>Etiquetas con código de barras</h3><button class="btn icon ghost" data-close>${I.x}</button></div>
    <p class="hint" style="margin:0">Imprimilas en hojas de etiquetas adhesivas (carta) o en papel y pegalas en cada prenda. Después se escanean con el celular.</p>
    <form id="f" class="form">
      <div class="field"><label>Socio</label><select name="partner"><option value="all">Todos</option>${partnerOpts(S.partner)}</select></div>
      <div class="field"><label>Cantidad</label><select name="mode"><option value="one">Una por variante</option><option value="stock">Una por pieza en stock</option></select></div>
      <div class="field full"><label>Producto</label><select name="pid"><option value="all">Todos los productos</option>${DB.products.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select></div>
      <button class="btn dark lg full">${I.print} Imprimir etiquetas</button>
    </form>`, (f) => { printLabels(f.get("partner"), f.get("pid"), f.get("mode")); });
}
async function printLabels(partner, pid, mode) {
  await lib("vendor/JsBarcode.all.min.js");
  const list = DB.products.filter(p => (partner === "all" || p.partner === partner) && (pid === "all" || p.id === pid)).flatMap(p => p.variants.flatMap(v => Array.from({ length: mode === "stock" ? Math.max(0, v.stock) : 1 }, () => ({ p, v }))));
  if (!list.length) return toast("No hay etiquetas para imprimir", true);
  const svgCache = {};
  const bc = (code) => svgCache[code] || (svgCache[code] = (() => { const el = document.createElementNS("http://www.w3.org/2000/svg", "svg"); JsBarcode(el, code, { format: "CODE128", height: 34, width: 1.6, fontSize: 11, margin: 0, textMargin: 1 }); return el.outerHTML; })());
  $("#print-root").innerHTML = `<div class="labels">${list.map(({ p, v }) => `<div class="label"><div class="lb-top"><span>${esc(DB.settings.store)}</span><b>${money(p.price)}</b></div><div class="lb-name">${esc(p.name)}</div><div class="lb-var">${esc(v.size)} · ${esc(v.color)}</div>${bc(v.code)}</div>`).join("")}</div>`;
  setTimeout(() => window.print(), 50);
}

/* ---------- Inicio ---------- */
load();
if (scannerParams()) startScannerMode();
else {
  const sid = sessionStorage.getItem(SESSION); if (sid) me = DB.users.find(u => u.id === sid && u.active) || null;
  render(); listenScanner();
}
window.addEventListener("afterprint", () => { $("#print-root").innerHTML = ""; });
})();
