/* Ari's Closet · demo PWA. Todo se guarda en localStorage del navegador.
   En producción la capa "DB" se reemplaza por Supabase (mismas funciones). */
(() => {
"use strict";
const KEY = "aris-demo-v1";
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uid = () => Math.random().toString(36).slice(2, 9);
const dayOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const today = () => dayOf(new Date());
const fmtT = (iso) => new Date(iso).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
const fmtD = (iso) => new Date(iso).toLocaleDateString("es", { day: "numeric", month: "short" });
const fmtDL = (d) => d.toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

/* ---------- DB (localStorage) ---------- */
let DB = null;
function load() {
  try { DB = JSON.parse(localStorage.getItem(KEY)); } catch { DB = null; }
  if (!DB) { DB = JSON.parse(JSON.stringify(window.SEED)); DB.sales = []; DB.expenses = []; DB.moves = []; seedHistory(); save(); }
}
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
      const qty = p.cat === "Accesorios" ? 1 + Math.floor(Math.random() * 3) : 1;
      const sub = p.price * qty;
      const r = Math.random();
      const disc = r < 0.2 ? { type: "manual", pct: 10, amount: Math.round(sub * .1), by: null } : r < 0.3 ? { type: "codigo", code: "ARI15", pct: 15, amount: Math.round(sub * .15) } : null;
      const seller = sellers[Math.floor(Math.random() * sellers.length)];
      DB.sales.push({ id: uid(), n: 0, at: dt.toISOString(), day: dayOf(dt), seller: seller.id, items: [{ pid: p.id, vid: v.id, name: p.name, size: v.size, color: v.color, qty, price: p.price, cost: p.cost }],
        subtotal: sub, discount: disc, total: sub - (disc ? disc.amount : 0), pay: DB.payMethods[Math.floor(Math.random() * 3)], status: "cerrada" });
    }
    if (d % 3 === 0) {
      const dt = new Date(now); dt.setDate(now.getDate() - d);
      const cats = ["Servicios", "Mercadería", "Transporte", "Otros"];
      DB.expenses.push({ id: uid(), at: dt.toISOString(), day: dayOf(dt), cat: cats[d % 4], amount: [350, 2300, 180, 420][d % 4], note: ["Luz e internet", "Compra a proveedor", "Envíos", "Bolsas y etiquetas"][d % 4], by: "u1" });
    }
  }
  DB.sales.sort((a, b) => a.at.localeCompare(b.at)).forEach((s, i) => s.n = 400 + i);
}

/* ---------- Sesión ---------- */
const SESSION = "aris-demo-session";
let me = null;
const role = () => DB.roles[me.role];
const can = (k) => !!role()[k];
function login(u) { me = u; sessionStorage.setItem(SESSION, u.id); location.hash = role().views[0]; render(); }
function logout() { me = null; sessionStorage.removeItem(SESSION); location.hash = ""; render(); }

/* ---------- Estado UI ---------- */
const S = { cart: [], disc: null, pay: "Efectivo", q: "", invFilter: "Todo", invQ: "", repRange: "hoy", sim: false, custom: false };
const prodById = (id) => DB.products.find(p => p.id === id);
const varById = (id) => { for (const p of DB.products) { const v = p.variants.find(v => v.id === id); if (v) return { p, v }; } return null; };
const userById = (id) => DB.users.find(u => u.id === id) || { name: "—" };
const salesOf = (day) => DB.sales.filter(s => s.day === day && s.status === "cerrada");
const lowStock = () => DB.products.flatMap(p => p.variants.filter(v => v.stock <= DB.settings.lowStock).map(v => ({ p, v })));

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
  wa: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.6.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 12 12 0 0 0 4.6 4.1c1.7.7 2.4.8 3.2.7a2.8 2.8 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3z"/></svg>'
};
const NAV = [["panel","Panel"],["venta","Vender"],["inventario","Inventario"],["gastos","Gastos"],["reportes","Reportes"],["catalogos","Catálogos"],["usuarios","Usuarios"]];

/* ---------- Render raíz ---------- */
const app = $("#app");
function view() { const h = location.hash.replace("#", "") || role().views[0]; return role().views.includes(h) ? h : role().views[0]; }
function render() {
  if (!me) { app.innerHTML = loginView(); bindLogin(); return; }
  const v = view();
  const low = lowStock().length;
  const todayTotal = salesOf(today()).reduce((a, s) => a + s.total, 0);
  app.innerHTML = `
  <div class="shell">
    <aside class="sidebar">
      <div class="brand"><img src="icons/logo.png" alt=""><div><div class="brand-name">${esc(DB.settings.store)}</div><div class="brand-sub">${esc(role().label)}</div></div></div>
      <nav class="nav">${NAV.filter(([k]) => role().views.includes(k)).map(([k, l]) => `<a href="#${k}" class="${v === k ? "active" : ""}">${I[k]}<span>${l}</span>${k === "inventario" && low ? `<span class="badge">${low}</span>` : ""}</a>`).join("")}</nav>
      <div class="side-foot">
        <div class="cashbox"><small>Caja de hoy</small><b>${money(todayTotal)}</b><small>${salesOf(today()).length} tickets</small></div>
        <div class="me"><span class="avatar ${me.role === "propietaria" ? "red" : ""}">${esc(me.name.slice(0, 2).toUpperCase())}</span><div><b>${esc(me.name)}</b><span>${esc(role().label)}</span></div><button title="Salir" data-act="logout">${I.out}</button></div>
      </div>
    </aside>
    <div class="main">
      ${({ panel: panelView, venta: ventaView, inventario: invView, gastos: gastosView, reportes: repView, catalogos: catView, usuarios: usersView })[v]()}
    </div>
    <nav class="tabbar">${NAV.filter(([k]) => role().views.includes(k)).slice(0, 5).map(([k, l]) => `<a href="#${k}" class="${v === k ? "active" : ""}">${I[k]}<span>${l}</span>${k === "inventario" && low ? `<span class="badge">${low}</span>` : ""}</a>`).join("")}</nav>
  </div>`;
  bind();
  if (S.cartOpen) { if (v === "venta" && S.cart.length && window.innerWidth <= 900) $("#modal-root").innerHTML = `<div class="overlay"><div class="modal"><div class="modal-h"><h3>Carrito</h3><button class="btn icon ghost" data-close>${I.x}</button></div>${cartHTML()}</div></div>`; else { S.cartOpen = false; if (!$(".ticket")) closeModal(); } }
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
  </form></div>`;
}
function bindLogin() {
  $("#loginForm").onsubmit = (e) => { e.preventDefault(); const f = new FormData(e.target); const u = DB.users.find(x => x.id === f.get("u")); if (u && u.pass === f.get("p")) login(u); else toast("Contraseña incorrecta", true); };
}

/* ---------- Panel ---------- */
function panelView() {
  const t = today(), s = salesOf(t);
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 7);
  const lastWeek = salesOf(dayOf(yesterday)).reduce((a, x) => a + x.total, 0);
  const total = s.reduce((a, x) => a + x.total, 0), disc = s.reduce((a, x) => a + (x.discount ? x.discount.amount : 0), 0);
  const cost = s.reduce((a, x) => a + x.items.reduce((b, i) => b + i.cost * i.qty, 0), 0);
  const exp = DB.expenses.filter(e => e.day === t).reduce((a, e) => a + e.amount, 0);
  const delta = lastWeek ? Math.round((total - lastWeek) / lastWeek * 100) : 0;
  const mine = me.role === "vendedor";
  const list = (mine ? s.filter(x => x.seller === me.id) : s).slice().reverse().slice(0, 8);
  const bySeller = DB.users.map(u => ({ u, t: s.filter(x => x.seller === u.id).reduce((a, x) => a + x.total, 0) })).filter(x => x.t > 0).sort((a, b) => b.t - a.t);
  const max = Math.max(1, ...bySeller.map(x => x.t));
  const hours = Array.from({ length: 12 }, (_, i) => s.filter(x => new Date(x.at).getHours() === 9 + i).reduce((a, x) => a + x.total, 0));
  const hmax = Math.max(1, ...hours);
  return topbar("Panel", fmtDL(new Date()), `
    ${!mine ? `<label class="toggle hide-m" title="Genera una venta de otro dispositivo cada pocos segundos"><input type="checkbox" id="simToggle" ${S.sim ? "checked" : ""}> Simular ventas de otros dispositivos</label>` : ""}
    <a href="#venta" class="btn red">${I.plus}<span class="hide-m">Nueva venta</span></a>`) + `
  <div class="content">
    <section class="kpis">
      <div class="card kpi"><div class="lbl">Ventas de hoy<span class="ico">${I.trend}</span></div><div class="val">${money(total)}</div><div class="foot">${lastWeek ? `<span class="chip ${delta >= 0 ? "green" : "red"}">${delta >= 0 ? "+" : ""}${delta} %</span> vs. hace una semana` : "Sin referencia semanal"}</div></div>
      <div class="card kpi"><div class="lbl">Tickets<span class="ico">${I.ticket}</span></div><div class="val">${s.length}</div><div class="foot">Promedio ${money(s.length ? total / s.length : 0)}</div></div>
      <div class="card kpi"><div class="lbl">Descuentos<span class="ico red">${I.disc}</span></div><div class="val red">${money(disc)}</div><div class="foot">${s.filter(x => x.discount).length} ventas · ${total ? (disc / (total + disc) * 100).toFixed(1) : 0} %</div></div>
      ${can("canSeeProfit") ? `<div class="card kpi"><div class="lbl">Utilidad estimada<span class="ico">${I.cash}</span></div><div class="val">${money(total - cost - exp)}</div><div class="foot">Gastos de hoy ${money(exp)}</div></div>`
        : `<div class="card kpi"><div class="lbl">Artículos vendidos<span class="ico">${I.inventario}</span></div><div class="val">${s.reduce((a, x) => a + x.items.reduce((b, i) => b + i.qty, 0), 0)}</div><div class="foot">${lowStock().length} variantes en stock bajo</div></div>`}
    </section>
    <div class="grid-2">
      <section class="card">
        <div class="card-h"><h2>${mine ? "Mis ventas de hoy" : "Ventas en vivo"} <span class="live">EN VIVO</span></h2><a href="#reportes" class="btn sm ${role().views.includes("reportes") ? "" : "hide-m hide-d"}">Reportes</a></div>
        <div class="tbl-wrap"><table><thead><tr><th>Hora</th><th>Ticket</th><th>Vendedora</th><th>Artículos</th><th>Descuento</th><th class="r">Total</th></tr></thead><tbody>
        ${list.length ? list.map((x, i) => `<tr class="${i === 0 ? "hl" : ""}"><td><b>${fmtT(x.at)}</b></td><td style="color:var(--muted)">#${x.n}</td><td><span class="who"><span class="avatar ${x.seller === "u1" ? "red" : x.seller === "u3" ? "grey" : ""}">${esc(userById(x.seller).name[0])}</span>${esc(userById(x.seller).name)}</span></td><td>${esc(x.items.map(i => `${i.qty > 1 ? i.qty + " × " : ""}${i.name} ${i.size}`).join(", "))}</td><td>${discChip(x.discount)}</td><td class="r"><b>${money(x.total)}</b></td></tr>`).join("") : `<tr><td colspan="6" class="empty">Todavía no hay ventas hoy. ¡Registrá la primera!</td></tr>`}
        </tbody></table></div>
      </section>
      <div class="stack">
        <section class="card"><div class="card-h"><h2>${I.warn} Stock bajo</h2><span class="badge">${lowStock().length}</span></div>
          <div class="card-b list" style="padding-top:4px;padding-bottom:4px">${lowStock().slice(0, 5).map(({ p, v }) => `<div class="row"><span><span class="t">${esc(p.name)}</span><span class="s">${esc(v.size)} · ${esc(v.color)}</span></span><span class="chip ${v.stock === 0 ? "solid-red" : v.stock <= 1 ? "red" : ""}">${v.stock}</span></div>`).join("") || `<div class="empty">Todo con stock suficiente</div>`}</div>
          ${can("canStockIn") ? `<div style="padding:0 18px 18px"><button class="btn outline block" data-act="stockin">${I.plus} Registrar entrada</button></div>` : ""}
        </section>
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
  const prods = DB.products.filter(p => !q || (p.name + p.brand + p.cat + p.variants.map(v => v.id + v.size + v.color).join("")).toLowerCase().includes(q));
  const { subtotal, amount, total } = cartCalc();
  const lim = role().maxDisc;
  const n = (DB.sales.reduce((a, s) => Math.max(a, s.n), 400) + 1);
  return topbar("Nueva venta", `Ticket #${n} · ${esc(me.name)}`) + `
  <div class="content pos">
    <section class="stack" style="gap:12px">
      <div class="search full">${I.search}<input id="posQ" placeholder="Buscar producto, talla, color o código" value="${esc(S.q)}" autocomplete="off"></div>
      <div class="prod-grid">${prods.map(p => `<div class="prod"><div class="ph ${p.color}"></div><b>${esc(p.name)}</b><span class="hint">${esc(p.brand)} · ${esc(p.cat)}</span><span class="pr">${money(p.price)}</span>
        <div class="vars">${p.variants.map(v => `<button data-add="${v.id}" ${v.stock <= 0 ? "disabled" : ""} class="${v.stock <= DB.settings.lowStock ? "low" : ""}" title="Stock ${v.stock}">${esc(v.size)} ${esc(v.color)} · ${v.stock}</button>`).join("")}</div></div>`).join("") || `<div class="empty">Sin resultados</div>`}</div>
    </section>
    <aside class="card cart-panel hide-m" style="padding:16px">${cartHTML()}</aside>
  </div>
  <button class="hide-d cart-fab" data-act="opencart" ${!S.cart.length ? "disabled" : ""}><span>${I.venta} Carrito · ${S.cart.reduce((a, c) => a + c.qty, 0)}</span><span>${money(total)}</span></button>`;
}
function cartHTML() {
  const { subtotal, amount, total } = cartCalc();
  const lim = role().maxDisc;
  const n = S.cart.reduce((a, c) => a + c.qty, 0);
  return `      <div class="row" style="padding:0 0 8px;border:none"><span class="section-title">Carrito · ${n} ${n === 1 ? "artículo" : "artículos"}</span>${S.cart.length ? `<button class="btn ghost sm" data-act="clearcart">Vaciar</button>` : ""}</div>
      ${S.cart.length ? S.cart.map(c => `<div class="cart-item"><div class="ph ${prodById(c.pid).color}"></div><div class="i"><b>${esc(c.name)}</b><span>${esc(c.size)} · ${esc(c.color)} · ${money(c.price)}</span></div>
        <div class="qty"><button data-qty="${c.vid}|-1">−</button><b>${c.qty}</b><button class="plus" data-qty="${c.vid}|1">+</button></div></div>`).join("") : `<div class="empty">Tocá una talla para agregarla</div>`}
      <div style="padding:14px 0 6px;display:flex;flex-direction:column;gap:10px">
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
      <div class="pay" style="margin-bottom:10px">${DB.payMethods.map(m => `<button data-pay="${esc(m)}" class="${S.pay === m ? "on" : ""}">${m === "Efectivo" ? I.cash : m === "Tarjeta" ? I.card : I.transfer}${esc(m)}</button>`).join("")}</div>
      <button class="cobrar" data-act="cobrar" ${!S.cart.length ? "disabled" : ""}><span>Cobrar</span><span>${money(total)}</span></button>
`;
}
function addToCart(vid) {
  const r = varById(vid); if (!r) return;
  const inCart = S.cart.find(c => c.vid === vid);
  const have = inCart ? inCart.qty : 0;
  if (have + 1 > r.v.stock) return toast(`Solo hay ${r.v.stock} en stock`, true);
  if (inCart) inCart.qty++; else S.cart.push({ pid: r.p.id, vid, name: r.p.name, size: r.v.size, color: r.v.color, qty: 1, price: r.p.price, cost: r.p.cost });
  render();
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
  for (const c of S.cart) { const r = varById(c.vid); r.v.stock -= c.qty; DB.moves.push({ id: uid(), at: sale.at, vid: c.vid, type: "venta", qty: -c.qty, by: me.id, ref: sale.n }); }
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
  modal(`<div class="modal-h"><h3>Venta registrada</h3><button class="btn icon ghost" data-close>${I.x}</button></div>
    <div style="display:flex;gap:12px;align-items:center"><span class="avatar" style="width:40px;height:40px;background:var(--green)">✓</span><div><b style="font-size:18px">${money(s.total)}</b><div class="hint">Ticket #${s.n} · ${esc(s.pay)}${s.discount ? " · descuento " + s.discount.pct + " %" : ""}</div></div></div>
    <div class="ticket">${esc(txt)}</div>
    <div style="display:flex;gap:8px"><a class="btn block" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(txt)}">${I.wa} WhatsApp</a><button class="btn block" data-act="print">Imprimir</button><a href="#venta" class="btn dark block" data-close>Nueva venta</a></div>
    <div class="print-only">${esc(txt)}</div>`);
}

/* ---------- Inventario ---------- */
function invView() {
  const q = S.invQ.trim().toLowerCase();
  let prods = DB.products.filter(p => !q || (p.name + p.brand + p.cat).toLowerCase().includes(q));
  if (S.invFilter === "Stock bajo") prods = prods.filter(p => p.variants.some(v => v.stock <= DB.settings.lowStock));
  else if (S.invFilter !== "Todo") prods = prods.filter(p => S.invFilter === "Calzado" ? p.cat === "Calzado" : p.cat !== "Calzado");
  const pieces = DB.products.reduce((a, p) => a + p.variants.reduce((b, v) => b + v.stock, 0), 0);
  const value = DB.products.reduce((a, p) => a + p.variants.reduce((b, v) => b + v.stock * p.cost, 0), 0);
  return topbar("Inventario", `${pieces} piezas${can("canSeeProfit") ? " · valor al costo " + money(value) : ""}`, can("canStockIn") ? `<button class="btn" data-act="stockin">${I.plus}<span class="hide-m">Entrada</span></button>${can("canEditCatalog") ? `<button class="btn dark" data-act="newprod">${I.plus}<span class="hide-m">Producto</span></button>` : ""}` : "") + `
  <div class="content" style="gap:12px">
    <div class="search full">${I.search}<input id="invQ" placeholder="Producto, marca o categoría" value="${esc(S.invQ)}"></div>
    <div class="seg">${["Todo", "Ropa", "Calzado", "Stock bajo"].map(f => `<button data-inv="${f}" class="${S.invFilter === f ? "on" + (f === "Stock bajo" ? " red" : "") : ""}">${f}${f === "Stock bajo" ? " · " + lowStock().length : ""}</button>`).join("")}</div>
    <div class="inv-grid">${prods.map(p => { const st = p.variants.reduce((a, v) => a + v.stock, 0); return `<div class="card inv-item"><div class="inv-top"><div class="ph ${p.color}"></div><div class="i"><b>${esc(p.name)}</b><span>${esc(p.brand)} · ${money(p.price)}${can("canSeeProfit") ? " · costo " + money(p.cost) : ""}</span></div><div class="n"><b>${st}</b><span>en stock</span></div></div>
      <div class="vchips">${p.variants.map(v => `<span class="chip ${v.stock === 0 ? "solid-red" : v.stock <= DB.settings.lowStock ? "red" : ""}">${esc(v.size)} ${esc(v.color)} · ${v.stock}</span>`).join("")}</div></div>`; }).join("") || `<div class="empty">Sin productos</div>`}</div>
  </div>`;
}
function stockInModal() {
  const opts = DB.products.flatMap(p => p.variants.map(v => `<option value="${v.id}">${esc(p.name)} · ${esc(v.size)} ${esc(v.color)} (stock ${v.stock})</option>`)).join("");
  modal(`<div class="modal-h"><h3>Registrar entrada</h3><button class="btn icon ghost" data-close>${I.x}</button></div>
  <form id="f" class="form"><div class="field full"><label>Variante</label><select name="vid">${opts}</select></div>
  <div class="field"><label>Cantidad</label><input name="qty" type="number" min="1" value="1" required></div>
  <div class="field"><label>Motivo</label><select name="type"><option value="compra">Compra a proveedor</option><option value="ajuste">Ajuste de inventario</option><option value="devolucion">Devolución de cliente</option></select></div>
  <button class="btn dark lg full" type="submit">Guardar entrada</button></form>`, (f) => {
    const r = varById(f.get("vid")); const q = +f.get("qty"); r.v.stock += q;
    DB.moves.push({ id: uid(), at: new Date().toISOString(), vid: r.v.id, type: f.get("type"), qty: q, by: me.id }); save(); render(); toast(`+${q} ${r.p.name} ${r.v.size} ${r.v.color}`);
  });
}
function newProdModal() {
  modal(`<div class="modal-h"><h3>Nuevo producto</h3><button class="btn icon ghost" data-close>${I.x}</button></div>
  <form id="f" class="form">
  <div class="field full"><label>Nombre</label><input name="name" required placeholder="Ej. Falda plisada"></div>
  <div class="field"><label>Categoría</label><select name="cat">${DB.categories.map(c => `<option>${esc(c)}</option>`).join("")}</select></div>
  <div class="field"><label>Marca</label><select name="brand">${DB.brands.map(c => `<option>${esc(c)}</option>`).join("")}</select></div>
  <div class="field"><label>Costo</label><input name="cost" type="number" min="0" required></div>
  <div class="field"><label>Precio de venta</label><input name="price" type="number" min="0" required></div>
  <div class="field"><label>Tallas (separadas por coma)</label><input name="sizes" value="S, M, L" required></div>
  <div class="field"><label>Colores (separados por coma)</label><input name="colors" value="Negro" required></div>
  <div class="field full"><label>Stock inicial por variante</label><input name="stock" type="number" min="0" value="0"></div>
  <button class="btn dark lg full" type="submit">Crear producto</button></form>`, (f) => {
    const sizes = f.get("sizes").split(",").map(s => s.trim()).filter(Boolean), colors = f.get("colors").split(",").map(s => s.trim()).filter(Boolean);
    const p = { id: uid(), name: f.get("name"), cat: f.get("cat"), brand: f.get("brand"), cost: +f.get("cost"), price: +f.get("price"), color: "c" + (1 + Math.floor(Math.random() * 6)), variants: [] };
    sizes.forEach(s => colors.forEach(c => p.variants.push({ id: uid(), size: s, color: c, stock: +f.get("stock") })));
    DB.products.push(p); save(); render(); toast(`Producto "${p.name}" creado con ${p.variants.length} variantes`);
  });
}

/* ---------- Gastos ---------- */
function gastosView() {
  const list = DB.expenses.slice().sort((a, b) => b.at.localeCompare(a.at));
  const month = today().slice(0, 7);
  const mt = DB.expenses.filter(e => e.day.startsWith(month)).reduce((a, e) => a + e.amount, 0);
  const byCat = DB.expenseCats.map(c => ({ c, t: DB.expenses.filter(e => e.day.startsWith(month) && e.cat === c).reduce((a, e) => a + e.amount, 0) })).filter(x => x.t > 0).sort((a, b) => b.t - a.t);
  return topbar("Gastos", `Este mes: ${money(mt)}`, `<button class="btn dark" data-act="newexp">${I.plus}<span class="hide-m">Registrar gasto</span></button>`) + `
  <div class="content"><div class="grid-2">
    <section class="card"><div class="card-h"><h2>Movimientos</h2></div><div class="tbl-wrap"><table><thead><tr><th>Fecha</th><th>Categoría</th><th>Detalle</th><th>Registró</th><th class="r">Monto</th></tr></thead><tbody>
    ${list.map(e => `<tr><td>${fmtD(e.at)}</td><td><span class="chip">${esc(e.cat)}</span></td><td>${esc(e.note)}</td><td>${esc(userById(e.by).name)}</td><td class="r"><b>${money(e.amount)}</b></td></tr>`).join("") || `<tr><td colspan="5" class="empty">Sin gastos</td></tr>`}</tbody></table></div></section>
    <section class="card"><div class="card-h"><h2>Por categoría</h2><span class="hint">este mes</span></div><div class="card-b" style="display:flex;flex-direction:column;gap:14px">
    ${byCat.map(x => `<div style="display:flex;flex-direction:column;gap:6px"><div class="row" style="padding:0;border:none"><span>${esc(x.c)}</span><b>${money(x.t)}</b></div><div class="bar"><i style="width:${x.t / mt * 100}%"></i></div></div>`).join("") || `<div class="empty">Sin gastos este mes</div>`}</div></section>
  </div></div>`;
}
function newExpModal() {
  modal(`<div class="modal-h"><h3>Registrar gasto</h3><button class="btn icon ghost" data-close>${I.x}</button></div>
  <form id="f" class="form"><div class="field"><label>Categoría</label><select name="cat">${DB.expenseCats.map(c => `<option>${esc(c)}</option>`).join("")}</select></div>
  <div class="field"><label>Monto</label><input name="amount" type="number" min="1" required></div>
  <div class="field full"><label>Detalle</label><input name="note" placeholder="Ej. Pago de luz noviembre" required></div>
  <div class="field full"><label>Comprobante (foto)</label><input name="photo" type="file" accept="image/*" capture="environment"></div>
  <button class="btn dark lg full" type="submit">Guardar gasto</button></form>`, (f) => {
    DB.expenses.push({ id: uid(), at: new Date().toISOString(), day: today(), cat: f.get("cat"), amount: +f.get("amount"), note: f.get("note"), by: me.id }); save(); render(); toast("Gasto registrado");
  });
}

/* ---------- Reportes ---------- */
function rangeDays() {
  const n = S.repRange === "hoy" ? 1 : S.repRange === "semana" ? 7 : 30;
  const out = []; for (let i = n - 1; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); out.push(dayOf(d)); } return out;
}
function repView() {
  const days = rangeDays(), set = new Set(days);
  const s = DB.sales.filter(x => set.has(x.day) && x.status === "cerrada"), e = DB.expenses.filter(x => set.has(x.day));
  const total = s.reduce((a, x) => a + x.total, 0), cost = s.reduce((a, x) => a + x.items.reduce((b, i) => b + i.cost * i.qty, 0), 0), exp = e.reduce((a, x) => a + x.amount, 0), disc = s.reduce((a, x) => a + (x.discount ? x.discount.amount : 0), 0);
  const top = {}; s.forEach(x => x.items.forEach(i => { top[i.name] = top[i.name] || { q: 0, t: 0 }; top[i.name].q += i.qty; top[i.name].t += i.price * i.qty; }));
  const topL = Object.entries(top).sort((a, b) => b[1].t - a[1].t).slice(0, 6);
  const bySeller = DB.users.map(u => { const m = s.filter(x => x.seller === u.id); return { u, n: m.length, t: m.reduce((a, x) => a + x.total, 0), d: m.reduce((a, x) => a + (x.discount ? x.discount.amount : 0), 0) }; }).filter(x => x.n);
  const perDay = days.map(d => s.filter(x => x.day === d).reduce((a, x) => a + x.total, 0)); const pmax = Math.max(1, ...perDay);
  const byPay = DB.payMethods.map(m => ({ m, t: s.filter(x => x.pay === m).reduce((a, x) => a + x.total, 0) }));
  return topbar("Reportes", `${days.length === 1 ? "Hoy" : "Últimos " + days.length + " días"} · ${s.length} ventas`, `<button class="btn" data-act="csv">${I.down}<span class="hide-m">Exportar CSV</span></button>`) + `
  <div class="content">
    <div class="seg">${[["hoy", "Hoy"], ["semana", "7 días"], ["mes", "30 días"]].map(([k, l]) => `<button data-rep="${k}" class="${S.repRange === k ? "on" : ""}">${l}</button>`).join("")}</div>
    <section class="kpis">
      <div class="card kpi"><div class="lbl">Ventas</div><div class="val">${money(total)}</div><div class="foot">${s.length} tickets</div></div>
      <div class="card kpi"><div class="lbl">Descuentos</div><div class="val red">${money(disc)}</div><div class="foot">${total ? (disc / (total + disc) * 100).toFixed(1) : 0} % de lo vendido</div></div>
      <div class="card kpi"><div class="lbl">Gastos</div><div class="val">${money(exp)}</div><div class="foot">${e.length} registros</div></div>
      ${can("canSeeProfit") ? `<div class="card kpi"><div class="lbl">Utilidad</div><div class="val" style="color:var(--green)">${money(total - cost - exp)}</div><div class="foot">Costo de mercadería ${money(cost)}</div></div>` : `<div class="card kpi"><div class="lbl">Ticket promedio</div><div class="val">${money(s.length ? total / s.length : 0)}</div><div class="foot">por venta</div></div>`}
    </section>
    <section class="card"><div class="card-h"><h2>Ventas por día</h2></div><div class="card-b"><div class="mini-chart" style="height:120px">${perDay.map((v, i) => `<i class="${i === perDay.length - 1 ? "red" : ""}" style="height:${v / pmax * 100}%" title="${days[i]} · ${money(v)}"></i>`).join("")}</div><div class="row" style="border:none;padding:6px 0 0"><span class="hint">${fmtD(days[0])}</span><span class="hint">${fmtD(days[days.length - 1])}</span></div></div></section>
    <div class="grid-2" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">
      <section class="card"><div class="card-h"><h2>Más vendidos</h2></div><div class="tbl-wrap"><table><thead><tr><th>Producto</th><th class="r">Uds.</th><th class="r">Total</th></tr></thead><tbody>${topL.map(([n, v]) => `<tr><td><b>${esc(n)}</b></td><td class="r">${v.q}</td><td class="r">${money(v.t)}</td></tr>`).join("") || `<tr><td colspan="3" class="empty">Sin datos</td></tr>`}</tbody></table></div></section>
      <section class="card"><div class="card-h"><h2>Descuentos por vendedora</h2></div><div class="tbl-wrap"><table><thead><tr><th>Vendedora</th><th class="r">Ventas</th><th class="r">Vendido</th><th class="r">Descontado</th></tr></thead><tbody>${bySeller.map(x => `<tr><td><b>${esc(x.u.name)}</b></td><td class="r">${x.n}</td><td class="r">${money(x.t)}</td><td class="r" style="color:var(--red)">${money(x.d)}</td></tr>`).join("") || `<tr><td colspan="4" class="empty">Sin datos</td></tr>`}</tbody></table></div></section>
      <section class="card"><div class="card-h"><h2>Formas de pago</h2></div><div class="card-b" style="display:flex;flex-direction:column;gap:14px">${byPay.map(x => `<div style="display:flex;flex-direction:column;gap:6px"><div class="row" style="padding:0;border:none"><span>${esc(x.m)}</span><b>${money(x.t)}</b></div><div class="bar"><i style="width:${total ? x.t / total * 100 : 0}%"></i></div></div>`).join("")}</div></section>
    </div>
  </div>`;
}
function exportCSV() {
  const set = new Set(rangeDays());
  const rows = [["ticket", "fecha", "hora", "vendedora", "articulos", "subtotal", "descuento_tipo", "descuento_monto", "total", "pago"]];
  DB.sales.filter(x => set.has(x.day)).forEach(x => rows.push([x.n, x.day, fmtT(x.at), userById(x.seller).name, x.items.map(i => `${i.qty}x ${i.name} ${i.size} ${i.color}`).join(" | "), x.subtotal, x.discount ? x.discount.type : "", x.discount ? x.discount.amount : 0, x.total, x.pay]));
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" })); a.download = `ventas-${S.repRange}.csv`; a.click();
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
      <div class="full"><button class="btn dark" type="submit" ${can("canEditCatalog") ? "" : "disabled"}>Guardar ajustes</button></div></form></section>
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
  const f = $("#f"); if (f) { f.onsubmit = (e) => { e.preventDefault(); const r = modalSubmit && modalSubmit(new FormData(f)); if (r !== false) closeModal(); }; const first = f.querySelector("input,select"); first && first.focus(); }
}
function closeModal() { $("#modal-root").innerHTML = ""; modalSubmit = null; }
let toastT;
function toast(msg, bad) { $("#toast-root").innerHTML = `<div class="toast ${bad ? "red" : ""}">${esc(msg)}</div>`; clearTimeout(toastT); toastT = setTimeout(() => $("#toast-root").innerHTML = "", 2800); }

/* ---------- Eventos ---------- */
function bind() {
  const posQ = $("#posQ"); if (posQ) posQ.oninput = (e) => { S.q = e.target.value; const pos = e.target.selectionStart; render(); const n = $("#posQ"); n.focus(); n.setSelectionRange(pos, pos); };
  const invQ = $("#invQ"); if (invQ) invQ.oninput = (e) => { S.invQ = e.target.value; const pos = e.target.selectionStart; render(); const n = $("#invQ"); n.focus(); n.setSelectionRange(pos, pos); };
  const sim = $("#simToggle"); if (sim) sim.onchange = (e) => { S.sim = e.target.checked; toast(S.sim ? "Simulando ventas de otros dispositivos…" : "Simulación detenida"); };
  const sf = $("#settingsForm"); if (sf) sf.onsubmit = (e) => { e.preventDefault(); const f = new FormData(sf); Object.assign(DB.settings, { store: f.get("store"), currency: f.get("currency"), lowStock: +f.get("lowStock"), minMargin: +f.get("minMargin") }); save(); render(); toast("Ajustes guardados"); };
  app.querySelectorAll("[data-role]").forEach(s => s.onchange = (e) => { userById(e.target.dataset.role).role = e.target.value; save(); render(); toast("Rol actualizado"); });
}
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-act],[data-add],[data-qty],[data-disc],[data-pay],[data-inv],[data-rep],[data-addcat],[data-delcat],[data-lim],[data-toggle],[data-close]");
  if (!t) { if (e.target.classList.contains("overlay")) closeModal(); return; }
  if (t.dataset.close != null) { S.cartOpen = false; closeModal(); return; }
  if (t.dataset.add) return addToCart(t.dataset.add);
  if (t.dataset.qty) { const [v, d] = t.dataset.qty.split("|"); return setQty(v, +d); }
  if (t.dataset.disc) return applyManual(+t.dataset.disc);
  if (t.dataset.pay) { S.pay = t.dataset.pay; return render(); }
  if (t.dataset.inv) { S.invFilter = t.dataset.inv; return render(); }
  if (t.dataset.rep) { S.repRange = t.dataset.rep; return render(); }
  if (t.dataset.addcat) return addCatModal(t.dataset.addcat);
  if (t.dataset.delcat) { const [k, i] = t.dataset.delcat.split("|"); DB[k].splice(+i, 1); save(); return render(); }
  if (t.dataset.lim) { const [k, d] = t.dataset.lim.split("|"); DB.roles[k].maxDisc = Math.min(100, Math.max(0, DB.roles[k].maxDisc + +d)); save(); return render(); }
  if (t.dataset.toggle) { const u = userById(t.dataset.toggle); u.active = !u.active; save(); return render(); }
  const a = t.dataset.act;
  if (a === "opencart") { S.cartOpen = true; render(); }
  else if (a === "logout") logout();
  else if (a === "clearcart") { S.cart = []; S.disc = null; render(); }
  else if (a === "nodisc") { e.preventDefault(); S.disc = null; render(); }
  else if (a === "code") codeModal();
  else if (a === "pin") pinModal((pct, auth) => { S.disc = { type: "pin", pct, by: auth.id }; render(); toast(`${pct} % autorizado por ${auth.name}`); });
  else if (a === "cobrar") cobrar();
  else if (a === "print") window.print();
  else if (a === "stockin") stockInModal();
  else if (a === "newprod") newProdModal();
  else if (a === "newexp") newExpModal();
  else if (a === "newuser") newUserModal();
  else if (a === "csv") exportCSV();
  else if (a === "reset") { if (confirm("¿Volver a los datos de ejemplo? Se borran las ventas registradas en este demo.")) reset(); }
});
window.addEventListener("hashchange", () => me && render());
// Sincronía entre pestañas/ventanas del mismo navegador (en producción: Supabase Realtime)
window.addEventListener("storage", (e) => { if (e.key === KEY) { load(); if (me) { me = DB.users.find(u => u.id === me.id) || me; render(); } } });
// Simulación de ventas desde "otro dispositivo"
setInterval(() => {
  if (!S.sim || !me) return;
  const seller = DB.users.filter(u => u.id !== me.id && u.active); const u = seller[Math.floor(Math.random() * seller.length)];
  const avail = DB.products.flatMap(p => p.variants.filter(v => v.stock > 0).map(v => ({ p, v }))); if (!avail.length || !u) return;
  const { p, v } = avail[Math.floor(Math.random() * avail.length)];
  const sub = p.price; const d = Math.random() < .3 ? { type: "manual", pct: 10, amount: Math.round(sub * .1) } : null;
  v.stock--; DB.sales.push({ id: uid(), n: DB.sales.reduce((a, s) => Math.max(a, s.n), 400) + 1, at: new Date().toISOString(), day: today(), seller: u.id, items: [{ pid: p.id, vid: v.id, name: p.name, size: v.size, color: v.color, qty: 1, price: p.price, cost: p.cost }], subtotal: sub, discount: d, total: sub - (d ? d.amount : 0), pay: DB.payMethods[Math.floor(Math.random() * 3)], status: "cerrada" });
  save(); if (view() === "panel") { render(); toast(`${u.name} vendió ${p.name} ${v.size} · ${money(sub - (d ? d.amount : 0))}`); }
}, 9000);

/* ---------- Inicio ---------- */
load();
const sid = sessionStorage.getItem(SESSION); if (sid) me = DB.users.find(u => u.id === sid && u.active) || null;
render();
})();
