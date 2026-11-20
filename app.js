/* Ari's Closet · PWA de ventas.
   Con config.js trabaja contra Supabase (nube). Con ?demo usa datos de ejemplo guardados en el navegador. */
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
  DB.settings = Object.assign({ waCountry: "505", relay: DEFAULT_RELAY, paper: "80", rcLogo: true, rcAddress: "", rcPhone: "", rcRuc: "", rcFooter: "¡Gracias por tu compra!\nCambios dentro de 8 días con este recibo." }, DB.settings);
  DB.products.forEach(p => { if (!p.partner) p.partner = DB.partners[0].id; });
  const def = { propietaria: { seeAllSales: true, canSeeCost: true, canSeeProfit: true }, admin: { seeAllSales: true, canSeeCost: false, canSeeProfit: false }, vendedor: { seeAllSales: false, canSeeCost: false, canSeeProfit: false } };
  Object.entries(DB.roles).forEach(([k, r]) => { const d = def[k] || def.vendedor; ["seeAllSales", "canSeeCost"].forEach(f => { if (r[f] === undefined) r[f] = d[f]; }); });
  // La propietaria siempre lo ve todo
  Object.assign(DB.roles.propietaria, { views: NAV_KEYS.slice(), seeAllSales: true, canSeeCost: true, canSeeProfit: true, canStockIn: true, canExpense: true, canEditCatalog: true, canUsers: true, canVoid: true, maxDisc: 100 });
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
function save() { if (CLOUD) return; localStorage.setItem(KEY, JSON.stringify(DB)); }
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
function login(u) { me = u; sessionStorage.setItem(SESSION, u.id); location.hash = role().views[0]; render(); listenScanner(); offerInstall(); }
function logout() {
  me = null; sessionStorage.removeItem(SESSION); stopScanner(); location.hash = ""; S.cart = []; S.disc = null; closeModal();
  if (CLOUD) { cloudUnsubscribe(); CL.pending = null; DB = emptyDB(); sb.auth.signOut().catch(() => {}); }
  render();
}
const initials = (n) => { const w = String(n || "").trim().split(/\s+/).filter(Boolean); return ((w[0] || "?")[0] + (w.length > 1 ? w[w.length > 2 ? 2 : 1][0] : (w[0] || "")[1] || "")).toUpperCase(); };
const avatarCls = (id) => { const r = userById(id).role; return r === "propietaria" ? "red" : r === "vendedor" ? "grey" : ""; };
/* ---------- Nube (Supabase) ----------
   Con config.js la app trabaja contra la base de datos real: login con correo,
   datos compartidos entre equipos y panel en vivo. Con ?demo usa los datos de ejemplo. */
const CFG = window.ARIS_CONFIG || {};
const CLOUD = !!(CFG.url && CFG.anonKey && window.supabase) && !/[?&]demo\b/.test(location.search);
const sb = CLOUD ? window.supabase.createClient(CFG.url, CFG.anonKey, { auth: { persistSession: true, autoRefreshToken: true, storageKey: "aris-auth" } }) : null;
const CL = { catId: {}, catName: {}, brandId: {}, brandName: {}, ecatId: {}, ecatName: {}, pending: null, rt: null, rtT: null, newSales: [] };
// Usuarios con nombre corto (nusuario): por dentro Supabase usa nusuario@<dominio>
const UDOM = String(CFG.userDomain || "ariscloset.app").toLowerCase();
const toEmail = (u) => { u = String(u || "").trim().toLowerCase(); return u.includes("@") ? u : `${u}@${UDOM}`; };
const userOf = (email) => { const e = String(email || "").toLowerCase(); return e.endsWith("@" + UDOM) ? e.slice(0, -UDOM.length - 1) : e; };
const sbq = async (p) => { const { data, error } = await p; if (error) throw error; return data; };
// Trae todas las filas aunque pasen del límite de 1000 por consulta
async function sbAll(build) { const out = []; for (let from = 0; ; from += 1000) { const d = await sbq(build().range(from, from + 999)); out.push(...d); if (d.length < 1000) return out; } }
function errMsg(e) {
  const m = String((e && (e.message || e.error_description || e.msg)) || e || "");
  if (/invalid login credentials/i.test(m)) return "Usuario o contraseña incorrectos";
  if (/email address .* is invalid|invalid email|validate email/i.test(m)) return "Supabase no aceptó ese nombre de usuario. Probá solo con letras y números.";
  if (/email not confirmed/i.test(m)) return "Falta confirmar el correo (revisá la bandeja de entrada)";
  if (/failed to fetch|networkerror|load failed/i.test(m)) return "Sin conexión a internet. Intentá de nuevo.";
  if (/row-level security|permission denied/i.test(m)) return "Tu rol no tiene permiso para hacer esto";
  if (/variants_barcode_key|barcode/i.test(m) && /duplicate|unique/i.test(m)) return "Ese código de barras ya lo usa otra prenda";
  if (/variants_product_id_size_color_key/i.test(m)) return "Hay dos variantes con la misma talla y color";
  if (/duplicate key|already exists|unique/i.test(m)) return "Ya existe un registro con ese nombre";
  if (/already registered|user_already_exists/i.test(m)) return "Ese usuario ya existe";
  if (/signups? not allowed|signup.*disabled/i.test(m)) return "Supabase no permite registros desde la app: creá el usuario en Supabase (Authentication → Add user) y después activalo aquí";
  if (/rate limit/i.test(m)) return "Demasiados intentos seguidos. Esperá unos minutos.";
  if (/password should be at least/i.test(m)) return "La contraseña debe tener al menos 6 caracteres";
  if (/stock_check|stock >= 0/i.test(m)) return "No hay stock suficiente";
  return m.replace(/^.*?ERROR:\s*/, "") || "Algo salió mal";
}
const emptyDB = () => ({ settings: { store: "Ari's Closet", currency: "C$", lowStock: 2, minMargin: 5, waCountry: "505", relay: DEFAULT_RELAY, paper: "80", rcLogo: true, rcAddress: "", rcPhone: "", rcRuc: "", rcFooter: "" }, users: [], roles: {}, partners: [], categories: [], brands: [], payMethods: [], expenseCats: [], discountCodes: [], products: [], sales: [], expenses: [], moves: [] });
const photoUrl = (path) => path ? sb.storage.from("product-photos").getPublicUrl(path).data.publicUrl : null;
const one = (x) => Array.isArray(x) ? x[0] : x;
const ROLE_ORDER = ["propietaria", "admin", "vendedor"];

// Gastos del período más los prorrateados (aunque se hayan pagado antes). Si falta el script 0007, sigue sin prorrateo.
async function loadExpenses(sinceDay) {
  try { const r = await sbAll(() => sb.from("expenses").select("*").or(`day.gte.${sinceDay},spread_qty.not.is.null`).order("created_at").order("id")); CL.noSpread = false; return r; }
  catch (e) { if (!/spread_qty|column|42703|PGRST/i.test(String(e && (e.message || e.code)))) throw e; CL.noSpread = true; return sbAll(() => sb.from("expenses").select("*").gte("day", sinceDay).order("created_at").order("id")); }
}
// Lee todo lo que el rol puede ver y lo deja con la misma forma que usa la app
async function cloudLoad() {
  const since = new Date(); since.setDate(since.getDate() - 62); const sinceDay = dayOf(since);
  const [roles, profiles, st, partners, cats, brands, pays, ecats, codes, prods, sales, moves, exps] = await Promise.all([
    sbq(sb.from("roles").select("*")),
    sbq(sb.from("profiles").select("*").order("created_at")),
    sbq(sb.from("settings").select("*").eq("id", 1).maybeSingle()),
    sbq(sb.from("partners").select("*").eq("active", true).order("created_at")),
    sbq(sb.from("categories").select("*").order("sort").order("id")),
    sbq(sb.from("brands").select("*").order("sort").order("id")),
    sbq(sb.from("payment_methods").select("*").eq("active", true).order("sort").order("id")),
    sbq(sb.from("expense_categories").select("*").order("sort").order("id")),
    sbq(sb.from("discount_codes").select("*").eq("active", true).order("created_at")),
    sbAll(() => sb.from("products").select("*, product_costs(cost), variants(*)").eq("active", true).order("created_at").order("id")),
    sbAll(() => sb.from("sales").select("*, sale_items(*, sale_item_costs(unit_cost))").gte("day", sinceDay).order("created_at").order("id")),
    sbAll(() => sb.from("stock_moves").select("*, sales(number)").gte("created_at", since.toISOString()).order("id")),
    loadExpenses(sinceDay)
  ]);
  const D = emptyDB();
  roles.sort((a, b) => ROLE_ORDER.indexOf(a.key) - ROLE_ORDER.indexOf(b.key)).forEach(r => {
    D.roles[r.key] = { label: r.label, maxDisc: +r.max_disc, views: NAV_KEYS.filter(k => r.views.includes(k)), seeAllSales: r.see_all_sales, canSeeCost: r.can_see_cost, canSeeProfit: r.can_see_profit,
      canStockIn: r.can_stock_in, canExpense: r.can_expense, canEditCatalog: r.can_edit_catalog, canUsers: r.key === "propietaria", canVoid: r.key !== "vendedor" };
  });
  D.users = profiles.map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role, active: u.active }));
  if (st) D.settings = { store: st.store, currency: st.currency, lowStock: +st.low_stock, minMargin: +st.min_margin, waCountry: st.wa_country, relay: DEFAULT_RELAY, paper: st.paper, rcLogo: st.rc_logo, rcAddress: st.rc_address, rcPhone: st.rc_phone, rcRuc: st.rc_ruc, rcFooter: st.rc_footer };
  D.partners = partners.map(p => ({ id: p.id, name: p.name, share: +p.share, color: p.color }));
  const map = (list, idK, nameK) => { CL[idK] = {}; CL[nameK] = {}; list.forEach(c => { CL[nameK][c.id] = c.name; if (c.active) CL[idK][c.name] = c.id; }); return list.filter(c => c.active).map(c => c.name); };
  D.categories = map(cats, "catId", "catName"); D.brands = map(brands, "brandId", "brandName"); D.expenseCats = map(ecats, "ecatId", "ecatName");
  D.payMethods = pays.map(p => p.name);
  D.discountCodes = codes.map(c => ({ code: c.code, pct: +c.pct, maxUses: c.max_uses, uses: c.uses, active: c.active, validFrom: c.valid_from, validTo: c.valid_to }));
  D.products = prods.map(p => ({ id: p.id, partner: p.partner_id, name: p.name, cat: CL.catName[p.category_id] || "", brand: CL.brandName[p.brand_id] || "", price: +p.price,
    cost: one(p.product_costs) ? +one(p.product_costs).cost : 0, photo: photoUrl(p.photo_path), photoPath: p.photo_path,
    variants: (p.variants || []).filter(v => v.active).sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)).map(v => ({ id: v.id, size: v.size, color: v.color, code: v.barcode, stock: v.stock })) }));
  D.sales = sales.map(s => ({ id: s.id, n: +s.number, at: s.created_at, day: s.day, seller: s.seller_id, subtotal: +s.subtotal, total: +s.total, pay: s.payment_method, status: s.status, phone: s.customer_phone || "",
    discount: s.discount_type ? { type: s.discount_type, pct: +s.discount_pct, amount: +s.discount_amount, code: s.discount_code, by: s.authorized_by } : null,
    items: (s.sale_items || []).map(i => ({ pid: i.product_id, vid: i.variant_id, partner: i.partner_id, name: i.name, size: i.size, color: i.color, qty: i.qty, price: +i.price, cost: one(i.sale_item_costs) ? +one(i.sale_item_costs).unit_cost : 0 })) }));
  D.moves = moves.map(m => ({ id: m.id, at: m.created_at, vid: m.variant_id, partner: m.partner_id, type: m.type, qty: m.qty, by: m.user_id, ref: m.sales ? m.sales.number : null, note: m.note }));
  D.expenses = exps.map(e => ({ id: e.id, at: e.created_at, day: e.day, cat: CL.ecatName[e.category_id] || "", amount: +e.amount, note: e.note, partner: e.partner_id || "shared", by: e.user_id, receipt: e.receipt_path, spreadQty: e.spread_qty || null, spreadUnit: e.spread_unit || null, spreadFrom: e.spread_from || null }));
  // Variantes de productos dados de baja: siguen apareciendo en ventas y kárdex
  DB = D;
  if (me) { const fresh = DB.users.find(u => u.id === me.id); if (!fresh || !fresh.active || !DB.roles[fresh.role]) { me = null; CL.pending = fresh || {}; return cloudPending(); } me = fresh; }
}
function busy(on) { document.body.classList.toggle("is-busy", !!on); }
// Ejecuta un cambio en la nube, recarga y vuelve a dibujar. Devuelve false si falló (el formulario queda abierto).
async function act(fn, okMsg) {
  busy(true);
  try { await fn(); await cloudLoad(); if (me) render(); if (okMsg) toast(okMsg); return true; }
  catch (e) { toast(errMsg(e), true); return false; }
  finally { busy(false); }
}
// Redibuja sin interrumpir a quien está escribiendo
function softRender() {
  if (!me) return;
  const a = document.activeElement;
  if (a && app.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.id !== "posQ") { a.addEventListener("blur", () => setTimeout(() => me && render(), 0), { once: true }); return; }
  render();
}
async function cloudRefresh() {
  try { await cloudLoad(); } catch { return; }
  if (!me) return;
  softRender();
  const news = CL.newSales.splice(0);
  news.forEach(id => { const x = DB.sales.find(s => s.id === id); if (x && x.seller !== me.id) toast(`${userById(x.seller).name} vendió ${money(x.total)} · factura #${x.n}`); });
}
const cloudSoon = (ms = 700) => { clearTimeout(CL.rtT); CL.rtT = setTimeout(cloudRefresh, ms); };
function cloudSubscribe() {
  if (CL.rt) return;
  const on = (ch, table) => ch.on("postgres_changes", { event: "*", schema: "public", table }, (p) => { if (table === "sales" && p.eventType === "INSERT" && p.new && p.new.id) CL.newSales.push(p.new.id); cloudSoon(); });
  CL.rt = ["sales", "variants", "expenses"].reduce(on, sb.channel("tienda")).subscribe();
}
function cloudUnsubscribe() { if (CL.rt) { sb.removeChannel(CL.rt); CL.rt = null; } }
document.addEventListener("visibilitychange", () => { if (CLOUD && me && document.visibilityState === "visible") cloudSoon(100); });

function bootScreen(msg) { $("#toast-root").innerHTML = ""; app.innerHTML = `<div class="boot"><img src="icons/logo-t.png" alt="Ari's Closet"><span class="spinner"></span><small>${esc(msg || "Abriendo caja…")}</small></div>`; }
async function cloudStart(user) {
  bootScreen();
  try {
    const prof = await sbq(sb.from("profiles").select("*").eq("id", user.id).maybeSingle());
    if (!prof || !prof.active) { CL.pending = prof || { email: user.email }; return cloudPending(); }
    me = { id: prof.id };
    await cloudLoad();
    if (!me) return;
    CL.pending = null;
    if (!role().views.includes(location.hash.replace("#", ""))) location.hash = role().views[0];
    render(); cloudSubscribe(); listenScanner(); offerInstall();
  } catch (e) { me = null; app.innerHTML = loginView(errMsg(e)); bindLogin(); }
}
function cloudPending() {
  cloudUnsubscribe(); stopScanner();
  const p = CL.pending || {};
  app.innerHTML = `<div class="login">${loginPattern()}<div class="login-card">
    <div class="login-logo"><img src="icons/logo-t.png" alt="Ari's Closet"></div>
    <h1>Cuenta pendiente</h1>
    <p>${p.name ? esc(p.name) + ", tu" : "Tu"} cuenta${p.email ? " <b>" + esc(userOf(p.email)) + "</b>" : ""} todavía no está activa. La propietaria tiene que activarla en <b>Usuarios</b>.</p>
    <button class="btn dark lg block" id="pendRetry">Ya me activaron</button>
    <button class="btn ghost block" data-act="logout">Salir</button>
  </div></div>`;
  $("#pendRetry").onclick = async () => { const { data } = await sb.auth.getUser(); if (data && data.user) cloudStart(data.user); else logout(); };
}
// Sube una imagen (dataURL) a Storage y devuelve su ruta
async function uploadImg(bucket, path, dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  await sbq(sb.storage.from(bucket).upload(path, blob, { contentType: "image/jpeg", upsert: true }));
  return path;
}


/* ---------- Estado UI ---------- */
const S = { spk: (() => { try { return +localStorage.getItem("aris-spk") === 30 ? 30 : 7; } catch { return 7; } })(), sb: (() => { try { return localStorage.getItem("aris-sb") === "1"; } catch { return false; } })(), cart: [], disc: null, pay: "Efectivo", q: "", invFilter: "Todo", invQ: "", repRange: "hoy", sim: false, custom: false, partner: "all" };
const prodById = (id) => DB.products.find(p => p.id === id);
const varById = (id) => { for (const p of DB.products) { const v = p.variants.find(v => v.id === id); if (v) return { p, v }; } return null; };
const userById = (id) => DB.users.find(u => u.id === id) || { name: "—" };
const salesOf = (day) => DB.sales.filter(s => s.day === day && s.status === "cerrada");
const lowStock = () => DB.products.flatMap(p => p.variants.filter(v => v.stock <= DB.settings.lowStock).map(v => ({ p, v })));
/* ---------- Socios ---------- */
const partnerById = (id) => DB.partners.find(p => p.id === id) || { id, name: id === "shared" ? "Compartido" : "—", share: 0, color: "#7A7A76" };
const itemPartner = (i) => i.partner || (prodById(i.pid) || {}).partner || DB.partners[0].id;
// Parte de una venta que corresponde a un socio (el descuento de la factura se prorratea)
function scopeSale(x, pid) {
  const items = x.items.filter(i => itemPartner(i) === pid);
  if (!items.length) return null;
  if (items.length === x.items.length) return x;
  const sub = items.reduce((a, i) => a + i.price * i.qty, 0), f = x.subtotal ? x.total / x.subtotal : 1, total = Math.round(sub * f);
  return { ...x, items, subtotal: sub, total, discount: x.discount ? { ...x.discount, amount: sub - total } : null };
}
const scoped = (list) => S.partner === "all" ? list : list.map(x => scopeSale(x, S.partner)).filter(Boolean);
const expShare = (e, pid) => e.partner === pid ? e.amount : (!e.partner || e.partner === "shared") ? Math.round(e.amount * (partnerById(pid).share || 0) / 100) : 0;
// ---------- Gastos prorrateados ----------
const addDaysS = (d, n) => { const x = new Date(d + "T12:00:00"); x.setDate(x.getDate() + n); return dayOf(x); };
const addMonthsS = (d, n) => { const x = new Date(d + "T12:00:00"), day = x.getDate(); x.setDate(1); x.setMonth(x.getMonth() + n); x.setDate(Math.min(day, new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate())); return dayOf(x); };
const UNIT = { dias: ["día", "días"], meses: ["mes", "meses"], anios: ["año", "años"] };
// Del día "from" (incluido) al "to" (excluido) y cuántos días son
function spreadSpan(x) {
  if (!x.spreadQty || !x.spreadUnit) return null;
  const from = x.spreadFrom || x.day;
  const to = x.spreadUnit === "dias" ? addDaysS(from, x.spreadQty) : addMonthsS(from, x.spreadUnit === "anios" ? 12 * x.spreadQty : x.spreadQty);
  return { from, to, n: Math.max(1, Math.round((Date.parse(to + "T12:00:00") - Date.parse(from + "T12:00:00")) / 864e5)) };
}
// Los gastos que le corresponden a esos días: los normales por su fecha y los prorrateados solo en su parte
function expFor(days) {
  const set = new Set(days);
  return DB.expenses.map(x => {
    const sp = spreadSpan(x); if (!sp) return set.has(x.day) ? x : null;
    const k = days.filter(d => d >= sp.from && d < sp.to).length; if (!k) return null;
    return { ...x, amount: Math.round(x.amount * k / sp.n * 100) / 100, alloc: { k, n: sp.n, full: x.amount, from: sp.from, to: sp.to } };
  }).filter(Boolean);
}
const spreadTxt = (x) => { const sp = spreadSpan(x); if (!sp) return ""; return `${x.spreadQty} ${UNIT[x.spreadUnit][x.spreadQty === 1 ? 0 : 1]} desde ${fmtD(sp.from + "T12:00:00")} · ${money(x.amount / sp.n)} por día`; };
const scopedExp = (list) => S.partner === "all" ? list : list.map(e => ({ ...e, amount: expShare(e, S.partner) })).filter(e => e.amount > 0);
const inPartner = (p) => S.partner === "all" || p.partner === S.partner;
const lowStockP = () => lowStock().filter(x => inPartner(x.p));
const pDot = (id) => `<span class="pdot" style="background:${esc(partnerById(id).color || "#7A7A76")}"></span>`;
const partnerChip = (id) => `<span class="chip pchip">${pDot(id)}${esc(partnerById(id).name)}</span>`;
const partnerSeg = () => DB.partners.length > 1 && can("seeAllSales") ? `<div class="seg partner-seg" role="group" aria-label="Socio">${[["all", "Consolidado"], ...DB.partners.map(p => [p.id, p.name])].map(([k, l]) => `<button data-partner="${k}" class="${S.partner === k ? "on" : ""}">${k !== "all" ? pDot(k) : ""}${esc(l)}</button>`).join("")}</div>` : "";
const partnerOpts = (sel, withShared) => (withShared ? `<option value="shared" ${sel === "shared" ? "selected" : ""}>Compartido (según %)</option>` : "") + DB.partners.map(p => `<option value="${p.id}" ${sel === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("");

/* ---------- Iconos ---------- */
const I = {
  panel: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/></svg>',
  venta: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>',
  inventario: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 7.3L12 3 3.5 7.3v9.4L12 21l8.5-4.3z"/><path d="M3.5 7.3L12 11.6l8.5-4.3"/><path d="M12 11.6V21"/></svg>',
  gastos: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20"/><path d="M6 15h4"/></svg>',
  reportes: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 14l4-4 4 3 5-6"/></svg>',
  catalogos: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/></svg>',
  usuarios: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/></svg>',
  search: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7A7A76" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  plus: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  x: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
  trend: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M22 7l-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/></svg>',
  factura: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3h16v18l-2.7-2-2.6 2-2.7-2-2.7 2-2.6-2L4 21z"/><path d="M8 8h8M8 12h8"/></svg>',
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
  chev: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  edit: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  phone: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/></svg>',
  barcode: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><path d="M4 5v14M7 5v14M10.5 5v14M13 5v14M16.5 5v14M20 5v14"/></svg>',
  share: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>',
  print: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><rect x="2" y="9" width="20" height="9" rx="2"/><path d="M6 14h12v8H6z"/></svg>',
  install: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M12 7v7M9 11l3 3 3-3"/></svg>',
  wa: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.6.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 12 12 0 0 0 4.6 4.1c1.7.7 2.4.8 3.2.7a2.8 2.8 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3z"/></svg>'
};
const NAV_KEYS = ["panel", "venta", "inventario", "gastos", "reportes", "catalogos", "usuarios"];
const NAV = [["panel","Panel"],["venta","Vender"],["inventario","Inventario"],["gastos","Gastos"],["reportes","Reportes"],["catalogos","Configuración"],["usuarios","Usuarios"]];

/* ---------- Render raíz ---------- */
const app = $("#app");
function view() { const h = location.hash.replace("#", "") || role().views[0]; return role().views.includes(h) ? h : role().views[0]; }
function render() {
  if (scannerParams()) return;
  if (!me) { app.innerHTML = loginView(); bindLogin(); return; }
  const v = view();
  const low = lowStock().length;
  const todaySales = salesOf(today()).filter(x => can("seeAllSales") || x.seller === me.id);
  const todayTotal = todaySales.reduce((a, s) => a + s.total, 0);
  const _ci = $(".cart-items-d"), _ciTop = _ci ? _ci.scrollTop : 0;
  app.innerHTML = `
  <div class="shell ${v === "venta" && S.cart.length ? "has-cart" : ""} ${S.sb ? "sb-collapsed" : ""}">
    <aside class="sidebar">
      <button class="sb-toggle" data-act="sb" aria-label="${S.sb ? "Expandir menú" : "Contraer menú"}" title="${S.sb ? "Expandir menú" : "Contraer menú"}">${I.chev}</button>
      <div class="brand"><img class="brand-full" src="icons/logo-c.png" alt="${esc(DB.settings.store)}"><img class="brand-mono" src="icons/mono.png" alt=""><span class="brand-role">${esc(role().label)}</span></div>
      <nav class="nav">${NAV.filter(([k]) => role().views.includes(k)).map(([k, l]) => `<a href="#${k}" class="${v === k ? "active" : ""}" data-tip="${l}">${I[k]}<span class="nl">${l}</span>${tabBadge(k, low)}</a>`).join("")}</nav>
      <div class="side-foot">
        ${installHTML()}
        <div class="cashbox" data-tip="${money(todayTotal)}"><span class="cb-ico">${I.cash}</span><div class="cb-body"><small>${can("seeAllSales") ? "Caja de hoy" : "Mis ventas de hoy"}</small><b>${money(todayTotal)}</b><small>${todaySales.length} facturas · ${todaySales.reduce((a, x) => a + x.items.reduce((b, i) => b + i.qty, 0), 0)} uds.</small></div></div>
        <div class="me"><span class="avatar ${me.role === "propietaria" ? "red" : ""}" title="${esc(me.name)}">${esc(initials(me.name))}</span><div><b>${esc(me.name)}</b><span>${esc(role().label)}</span></div><button title="Salir" data-act="logout">${I.out}</button></div>
      </div>
    </aside>
    <div class="main">
      ${({ panel: panelView, venta: ventaView, inventario: invView, gastos: gastosView, reportes: repView, catalogos: catView, usuarios: usersView })[v]()}
    </div>
    <div class="dock">
      ${v === "venta" && S.cart.length ? cartBarHTML() : ""}
      <nav class="tabbar">${tabViews().main.map(([k, l]) => `<a href="#${k}" class="${v === k ? "active" : ""}">${I[k]}<span>${l}</span>${tabBadge(k, low)}</a>`).join("")}${tabViews().more.length ? `<button type="button" class="tab-more ${tabViews().more.some(([k]) => k === v) ? "active" : ""}" data-act="more" aria-label="Más opciones">${LI("layout-grid")}<span>Más</span>${tabViews().more.some(([k]) => tabBadge(k, low)) ? `<span class="badge dot"></span>` : ""}</button>` : ""}</nav>
    </div>
  </div>`;
  bind();
  if (S.lastView !== v) { const first = !S.lastView; S.lastView = v; animateView(first); }
  const ci = $(".cart-items-d");
  if (ci) {
    ci.scrollTop = _ciTop;
    // la prenda recién agregada se muestra aunque esté al final de la lista
    if (S.lastAdd && Date.now() - S.lastAdd.at < 400) { const it = ci.querySelector(`[data-vid="${S.lastAdd.vid}"]`); if (it) it.scrollIntoView({ block: "nearest" }); }
  }
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
const greet = () => { const h = new Date().getHours(); return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches"; };
const topbar = (title, sub, right = "") => `<header class="topbar"><div><h1>${title}</h1><div class="sub">${sub}</div></div><div class="grow"></div>${right}${tabViews().more.length ? "" : `<button class="btn icon hide-d" data-act="logout" title="Salir">${I.out}</button>`}</header>`;
// Barra inferior del teléfono: hasta 5 botones; si hay más pantallas, el quinto es "Más"
function tabViews() {
  const all = NAV.filter(([k]) => role().views.includes(k));
  return all.length > 5 ? { main: all.slice(0, 4), more: all.slice(4) } : { main: all, more: [] };
}
const SHEET_TONE = { panel: "t-rose", venta: "t-rose", inventario: "t-gold", gastos: "t-sage", reportes: "t-berry", catalogos: "t-gold", usuarios: "t-sage" };
const SHEET_SUB = { reportes: "Ventas, utilidad y socios", catalogos: "Tienda, recibo y listas", usuarios: "Equipo, roles y permisos", gastos: "Registrar y revisar", inventario: "Stock y productos" };
// Hoja que sube desde abajo, como en las apps nativas
function moreSheet() {
  const v = view(), low = lowStock().length;
  $("#modal-root").innerHTML = `<div class="overlay sheet-ov"><div class="sheet" role="dialog" aria-modal="true" aria-label="Más opciones">
    <div class="sheet-grab" aria-hidden="true"></div>
    <div class="sheet-me"><span class="avatar ${me.role === "propietaria" ? "red" : ""}">${esc(initials(me.name))}</span><span><b>${esc(me.name)}</b><small>${esc(role().label)} · ${esc(DB.settings.store)}</small></span></div>
    <nav class="sheet-grid">${tabViews().more.map(([k, l]) => `<a href="#${k}" class="sheet-item ${v === k ? "on" : ""}" data-close><span class="ct-ico sm ${SHEET_TONE[k] || "t-rose"}">${I[k]}</span><span class="si-t"><b>${l}</b><small>${SHEET_SUB[k] || ""}</small></span>${tabBadge(k, low)}${LI("chevron-right", "si-go")}</a>`).join("")}</nav>
    ${installHTML()}
    <button class="sheet-out" data-act="logout">${LI("log-out")} Cerrar sesión</button>
  </div></div>`;
  document.body.classList.add("lock");
  // Deslizar hacia abajo para cerrar
  const sh = $(".sheet"); let y0 = null, dy = 0;
  sh.addEventListener("touchstart", (e) => { if (sh.scrollTop > 0) return; y0 = e.touches[0].clientY; dy = 0; sh.style.transition = "none"; }, { passive: true });
  sh.addEventListener("touchmove", (e) => { if (y0 == null) return; dy = Math.max(0, e.touches[0].clientY - y0); sh.style.transform = `translateY(${dy}px)`; }, { passive: true });
  sh.addEventListener("touchend", () => { if (y0 == null) return; y0 = null; sh.style.transition = ""; if (dy > 90) closeSheet(); else sh.style.transform = ""; });
}
function closeSheet() {
  const ov = $(".sheet-ov"); if (!ov) return;
  ov.classList.add("closing"); setTimeout(() => { if ($(".sheet-ov")) closeModal(); }, 220);
}

/* ---------- Login ---------- */
// Fondo del login: prendas y accesorios como marca de agua, en posiciones fijas
const LOGIN_DECO = [
  ["Vestidos", 6, 8, 62, -12], ["Bolsos", 22, 3, 46, 10], ["Destello", 38, 10, 26, 0, 1], ["Tacones", 74, 6, 58, 14], ["Corazon", 90, 14, 30, -8, 1],
  ["Gancho", 3, 30, 52, 8], ["Labial", 18, 22, 34, -16], ["Lentes", 86, 32, 48, -10], ["Blusas", 68, 24, 40, 6],
  ["Sandalias", 8, 52, 50, -6], ["Corazon", 26, 44, 22, 12, 1], ["Carteras", 80, 50, 54, 8], ["Destello", 94, 46, 20, 0],
  ["Faldas", 4, 74, 48, 10], ["Accesorios", 20, 66, 36, -10], ["Destello", 30, 86, 24, 0, 1], ["Pantalones", 70, 72, 46, -8],
  ["Gancho", 88, 70, 44, -14], ["Tenis", 52, 90, 50, 6], ["Corazon", 14, 92, 26, -6], ["Bolsos", 92, 90, 42, 12, 1], ["Labial", 62, 4, 28, 18]
];
function loginPattern() {
  return `<div class="login-bg" aria-hidden="true">${LOGIN_DECO.map(([k, x, y, sz, rot, red]) => `<span class="deco ${red ? "red" : ""}" style="left:${x}%;top:${y}%;--s:${sz};transform:translate(-50%,-50%) rotate(${rot}deg)">${ART.icon(k)}</span>`).join("")}</div>`;
}
function loginView(err) {
  if (CLOUD) return `<div class="login">${loginPattern()}<form class="login-card" id="loginForm">
    <div class="login-logo"><img src="icons/logo-t.png" alt="Ari's Closet"></div>
    <h1 class="lg-title">Ingresá tus credenciales de acceso</h1>
    <div class="field"><label for="lgE">Usuario</label><div class="lg-user"><input id="lgE" name="e" type="text" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="Ej. nusuario" required><span class="lg-state" id="lgState" aria-hidden="true"></span></div></div>
    <div class="lg-who" id="lgWho" aria-live="polite"></div>
    <div class="field"><label for="lgP">Contraseña</label><input id="lgP" name="p" type="password" autocomplete="current-password" required></div>
    <div class="lg-err" id="lgErr" role="alert"></div>
    ${err ? `<div class="err">${esc(err)}</div>` : ""}
    <div class="lg-btns"><button class="btn lg" type="button" id="lgCancel">Cancelar</button><button class="btn dark lg" type="submit" id="lgGo">Entrar</button></div>
    <div class="lg-foot"><button class="btn ghost sm" type="button" id="lgForgot">Olvidé mi contraseña</button>${installHTML()}</div>
  </form></div>`;
  return `<div class="login">${loginPattern()}<form class="login-card" id="loginForm">
    <div class="login-logo"><img src="icons/logo-t.png" alt="Ari's Closet"></div>
    <h1 class="lg-title">Ingresá tus credenciales de acceso</h1>
    <div class="field"><label>Usuario</label><select name="u">${DB.users.filter(u => u.active).map(u => `<option value="${u.id}">${esc(u.name)} · ${esc(DB.roles[u.role].label)}</option>`).join("")}</select></div>
    <div class="field"><label>Contraseña</label><input name="p" type="password" value="1234" required></div>
    <button class="btn dark lg block" type="submit">Entrar</button>
    <p class="hint">Demo: la contraseña de todos es <b>1234</b>. PIN de autorización de Ariana: <b>1234</b>.</p>
    ${installHTML()}
  </form></div>`;
}
function byeScreen() {
  app.innerHTML = `<div class="login">${loginPattern()}<div class="login-card bye">
    <div class="login-logo"><img src="icons/logo-t.png" alt="Ari's Closet"></div>
    <h1>¡Hasta pronto!</h1>
    <p>El ingreso se canceló. Ya podés cerrar esta ${isStandalone() ? "ventana" : "pestaña"}.</p>
    <button class="btn lg block" id="byeBack">Volver a ingresar</button>
  </div></div>`;
  $("#byeBack").onclick = () => render();
}
function bindLogin() {
  if (CLOUD) {
    $("#loginForm").onsubmit = async (e) => {
      e.preventDefault(); const f = new FormData(e.target), btn = e.target.querySelector("[type=submit]");
      btn.disabled = true; btn.textContent = "Entrando…";
      const { data, error } = await sb.auth.signInWithPassword({ email: toEmail(f.get("e")), password: f.get("p") });
      if (error) {
        btn.disabled = false; btn.textContent = "Entrar";
        const bad = /invalid login credentials/i.test(error.message || "");
        // Si el usuario ya se reconoció arriba, el problema es solo la contraseña
        const msg = bad && found ? "Contraseña incorrecta. Intentá de nuevo." : errMsg(error);
        $("#lgErr").innerHTML = `${LI("circle-alert")}<span>${esc(msg)}</span>`; $("#lgErr").classList.add("on");
        if (bad && found) { const pw = $("#lgP"); pw.classList.add("invalid"); pw.select(); pw.focus(); }
        return;
      }
      cloudStart(data.user);
    };
    // Al escribir el usuario se busca en la base y se muestra su nombre (o se avisa que no existe)
    const inp = $("#lgE"), who = $("#lgWho"), state = $("#lgState"), go = $("#lgGo");
    let seq = 0, timer = null, found = null, checked = "";
    const show = (cls, html, st) => { who.className = "lg-who " + cls; who.innerHTML = html; state.className = "lg-state " + (st || ""); };
    const check = async () => {
      const u = inp.value.trim(); if (u === checked) return; const my = ++seq; found = null; checked = u;
      if (u.length < 3) { go.disabled = false; return show("", ""); }
      state.className = "lg-state busy";
      let r; try { r = await sbq(sb.rpc("login_lookup", { p_email: toEmail(u) })); } catch (e) { console.warn("login_lookup no disponible (¿falta correr 0006_login.sql?)", e); if (my === seq) { go.disabled = false; checked = ""; show("", ""); } return; }
      if (my !== seq) return;
      if (!r || !r.found) { go.disabled = true; return show("bad", `<span><b>No existe el usuario “${esc(u)}”</b><small>Revisá cómo lo escribiste.</small></span>`, "bad"); }
      if (!r.active) { go.disabled = false; return show("warn", `<span class="avatar grey">${esc(initials(r.name))}</span><span><b>${esc(r.name)}</b><small>Cuenta pendiente de activación</small></span>`, "warn"); }
      found = r; go.disabled = false;
      show("ok", `<span class="avatar ${/propiet/i.test(r.role) ? "red" : ""}">${esc(initials(r.name))}</span><span><small>Hola,</small><b>${esc(r.name)}</b><small>${esc(r.role)}</small></span>`, "ok");
    };
    inp.oninput = () => { $("#lgErr").classList.remove("on"); $("#lgP").classList.remove("invalid"); clearTimeout(timer); go.disabled = false; timer = setTimeout(check, 350); };
    inp.onblur = () => { clearTimeout(timer); check(); };
    inp.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); clearTimeout(timer); check().then(() => { if (found || !go.disabled) $("#lgP").focus(); }); } };
    // Autocompletado del navegador: revisa el usuario aunque no se haya tecleado
    $("#lgP").onfocus = () => check();
    $("#lgP").oninput = () => { $("#lgP").classList.remove("invalid"); $("#lgErr").classList.remove("on"); };
    setTimeout(() => { if (inp.value.trim()) check(); }, 700);
    // Cancelar: cierra la app instalada o la pestaña; si el navegador no lo permite, deja la pantalla de despedida
    $("#lgCancel").onclick = () => {
      seq++; clearTimeout(timer); found = null; checked = ""; inp.value = ""; $("#lgP").value = "";
      try { window.close(); } catch {}
      setTimeout(() => { if (!window.closed) byeScreen(); }, 250);
    };
    $("#lgForgot").onclick = async () => {
      const email = $("#lgE").value.trim();
      if (!email.includes("@")) return toast("Pedile a la propietaria que te asigne una contraseña nueva (Usuarios → Editar)");
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
      toast(error ? errMsg(error) : "Te enviamos un correo para crear una contraseña nueva", !!error);
    };
    return;
  }
  $("#loginForm").onsubmit = (e) => { e.preventDefault(); const f = new FormData(e.target); const u = DB.users.find(x => x.id === f.get("u")); if (u && u.pass === f.get("p")) login(u); else toast("Contraseña incorrecta", true); };
}

/* ---------- Panel ---------- */
function panelView() {
  if (!can("seeAllSales")) return myPanelView();
  const t = today(), s = scoped(salesOf(t));
  const WD = lastN(S.spk), W = WD.map(d => { const ds = scoped(salesOf(d)); return { total: ds.reduce((a, x) => a + x.total, 0), n: ds.length, disc: ds.reduce((a, x) => a + (x.discount ? x.discount.amount : 0), 0), cost: ds.reduce((a, x) => a + x.items.reduce((b, i) => b + i.cost * i.qty, 0), 0), units: ds.reduce((a, x) => a + x.items.reduce((b, i) => b + i.qty, 0), 0), exp: scopedExp(expFor([d])).reduce((a, e) => a + e.amount, 0) }; });
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 7);
  const lastWeek = scoped(salesOf(dayOf(yesterday))).reduce((a, x) => a + x.total, 0);
  const total = s.reduce((a, x) => a + x.total, 0), disc = s.reduce((a, x) => a + (x.discount ? x.discount.amount : 0), 0);
  const cost = s.reduce((a, x) => a + x.items.reduce((b, i) => b + i.cost * i.qty, 0), 0);
  const exp = scopedExp(expFor([t])).reduce((a, e) => a + e.amount, 0);
  const delta = lastWeek ? Math.round((total - lastWeek) / lastWeek * 100) : 0;
  const mine = me.role === "vendedor";
  const list = (mine ? s.filter(x => x.seller === me.id) : s).slice().sort((a, b) => b.at.localeCompare(a.at) || b.n - a.n);
  const bySeller = DB.users.map(u => ({ u, t: s.filter(x => x.seller === u.id).reduce((a, x) => a + x.total, 0) })).filter(x => x.t > 0).sort((a, b) => b.t - a.t);
  const max = Math.max(1, ...bySeller.map(x => x.t));
  const hours = Array.from({ length: 12 }, (_, i) => s.filter(x => new Date(x.at).getHours() === 9 + i).reduce((a, x) => a + x.total, 0));
  const hmax = Math.max(1, ...hours);
  const byPartner = DB.partners.map(p => { const ps = salesOf(t).map(x => scopeSale(x, p.id)).filter(Boolean); return { p, t: ps.reduce((a, x) => a + x.total, 0), q: ps.reduce((a, x) => a + x.items.reduce((b, i) => b + i.qty, 0), 0) }; });
  const pmax = Math.max(1, ...byPartner.map(x => x.t));
  return topbar(`${greet()}, ${esc(me.name.split(" ")[0])}`, S.partner === "all" ? fmtDL(new Date()) : `${esc(partnerById(S.partner).name)} · ${fmtDL(new Date())}`, `
    ${!mine && !CLOUD ? `<label class="toggle hide-m" title="Genera una venta de otro dispositivo cada pocos segundos"><input type="checkbox" id="simToggle" ${S.sim ? "checked" : ""}> <span class="tl-long">Simular ventas de otros dispositivos</span><span class="tl-short">Simular</span></label>` : ""}
    ${spkRangeSeg("hide-m")}<a href="#venta" class="btn red">${I.plus}<span class="hide-m">Nueva venta</span></a>`) + `
  <div class="content">
    ${partnerSeg() ? `<div class="panel-tools">${partnerSeg()}${spkRangeSeg("hide-d")}</div>` : `<div class="panel-tools hide-d">${spkRangeSeg()}</div>`}
    <section class="kpis">
      <div class="card kpi hero k1"><div class="lbl">Ventas de hoy<span class="ico">${I.trend}</span></div><div class="val">${money(total)}</div><div class="foot">${lastWeek ? `${deltaChip(total, lastWeek)} vs. hace una semana` : "Sin referencia semanal"}</div>${spark(W.map(d => d.total), WD)}</div>
      <div class="card kpi k2"><div class="lbl">Facturas<span class="ico">${I.ticket}</span></div><div class="val">${s.length}</div><div class="foot">${deltaChip(s.length, W[0].n)} Promedio ${money(s.length ? total / s.length : 0)}</div>${spark(W.map(d => d.n), WD, "int")}</div>
      <div class="card kpi k3"><div class="lbl">Descuentos<span class="ico">${I.disc}</span></div><div class="val red">${money(disc)}</div><div class="foot">${s.filter(x => x.discount).length} ventas · ${total ? (disc / (total + disc) * 100).toFixed(1) : 0} %</div>${spark(W.map(d => d.disc), WD)}</div>
      ${can("canSeeProfit") ? `<div class="card kpi k4"><div class="lbl">Utilidad estimada<span class="ico">${I.cash}</span></div><div class="val">${money(total - cost - exp)}</div><div class="foot">Margen ${total ? Math.round((total - cost) / total * 100) : 0} % · gastos ${money(exp)}</div>${spark(W.map(d => d.total - d.cost - d.exp), WD)}</div>`
        : `<div class="card kpi k4"><div class="lbl">Artículos vendidos<span class="ico">${I.inventario}</span></div><div class="val">${s.reduce((a, x) => a + x.items.reduce((b, i) => b + i.qty, 0), 0)}</div><div class="foot">${lowStockP().length} variantes en stock bajo</div>${spark(W.map(d => d.units), WD, "int")}</div>`}
    </section>
    <div class="grid-2">
      <section class="card">
        <div class="card-h"><h2>${mine ? "Mis ventas de hoy" : "Ventas en vivo"} <span class="live">EN VIVO</span></h2><span class="hint live-count">${list.length} ${list.length === 1 ? "venta" : "ventas"} · ${money(list.reduce((a, x) => a + x.total, 0))}</span><a href="#reportes" class="btn sm ${role().views.includes("reportes") ? "" : "hide-m hide-d"}">Reportes</a></div>
        <div class="tbl-wrap live-list lv-a"><table><thead><tr><th>Hora</th><th>Vendedora</th><th>Artículos</th><th>Descuento</th><th class="r">Total</th></tr></thead><tbody>
        ${list.length ? list.map((x, i) => `<tr class="${i === 0 ? "hl" : ""} clickable" data-sale-detail="${x.id}" title="Ver detalle"><td><b>${fmtT(x.at)}</b><span class="tk">#${x.n}</span></td><td><span class="who"><span class="avatar ${avatarCls(x.seller)}" title="${esc(userById(x.seller).name)}">${esc(userById(x.seller).name[0])}</span><span class="who-n">${esc(userById(x.seller).name)}</span></span></td><td>${itemsCell(x)}</td><td>${discChip(x.discount)}</td><td class="r"><b>${money(x.total)}</b></td></tr>`).join("") : `<tr><td colspan="6" class="empty">Todavía no hay ventas hoy. ¡Registrá la primera!</td></tr>`}
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
        <section class="card"><div class="card-h"><h2>Ventas por hora</h2><span class="hint">${peakHint(hours)}</span></div><div class="card-b"><div class="mini-chart">${hours.map((h, i) => `<i class="${h === hmax && h > 0 ? "red" : ""}" style="height:${h / hmax * 100}%" title="${9 + i}:00 · ${money(h)}"></i>`).join("")}</div>${chartX(HOURS)}</div></section>` : ""}
      </div>
    </div>
  </div>`;
}
// Etiquetas bajo un gráfico de barras (horas o días)
const chartX = (labels, every = 1) => `<div class="chart-x">${labels.map((l, i) => `<span>${i % every === 0 || i === labels.length - 1 ? l : ""}</span>`).join("")}</div>`;
const HOURS = Array.from({ length: 12 }, (_, i) => 9 + i);
const peakHint = (hours) => { const m = Math.max(...hours); return m > 0 ? `Pico ${HOURS[hours.indexOf(m)]} h · ${money(m)}` : "9 h – 20 h"; };
const dayShort = (d) => new Date(d + "T12:00").toLocaleDateString("es", { weekday: "short" }).replace(".", "");
const dayNum = (d) => String(+d.slice(8));
// Celda de artículos: una prenda = su nombre; varias = "N artículos" (el detalle se abre al tocar la fila)
function itemsCell(x) {
  const units = x.items.reduce((a, i) => a + i.qty, 0);
  if (x.items.length === 1) { const i = x.items[0]; return `<span class="it-one">${i.qty > 1 ? i.qty + " × " : ""}${esc(i.name)} <span class="hint">${esc(i.size)}</span></span>`; }
  return `<span class="it-many">${I.ticket}${units} artículos</span>`;
}
function saleDetailModal(id) {
  const x = DB.sales.find(s => s.id === id); if (!x) return;
  const showCost = can("canSeeProfit");
  const split = DB.partners.length > 1 && can("seeAllSales") ? DB.partners.map(p => ({ p, v: scopeSale(x, p.id) })).filter(o => o.v) : [];
  const cost = x.items.reduce((a, i) => a + i.cost * i.qty, 0);
  modal(`<div class="modal-h"><div><h3>Factura #${x.n}</h3><div class="hint">${fmtDL(new Date(x.at))} · ${fmtT(x.at)}</div></div><button class="btn icon ghost" data-close>${I.x}</button></div>
    <div class="sd-meta"><span class="who"><span class="avatar ${avatarCls(x.seller)}">${esc(userById(x.seller).name[0])}</span>${esc(userById(x.seller).name)}</span><span class="chip">${esc(x.pay)}</span>${x.discount ? discChip(x.discount) : ""}${x.status !== "cerrada" ? `<span class="chip red">${esc(x.status)}</span>` : ""}</div>
    <div class="sd-items">${x.items.map(i => `<div class="cart-item">${ART.thumb(prodById(i.pid) || { cat: "" }, "sm")}<div class="i"><b>${esc(i.name)}</b><span>${esc(i.size)} · ${esc(i.color)} · ${i.qty} × ${money(i.price)}${split.length > 1 ? ` · ${esc(partnerById(itemPartner(i)).name)}` : ""}</span></div><b class="sd-amt">${money(i.price * i.qty)}</b></div>`).join("")}</div>
    <div class="totals" style="padding:0 2px">
      <div><span>${x.items.reduce((a, i) => a + i.qty, 0)} artículos · subtotal</span><span>${money(x.subtotal)}</span></div>
      ${x.discount ? `<div class="d"><span>Descuento ${x.discount.pct} %${x.discount.type === "pin" ? " · autorizó " + esc(userById(x.discount.by).name) : x.discount.type === "codigo" ? " · código " + esc(x.discount.code) : ""}</span><span>− ${money(x.discount.amount)}</span></div>` : ""}
      <div class="sd-total"><span>Total</span><span>${money(x.total)}</span></div>
      ${showCost ? `<div><span>Costo de la mercadería</span><span>${money(cost)}</span></div><div><span>Margen</span><span style="color:var(--green);font-weight:600">${money(x.total - cost)} · ${x.total ? Math.round((x.total - cost) / x.total * 100) : 0} %</span></div>` : ""}
    </div>
    ${split.length > 1 ? `<div class="split">${split.map(o => `<span class="who">${pDot(o.p.id)}${esc(o.p.name)} <b>${money(o.v.total)}</b></span>`).join("")}</div>` : ""}
    <div class="ticket-actions"><button class="btn" data-act="print" data-sale="${x.id}">${I.print} Reimprimir</button><button class="btn red" data-act="reticket" data-sale="${x.id}">${I.wa} Enviar factura</button>${can("canVoid") && x.status === "cerrada" ? `<button class="btn ghost" data-act="void" data-sale="${x.id}">Anular venta</button>` : ""}</div>`);
}
// Anular: devuelve las prendas al stock y la venta deja de contar en caja y reportes
function voidModal(id) {
  const x = DB.sales.find(s => s.id === id); if (!x) return;
  modal(`<div class="modal-h"><h3>Anular factura #${x.n}</h3><button class="btn icon ghost" data-close>${I.x}</button></div>
    <p class="hint" style="margin:0">Las ${x.items.reduce((a, i) => a + i.qty, 0)} prendas vuelven al inventario y ${money(x.total)} salen de la caja. Queda registrado quién la anuló.</p>
    <form id="f" class="form"><div class="field full"><label>Motivo</label><input name="reason" required placeholder="Ej. La clienta devolvió la compra"></div>
    <button class="btn red lg full">Anular venta</button></form>`, f => {
    const reason = f.get("reason").trim();
    if (CLOUD) return act(() => sbq(sb.rpc("void_sale", { p_sale: id, p_reason: reason })), `Factura #${x.n} anulado`);
    x.status = "anulada"; x.voidReason = reason;
    x.items.forEach(i => { const r = varById(i.vid); if (r) r.v.stock += i.qty; DB.moves.push({ id: uid(), at: new Date().toISOString(), vid: i.vid, partner: i.partner, type: "anulacion", qty: i.qty, by: me.id, ref: x.n }); });
    if (x.discount && x.discount.type === "codigo") { const dc = DB.discountCodes.find(d => d.code === x.discount.code); if (dc) dc.uses = Math.max(0, dc.uses - 1); }
    save(); render(); toast(`Factura #${x.n} anulado`);
  });
}
// Mini-gráfica de tendencia de cada tarjeta: datos reales de los últimos 7 o 30 días.
// Al pasar el mouse (o el dedo) muestra la fecha y el valor de cada día.
let _sparkN = 0;
function spark(vals, days, kind = "money") {
  const n = vals.length; if (n < 2) return "";
  const max = Math.max(...vals), min = Math.min(...vals, 0), rng = max - min || 1;
  const pts = vals.map((v, i) => [i * 100 / (n - 1), 30 - (v - min) / rng * 25]);
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < n; i++) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], cx = (x0 + x1) / 2; d += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`; }
  const id = "sg" + (++_sparkN), lastY = pts[n - 1][1] / 32 * 100;
  return `<div class="spk" data-vals="${vals.join(",")}" data-days="${(days || []).join(",")}" data-kind="${kind}">
    <svg class="spark" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".28"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs><path d="${d} L100,32 L0,32 Z" fill="url(#${id})"/><path d="${d}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>
    <i class="spk-today" style="top:${lastY}%"></i><i class="spk-dot"></i><i class="spk-line"></i>
    <span class="spk-lbl">${n} días</span><span class="spk-tip"></span>
  </div>`;
}
const lastN = (n) => { const out = []; for (let i = n - 1; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); out.push(dayOf(d)); } return out; };
// Interacción de las mini-gráficas
function spkMove(e) {
  const box = e.target.closest && e.target.closest(".spk"); if (!box) return;
  const pt = e.touches ? e.touches[0] : e, r = box.getBoundingClientRect();
  const vals = box.dataset.vals.split(",").map(Number), days = box.dataset.days.split(","), n = vals.length;
  const i = Math.max(0, Math.min(n - 1, Math.round((pt.clientX - r.left) / r.width * (n - 1))));
  const max = Math.max(...vals), min = Math.min(...vals, 0), rng = max - min || 1;
  const x = i / (n - 1) * 100, y = (30 - (vals[i] - min) / rng * 25) / 32 * 100;
  const dot = box.querySelector(".spk-dot"), line = box.querySelector(".spk-line"), tip = box.querySelector(".spk-tip");
  dot.style.left = line.style.left = x + "%"; dot.style.top = y + "%";
  const dd = days[i] ? new Date(days[i] + "T12:00") : null;
  const when = i === n - 1 ? "Hoy" : dd ? dd.toLocaleDateString("es", { weekday: "short", day: "numeric", month: "short" }) : "";
  const v = box.dataset.kind === "money" ? money(vals[i]) : vals[i].toLocaleString("en-US");
  tip.innerHTML = `<b>${v}</b><span>${when}</span>`;
  tip.style.left = Math.min(Math.max(x, 18), 82) + "%";
  box.classList.add("on");
}
document.addEventListener("mousemove", (e) => { const on = document.querySelector(".spk.on"); const box = e.target.closest && e.target.closest(".spk"); if (on && on !== box) on.classList.remove("on"); if (box) spkMove(e); });
document.addEventListener("touchstart", (e) => { document.querySelectorAll(".spk.on").forEach(x => { if (!x.contains(e.target)) x.classList.remove("on"); }); if (e.target.closest && e.target.closest(".spk")) spkMove(e); }, { passive: true });
document.addEventListener("touchmove", (e) => { if (e.target.closest && e.target.closest(".spk")) spkMove(e); }, { passive: true });
const spkRangeSeg = (cls = "") => `<div class="seg spk-seg ${cls}" role="group" aria-label="Período de las tendencias"><span class="hint hide-m">Tendencia</span>${[7, 30].map(n => `<button data-spk="${n}" class="${S.spk === n ? "on" : ""}">${n} días</button>`).join("")}</div>`;
const last7 = () => lastN(7);
const deltaChip = (now, before) => { if (!before) return ""; const d = Math.round((now - before) / before * 100); return `<span class="chip ${d >= 0 ? "green" : "red"}">${d >= 0 ? "↑" : "↓"} ${Math.abs(d)} %</span>`; };
const discChip = (d) => d ? `<span class="chip red">${d.type === "codigo" ? "Código " + esc(d.code) : d.type === "pin" ? d.pct + " % con PIN" : d.pct + " % manual"}</span>` : `<span class="nodisc" style="color:var(--faint)">—</span>`;

// Panel de quien solo ve lo suyo: lo vendido, unidades y stock. Sin costos, márgenes ni caja de la tienda.
function myPanelView() {
  const t = today(), mine = (d) => salesOf(d).filter(x => x.seller === me.id), SD = lastN(S.spk);
  const s = mine(t), units = s.reduce((a, x) => a + x.items.reduce((b, i) => b + i.qty, 0), 0), total = s.reduce((a, x) => a + x.total, 0);
  const week = []; for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); week.push(dayOf(d)); }
  const ws = week.map(d => mine(d)), wTotal = ws.flat().reduce((a, x) => a + x.total, 0), wUnits = ws.flat().reduce((a, x) => a + x.items.reduce((b, i) => b + i.qty, 0), 0);
  const top = {}; s.forEach(x => x.items.forEach(i => { const k = `${i.name}\u0001${i.size} ${i.color}`; top[k] = top[k] || { q: 0, t: 0 }; top[k].q += i.qty; top[k].t += Math.round(i.price * i.qty * (x.subtotal ? x.total / x.subtotal : 1)); }));
  const topL = Object.entries(top).sort((a, b) => b[1].q - a[1].q);
  const list = s.slice().sort((a, b) => b.at.localeCompare(a.at));
  const perDay = ws.map(x => x.reduce((a, y) => a + y.items.reduce((b, i) => b + i.qty, 0), 0)), pmax = Math.max(1, ...perDay);
  return topbar(`${greet()}, ${esc(me.name.split(" ")[0])}`, `Mis ventas · ${fmtDL(new Date())}`, `${spkRangeSeg("hide-m")}<a href="#venta" class="btn red">${I.plus}<span class="hide-m">Nueva venta</span></a>`) + `
  <div class="content">
    <div class="panel-tools hide-d">${spkRangeSeg()}</div>
    <section class="kpis">
      <div class="card kpi hero k1"><div class="lbl">Vendido hoy<span class="ico">${I.trend}</span></div><div class="val">${money(total)}</div><div class="foot">${s.length} ${s.length === 1 ? "venta" : "ventas"}</div>${spark(SD.map(d => mine(d).reduce((a, y) => a + y.total, 0)), SD)}</div>
      <div class="card kpi k2"><div class="lbl">Unidades hoy<span class="ico">${I.inventario}</span></div><div class="val">${units}</div><div class="foot">${s.length ? (units / s.length).toFixed(1) + " por venta" : "Todavía sin ventas"}</div>${spark(SD.map(d => mine(d).reduce((a, y) => a + y.items.reduce((b, i) => b + i.qty, 0), 0)), SD, "int")}</div>
      <div class="card kpi k3"><div class="lbl">Vendido en 7 días<span class="ico">${I.ticket}</span></div><div class="val">${money(wTotal)}</div><div class="foot">${wUnits} unidades</div>${spark(SD.map(d => mine(d).length), SD, "int")}</div>
      <div class="card kpi k4 warn"><div class="lbl">Stock bajo<span class="ico">${I.warn}</span></div><div class="val red">${lowStock().length}</div><div class="foot">variantes por agotarse</div><div class="meter"><i style="width:${Math.min(100, lowStock().length / Math.max(1, DB.products.reduce((a, p) => a + p.variants.length, 0)) * 100)}%"></i></div></div>
    </section>
    <div class="grid-2">
      <div class="stack">
        <section class="card"><div class="card-h"><h2>Mis ventas de hoy</h2><span class="hint">${s.length} · ${money(total)}</span></div>
          <div class="tbl-wrap live-list lv-b"><table><thead><tr><th>Hora</th><th>Factura</th><th>Artículos</th><th class="r">Uds.</th><th>Pago</th><th class="r">Total</th></tr></thead><tbody>
          ${list.length ? list.map((x, i) => `<tr class="${i === 0 ? "hl" : ""} clickable" data-sale-detail="${x.id}" title="Ver detalle"><td><b>${fmtT(x.at)}</b></td><td style="color:var(--muted)">#${x.n}</td><td>${itemsCell(x)}</td><td class="r">${x.items.reduce((a, i) => a + i.qty, 0)}</td><td><span class="chip">${esc(x.pay)}</span></td><td class="r"><b>${money(x.total)}</b></td></tr>`).join("") : `<tr><td colspan="6" class="empty">Todavía no vendiste hoy. ¡A vender!</td></tr>`}
          </tbody></table></div></section>
        <section class="card"><div class="card-h"><h2>Lo que vendí hoy</h2><span class="hint">por producto</span></div>
          <div class="tbl-wrap"><table><thead><tr><th>Producto</th><th>Variante</th><th class="r">Uds.</th><th class="r">Vendido</th></tr></thead><tbody>
          ${topL.map(([k, v]) => { const [n, vr] = k.split("\u0001"); return `<tr><td><b>${esc(n)}</b></td><td>${esc(vr)}</td><td class="r">${v.q}</td><td class="r">${money(v.t)}</td></tr>`; }).join("") || `<tr><td colspan="4" class="empty">Sin ventas hoy</td></tr>`}
          </tbody></table></div></section>
      </div>
      <div class="stack">
        <section class="card"><div class="card-h"><h2>Mis unidades · 7 días</h2></div><div class="card-b"><div class="mini-chart" style="height:90px">${perDay.map((v, i) => `<i class="${i === perDay.length - 1 ? "red" : ""}" style="height:${v / pmax * 100}%" title="${week[i]} · ${v} uds."></i>`).join("")}</div>${chartX(week.map((d, i) => i === week.length - 1 ? "hoy" : dayShort(d)))}</div></section>
        <section class="card"><div class="card-h"><h2>${I.warn} Stock bajo</h2><span class="badge">${lowStock().length}</span></div>
          <div class="card-b list" style="padding-top:4px;padding-bottom:4px">${lowStock().slice(0, 8).map(({ p, v }) => `<div class="row"><span><span class="t">${esc(p.name)}</span><span class="s">${esc(v.size)} · ${esc(v.color)}</span></span><span class="chip ${v.stock === 0 ? "solid-red" : v.stock <= 1 ? "red" : ""}">${v.stock}</span></div>`).join("") || `<div class="empty">Todo con stock suficiente</div>`}</div>
          <div style="padding:0 18px 18px"><a href="#inventario" class="btn outline block">Ver todo el inventario</a></div></section>
      </div>
    </div>
  </div>`;
}

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
  return topbar("Nueva venta", `${CLOUD ? "" : "Factura #" + n + " · "}${esc(me.name)}`, `<button class="btn" data-act="camscan" title="Escanear con la cámara de este equipo">${I.cam}<span class="hide-m">Cámara</span></button><button class="btn hide-m ${phoneOnline() ? "scan-on" : ""}" data-act="pair" id="scanBadge" title="Usar un celular como escáner de esta computadora">${I.phone}<span>${phoneOnline() ? "Celular conectado" : "Escanear con celular"}</span></button>`) + `
  <div class="content pos">
    <section class="stack" style="gap:12px">
      <div class="search full">${I.search}<input id="posQ" placeholder="Buscar producto, talla, color o código de barras" value="${esc(S.q)}" autocomplete="off" enterkeyhint="search"></div>
      <div class="prod-grid">${prods.map(p => `<div class="prod">${ART.thumb(p, "big")}<b>${esc(p.name)}</b><span class="hint">${p.brand ? esc(p.brand) + " · " : ""}${esc(p.cat)}</span><span class="pr">${money(p.price)}</span>
        ${DB.partners.length > 1 ? `<span class="hint who" style="gap:6px">${pDot(p.partner)}${esc(partnerById(p.partner).name)}</span>` : ""}<div class="vars">${p.variants.map(v => `<button data-add="${v.id}" ${v.stock <= 0 ? "disabled" : ""} class="${v.stock <= DB.settings.lowStock ? "low" : ""}" title="Código ${esc(v.code)} · stock ${v.stock}">${esc(v.size)} ${esc(v.color)} · ${v.stock}</button>`).join("")}</div></div>`).join("") || `<div class="empty">Sin resultados</div>`}</div>
    </section>
    <aside class="card cart-panel hide-m" style="padding:16px">${cartHTML()}</aside>
  </div>`;
}
function cartItemsHTML() {
  return S.cart.length ? S.cart.map(c => `<div data-vid="${c.vid}" class="cart-item ${S.lastScan && S.lastScan.vid === c.vid && Date.now() - S.lastScan.at < 1500 ? "flash" : ""}">${ART.thumb(prodById(c.pid), "sm")}<div class="i"><b>${esc(c.name)}</b><span>${esc(c.size)} · ${esc(c.color)} · ${money(c.price)}</span></div>
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
    <div class="cart-items-d">${cartItemsHTML()}</div>
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
  S.lastAdd = { at: Date.now(), vid, name: `${r.p.name} ${r.v.size}` };
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
  if (CLOUD) return cobrarCloud();
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
// La venta se registra en la base (precios, stock y descuentos se validan allá)
async function cobrarCloud() {
  if (S.busy) return;
  const cart = S.cart.map(c => ({ ...c })), disc = S.disc, pay = S.pay;
  const p_discount = !disc ? null : disc.type === "manual" ? { type: "manual", pct: disc.pct } : disc.type === "codigo" ? { type: "codigo", code: disc.code } : { type: "pin", pct: disc.pct, pin: disc.pin };
  S.busy = true; busy(true);
  document.querySelectorAll('[data-act="cobrar"]').forEach(b => { b.disabled = true; b.dataset.txt = b.innerHTML; b.textContent = "Registrando…"; });
  try {
    const r = await sbq(sb.rpc("register_sale", { p_items: cart.map(c => ({ variant_id: c.vid, qty: c.qty })), p_payment: pay, p_discount, p_phone: null }));
    const sale = { id: r.id, n: +r.number, at: r.created_at, day: today(), seller: me.id, items: cart, subtotal: +r.subtotal, total: +r.total, pay, status: "cerrada",
      discount: disc ? { type: disc.type, pct: disc.pct, code: disc.code || null, by: disc.by || null, amount: +r.discount } : null };
    DB.sales.push(sale);
    cart.forEach(c => { const x = varById(c.vid); if (x) x.v.stock -= c.qty; });
    S.cart = []; S.disc = null; S.pay = "Efectivo"; S.cartOpen = false;
    render(); showTicket(sale); cloudSoon(1500);
  } catch (e) {
    toast(errMsg(e), true);
    document.querySelectorAll('[data-act="cobrar"]').forEach(b => { b.disabled = false; if (b.dataset.txt) b.innerHTML = b.dataset.txt; });
    cloudSoon(100);
  } finally { S.busy = false; busy(false); }
}
function ticketText(s) {
  const L = [DB.settings.store.toUpperCase(), "Factura #" + s.n, new Date(s.at).toLocaleString("es"), "Atendió: " + userById(s.seller).name, "".padEnd(32, "-")];
  s.items.forEach(i => L.push(`${i.qty} x ${i.name} ${i.size} ${i.color}`.slice(0, 32), `${money(i.price * i.qty)}`.padStart(32)));
  L.push("".padEnd(32, "-"), `Subtotal ${money(s.subtotal)}`.padStart(32));
  if (s.discount) L.push(`Descuento ${s.discount.pct}% -${money(s.discount.amount)}`.padStart(32));
  L.push(`TOTAL ${money(s.total)}`.padStart(32), `Pago: ${s.pay}`, "", "¡Gracias por tu compra!", "Encontrá tu estilo único");
  return L.join("\n");
}
// Recibo para impresora térmica de rollo (80 mm o 58 mm)
function receiptHTML(s) {
  const st = DB.settings, w58 = st.paper === "58";
  const d = new Date(s.at);
  const units = s.items.reduce((a, i) => a + i.qty, 0);
  const line = (l, r, cls = "") => `<div class="rc-row ${cls}"><span>${l}</span><span>${r}</span></div>`;
  return `<div class="receipt ${w58 ? "w58" : "w80"}">
    ${st.rcLogo ? `<img class="rc-logo" src="icons/logo-receipt.png" alt="">` : ""}
    ${st.rcLogo ? "" : `<div class="rc-store">${esc(st.store)}</div>`}
    ${st.rcAddress ? `<div class="rc-c">${esc(st.rcAddress)}</div>` : ""}
    ${st.rcPhone ? `<div class="rc-c">Tel. ${esc(st.rcPhone)}</div>` : ""}
    ${st.rcRuc ? `<div class="rc-c">RUC ${esc(st.rcRuc)}</div>` : ""}
    <div class="rc-sep"></div>
    ${line(`<b>Factura #${s.n}</b>`, d.toLocaleDateString("es", { day: "2-digit", month: "2-digit", year: "numeric" }))}
    ${line(`Atendió: ${esc(userById(s.seller).name)}`, d.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" }))}
    <div class="rc-sep"></div>
    ${s.items.map(i => `<div class="rc-item"><div class="rc-name">${esc(i.name)}</div>
      ${line(`<span class="rc-var">${esc(i.size)} · ${esc(i.color)}</span> ${i.qty} x ${money(i.price)}`, money(i.price * i.qty))}</div>`).join("")}
    <div class="rc-sep"></div>
    ${line(`Artículos: ${units}`, "")}
    ${line("Subtotal", money(s.subtotal))}
    ${s.discount ? line(`Descuento ${s.discount.pct} %${s.discount.type === "codigo" ? " (" + esc(s.discount.code) + ")" : ""}`, "− " + money(s.discount.amount)) : ""}
    ${line("TOTAL", money(s.total), "rc-total")}
    ${line("Forma de pago", esc(s.pay))}
    <div class="rc-sep"></div>
    <div class="rc-foot">${esc(st.rcFooter || "").replace(/\n/g, "<br>")}</div>
    ${st.rcLogo ? "" : `<div class="rc-tag">Encontrá tu estilo único</div>`}
  </div>`;
}
function setPage(css) { let el = document.getElementById("page-style"); if (!el) { el = document.createElement("style"); el.id = "page-style"; document.head.appendChild(el); } el.textContent = css; }
function showTicket(s) {
  const txt = ticketText(s);
  const split = DB.partners.map(p => ({ p, x: scopeSale(s, p.id) })).filter(o => o.x);
  modal(`<div class="modal-h"><h3>Venta registrada</h3><button class="btn icon ghost" data-close>${I.x}</button></div>
    <div style="display:flex;gap:12px;align-items:center"><span class="avatar" style="width:40px;height:40px;background:var(--green)">✓</span><div><b style="font-size:18px">${money(s.total)}</b><div class="hint">Factura #${s.n} · ${esc(s.pay)}${s.discount ? " · descuento " + s.discount.pct + " %" : ""}</div></div></div>
    ${split.length > 1 ? `<div class="split">${split.map(o => `<span class="who">${pDot(o.p.id)}${esc(o.p.name)} <b>${money(o.x.total)}</b></span>`).join("")}</div>` : ""}
    <div class="rc-preview">${receiptHTML(s)}</div>
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
  try { await navigator.share({ title: `${DB.settings.store} · Factura #${s.n}`, text: ticketText(s) }); } catch {}
}
function printTicket(id) {
  const s = DB.sales.find(x => x.id === id); if (!s) return;
  const w = DB.settings.paper === "58" ? 58 : 80;
  $("#print-root").innerHTML = receiptHTML(s);
  const go = () => {
    // Mide el recibo para que la página tenga su largo exacto (la impresora corta al final)
    const probe = document.createElement("div"); probe.className = "rc-probe"; probe.innerHTML = receiptHTML(s); document.body.appendChild(probe);
    const mm = Math.ceil(probe.firstElementChild.getBoundingClientRect().height * 25.4 / 96) + 4; probe.remove();
    setPage(`@page{size:${w}mm ${Math.max(60, mm)}mm;margin:0}`);
    window.print();
  };
  const img = new Image(); img.onload = img.onerror = go; img.src = "icons/logo-receipt.png";
  if (!DB.settings.rcLogo) go();
}

/* ---------- Inventario ---------- */
function invView() {
  const q = S.invQ.trim().toLowerCase();
  let prods = DB.products.filter(p => inPartner(p) && (!q || (p.name + p.brand + p.cat + p.variants.map(v => v.code).join(" ")).toLowerCase().includes(q)));
  if (S.invFilter === "Stock bajo") prods = prods.filter(p => p.variants.some(v => v.stock <= DB.settings.lowStock));
  else if (S.invFilter !== "Todo") { const shoes = ["Sandalias", "Tacones", "Tenis"], bags = ["Bolsos", "Carteras", "Accesorios"]; prods = prods.filter(p => S.invFilter === "Calzado" ? shoes.includes(p.cat) : S.invFilter === "Bolsos y accesorios" ? bags.includes(p.cat) : !shoes.includes(p.cat) && !bags.includes(p.cat)); }
  const pieces = DB.products.filter(inPartner).reduce((a, p) => a + p.variants.reduce((b, v) => b + v.stock, 0), 0);
  const value = DB.products.filter(inPartner).reduce((a, p) => a + p.variants.reduce((b, v) => b + v.stock * p.cost, 0), 0);
  return topbar("Inventario", `${pieces} piezas${can("canSeeCost") ? " · valor al costo " + money(value) : ""}`, `${can("canStockIn") ? `<button class="btn" data-act="labels" title="Imprimir etiquetas con código de barras">${I.barcode}<span class="hide-m">Etiquetas</span></button><button class="btn" data-act="stockin">${I.plus}<span class="hide-m">Entrada</span></button>` : ""}${can("canEditCatalog") ? `<button class="btn dark" data-act="newprod">${I.plus}<span class="hide-m">Producto</span></button>` : ""}`) + `
  <div class="content" style="gap:12px">
    ${partnerSeg()}
    <div class="search full">${I.search}<input id="invQ" placeholder="Producto, marca, categoría o código" value="${esc(S.invQ)}"></div>
    <div class="seg">${["Todo", "Ropa", "Calzado", "Bolsos y accesorios", "Stock bajo"].map(f => `<button data-inv="${f}" class="${S.invFilter === f ? "on" + (f === "Stock bajo" ? " red" : "") : ""}">${f}${f === "Stock bajo" ? " · " + lowStockP().length : ""}</button>`).join("")}</div>
    <div class="inv-grid">${prods.map(p => { const st = p.variants.reduce((a, v) => a + v.stock, 0); return `<div class="card inv-item"><div class="inv-top"><button class="art-btn" data-photo="${p.id}" title="${can("canEditCatalog") ? "Cambiar foto" : ""}" ${can("canEditCatalog") ? "" : "disabled"}>${ART.thumb(p, "sm")}</button><div class="i"><b>${esc(p.name)}</b><span>${p.brand ? esc(p.brand) + " · " : ""}${money(p.price)}${can("canSeeCost") ? " · costo " + money(p.cost) : ""}</span>${DB.partners.length > 1 ? `<span class="who" style="gap:6px;margin-top:3px">${pDot(p.partner)}${esc(partnerById(p.partner).name)}</span>` : ""}</div><div class="n"><b>${st}</b><span>en stock</span></div></div>
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
    const q = +f.get("qty");
    if (CLOUD) return act(() => sbq(sb.rpc("stock_in", { p_variant: r.v.id, p_qty: q, p_type: f.get("type"), p_note: null })), `+${q} ${r.p.name} ${r.v.size} ${r.v.color} · ${partnerById(r.p.partner).name}`);
    r.v.stock += q;
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
      <input name="v_code" value="${esc(v ? v.code : CLOUD ? "" : newCode())}" placeholder="${v || !CLOUD ? "Código" : "Automático"}" aria-label="Código de barras" inputmode="numeric">
      <span class="vstock" title="El stock se cambia con Registrar entrada">${v ? v.stock + " uds." : "nueva"}</span>
      <button type="button" class="btn ghost sm" data-delvrow data-stock="${v ? v.stock : 0}" title="${v && sold(v.id) ? "Tiene ventas: no se puede quitar" : "Quitar variante"}" ${v && (sold(v.id) || (v.stock > 0 && !can("canStockIn"))) ? "disabled" : ""}>${I.x}</button>
    </div>`;
  modal(`<div class="modal-h"><h3>Editar producto</h3><button class="btn icon ghost" data-close>${I.x}</button></div>
  <form id="f" class="form">
    <div class="field full"><label>Nombre</label><input name="name" required value="${esc(p.name)}"></div>
    <div class="field"><label>Categoría</label><select name="cat">${DB.categories.map(c => `<option ${c === p.cat ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></div>
    <div class="field"><label>Marca</label><select name="brand"><option value="">Sin marca</option>${DB.brands.map(c => `<option ${c === p.brand ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></div>
    ${can("canSeeCost") ? `<div class="field"><label>Costo</label><input name="cost" type="number" min="0" required value="${p.cost}"></div>` : `<input type="hidden" name="cost" value="${p.cost}">`}
    <div class="field"><label>Precio de venta</label><input name="price" type="number" min="0" required value="${p.price}"></div>
    <div class="field full"><label>Socio dueño</label><select name="partner">${partnerOpts(p.partner)}</select></div>
    <div class="field full"><label>Tallas y colores</label>
      <div id="vrows" class="vrows">${p.variants.map(vrow).join("")}</div>
      <button type="button" class="btn sm" id="addVrow" style="align-self:flex-start">${I.plus} Agregar variante</button>
      <span class="hint">El stock no se edita aquí: se cambia con <b>Registrar entrada</b> para que quede en el historial. Si quitás una variante que tiene unidades, se descuentan con un ajuste. Las que ya tienen ventas no se pueden quitar.</span>
    </div>
    <button class="btn dark lg full" type="submit">Guardar cambios</button>
    <button type="button" class="btn ghost full" data-act="delprod" data-pid="${p.id}" ${p.variants.some(v => sold(v.id)) ? "disabled title='Tiene ventas registradas'" : ""}>Eliminar producto</button>
  </form>`, (f) => {
    const rows = [...document.querySelectorAll("#vrows .vrow")].map(r => ({ id: r.dataset.vrow, size: r.querySelector("[name=v_size]").value.trim(), color: r.querySelector("[name=v_color]").value.trim(), code: r.querySelector("[name=v_code]").value.trim() }));
    if (!rows.length) { toast("El producto necesita al menos una variante", true); return false; }
    const codes = rows.map(r => r.code).filter(Boolean);
    if (new Set(codes).size !== codes.length) { toast("Hay códigos repetidos", true); return false; }
    const clash = codes.find(c => DB.products.some(x => x.id !== p.id && x.variants.some(v => v.code === c)));
    if (clash) { toast(`El código ${clash} ya lo usa otro producto`, true); return false; }
    if (CLOUD) return act(async () => {
      // Variantes quitadas que tenían unidades: se bajan a cero con un ajuste (queda en el kárdex)
      for (const v of p.variants) if (v.stock > 0 && !rows.some(r => r.id === v.id)) await sbq(sb.rpc("stock_in", { p_variant: v.id, p_qty: -v.stock, p_type: "ajuste", p_note: "Variante eliminada" }));
      await sbq(sb.rpc("save_product", { p: Object.assign({ id: p.id, name: f.get("name").trim(), category_id: CL.catId[f.get("cat")] || null, brand_id: CL.brandId[f.get("brand")] || null, partner_id: f.get("partner"), price: +f.get("price") },
      can("canSeeCost") ? { cost: +f.get("cost") } : {}, { variants: rows.map(r => ({ id: r.id === "new" ? null : r.id, size: r.size, color: r.color, barcode: r.code || null })) }) }));
    }, "Producto actualizado");
    Object.assign(p, { name: f.get("name").trim(), cat: f.get("cat"), brand: f.get("brand"), cost: +f.get("cost"), price: +f.get("price"), partner: f.get("partner") });
    p.variants = rows.map(r => { const v = p.variants.find(x => x.id === r.id) || { id: uid(), stock: 0 }; return Object.assign(v, { size: r.size, color: r.color, code: r.code || newCode() }); });
    save(); render(); toast("Producto actualizado");
  });
  $("#addVrow").onclick = () => { $("#vrows").insertAdjacentHTML("beforeend", vrow(null)); $("#vrows .vrow:last-child input").focus(); };
  $("#vrows").onclick = (e) => {
    const b = e.target.closest("[data-delvrow]"); if (!b || b.disabled) return;
    const n = +b.dataset.stock || 0;
    if (n > 0 && !confirm(`Esta variante tiene ${n} ${n === 1 ? "unidad" : "unidades"}. Al guardar se descuentan del inventario con un ajuste. ¿Quitarla?`)) return;
    b.closest(".vrow").remove();
  };
  codeFieldKeys();
}
// En los campos de código, Enter (lector de barras) pasa al siguiente campo en vez de guardar el formulario
function codeFieldKeys() {
  $("#vrows").addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || !e.target.matches("input")) return;
    e.preventDefault();
    const all = [...document.querySelectorAll("#vrows input")], i = all.indexOf(e.target);
    if (all[i + 1]) all[i + 1].focus();
  });
}
// Nuevo producto: cada fila es una prenda distinta (talla + color) con su cantidad y su código
function newProdModal() {
  const stockOk = can("canStockIn");
  const nrow = (sz = "", co = "", q = 1) => `<div class="vrow nv">
      <input name="v_size" value="${esc(sz)}" placeholder="Talla" aria-label="Talla" required>
      <input name="v_color" value="${esc(co)}" placeholder="Color" aria-label="Color" required>
      ${stockOk ? `<input name="v_qty" type="number" min="0" value="${q}" aria-label="Cantidad" title="Cantidad que llegó">` : ""}
      <button type="button" class="btn ghost sm" data-delvrow title="Quitar">${I.x}</button>
      <input name="v_code" placeholder="Código: automático o escaneá" aria-label="Código de barras" inputmode="numeric">
    </div>`;
  modal(`<div class="modal-h"><h3>Nuevo producto</h3><button class="btn icon ghost" data-close>${I.x}</button></div>
  <form id="f" class="form">
  <div class="field full"><label>Nombre</label><input name="name" required placeholder="Ej. Falda plisada"></div>
  <div class="field"><label>Categoría</label><select name="cat">${DB.categories.map(c => `<option>${esc(c)}</option>`).join("")}</select></div>
  <div class="field"><label>Marca</label><select name="brand">${DB.brands.length ? "" : `<option value="">Sin marca</option>`}${DB.brands.map(c => `<option>${esc(c)}</option>`).join("")}</select></div>
  <div class="field full"><label>Socio dueño</label><select name="partner">${partnerOpts(S.partner !== "all" ? S.partner : DB.partners[0].id)}</select></div>
  ${can("canSeeCost") ? `<div class="field"><label>Costo</label><input name="cost" type="number" min="0" required></div>` : `<input type="hidden" name="cost" value="0"><div class="field"><label>Costo</label><span class="hint" style="padding-top:10px">Lo completa la propietaria.</span></div>`}
  <div class="field"><label>Precio de venta</label><input name="price" type="number" min="0" required></div>
  <div class="field full"><label>Tallas y colores que llegaron</label>
    <div class="vgen"><input id="genS" placeholder="Tallas: S, M, L"><input id="genC" placeholder="Colores: Negro, Azul"><button type="button" class="btn sm" id="genGo">Combinar</button></div>
    <div class="vhead ${stockOk ? "" : "noq"}"><span>Talla</span><span>Color</span>${stockOk ? "<span>Cant.</span>" : ""}<span></span></div>
    <div id="vrows" class="vrows">${nrow()}</div>
    <button type="button" class="btn sm" id="addVrow" style="align-self:flex-start">${I.plus} Agregar fila</button>
    <span class="hint">Una fila por cada combinación que trajiste, con su cantidad. ¿Trajiste S Negro y M Azul? Son dos filas. “Combinar” arma todas las combinaciones y quitás las que no.</span>
  </div>
  <button class="btn dark lg full" type="submit">Crear producto</button></form>`, (f) => {
    const rows = [...document.querySelectorAll("#vrows .vrow")].map(r => ({ size: r.querySelector("[name=v_size]").value.trim(), color: r.querySelector("[name=v_color]").value.trim(), code: r.querySelector("[name=v_code]").value.trim(), qty: stockOk ? Math.max(0, +r.querySelector("[name=v_qty]").value || 0) : 0 })).filter(r => r.size || r.color);
    if (!rows.length) { toast("Agregá al menos una talla y color", true); return false; }
    const keys = rows.map(r => (r.size + "|" + r.color).toLowerCase());
    if (new Set(keys).size !== keys.length) { toast("Hay dos filas con la misma talla y color", true); return false; }
    const codes = rows.map(r => r.code).filter(Boolean);
    if (new Set(codes).size !== codes.length) { toast("Hay códigos repetidos", true); return false; }
    const clash = codes.find(c => findByCode(c)); if (clash) { toast(`El código ${clash} ya lo usa otra prenda`, true); return false; }
    const name = f.get("name").trim(), units = rows.reduce((a, r) => a + r.qty, 0);
    const msg = `"${name}" creado: ${rows.length} ${rows.length === 1 ? "variante" : "variantes"}${units ? `, ${units} ${units === 1 ? "unidad" : "unidades"}` : ""}`;
    if (CLOUD) return act(() => sbq(sb.rpc("save_product", { p: { name, category_id: CL.catId[f.get("cat")] || null, brand_id: CL.brandId[f.get("brand")] || null, partner_id: f.get("partner"), price: +f.get("price"), cost: +f.get("cost"),
      variants: rows.map(r => ({ size: r.size, color: r.color, barcode: r.code || null, initial_stock: r.qty })) } })), msg);
    const p = { id: uid(), partner: f.get("partner"), name, cat: f.get("cat"), brand: f.get("brand"), cost: +f.get("cost"), price: +f.get("price"), variants: [] };
    DB.products.push(p);
    rows.forEach(r => p.variants.push({ id: uid(), size: r.size, color: r.color, stock: r.qty, code: r.code || newCode() }));
    save(); render(); toast(msg);
  });
  $("#addVrow").onclick = () => { $("#vrows").insertAdjacentHTML("beforeend", nrow()); $("#vrows .vrow:last-child input").focus(); };
  $("#vrows").onclick = (e) => { const b = e.target.closest("[data-delvrow]"); if (b) b.closest(".vrow").remove(); };
  $("#genGo").onclick = () => {
    const split = (x) => x.split(",").map(t => t.trim()).filter(Boolean);
    const sz = split($("#genS").value), co = split($("#genC").value);
    if (!sz.length || !co.length) return toast("Escribí al menos una talla y un color", true);
    // quita filas vacías y agrega las combinaciones que falten
    document.querySelectorAll("#vrows .vrow").forEach(r => { if (!r.querySelector("[name=v_size]").value.trim() && !r.querySelector("[name=v_color]").value.trim()) r.remove(); });
    const have = new Set([...document.querySelectorAll("#vrows .vrow")].map(r => (r.querySelector("[name=v_size]").value.trim() + "|" + r.querySelector("[name=v_color]").value.trim()).toLowerCase()));
    sz.forEach(a => co.forEach(c => { if (!have.has((a + "|" + c).toLowerCase())) $("#vrows").insertAdjacentHTML("beforeend", nrow(a, c)); }));
  };
  codeFieldKeys();
}

/* ---------- Gastos ---------- */
function gastosView() {
  const list = scopedExp(DB.expenses).slice().sort((a, b) => b.at.localeCompare(a.at));
  const month = today().slice(0, 7);
  const mt = scopedExp(DB.expenses).filter(e => e.day.startsWith(month)).reduce((a, e) => a + e.amount, 0);
  const byCat = DB.expenseCats.map(c => ({ c, t: scopedExp(DB.expenses).filter(e => e.day.startsWith(month) && e.cat === c).reduce((a, e) => a + e.amount, 0) })).filter(x => x.t > 0).sort((a, b) => b.t - a.t);
  return topbar("Gastos", `Este mes: ${money(mt)}`, can("canExpense") ? `<button class="btn dark" data-act="newexp">${I.plus}<span class="hide-m">Registrar gasto</span></button>` : "") + `
  <div class="content">${partnerSeg()}${S.partner !== "all" ? `<div class="hint">Gastos propios de ${esc(partnerById(S.partner).name)} más su ${partnerById(S.partner).share} % de los gastos compartidos.</div>` : ""}<div class="grid-2">
    <section class="card"><div class="card-h"><h2>Movimientos</h2></div><div class="tbl-wrap"><table><thead><tr><th>Fecha</th><th>Categoría</th><th>Detalle</th><th>Socio</th><th>Registró</th><th class="r">Monto</th></tr></thead><tbody>
    ${list.map(e => `<tr><td>${fmtD(e.at)}</td><td><span class="chip">${esc(e.cat)}</span></td><td>${esc(e.note)}${e.spreadQty ? `<span class="s spread-s">${LI("calendar-range")} Prorrateado: ${spreadTxt(e)}</span>` : ""}</td><td>${partnerChip(e.partner || "shared")}</td><td>${esc(userById(e.by).name)}</td><td class="r"><b>${money(e.amount)}</b></td></tr>`).join("") || `<tr><td colspan="6" class="empty">Sin gastos</td></tr>`}</tbody></table></div></section>
    <section class="card"><div class="card-h"><h2>Por categoría</h2><span class="hint">pagado este mes</span></div><div class="card-b" style="display:flex;flex-direction:column;gap:14px">
    ${byCat.map(x => `<div style="display:flex;flex-direction:column;gap:6px"><div class="row" style="padding:0;border:none"><span>${esc(x.c)}</span><b>${money(x.t)}</b></div><div class="bar"><i style="width:${x.t / mt * 100}%"></i></div></div>`).join("") || `<div class="empty">Sin gastos este mes</div>`}</div></section>
  </div></div>`;
}
function newExpModal() {
  modal(`<div class="modal-h"><h3>Registrar gasto</h3><button class="btn icon ghost" data-close>${I.x}</button></div>
  <form id="f" class="form"><div class="field"><label>Categoría</label><select name="cat">${DB.expenseCats.map(c => `<option>${esc(c)}</option>`).join("")}</select></div>
  <div class="field"><label>Monto</label><input name="amount" type="number" min="1" required></div>
  <div class="field full"><label>¿De quién es el gasto?</label><select name="partner">${partnerOpts("shared", true)}</select></div>
  <div class="field full"><label>Detalle</label><input name="note" placeholder="Ej. Pago de luz noviembre" required></div>
  <div class="field full exp-warn" id="expWarn" hidden>${LI("circle-alert")}<span>Las compras de prendas para vender no van aquí: registralas en <b>Inventario → Entrada</b> con su costo. Si las ponés como gasto, el estado de resultados las cuenta dos veces.</span></div>
  ${CLOUD && CL.noSpread ? "" : `<div class="field full spread-box">
    <label class="spread-tg"><span><b>Distribuir este gasto</b><small>Para alquiler, salarios, equipo… cada día carga solo su parte</small></span><span class="switch"><input type="checkbox" name="spread" id="spreadOn"><span></span></span></label>
    <div class="spread-opts" id="spreadOpts" hidden>
      <div class="field"><label>Durante</label><div class="spread-q"><input name="sq" type="number" min="1" max="3650" value="1"><select name="su"><option value="dias">días</option><option value="meses" selected>meses</option><option value="anios">años</option></select></div></div>
      <div class="field"><label>Desde</label><input name="sf" type="date" value="${today()}"></div>
      <div class="hint full" id="spreadHint"></div>
    </div></div>`}
  <div class="field full"><label>Comprobante (foto)</label><input name="photo" type="file" accept="image/*" capture="environment"></div>
  <button class="btn dark lg full" type="submit">Guardar gasto</button></form>`, (f) => {
    const sp = f.get("spread") ? { spreadQty: Math.max(1, Math.min(3650, +f.get("sq") || 1)), spreadUnit: f.get("su"), spreadFrom: f.get("sf") || today() } : null;
    if (CLOUD) return act(async () => {
      const file = f.get("photo"); let receipt_path = null;
      if (file && file.size) receipt_path = await uploadImg("receipts", `${me.id}/${Date.now()}.jpg`, await ART.compress(file, 1400));
      await sbq(sb.from("expenses").insert({ category_id: CL.ecatId[f.get("cat")], amount: +f.get("amount"), note: f.get("note").trim(), partner_id: f.get("partner") === "shared" ? null : f.get("partner"), receipt_path, ...(sp ? { spread_qty: sp.spreadQty, spread_unit: sp.spreadUnit, spread_from: sp.spreadFrom } : {}) }));
    }, "Gasto registrado");
    DB.expenses.push({ id: uid(), at: new Date().toISOString(), day: today(), cat: f.get("cat"), amount: +f.get("amount"), note: f.get("note"), partner: f.get("partner"), by: me.id, ...(sp || {}) }); save(); render(); toast("Gasto registrado");
  });
  const warn = () => { $("#expWarn").hidden = !/mercader/i.test($("#f [name=cat]").value); };
  $("#f [name=cat]").onchange = warn; warn();
  if ($("#spreadOn")) {
    const upd = () => {
      $("#spreadOpts").hidden = !$("#spreadOn").checked;
      const amt = +$("#f [name=amount]").value || 0, q = Math.max(1, +$("#f [name=sq]").value || 1), u = $("#f [name=su]").value, from = $("#f [name=sf]").value || today();
      const sp = spreadSpan({ spreadQty: q, spreadUnit: u, spreadFrom: from, day: today() });
      $("#spreadHint").innerHTML = amt ? `Se reparte en <b>${sp.n} días</b> (hasta el ${fmtD(addDaysS(sp.to, -1) + "T12:00:00")}): <b>${money(amt / sp.n)} por día</b>${u !== "dias" ? `, ${money(amt / (u === "anios" ? 12 * q : q))} por mes` : ""}.` : "Escribí el monto para ver cuánto le toca a cada día.";
    };
    ["#spreadOn", "#f [name=sq]", "#f [name=su]", "#f [name=sf]", "#f [name=amount]"].forEach(q => { $(q).oninput = upd; $(q).onchange = upd; });
    $("#f [name=cat]").addEventListener("change", () => { if (/alquiler|salario/i.test($("#f [name=cat]").value) && !$("#spreadOn").checked) { $("#spreadOn").checked = true; upd(); } });
    upd();
  }
}

/* ---------- Reportes ---------- */
function rangeDays() {
  const n = S.repRange === "hoy" ? 1 : S.repRange === "semana" ? 7 : 30;
  const out = []; for (let i = n - 1; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); out.push(dayOf(d)); } return out;
}
function repData() {
  const days = rangeDays(), set = new Set(days);
  const all = can("seeAllSales");
  const s = scoped(DB.sales.filter(x => set.has(x.day) && x.status === "cerrada" && (all || x.seller === me.id))), e = all ? scopedExp(expFor(days)) : [];
  const total = s.reduce((a, x) => a + x.total, 0), gross = s.reduce((a, x) => a + x.subtotal, 0), cost = s.reduce((a, x) => a + x.items.reduce((b, i) => b + i.cost * i.qty, 0), 0), exp = e.reduce((a, x) => a + x.amount, 0), disc = s.reduce((a, x) => a + (x.discount ? x.discount.amount : 0), 0);
  // líneas: el descuento de la factura se prorratea por línea según su peso
  const lines = []; s.forEach(x => { const f = x.subtotal ? x.total / x.subtotal : 1; x.items.forEach(i => lines.push({ ...i, sale: x, gross: i.price * i.qty, net: Math.round(i.price * i.qty * f), disc: Math.round(i.price * i.qty * (1 - f)), costT: i.cost * i.qty, partner: itemPartner(i), cat: (prodById(i.pid) || {}).cat || "—", brand: (prodById(i.pid) || {}).brand || "—" })); });
  const group = (key) => { const m = {}; lines.forEach(l => { const k = key(l); m[k] = m[k] || { k, q: 0, gross: 0, disc: 0, net: 0, cost: 0, n: new Set() }; const g = m[k]; g.q += l.qty; g.gross += l.gross; g.disc += l.disc; g.net += l.net; g.cost += l.costT; g.n.add(l.sale.id); }); return Object.values(m).map(g => ({ ...g, n: g.n.size, margin: g.net - g.cost, pct: g.net ? (g.net - g.cost) / g.net * 100 : 0 })).sort((a, b) => b.net - a.net); };
  return { days, s, e, total, gross, cost, exp, disc, lines, group };
}
// Estado de resultados: cada línea abre su detalle
const erRow = (k, label, val, style = "") => `<button type="button" class="row er-row" data-erdet="${k}" style="${style}"><span>${label}</span><span class="er-v">${val}${LI("chevron-right", "er-go")}</span></button>`;
function erDetailModal(k) {
  const D = repData(), { s, e, lines, total, gross, cost, exp, disc } = D;
  const per = D.days.length === 1 ? "hoy" : `últimos ${D.days.length} días`;
  const when = (iso) => `${fmtD(iso)} · ${fmtT(iso)}`;
  const row = (title, sub, amount, opts = {}) => `<div class="er-item ${opts.sale ? "clickable" : ""}" ${opts.sale ? `data-sale-detail="${opts.sale}"` : ""}><span class="er-main"><b>${title}</b><small>${sub}</small></span><span class="er-amt ${opts.cls || ""}">${amount}</span></div>`;
  const discTxt = (d) => !d ? "" : d.type === "codigo" ? `código ${esc(d.code)}` : d.type === "pin" ? `con PIN · autorizó ${esc(userById(d.by).name)}` : "manual";
  const pieces = (x) => x.items.map(i => `${i.qty > 1 ? i.qty + " × " : ""}${esc(i.name)} ${esc(i.size)} ${esc(i.color)}`).join(", ");
  let title, sum, sumLbl, body;
  if (k === "gross") {
    title = "Venta bruta"; sum = gross; sumLbl = `${lines.reduce((a, l) => a + l.qty, 0)} piezas a precio de lista`;
    body = lines.slice().sort((a, b) => b.sale.at.localeCompare(a.sale.at)).map(l => row(`${l.qty > 1 ? l.qty + " × " : ""}${esc(l.name)} <span class="hint">${esc(l.size)} · ${esc(l.color)}</span>`, `${when(l.sale.at)} · Factura #${l.sale.n} · ${esc(userById(l.sale.seller).name)}`, money(l.gross), { sale: l.sale.id })).join("");
  } else if (k === "disc") {
    const ds = s.filter(x => x.discount && x.discount.amount > 0).sort((a, b) => b.at.localeCompare(a.at));
    title = "Descuentos"; sum = -disc; sumLbl = `${ds.length} ${ds.length === 1 ? "factura" : "facturas"} con descuento`;
    body = ds.map(x => row(`${x.discount.pct} % · ${pieces(x)}`, `${when(x.at)} · Factura #${x.n} · ${esc(userById(x.seller).name)} · ${discTxt(x.discount)}`, "− " + money(x.discount.amount), { sale: x.id, cls: "red" })).join("");
  } else if (k === "net") {
    title = "Venta neta"; sum = total; sumLbl = `${s.length} ${s.length === 1 ? "factura" : "facturas"} · lo que realmente se cobró`;
    body = s.slice().sort((a, b) => b.at.localeCompare(a.at)).map(x => row(`Factura #${x.n} · ${esc(x.pay)}`, `${when(x.at)} · ${esc(userById(x.seller).name)} · ${x.items.reduce((a, i) => a + i.qty, 0)} piezas${x.discount ? ` · bruto ${money(x.subtotal)} − ${money(x.discount.amount)}` : ""}`, money(x.total), { sale: x.id })).join("");
  } else if (k === "cost") {
    const g = {}; lines.forEach(l => { const key = `${l.name}|${l.size}|${l.color}`; g[key] = g[key] || { l, q: 0, c: 0 }; g[key].q += l.qty; g[key].c += l.costT; });
    const list = Object.values(g).sort((a, b) => b.c - a.c);
    title = "Costo de mercadería vendida"; sum = -cost; sumLbl = "lo que costaron las piezas vendidas";
    body = list.map(x => row(`${esc(x.l.name)} <span class="hint">${esc(x.l.size)} · ${esc(x.l.color)}</span>`, `${x.q} ${x.q === 1 ? "pieza" : "piezas"} × costo ${money(x.l.cost)}`, "− " + money(x.c))).join("");
  } else if (k === "gp") {
    const list = D.group(l => l.name);
    title = "Utilidad bruta por producto"; sum = total - cost; sumLbl = `margen ${total ? Math.round((total - cost) / total * 100) : 0} % sobre la venta neta`;
    body = list.map(x => row(esc(x.k), `${x.q} piezas · neto ${money(x.net)} − costo ${money(x.cost)} · margen ${Math.round(x.pct)} %`, money(x.margin), { cls: x.margin >= 0 ? "green" : "red" })).join("");
  } else if (k === "exp") {
    title = "Gastos operativos"; sum = -exp; sumLbl = `${e.length} ${e.length === 1 ? "pago" : "pagos"} en el período`;
    body = e.slice().sort((a, b) => b.at.localeCompare(a.at)).map(x => row(`${esc(x.note || x.cat)}${x.alloc ? ` <span class="chip spread">prorrateado</span>` : ""}`, x.alloc ? `${x.alloc.k} de ${x.alloc.n} días de un pago de ${money(x.alloc.full)} · ${esc(x.cat)} · ${esc(partnerById(x.partner || "shared").name)}` : `${fmtD(x.at)} · ${esc(x.cat)} · ${esc(partnerById(x.partner || "shared").name)} · registró ${esc(userById(x.by).name)}`, "− " + money(x.amount))).join("");
  } else {
    const gp = total - cost, np = gp - exp;
    title = "Utilidad neta"; sum = np; sumLbl = np >= 0 ? "lo que queda después de costos y gastos" : "los costos y gastos superan lo vendido";
    const byDay = D.days.slice().reverse().map(d => { const sd = s.filter(x => x.day === d), n = sd.reduce((a, x) => a + x.total, 0), c = sd.reduce((a, x) => a + x.items.reduce((b, i) => b + i.cost * i.qty, 0), 0), g = scopedExp(expFor([d])).reduce((a, x) => a + x.amount, 0); return { d, n, c, g, u: n - c - g }; }).filter(x => x.n || x.g);
    body = `<div class="er-eq"><span>Utilidad bruta</span><b>${money(gp)}</b><span>− Gastos operativos</span><b>− ${money(exp)}</b><span class="t">= Utilidad neta</span><b class="t ${np >= 0 ? "green" : "red"}">${money(np)}</b></div>` +
      (byDay.length > 1 ? `<div class="pl-grp" style="padding:12px 2px 4px">Día por día</div>` + byDay.map(x => row(fmtD(x.d + "T12:00:00"), `neto ${money(x.n)} − costo ${money(x.c)}${x.g ? ` − gastos ${money(x.g)}` : ""}`, money(x.u), { cls: x.u >= 0 ? "green" : "red" })).join("") : "");
  }
  modal(`<div class="modal-h"><div><h3>${title}</h3><div class="hint">${S.partner === "all" ? "Consolidado" : esc(partnerById(S.partner).name)} · ${per}</div></div><button class="btn icon ghost" data-close>${I.x}</button></div>
    <div class="er-sum"><span>${sumLbl}</span><b class="${sum < 0 ? "red" : ""}">${sum < 0 ? "− " + money(-sum) : money(sum)}</b></div>
    <div class="er-list">${body || `<div class="empty">No hay movimientos en el período</div>`}</div>
    ${["gross", "disc", "net"].includes(k) ? `<div class="hint">Tocá una línea para ver la factura completa.</div>` : ""}`);
}
function repView() {
  const D = repData(); const { days, s, e, total, gross, cost, exp, disc } = D;
  let tab = S.repTab || "resumen"; const P = can("canSeeProfit");
  const tabs = can("seeAllSales") ? [["resumen", "Resumen"], ...(DB.partners.length > 1 ? [["socios", "Socios"]] : []), ["producto", "Por producto"], ["categoria", "Categorías"], ["vendedora", "Vendedoras"], ["tickets", "Facturas"], ["inventario", "Inventario"], ["movimientos", "Movimientos"]]
    : [["resumen", "Resumen"], ["producto", "Por producto"], ["tickets", "Facturas"]];
  const mcell = (g) => P ? `<td class="r">${money(g.margin)}</td><td class="r"><span class="chip ${g.pct >= 40 ? "green" : g.pct >= 20 ? "" : "red"}">${g.pct.toFixed(0)} %</span></td>` : "";
  const mhead = P ? `<th class="r">Margen</th><th class="r">%</th>` : "";
  const tbl = (head, rows, empty = "Sin datos") => `<div class="tbl-wrap"><table><thead><tr>${head}</tr></thead><tbody>${rows.join("") || `<tr><td colspan="12" class="empty">${empty}</td></tr>`}</tbody></table></div>`;
  const perDay = days.map(d => s.filter(x => x.day === d).reduce((a, x) => a + x.total, 0)); const pmax = Math.max(1, ...perDay);
  if (!tabs.some(([k]) => k === tab)) tab = "resumen";
  let body = "";
  if (tab === "resumen") {
    const byPay = DB.payMethods.map(m => ({ m, t: s.filter(x => x.pay === m).reduce((a, x) => a + x.total, 0) }));
    const hours = Array.from({ length: 12 }, (_, i) => s.filter(x => new Date(x.at).getHours() === 9 + i).reduce((a, x) => a + x.total, 0)); const hmax = Math.max(1, ...hours);
    const topL = D.group(l => l.name).slice(0, 5);
    body = `<section class="kpis">
      <div class="card kpi"><div class="lbl">Venta bruta</div><div class="val">${money(gross)}</div><div class="foot">${s.length} facturas · ${D.lines.reduce((a, l) => a + l.qty, 0)} piezas</div></div>
      <div class="card kpi"><div class="lbl">Descuentos</div><div class="val red">− ${money(disc)}</div><div class="foot">${gross ? (disc / gross * 100).toFixed(1) : 0} % de la venta bruta</div></div>
      <div class="card kpi"><div class="lbl">Venta neta</div><div class="val">${money(total)}</div><div class="foot">Factura promedio ${money(s.length ? total / s.length : 0)}</div></div>
      ${P ? `<div class="card kpi"><div class="lbl">Utilidad bruta</div><div class="val" style="color:var(--green)">${money(total - cost)}</div><div class="foot">Margen ${total ? ((total - cost) / total * 100).toFixed(0) : 0} % · costo ${money(cost)}</div></div>` : `<div class="card kpi"><div class="lbl">Piezas por factura</div><div class="val">${s.length ? (D.lines.reduce((a, l) => a + l.qty, 0) / s.length).toFixed(1) : 0}</div><div class="foot">promedio</div></div>`}
    </section>
    ${P ? `<section class="card"><div class="card-h"><h2>Estado de resultados del período</h2></div><div class="card-b list" style="padding-top:4px;padding-bottom:4px">
      ${erRow("gross", "Venta bruta", `<b>${money(gross)}</b>`)}${erRow("disc", "− Descuentos", `<b style="color:var(--red)">− ${money(disc)}</b>`)}${erRow("net", "= Venta neta", `<b>${money(total)}</b>`)}
      ${erRow("cost", "− Costo de mercadería vendida", `<b>− ${money(cost)}</b>`)}${erRow("gp", "= Utilidad bruta", `<b>${money(total - cost)}</b>`)}
      ${erRow("exp", `− Gastos operativos (${e.length})`, `<b>− ${money(exp)}</b>`)}${erRow("np", `<span style="font-weight:700">= Utilidad neta</span>`, `<b style="color:${total - cost - exp >= 0 ? "var(--green)" : "var(--red)"};font-size:16px">${money(total - cost - exp)}</b>`, "border-top:2px solid var(--ink)")}
      <div class="hint" style="padding:10px 0 4px">Tocá cualquier línea para ver de qué se compone.</div></div></section>` : ""}
    <section class="card"><div class="card-h"><h2>Ventas por día</h2></div><div class="card-b"><div class="mini-chart" style="height:120px">${perDay.map((v, i) => `<i class="${i === perDay.length - 1 ? "red" : ""}" style="height:${v / pmax * 100}%" title="${days[i]} · ${money(v)}"></i>`).join("")}</div>${chartX(days.map(d => days.length <= 7 ? dayShort(d) + " " + dayNum(d) : dayNum(d)), days.length > 14 ? 3 : 1)}</div></section>
    <div class="grid-2" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">
      <section class="card"><div class="card-h"><h2>Más vendidos</h2></div>${tbl(`<th>Producto</th><th class="r">Uds.</th><th class="r">Neto</th>`, topL.map(g => `<tr><td><b>${esc(g.k)}</b></td><td class="r">${g.q}</td><td class="r">${money(g.net)}</td></tr>`))}</section>
      <section class="card"><div class="card-h"><h2>Ventas por hora</h2><span class="hint">${peakHint(hours)}</span></div><div class="card-b"><div class="mini-chart" style="height:100px">${hours.map((h, i) => `<i class="${h === hmax && h > 0 ? "red" : ""}" style="height:${h / hmax * 100}%" title="${9 + i}:00 · ${money(h)}"></i>`).join("")}</div>${chartX(HOURS)}</div></section>
      <section class="card"><div class="card-h"><h2>Formas de pago</h2></div><div class="card-b" style="display:flex;flex-direction:column;gap:14px">${byPay.map(x => `<div style="display:flex;flex-direction:column;gap:6px"><div class="row" style="padding:0;border:none"><span>${esc(x.m)}</span><b>${money(x.t)} <span class="hint">${total ? (x.t / total * 100).toFixed(0) : 0} %</span></b></div><div class="bar"><i style="width:${total ? x.t / total * 100 : 0}%"></i></div></div>`).join("")}</div></section>
    </div>`;
  } else if (tab === "socios") {
    const set = new Set(days), all = DB.sales.filter(x => set.has(x.day) && x.status === "cerrada"), allE = expFor(days);
    const rows = DB.partners.map(p => {
      const ps = all.map(x => scopeSale(x, p.id)).filter(Boolean);
      const gross = ps.reduce((a, x) => a + x.subtotal, 0), net = ps.reduce((a, x) => a + x.total, 0), c = ps.reduce((a, x) => a + x.items.reduce((b, i) => b + i.cost * i.qty, 0), 0);
      const own = allE.filter(x => x.partner === p.id).reduce((a, x) => a + x.amount, 0), shared = allE.filter(x => !x.partner || x.partner === "shared").reduce((a, x) => a + Math.round(x.amount * (p.share || 0) / 100), 0);
      const stockC = DB.products.filter(x => x.partner === p.id).reduce((a, x) => a + x.variants.reduce((b, v) => b + v.stock * x.cost, 0), 0);
      return { p, n: ps.length, q: ps.reduce((a, x) => a + x.items.reduce((b, i) => b + i.qty, 0), 0), gross, disc: gross - net, net, c, own, shared, util: net - c - own - shared, stockC };
    });
    const tot = (k) => rows.reduce((a, r) => a + r[k], 0);
    body = `<section class="kpis" style="grid-template-columns:repeat(${Math.min(4, rows.length)},minmax(0,1fr))">${rows.map(r => `<div class="card kpi"><div class="lbl"><span class="who">${pDot(r.p.id)}${esc(r.p.name)}</span><span class="chip">${tot("net") ? (r.net / tot("net") * 100).toFixed(0) : 0} %</span></div><div class="val">${money(r.net)}</div><div class="foot">${r.q} piezas · ${r.n} facturas${P ? ` · utilidad <b style="color:${r.util >= 0 ? "var(--green)" : "var(--red)"}">${money(r.util)}</b>` : ""}</div></div>`).join("")}</section>
    <section class="card"><div class="card-h"><h2>Liquidación por socio</h2><span class="hint">${days.length === 1 ? "hoy" : "últimos " + days.length + " días"}</span></div>${tbl(`<th>Socio</th><th class="r">Facturas</th><th class="r">Piezas</th><th class="r">Bruto</th><th class="r">Desc.</th><th class="r">Venta neta</th>${P ? `<th class="r">Costo</th><th class="r">Util. bruta</th><th class="r">Gastos propios</th><th class="r">Gastos compartidos</th><th class="r">Utilidad neta</th><th class="r">Inventario al costo</th>` : ""}`,
      rows.map(r => `<tr><td><span class="who">${pDot(r.p.id)}<b>${esc(r.p.name)}</b></span></td><td class="r">${r.n}</td><td class="r">${r.q}</td><td class="r">${money(r.gross)}</td><td class="r" style="color:var(--red)">${r.disc ? "− " + money(r.disc) : "—"}</td><td class="r"><b>${money(r.net)}</b></td>${P ? `<td class="r">${money(r.c)}</td><td class="r">${money(r.net - r.c)}</td><td class="r">${money(r.own)}</td><td class="r">${money(r.shared)} <span class="hint">${r.p.share} %</span></td><td class="r"><b style="color:${r.util >= 0 ? "var(--green)" : "var(--red)"}">${money(r.util)}</b></td><td class="r">${money(r.stockC)}</td>` : ""}</tr>`).concat([`<tr class="tot"><td><b>Consolidado</b></td><td class="r">${all.length}</td><td class="r">${tot("q")}</td><td class="r">${money(tot("gross"))}</td><td class="r" style="color:var(--red)">− ${money(tot("disc"))}</td><td class="r"><b>${money(tot("net"))}</b></td>${P ? `<td class="r">${money(tot("c"))}</td><td class="r">${money(tot("net") - tot("c"))}</td><td class="r">${money(tot("own"))}</td><td class="r">${money(tot("shared"))}</td><td class="r"><b>${money(tot("util"))}</b></td><td class="r">${money(tot("stockC"))}</td>` : ""}</tr>`]))}
      <div class="card-b hint">La <b>venta neta</b> es lo cobrado por la mercadería de cada socio (si una factura tiene prendas de ambos, se reparte y el descuento se prorratea). Los gastos compartidos se reparten según el % de cada socio, configurable en Configuración → Socios.</div></section>`;
  } else if (tab === "producto") {
    const g = D.group(l => l.name); const gv = D.group(l => `${l.name} · ${l.size} ${l.color}`);
    body = `<section class="card"><div class="card-h"><h2>Ventas por producto</h2><span class="hint">${g.length} productos</span></div>${tbl(`<th>Producto</th><th class="r">Uds.</th><th class="r">Facturas</th><th class="r">Bruto</th><th class="r">Desc.</th><th class="r">Neto</th>${P ? `<th class="r">Costo</th>` : ""}${mhead}`, g.map(x => `<tr><td><b>${esc(x.k)}</b></td><td class="r">${x.q}</td><td class="r">${x.n}</td><td class="r">${money(x.gross)}</td><td class="r" style="color:var(--red)">${x.disc ? "− " + money(x.disc) : "—"}</td><td class="r"><b>${money(x.net)}</b></td>${P ? `<td class="r">${money(x.cost)}</td>` : ""}${mcell(x)}</tr>`))}</section>
    <section class="card"><div class="card-h"><h2>Detalle por talla y color</h2></div>${tbl(`<th>Variante</th><th class="r">Uds.</th><th class="r">Neto</th>${mhead}`, gv.map(x => `<tr><td>${esc(x.k)}</td><td class="r">${x.q}</td><td class="r">${money(x.net)}</td>${mcell(x)}</tr>`))}</section>`;
  } else if (tab === "categoria") {
    const g = D.group(l => l.cat), gb = D.group(l => l.brand); const mx = Math.max(1, ...g.map(x => x.net));
    body = `<div class="grid-2" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr))">
    <section class="card"><div class="card-h"><h2>Por categoría</h2></div><div class="card-b" style="display:flex;flex-direction:column;gap:14px">${g.map(x => `<div style="display:flex;flex-direction:column;gap:6px"><div class="row" style="padding:0;border:none"><span><b>${esc(x.k)}</b> <span class="hint">${x.q} uds.</span></span><b>${money(x.net)}${P ? ` <span class="chip ${x.pct >= 40 ? "green" : ""}">${x.pct.toFixed(0)} %</span>` : ""}</b></div><div class="bar"><i style="width:${x.net / mx * 100}%"></i></div></div>`).join("") || `<div class="empty">Sin datos</div>`}</div></section>
    <section class="card"><div class="card-h"><h2>Por marca</h2></div>${tbl(`<th>Marca</th><th class="r">Uds.</th><th class="r">Neto</th>${mhead}`, gb.map(x => `<tr><td><b>${esc(x.k)}</b></td><td class="r">${x.q}</td><td class="r">${money(x.net)}</td>${mcell(x)}</tr>`))}</section></div>`;
  } else if (tab === "vendedora") {
    const rows = DB.users.map(u => { const m = s.filter(x => x.seller === u.id); const ls = D.lines.filter(l => l.sale.seller === u.id); const net = m.reduce((a, x) => a + x.total, 0), c = ls.reduce((a, l) => a + l.costT, 0); return { u, n: m.length, q: ls.reduce((a, l) => a + l.qty, 0), gross: m.reduce((a, x) => a + x.subtotal, 0), disc: m.reduce((a, x) => a + (x.discount ? x.discount.amount : 0), 0), nd: m.filter(x => x.discount).length, pin: m.filter(x => x.discount && x.discount.type === "pin").length, net, margin: net - c, pct: net ? (net - c) / net * 100 : 0 }; }).filter(x => x.n).sort((a, b) => b.net - a.net);
    body = `<section class="card"><div class="card-h"><h2>Desempeño por vendedora</h2></div>${tbl(`<th>Vendedora</th><th class="r">Facturas</th><th class="r">Piezas</th><th class="r">Bruto</th><th class="r">Descuentos</th><th class="r">Con desc.</th><th class="r">Con PIN</th><th class="r">Neto</th><th class="r">Factura prom.</th>${mhead}`, rows.map(x => `<tr><td><span class="who"><span class="avatar ${x.u.role === "propietaria" ? "red" : x.u.role === "vendedor" ? "grey" : ""}">${esc(x.u.name[0])}</span><b>${esc(x.u.name)}</b></span></td><td class="r">${x.n}</td><td class="r">${x.q}</td><td class="r">${money(x.gross)}</td><td class="r" style="color:var(--red)">${x.disc ? "− " + money(x.disc) : "—"}</td><td class="r">${x.nd} <span class="hint">(${(x.nd / x.n * 100).toFixed(0)} %)</span></td><td class="r">${x.pin}</td><td class="r"><b>${money(x.net)}</b></td><td class="r">${money(x.net / x.n)}</td>${mcell(x)}</tr>`))}</section>
    <section class="card"><div class="card-h"><h2>Descuentos otorgados</h2><span class="hint">quién, cuánto y por qué</span></div>${tbl(`<th>Fecha</th><th>Factura</th><th>Vendedora</th><th>Tipo</th><th class="r">%</th><th class="r">Monto</th><th>Autorizó</th>`, s.filter(x => x.discount).slice().reverse().map(x => `<tr><td>${fmtD(x.at)} ${fmtT(x.at)}</td><td>#${x.n}</td><td>${esc(userById(x.seller).name)}</td><td>${discChip(x.discount)}</td><td class="r">${x.discount.pct} %</td><td class="r" style="color:var(--red)">− ${money(x.discount.amount)}</td><td>${x.discount.type === "pin" ? esc(userById(x.discount.by).name) : x.discount.type === "codigo" ? "Código" : "Dentro de límite"}</td></tr>`), "Sin descuentos en el período")}</section>`;
  } else if (tab === "tickets") {
    body = `<section class="card"><div class="card-h"><h2>Facturas del período</h2><span class="hint">${s.length} ventas</span></div>${tbl(`<th>Fecha</th><th>Factura</th><th>Vendedora</th><th>Artículos</th><th>Pago</th><th class="r">Bruto</th><th class="r">Desc.</th><th class="r">Total</th>`, s.slice().reverse().map(x => `<tr class="clickable" data-sale-detail="${x.id}" title="Ver detalle"><td>${fmtD(x.at)} <span class="hint">${fmtT(x.at)}</span></td><td>#${x.n}</td><td>${esc(userById(x.seller).name)}</td><td>${itemsCell(x)}</td><td><span class="chip">${esc(x.pay)}</span></td><td class="r">${money(x.subtotal)}</td><td class="r" style="color:var(--red)">${x.discount ? "− " + money(x.discount.amount) : "—"}</td><td class="r"><b>${money(x.total)}</b></td></tr>`))}</section>`;
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
    const lbl = { venta: "Venta", compra: "Compra", ajuste: "Ajuste", devolucion: "Devolución", inicial: "Stock inicial", anulacion: "Anulación" };
    body = `<section class="card"><div class="card-h"><h2>Movimientos de inventario (kárdex)</h2><span class="hint">${mv.length} movimientos</span></div>${tbl(`<th>Fecha</th><th>Producto</th><th>Socio</th><th>Tipo</th><th class="r">Cantidad</th><th>Usuario</th><th>Ref.</th>`, mv.map(m => { const r = varById(m.vid); return `<tr><td>${fmtD(m.at)} <span class="hint">${fmtT(m.at)}</span></td><td><b>${r ? esc(r.p.name) : "—"}</b> <span class="hint">${r ? esc(r.v.size + " " + r.v.color) : ""}</span></td><td>${partnerChip(m.partner || (r ? r.p.partner : ""))}</td><td><span class="chip ${m.qty < 0 ? "" : "green"}">${lbl[m.type] || m.type}</span></td><td class="r" style="font-weight:700;color:${m.qty < 0 ? "var(--red)" : "var(--green)"}">${m.qty > 0 ? "+" : ""}${m.qty}</td><td>${esc(userById(m.by).name)}</td><td class="hint">${m.ref ? "Factura #" + m.ref : "—"}</td></tr>`; }), CLOUD ? "Sin movimientos en el período" : "Sin movimientos registrados en el período (las ventas de ejemplo no generan kárdex; las nuevas sí)")}</section>`;
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

/* ---------- Configuración: tarjetas que abren su detalle ---------- */
// Íconos de la librería Lucide (licencia ISC, vendor/lucide.js)
const LI = (n, cls = "") => ((window.LUCIDE && window.LUCIDE[n]) || "").replace("<svg", `<svg class="li ${cls}" aria-hidden="true"`);
const CAT_TABLE = { categories: "categories", brands: "brands", payMethods: "payment_methods", expenseCats: "expense_categories" };
const CAT = {
  tienda: { title: "Ajustes de la tienda", icon: "store", tone: "t-rose" },
  recibo: { title: "Recibo impreso", icon: "printer", tone: "t-gold" },
  partners: { title: "Socios", icon: "handshake", tone: "t-berry", noun: ["socio", "socios"] },
  discountCodes: { title: "Códigos de descuento", icon: "ticket-percent", tone: "t-sage", noun: ["código activo", "códigos activos"] },
  categories: { title: "Categorías", icon: "shirt", tone: "t-rose", noun: ["categoría", "categorías"], one: "categoría" },
  brands: { title: "Marcas", icon: "gem", tone: "t-gold", noun: ["marca", "marcas"], one: "marca" },
  payMethods: { title: "Formas de pago", icon: "wallet-cards", tone: "t-berry", noun: ["forma de pago", "formas de pago"], one: "forma de pago" },
  expenseCats: { title: "Categorías de gasto", icon: "receipt-text", tone: "t-sage", noun: ["categoría", "categorías"], one: "categoría de gasto" }
};
const plural = (n, [a, b]) => `${n} ${n === 1 ? a : b}`;
const shareSum = () => DB.partners.reduce((a, p) => a + (+p.share || 0), 0);
// Cuántas veces se usa cada elemento (para mostrarlo y para no borrar lo que está en uso)
function catUse(k, it) {
  if (k === "categories") return DB.products.filter(p => p.cat === it).length;
  if (k === "brands") return DB.products.filter(p => p.brand === it).length;
  if (k === "expenseCats") return DB.expenses.filter(e => e.cat === it).length;
  if (k === "payMethods") return DB.sales.filter(s => s.pay === it).length;
  if (k === "partners") return DB.products.filter(p => p.partner === it.id).length;
  return 0;
}
function tileInfo(k) {
  const st = DB.settings;
  if (k === "tienda") return { sub: `${esc(st.store)} · ${esc(st.currency)}`, chips: [`Stock bajo ≤ ${st.lowStock}`, `Margen mín. ${st.minMargin} %`, `WhatsApp +${esc(st.waCountry)}`] };
  if (k === "recibo") return { sub: `Rollo de ${st.paper === "58" ? 58 : 80} mm · ${st.rcLogo ? "con logo" : "sin logo"}`, chips: [st.rcAddress ? "Dirección ✓" : "Sin dirección", st.rcPhone ? "Teléfono ✓" : "Sin teléfono", st.rcRuc ? "RUC ✓" : "Sin RUC"] };
  if (k === "partners") return { n: DB.partners.length, sub: shareSum() !== 100 ? `<span class="ct-warn">Los % de gastos suman ${shareSum()} %</span>` : plural(DB.partners.length, CAT[k].noun), chips: DB.partners.map(p => `${pDot(p.id)}${esc(p.name)}`) };
  if (k === "discountCodes") { const act = DB.discountCodes.filter(d => d.active && d.uses < d.maxUses); return { n: act.length, sub: plural(act.length, CAT[k].noun), chips: act.map(d => `${esc(d.code)} · ${d.pct} %`) }; }
  return { n: DB[k].length, sub: plural(DB[k].length, CAT[k].noun), chips: DB[k].map(esc) };
}
function catView() {
  const tile = (k) => {
    const c = CAT[k], i = tileInfo(k), chips = i.chips || [], more = chips.length - 4;
    return `<button class="cat-tile ${c.tone}" data-cattile="${k}">
      <span class="ct-top"><span class="ct-ico">${LI(c.icon)}</span>${i.n != null ? `<span class="ct-n">${i.n}</span>` : ""}</span>
      <span class="ct-title">${c.title}</span><span class="ct-sub">${i.sub}</span>
      <span class="ct-chips">${chips.slice(0, 4).map(x => `<span class="ct-chip">${x}</span>`).join("")}${more > 0 ? `<span class="ct-chip more">+${more}</span>` : ""}</span>
      <span class="ct-go">${can("canEditCatalog") ? "Ver y editar" : "Ver"} ${LI("chevron-right")}</span></button>`;
  };
  return topbar("Configuración", "Ajustes de la tienda y listas que usa toda la app", me.role === "propietaria" && !CLOUD ? `<button class="btn ghost" data-act="reset" title="Vuelve a los datos de ejemplo">Reiniciar demo</button>` : "") + `
  <div class="content">
    <div class="section-title">Tienda</div>
    <div class="cat-grid">${["tienda", "recibo", "partners", "discountCodes"].map(tile).join("")}</div>
    <div class="section-title">Listas</div>
    <div class="cat-grid">${["categories", "brands", "payMethods", "expenseCats"].map(tile).join("")}</div>
  </div>`;
}
const catHead = (k, extra = "") => `<div class="modal-h"><div class="mh-t"><span class="ct-ico sm ${CAT[k].tone}">${LI(CAT[k].icon)}</span><div><h3>${CAT[k].title}</h3>${extra}</div></div><button class="btn icon ghost" data-close>${I.x}</button></div>`;
function openCat(k) {
  if (k === "tienda") return settingsModal("tienda");
  if (k === "recibo") return settingsModal("recibo");
  const ed = can("canEditCatalog");
  const items = k === "partners" ? DB.partners : DB[k];
  const btns = (i, canDel, why) => ed ? `<span class="cl-act"><button class="btn icon ghost sm" data-catedit="${k}|${i}" title="Editar" aria-label="Editar">${LI("pencil")}</button><button class="btn icon ghost sm danger" data-catdel="${k}|${i}" title="${canDel ? "Eliminar" : esc(why)}" aria-label="Eliminar" ${canDel ? "" : "disabled"}>${LI("trash-2")}</button></span>` : "";
  const row = (it, i) => {
    if (k === "partners") { const n = catUse(k, it); return `<div class="cl-row">${pDot(it.id)}<span class="cl-main"><b>${esc(it.name)}</b><span>${plural(n, ["producto", "productos"])} · asume ${it.share} % de gastos compartidos</span></span>${btns(i, n === 0 && DB.partners.length > 1, n ? "Tiene productos asignados" : "Tiene que quedar al menos un socio")}</div>`; }
    if (k === "discountCodes") { const ok = it.active && it.uses < it.maxUses; return `<div class="cl-row"><span class="cl-badge">${it.pct}%</span><span class="cl-main"><b>${esc(it.code)}</b><span>${it.uses} de ${it.maxUses} usos</span></span><span class="chip ${ok ? "green" : "red"}">${ok ? "Activo" : "Agotado"}</span>${btns(i, true)}</div>`; }
    const n = catUse(k, it), what = k === "expenseCats" ? ["gasto", "gastos"] : k === "payMethods" ? ["venta", "ventas"] : ["producto", "productos"];
    return `<div class="cl-row"><span class="cl-main"><b>${esc(it)}</b><span>${n ? plural(n, what) : "Sin uso todavía"}</span></span>${btns(i, true)}</div>`;
  };
  modal(`${catHead(k, `<div class="hint">${tileInfo(k).sub}</div>`)}
    ${ed ? `<button class="btn dark block" data-catadd="${k}">${LI("plus")} Agregar ${k === "partners" ? "socio" : k === "discountCodes" ? "código" : CAT[k].one}</button>` : ""}
    <div class="cat-list">${items.map(row).join("") || `<div class="empty">Todavía no hay nada aquí</div>`}</div>
    ${k === "partners" && shareSum() !== 100 ? `<div class="err">Los % de gastos compartidos suman ${shareSum()} %; deberían sumar 100 %.</div>` : ""}`);
}
// Después de guardar, vuelve a la lista
const backTo = (k) => (ok) => { if (ok !== false) setTimeout(() => openCat(k), 0); return ok; };
function catItemModal(k, i) {
  if (k === "partners") return partnerModal(i == null ? null : DB.partners[i].id);
  if (k === "discountCodes") return codeEditModal(i);
  const old = i == null ? null : DB[k][i];
  modal(`${catHead(k)}<form id="f" class="form">
    <div class="field full"><label>${old ? "Nombre" : "Nombre de la nueva " + CAT[k].one}</label><input name="v" required value="${esc(old || "")}"></div>
    <button class="btn dark lg full">${old ? "Guardar" : "Agregar"}</button>
    <button type="button" class="btn ghost full" data-cattile="${k}">Volver</button></form>`, f => {
    const v = f.get("v").trim(); if (!v) return false;
    if (DB[k].some((x, j) => j !== i && x.toLowerCase() === v.toLowerCase())) { toast("Ya existe en la lista", true); return false; }
    if (CLOUD) return act(() => sbq(old ? sb.from(CAT_TABLE[k]).update({ name: v }).eq("name", old) : sb.from(CAT_TABLE[k]).upsert({ name: v, active: true }, { onConflict: "name" })), old ? "Cambio guardado" : "Agregado").then(backTo(k));
    if (old) {
      DB[k][i] = v;
      if (k === "categories") DB.products.forEach(p => { if (p.cat === old) p.cat = v; });
      if (k === "brands") DB.products.forEach(p => { if (p.brand === old) p.brand = v; });
      if (k === "expenseCats") DB.expenses.forEach(e => { if (e.cat === old) e.cat = v; });
    } else DB[k].push(v);
    save(); render(); toast(old ? "Cambio guardado" : "Agregado"); openCat(k); return false;
  });
}
function codeEditModal(i) {
  const d = i == null ? null : DB.discountCodes[i];
  modal(`${catHead("discountCodes")}<form id="f" class="form">
    <div class="field"><label>Código</label><input name="code" required style="text-transform:uppercase" value="${esc(d ? d.code : "")}" ${d ? "readonly" : ""} minlength="3" maxlength="30"></div>
    <div class="field"><label>Porcentaje</label><input name="pct" type="number" min="1" max="90" required value="${d ? d.pct : ""}"></div>
    <div class="field full"><label>Usos máximos</label><input name="max" type="number" min="1" value="${d ? d.maxUses : 50}"></div>
    ${d ? `<div class="hint full">Lleva ${d.uses} usos. Para reactivar un código agotado, subí los usos máximos.</div>` : ""}
    <button class="btn dark lg full">${d ? "Guardar" : "Crear código"}</button>
    <button type="button" class="btn ghost full" data-cattile="discountCodes">Volver</button></form>`, f => {
    const code = f.get("code").toUpperCase().trim(), pct = +f.get("pct"), max = +f.get("max");
    if (!d && DB.discountCodes.some(x => x.code === code)) { toast("Ese código ya existe", true); return false; }
    if (CLOUD) return act(() => sbq(d ? sb.from("discount_codes").update({ pct, max_uses: max, active: true }).eq("code", code) : sb.from("discount_codes").upsert({ code, pct, max_uses: max, active: true }, { onConflict: "code" })), d ? "Código actualizado" : "Código creado").then(backTo("discountCodes"));
    if (d) Object.assign(d, { pct, maxUses: max, active: true }); else DB.discountCodes.push({ code, pct, maxUses: max, uses: 0, active: true });
    save(); render(); toast(d ? "Código actualizado" : "Código creado"); openCat("discountCodes"); return false;
  });
}
function catDelete(k, i) {
  const it = k === "partners" ? DB.partners[i] : DB[k][i];
  const label = k === "partners" ? it.name : k === "discountCodes" ? it.code : it;
  if (!confirm(`¿Eliminar "${label}"?`)) return;
  if (CLOUD) {
    const q = k === "partners" ? sb.from("partners").update({ active: false }).eq("id", it.id)
      : k === "discountCodes" ? sb.from("discount_codes").update({ active: false }).eq("code", it.code)
      : sb.from(CAT_TABLE[k]).update({ active: false }).eq("name", it);
    if (k === "partners" && S.partner === it.id) S.partner = "all";
    return act(() => sbq(q), "Eliminado").then(backTo(k));
  }
  if (k === "partners") { DB.partners.splice(i, 1); if (S.partner === it.id) S.partner = "all"; } else DB[k].splice(i, 1);
  save(); render(); toast("Eliminado"); openCat(k);
}
function settingsModal(part) {
  const st = DB.settings, ed = can("canEditCatalog");
  const body = part === "tienda" ? `
      <div class="field full"><label>Nombre de la tienda</label><input name="store" value="${esc(st.store)}" required></div>
      <div class="field"><label>Moneda</label><input name="currency" value="${esc(st.currency)}" maxlength="3" required></div>
      <div class="field"><label>Código de país (WhatsApp)</label><input name="waCountry" inputmode="numeric" value="${esc(st.waCountry)}"></div>
      <div class="field"><label>Alerta de stock bajo (≤)</label><input name="lowStock" type="number" min="0" value="${st.lowStock}"></div>
      <div class="field"><label>Margen mínimo sobre costo (%)</label><input name="minMargin" type="number" min="0" value="${st.minMargin}"></div>
      <div class="hint full">El margen mínimo impide descuentos que dejen una prenda por debajo de su costo más ese porcentaje.</div>
      ${CLOUD ? "" : `<div class="field full"><label>Servidor del escáner celular</label><input name="relay" value="${esc(st.relay)}"></div>`}`
    : `
      <div class="field"><label>Ancho del rollo</label><select name="paper"><option value="80" ${st.paper !== "58" ? "selected" : ""}>80 mm (estándar)</option><option value="58" ${st.paper === "58" ? "selected" : ""}>58 mm (pequeña)</option></select></div>
      <div class="field"><label>Logo en el recibo</label><select name="rcLogo"><option value="1" ${st.rcLogo ? "selected" : ""}>Sí</option><option value="0" ${!st.rcLogo ? "selected" : ""}>No</option></select></div>
      <div class="field full"><label>Dirección</label><input name="rcAddress" value="${esc(st.rcAddress)}" placeholder="Ej. Del parque central 1c al sur, Managua"></div>
      <div class="field"><label>Teléfono</label><input name="rcPhone" value="${esc(st.rcPhone)}" inputmode="tel"></div>
      <div class="field"><label>RUC (opcional)</label><input name="rcRuc" value="${esc(st.rcRuc)}"></div>
      <div class="field full"><label>Mensaje al pie</label><textarea name="rcFooter" rows="3">${esc(st.rcFooter)}</textarea></div>`;
  modal(`${catHead(part)}<form id="f" class="form"><fieldset class="form-fs" ${ed ? "" : "disabled"}>${body}</fieldset>
    ${ed ? `<button class="btn dark lg full">Guardar</button>` : `<div class="hint full">Tu rol puede ver estos ajustes pero no cambiarlos.</div>`}</form>`, f => {
    const v = part === "tienda"
      ? { store: f.get("store").trim(), currency: f.get("currency").trim(), lowStock: +f.get("lowStock"), minMargin: +f.get("minMargin"), waCountry: String(f.get("waCountry")).replace(/\D/g, ""), relay: (f.get("relay") || "").trim() || DEFAULT_RELAY }
      : { paper: f.get("paper"), rcLogo: f.get("rcLogo") === "1", rcAddress: f.get("rcAddress").trim(), rcPhone: f.get("rcPhone").trim(), rcRuc: f.get("rcRuc").trim(), rcFooter: f.get("rcFooter").trim() };
    if (CLOUD) {
      const row = part === "tienda" ? { store: v.store, currency: v.currency, low_stock: v.lowStock, min_margin: v.minMargin, wa_country: v.waCountry }
        : { paper: v.paper, rc_logo: v.rcLogo, rc_address: v.rcAddress, rc_phone: v.rcPhone, rc_ruc: v.rcRuc, rc_footer: v.rcFooter };
      return act(() => sbq(sb.from("settings").update({ ...row, updated_at: new Date().toISOString() }).eq("id", 1)), "Ajustes guardados");
    }
    Object.assign(DB.settings, v); if (part === "tienda") { stopScanner(); listenScanner(); }
    save(); render(); toast("Ajustes guardados");
  });
}
function partnerModal(id) {
  const p = id ? partnerById(id) : { name: "", share: 0, color: "#4A6FA5" };
  modal(`${catHead("partners")}<form id="f" class="form">
    <div class="field full"><label>Nombre</label><input name="name" required value="${esc(p.name)}"></div>
    <div class="field"><label>% de gastos compartidos</label><input name="share" type="number" min="0" max="100" value="${+p.share || 0}"></div>
    <div class="field"><label>Color</label><input name="color" type="color" value="${esc(p.color || "#4A6FA5")}" style="padding:4px"></div>
    <button class="btn dark lg full">${id ? "Guardar" : "Crear socio"}</button>
    <button type="button" class="btn ghost full" data-cattile="partners">Volver</button>
  </form>`, f => {
    const v = { name: f.get("name").trim(), share: +f.get("share"), color: f.get("color") };
    if (CLOUD) return act(() => sbq(id ? sb.from("partners").update(v).eq("id", id) : sb.from("partners").insert(v)), id ? "Socio actualizado" : "Socio creado").then(backTo("partners"));
    if (id) Object.assign(DB.partners.find(x => x.id === id), v); else DB.partners.push({ id: "s" + uid(), ...v });
    save(); render(); toast(id ? "Socio actualizado" : "Socio creado"); openCat("partners"); return false;
  });
}

/* ---------- Usuarios ---------- */
function usersView() {
  return topbar("Usuarios", `${DB.users.filter(u => u.active).length} de 3 activos`, DB.users.filter(u => u.active).length < 3 ? `<button class="btn dark" data-act="newuser">${I.plus}<span class="hide-m">Nuevo usuario</span></button>` : "") + `
  <div class="content">
  <div class="u-cards hide-d">${DB.users.map(u => {
    const r = DB.roles[u.role], pin = u.active && r && r.maxDisc > 0;
    return `<section class="card u-card ${u.active ? "" : "off"}">
      <div class="u-top"><span class="avatar ${u.role === "propietaria" ? "red" : u.role === "vendedor" ? "grey" : ""}">${esc(initials(u.name))}</span>
        <span class="u-id"><b>${esc(u.name)}</b><small>@${esc(CLOUD ? userOf(u.email) : u.email.split("@")[0])}${u.id === me.id ? " · vos" : ""}</small></span>
        <span class="chip ${u.active ? "green" : "red"}">${u.active ? "Activo" : "Inactivo"}</span></div>
      <div class="u-row"><span>Rol</span>${u.id === me.id ? `<b>${esc(r ? r.label : u.role)}</b>` : `<select data-role="${u.id}">${Object.entries(DB.roles).map(([k, x]) => `<option value="${k}" ${u.role === k ? "selected" : ""}>${esc(x.label)}</option>`).join("")}</select>`}</div>
      <div class="u-row"><span>Descuento sin PIN</span><b>hasta ${r ? r.maxDisc : 0} %</b></div>
      <div class="u-btns">${CLOUD ? `<button class="btn sm" data-edituser="${u.id}">${I.edit} Editar</button>` : ""}${pin ? `<button class="btn sm" data-setpin="${u.id}">${I.lock} PIN</button>` : ""}${u.id !== me.id ? `<button class="btn sm ${u.active ? "ghost danger" : "dark"}" data-toggle="${u.id}">${u.active ? "Desactivar" : "Activar"}</button>` : ""}</div>
    </section>`; }).join("")}</div>
  <section class="card hide-m"><div class="tbl-wrap"><table><thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Límite desc.</th><th>PIN</th><th>Estado</th><th></th></tr></thead><tbody>
  ${DB.users.map(u => `<tr><td><span class="who"><span class="avatar ${u.role === "propietaria" ? "red" : u.role === "vendedor" ? "grey" : ""}">${esc(initials(u.name))}</span><b>${esc(u.name)}</b></span></td><td style="color:var(--muted)">${esc(CLOUD ? userOf(u.email) : u.email)}</td>
    <td>${u.id === me.id ? `<span class="chip">${esc(DB.roles[u.role].label)}</span>` : `<select data-role="${u.id}" style="height:32px;border:1px solid var(--line);border-radius:8px;padding:0 8px">${Object.entries(DB.roles).map(([k, r]) => `<option value="${k}" ${u.role === k ? "selected" : ""}>${esc(r.label)}</option>`).join("")}</select>`}</td>
    <td>${DB.roles[u.role] ? DB.roles[u.role].maxDisc : 0} %</td><td>${u.active && DB.roles[u.role] && DB.roles[u.role].maxDisc > 0 ? `<button class="btn sm ghost" data-setpin="${u.id}">${I.lock} Definir</button>` : `<span class="hint">—</span>`}</td><td><span class="chip ${u.active ? "green" : "red"}">${u.active ? "Activo" : "Inactivo"}</span></td>
    <td class="r"><span style="display:inline-flex;gap:6px;justify-content:flex-end">${CLOUD ? `<button class="btn sm ghost" data-edituser="${u.id}">${I.edit} Editar</button>` : ""}${u.id !== me.id ? `<button class="btn sm" data-toggle="${u.id}">${u.active ? "Desactivar" : "Activar"}</button>` : `<span class="hint" style="align-self:center">vos</span>`}</span></td></tr>`).join("")}
  </tbody></table></div></section>
  ${permsHTML()}
  </div>`;
}
// Permisos por rol, editables por la propietaria
const PERMS = [
  ["Pantallas", null],
  ["Panel", "v:panel", "Las ventas del día. Si no ve todas las ventas, ve solo las suyas."],
  ["Vender", "v:venta"],
  ["Inventario (stock)", "v:inventario"],
  ["Gastos", "v:gastos"],
  ["Reportes", "v:reportes"],
  ["Configuración", "v:catalogos"],
  ["Información", null],
  ["Ver las ventas de todos", "seeAllSales", "Si está apagado, solo ve sus propias ventas."],
  ["Ver costos de los productos", "canSeeCost"],
  ["Ver utilidad y márgenes", "canSeeProfit", "Utilidad, margen y estado de resultados."],
  ["Acciones", null],
  ["Registrar entradas de inventario", "canStockIn"],
  ["Registrar gastos", "canExpense"],
  ["Crear y editar productos y catálogos", "canEditCatalog"],
  ["Descuento máximo sin PIN", "maxDisc"]
];
function permsHTML() {
  const roles = Object.entries(DB.roles);
  const cell = (k, r, key) => {
    if (k === "propietaria") return key === "maxDisc" ? `<span class="chip">100 %</span>` : `<span class="chip green">Siempre</span>`;
    if (key === "maxDisc") return `<span class="qty"><button data-lim="${k}|-5" aria-label="Menos">−</button><b style="width:48px">${r.maxDisc} %</b><button class="plus" data-lim="${k}|5" aria-label="Más">+</button></span>`;
    const on = key.startsWith("v:") ? r.views.includes(key.slice(2)) : !!r[key];
    return `<label class="switch" title="${on ? "Permitido" : "No permitido"}"><input type="checkbox" data-perm="${k}|${key}" ${on ? "checked" : ""}><span></span></label>`;
  };
  // Teléfono: un rol a la vez, en lista
  const editable = roles.filter(([k]) => k !== "propietaria");
  const pr = DB.roles[S.permRole] && S.permRole !== "propietaria" ? S.permRole : (editable[editable.length - 1] || [])[0];
  const mobile = `<div class="hide-d perm-m">
    <div class="seg perm-seg">${editable.map(([k, r]) => `<button data-permrole="${k}" class="${k === pr ? "on" : ""}">${esc(r.label)}</button>`).join("")}</div>
    <div class="perm-list">${PERMS.map(([label, key, help]) => key === null ? `<div class="pl-grp">${label}</div>`
      : `<div class="pl-row"><span class="pl-t"><b>${label}</b>${help ? `<small>${help}</small>` : ""}</span>${cell(pr, DB.roles[pr], key)}</div>`).join("")}</div>
    <div class="hint" style="padding:10px 2px 0">La propietaria siempre tiene todos los permisos.</div></div>`;
  return `<section class="card"><div class="card-h"><h2>Permisos por rol</h2><span class="hint">los cambios se aplican al instante</span></div>${mobile}
    <div class="tbl-wrap hide-m"><table class="perms"><thead><tr><th>Permiso</th>${roles.map(([, r]) => `<th class="c">${esc(r.label)}</th>`).join("")}</tr></thead><tbody>
    ${PERMS.map(([label, key, help]) => key === null ? `<tr class="grp"><td colspan="${roles.length + 1}">${label}</td></tr>`
      : `<tr><td><b>${label}</b>${help ? `<span class="s">${help}</span>` : ""}</td>${roles.map(([k, r]) => `<td class="c">${cell(k, r, key)}</td>`).join("")}</tr>`).join("")}
    <tr><td><b>Usuarios y permisos</b><span class="s">Solo la propietaria.</span></td>${roles.map(([k]) => `<td class="c">${k === "propietaria" ? `<span class="chip green">Siempre</span>` : `<span class="chip">No</span>`}</td>`).join("")}</tr>
    </tbody></table></div></section>`;
}
function setPerm(roleKey, key, on) {
  const r = DB.roles[roleKey]; if (!r || roleKey === "propietaria") return;
  if (key.startsWith("v:")) {
    const v = key.slice(2);
    if (!on && r.views.length <= 1) { toast("Cada rol necesita al menos una pantalla", true); return render(); }
    r.views = on ? NAV_KEYS.filter(k => k === v || r.views.includes(k)) : r.views.filter(k => k !== v);
  } else r[key] = on;
  if (key === "canSeeProfit" && on) r.canSeeCost = true;
  if (key === "canSeeCost" && !on) r.canSeeProfit = false;
  if (CLOUD) return saveRole(roleKey, `${r.label}: permiso ${on ? "activado" : "quitado"}`);
  save(); render(); toast(`${r.label}: permiso ${on ? "activado" : "quitado"}`);
}
function saveRole(k, msg) {
  const r = DB.roles[k];
  return act(() => sbq(sb.from("roles").update({ views: r.views, max_disc: r.maxDisc, see_all_sales: !!r.seeAllSales, can_see_cost: !!r.canSeeCost, can_see_profit: !!r.canSeeProfit,
    can_stock_in: !!r.canStockIn, can_expense: !!r.canExpense, can_edit_catalog: !!r.canEditCatalog, updated_at: new Date().toISOString() }).eq("key", k)), msg);
}
// Crea la cuenta con un cliente aparte (para no cerrar la sesión de la propietaria) y la activa con su rol
async function createUserCloud(name, email, password, roleKey) {
  const tmp = window.supabase.createClient(CFG.url, CFG.anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: "aris-tmp" } });
  const { data, error } = await tmp.auth.signUp({ email, password, options: { data: { name } } });
  if (error) throw error;
  if (!data.user || (data.user.identities && !data.user.identities.length)) throw new Error("Ese usuario ya existe");
  await sbq(sb.from("profiles").update({ name, role: roleKey, active: true }).eq("id", data.user.id));
  return !data.session;
}
function pinSetModal(id) {
  const u = userById(id);
  modal(`<div class="modal-h"><h3>PIN de ${esc(u.name)}</h3><button class="btn icon ghost" data-close>${I.x}</button></div>
    <p class="hint" style="margin:0">Con este PIN ${esc(u.name)} autoriza descuentos mayores al límite de quien vende, hasta su propio límite (${DB.roles[u.role] ? DB.roles[u.role].maxDisc : 0} %). Se guarda cifrado: nadie lo puede ver.</p>
    <form id="f" class="form"><div class="field full"><label>PIN nuevo (4 números)</label><input name="pin" type="password" inputmode="numeric" pattern="\\d{4}" maxlength="4" autocomplete="new-password" required></div>
    <button class="btn dark lg full">Guardar PIN</button></form>`, f => {
    const pin = String(f.get("pin")).trim(); if (!/^\d{4}$/.test(pin)) { toast("El PIN son 4 números", true); return false; }
    if (CLOUD) return act(() => sbq(sb.rpc("set_pin", { p_user: id, p_pin: pin })), "PIN guardado");
    userById(id).pin = pin; save(); toast("PIN guardado");
  });
}
// Nombre y contraseña de un usuario (solo la propietaria)
function editUserModal(id) {
  const u = userById(id);
  modal(`<div class="modal-h"><h3>Editar usuario</h3><button class="btn icon ghost" data-close>${I.x}</button></div>
    <form id="f" class="form">
      <div class="field full"><label>Usuario</label><input value="${esc(userOf(u.email))}" disabled></div>
      <div class="field full"><label>Nombre completo</label><input name="name" required value="${esc(u.name)}"></div>
      <div class="field full"><label>Contraseña nueva (opcional, mínimo 6)</label><input name="pass" type="text" minlength="6" autocomplete="new-password" placeholder="Dejala vacía para no cambiarla"></div>
      <button class="btn dark lg full">Guardar</button>
    </form>`, f => {
    const name = f.get("name").trim(), pass = String(f.get("pass") || "");
    return act(async () => {
      if (name !== u.name) await sbq(sb.from("profiles").update({ name }).eq("id", id));
      if (pass) await sbq(sb.rpc("admin_set_password", { p_user: id, p_password: pass }));
    }, pass ? "Usuario actualizado y contraseña cambiada" : "Usuario actualizado");
  });
}
function newUserModal() {
  modal(`<div class="modal-h"><h3>Nuevo usuario</h3><button class="btn icon ghost" data-close>${I.x}</button></div><form id="f" class="form">
  ${CLOUD ? `<div class="field"><label>Usuario</label><input name="user" required autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="Ej. kperez" pattern="[A-Za-z0-9._\\-]{3,30}" title="De 3 a 30 letras o números, sin espacios"></div>
  <div class="field"><label>Nombre completo</label><input name="name" required placeholder="Ej. Karla Pérez"></div>` : `<div class="field"><label>Nombre</label><input name="name" required></div><div class="field"><label>Correo</label><input name="email" type="email" required></div>`}
  <div class="field"><label>Rol</label><select name="role">${Object.entries(DB.roles).map(([k, r]) => `<option value="${k}">${esc(r.label)}</option>`).join("")}</select></div>
  <div class="field"><label>Contraseña ${CLOUD ? "(mínimo 6)" : ""}</label><input name="pass" value="${CLOUD ? "" : "1234"}" ${CLOUD ? 'minlength="6" autocomplete="new-password"' : ""} required></div>
  ${CLOUD ? `<p class="hint full" style="margin:0">Pasale el usuario y la contraseña a la persona. Si la olvida, le asignás otra en Editar.</p>` : ""}
  <button class="btn dark lg full">Crear usuario</button></form>`, f => {
    if (CLOUD) { let confirmMail = false; return act(async () => { const user = String(f.get("user")).trim().toLowerCase();
      if (!/^[a-z0-9._-]{3,30}$/.test(user)) throw new Error("El usuario lleva de 3 a 30 letras o números, sin espacios");
      confirmMail = await createUserCloud(f.get("name").trim(), toEmail(user), f.get("pass"), f.get("role")); }, "Usuario creado").then(ok => { if (ok && confirmMail) toast("Usuario creado. Tiene que confirmar su correo antes de entrar."); return ok; }); } DB.users.push({ id: uid(), name: f.get("name"), email: f.get("email"), role: f.get("role"), pass: f.get("pass"), pin: "", active: true }); save(); render(); });
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
    if (pin.length === 4 && CLOUD) {
      const pct = Math.min(90, Math.max(1, +$("#pinPct").value || 0)), typed = pin;
      busy(true);
      sbq(sb.rpc("check_pin", { p_pin: typed, p_pct: pct })).then(r => {
        if (r && r.ok) { closeModal(); onOk(pct, { id: r.id, name: r.name }, typed); } else { toast((r && r.error) || "PIN incorrecto", true); pin = ""; draw(); }
      }, e => { toast(errMsg(e), true); pin = ""; draw(); }).finally(() => busy(false));
      return;
    }
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
  const f = $("#f"); if (f) { f.onsubmit = async (e) => {
    e.preventDefault(); if (f.dataset.busy) return;
    let r = modalSubmit && modalSubmit(new FormData(f));
    if (r && typeof r.then === "function") {
      const btn = f.querySelector("button[type=submit], button:not([type])"); f.dataset.busy = "1"; if (btn) btn.disabled = true;
      try { r = await r; } finally { delete f.dataset.busy; if (btn) btn.disabled = false; }
    }
    if (r !== false && $("#f") === f) closeModal();
  }; const first = f.querySelector("input,select"); if (first && !matchMedia("(pointer:coarse)").matches) first.focus(); }
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
  app.querySelectorAll("[data-perm]").forEach(i => i.onchange = (e) => { const [k, key] = e.target.dataset.perm.split("|"); setPerm(k, key, e.target.checked); });
  app.querySelectorAll("[data-role]").forEach(s => s.onchange = (e) => { if (CLOUD) return act(() => sbq(sb.from("profiles").update({ role: e.target.value }).eq("id", e.target.dataset.role)), "Rol actualizado"); userById(e.target.dataset.role).role = e.target.value; save(); render(); toast("Rol actualizado"); });
}
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-act],[data-add],[data-qty],[data-disc],[data-pay],[data-inv],[data-rep],[data-reptab],[data-photo],[data-lim],[data-toggle],[data-partner],[data-assign],[data-editprod],[data-sale-detail],[data-spk],[data-setpin],[data-erdet],[data-permrole],[data-edituser],[data-cattile],[data-catadd],[data-catedit],[data-catdel],[data-close]");
  if (!t) { if (e.target.classList.contains("sheet-ov")) return closeSheet(); if (e.target.classList.contains("overlay")) { closeModal(); if (S.cartOpen) render(); } return; }
  if (t.dataset.close != null) { if (t.closest(".cart-screen")) S.cartOpen = false; closeModal(); if (S.cartOpen) render(); return; }
  if (t.dataset.editprod) return editProdModal(t.dataset.editprod);
  if (t.dataset.setpin) return pinSetModal(t.dataset.setpin);
  if (t.dataset.erdet) return erDetailModal(t.dataset.erdet);
  if (t.dataset.permrole) { S.permRole = t.dataset.permrole; return render(); }
  if (t.dataset.edituser) return editUserModal(t.dataset.edituser);
  if (t.dataset.saleDetail) return saleDetailModal(t.dataset.saleDetail);
  if (t.dataset.spk) { S.spk = +t.dataset.spk; try { localStorage.setItem("aris-spk", S.spk); } catch {} return render(); }
  if (t.dataset.partner) { S.partner = t.dataset.partner; return render(); }
  if (t.dataset.cattile) return openCat(t.dataset.cattile);
  if (t.dataset.catadd) return catItemModal(t.dataset.catadd, null);
  if (t.dataset.catedit) { const [k, i] = t.dataset.catedit.split("|"); return catItemModal(k, +i); }
  if (t.dataset.catdel) { const [k, i] = t.dataset.catdel.split("|"); return catDelete(k, +i); }
  if (t.dataset.add) return addToCart(t.dataset.add);
  if (t.dataset.qty) { const [v, d] = t.dataset.qty.split("|"); return setQty(v, +d); }
  if (t.dataset.disc) return applyManual(+t.dataset.disc);
  if (t.dataset.pay) { S.pay = t.dataset.pay; return render(); }
  if (t.dataset.inv) { S.invFilter = t.dataset.inv; return render(); }
  if (t.dataset.rep) { S.repRange = t.dataset.rep; return render(); }
  if (t.dataset.reptab) { S.repTab = t.dataset.reptab; return render(); }
  if (t.dataset.lim) { if (me.role !== "propietaria") return; const [k, d] = t.dataset.lim.split("|"); if (k === "propietaria") return; DB.roles[k].maxDisc = Math.min(100, Math.max(0, DB.roles[k].maxDisc + +d));
    if (CLOUD) return saveRole(k); save(); return render(); }
  if (t.dataset.photo) { const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*"; inp.onchange = async () => { const f = inp.files[0]; if (!f) return;
      if (CLOUD) { const pid = t.dataset.photo; return act(async () => { const path = await uploadImg("product-photos", `${pid}/${Date.now()}.jpg`, await ART.compress(f, 900)); await sbq(sb.from("products").update({ photo_path: path, updated_at: new Date().toISOString() }).eq("id", pid)); }, "Foto actualizada"); }
      try { prodById(t.dataset.photo).photo = await ART.compress(f); save(); render(); toast("Foto actualizada"); } catch { toast("No se pudo leer la imagen", true); } }; inp.click(); return; }
  if (t.dataset.toggle && CLOUD) { const u = userById(t.dataset.toggle); if (!u.active && DB.users.filter(x => x.active).length >= 3) return toast("Ya hay 3 usuarios activos. Desactivá uno primero.", true); return act(() => sbq(sb.from("profiles").update({ active: !u.active }).eq("id", u.id)), u.active ? `${u.name} desactivada` : `${u.name} activada`); }
  if (t.dataset.toggle) { const u = userById(t.dataset.toggle); u.active = !u.active; save(); return render(); }
  const a = t.dataset.act;
  if (a === "more") { moreSheet(); }
  else if (a === "opencart") { S.cartOpen = true; render(); }
  else if (a === "sb") { S.sb = !S.sb; try { localStorage.setItem("aris-sb", S.sb ? "1" : "0"); } catch {} render(); }
  else if (a === "logout") logout();
  else if (a === "clearcart") { S.cart = []; S.disc = null; render(); }
  else if (a === "nodisc") { e.preventDefault(); S.disc = null; render(); }
  else if (a === "code") codeModal();
  else if (a === "pin") pinModal((pct, auth, pin) => { S.disc = { type: "pin", pct, by: auth.id, byName: auth.name, pin }; render(); toast(`${pct} % autorizado por ${auth.name}`); });
  else if (a === "cobrar") cobrar();
  else if (a === "print") printTicket(t.dataset.sale);
  else if (a === "wa") waSend(t.dataset.sale);
  else if (a === "void") voidModal(t.dataset.sale);
  else if (a === "reticket") { const x = DB.sales.find(s => s.id === t.dataset.sale); if (x) showTicket(x); }
  else if (a === "share") shareTicket(t.dataset.sale);
  else if (a === "delprod" && CLOUD) { const pr = prodById(t.dataset.pid), st = pr ? pr.variants.reduce((x, v) => x + v.stock, 0) : 0;
    if (confirm(st ? `¿Eliminar este producto? Sus ${st} unidades se descuentan del inventario con un ajuste.` : "¿Eliminar este producto?")) act(async () => {
      for (const v of pr.variants) if (v.stock > 0) await sbq(sb.rpc("stock_in", { p_variant: v.id, p_qty: -v.stock, p_type: "ajuste", p_note: "Producto eliminado" }));
      await sbq(sb.from("products").update({ active: false }).eq("id", t.dataset.pid));
    }, "Producto eliminado").then(ok => ok && closeModal()); }
  else if (a === "delprod") { if (confirm("¿Eliminar este producto?")) { DB.products = DB.products.filter(x => x.id !== t.dataset.pid); save(); closeModal(); render(); toast("Producto eliminado"); } }
  else if (a === "labels") labelsModal();
  else if (a === "pair") pairModal();
  else if (a === "unpair") { localStorage.removeItem(SCAN_KEY); stopScanner(); pairModal(); }
  else if (a === "copylink") { navigator.clipboard && navigator.clipboard.writeText(S.pairUrl || "").then(() => toast("Enlace copiado"), () => {}); }
  else if (a === "camscan") camScanModal();
  else if (a === "install") { if (deferredInstall) { closeModal(); doInstall(); } else installSheet(); }
  else if (a === "install-later") { try { localStorage.setItem(INSTALL_LATER, Date.now()); } catch {} closeSheet(); }
  else if (a === "stockin") stockInModal();
  else if (a === "newprod") newProdModal();
  else if (a === "newexp") newExpModal();
  else if (a === "newuser") newUserModal();
  else if (a === "csv") exportCSV();
  else if (a === "reset") { if (confirm("¿Volver a los datos de ejemplo? Se borran las ventas registradas en este demo.")) reset(); }
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && $(".sheet-ov")) closeSheet(); });
window.addEventListener("hashchange", () => { if (scannerParams()) return startScannerMode(); if (me) { render(); if (CLOUD) cloudSoon(300); } });
// Sincronía entre pestañas/ventanas del mismo navegador (en producción: Supabase Realtime)
window.addEventListener("storage", (e) => { if (!CLOUD && e.key === KEY) { load(); if (me) { me = DB.users.find(u => u.id === me.id) || me; render(); } } });
// Simulación de ventas desde "otro dispositivo"
setInterval(() => {
  if (CLOUD || !S.sim || !me) return;
  const seller = DB.users.filter(u => u.id !== me.id && u.active); const u = seller[Math.floor(Math.random() * seller.length)];
  const avail = DB.products.flatMap(p => p.variants.filter(v => v.stock > 0).map(v => ({ p, v }))); if (!avail.length || !u) return;
  const { p, v } = avail[Math.floor(Math.random() * avail.length)];
  const sub = p.price; const d = Math.random() < .3 ? { type: "manual", pct: 10, amount: Math.round(sub * .1) } : null;
  v.stock--; DB.sales.push({ id: uid(), n: DB.sales.reduce((a, s) => Math.max(a, s.n), 400) + 1, at: new Date().toISOString(), day: today(), seller: u.id, items: [{ pid: p.id, vid: v.id, partner: p.partner, name: p.name, size: v.size, color: v.color, qty: 1, price: p.price, cost: p.cost }], subtotal: sub, discount: d, total: sub - (d ? d.amount : 0), pay: DB.payMethods[Math.floor(Math.random() * 3)], status: "cerrada" });
  save(); if (view() === "panel") { render(); toast(`${u.name} vendió ${p.name} ${v.size} · ${money(sub - (d ? d.amount : 0))}`); }
}, 9000);

/* ---------- Animaciones: entrada escalonada y números que suben ---------- */
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
function animateView(first) {
  if (reduceMotion()) return;
  const c = $(".content"); if (!c) return;
  c.classList.remove("enter"); void c.offsetWidth; c.classList.add("enter");
  const tb = $(".topbar"); if (tb) { tb.classList.remove("enter"); void tb.offsetWidth; tb.classList.add("enter"); }
  if (!first) { let bar = document.getElementById("page-bar"); if (!bar) { bar = document.createElement("div"); bar.id = "page-bar"; document.body.appendChild(bar); } bar.classList.remove("go"); void bar.offsetWidth; bar.classList.add("go"); }
  document.querySelectorAll(".kpi .val").forEach(el => {
    const txt = el.textContent, m = txt.match(/^(.*?)([\d,]+(?:\.\d+)?)(.*)$/); if (!m) return;
    const target = parseFloat(m[2].replace(/,/g, "")); if (!(target > 0)) return;
    const dec = (m[2].split(".")[1] || "").length, t0 = performance.now(), dur = 750;
    const fmt = (n) => m[1] + n.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + m[3];
    const step = (t) => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); if (!el.isConnected) return; el.textContent = fmt(target * e); if (k < 1) requestAnimationFrame(step); else el.textContent = txt; };
    el.textContent = fmt(0); requestAnimationFrame(step);
  });
}

/* ---------- Librerías bajo demanda ---------- */
const _libs = {};
const lib = (src) => _libs[src] || (_libs[src] = new Promise((res, rej) => { const el = document.createElement("script"); el.src = src; el.onload = res; el.onerror = () => { delete _libs[src]; rej(new Error("No se pudo cargar " + src)); }; document.head.appendChild(el); }));

/* ---------- Instalar PWA ---------- */
let deferredInstall = null;
const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredInstall = e; if (!$("#modal-root").innerHTML) { if (me) render(); else if (!scannerParams()) { /* login: solo refresca el pie */ const f = $(".lg-foot"); if (f && !f.querySelector(".install-btn")) f.insertAdjacentHTML("beforeend", installHTML()); } } if (me) offerInstall(); });
// ---------- Invitación a instalar (teléfono) ----------
// Ningún navegador permite instalar sin que la persona lo confirme, así que se lo ofrecemos
// con un botón de un toque (Android) o con los pasos ilustrados (iPhone).
const INSTALL_LATER = "aris-install-later";
const isAndroid = /android/i.test(navigator.userAgent);
const isPhone = () => matchMedia("(max-width:900px)").matches || matchMedia("(pointer:coarse)").matches;
let installOffered = false;
function offerInstall(force) {
  if (isStandalone() || !me || (installOffered && !force)) return;
  if (!force) { if (!isPhone()) return; try { if (Date.now() - (+localStorage.getItem(INSTALL_LATER) || 0) < 3 * 864e5) return; } catch {} }
  if (!force && !deferredInstall && !isIOS && !isAndroid) return;
  installOffered = true;
  setTimeout(() => { if (!$("#modal-root").innerHTML && me && !isStandalone()) installSheet(); else installOffered = false; }, force ? 0 : 1500);
}
function installSheet() {
  const step = (n, icon, html) => `<li><span class="is-n">${n}</span><span class="is-ico">${LI(icon)}</span><span>${html}</span></li>`;
  const how = deferredInstall ? `<button class="btn is-go" data-act="install">${LI("square-plus")} Instalar ahora</button><p class="is-note">Es gratis, no ocupa casi espacio y no pasa por ninguna tienda de apps.</p>`
    : isIOS ? `<ol class="is-steps">${step(1, "share", `Tocá <b>Compartir</b> (el cuadrito con la flecha). En los iPhone más nuevos está dentro del botón <b>···</b> de abajo`)}${step(2, "square-plus", `Deslizá y elegí <b>Agregar a inicio</b>`)}${step(3, "house", `Tocá <b>Agregar</b>. ¡Listo! Ya queda en tu pantalla`)}</ol><div class="is-arrow" aria-hidden="true">${LI("share")}<span>Barra de Safari, abajo</span></div>`
    : `<ol class="is-steps">${step(1, "ellipsis-vertical", `Tocá el menú <b>⋮</b> arriba a la derecha del navegador`)}${step(2, "square-plus", `Elegí <b>Instalar app</b> o <b>Agregar a pantalla principal</b>`)}${step(3, "house", `Confirmá con <b>Instalar</b>. ¡Listo!`)}</ol>`;
  $("#modal-root").innerHTML = `<div class="overlay sheet-ov"><div class="sheet install-sheet" role="dialog" aria-modal="true" aria-label="Instalar la app">
    <div class="sheet-grab" aria-hidden="true"></div>
    <div class="is-head"><img src="icons/icon-192.png" alt="" class="is-icon"><div><h3>Instalá ${esc(DB.settings.store)}</h3><p>Tenela en tu pantalla de inicio, como cualquier app.</p></div></div>
    <div class="is-perks"><span>${LI("zap")}Abre al instante</span><span>${LI("maximize")}Pantalla completa</span><span>${LI("house")}Un toque desde el inicio</span></div>
    ${how}
    <button class="btn ghost is-later" data-act="install-later">Ahora no</button>
  </div></div>`;
  document.body.classList.add("lock");
}
window.addEventListener("appinstalled", () => { deferredInstall = null; toast("App instalada"); render(); });
function installHTML() {
  if (isStandalone()) return "";
  if (deferredInstall || isIOS || isAndroid) return `<button class="btn block install-btn" data-act="install">${I.install} Instalar app</button>`;
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
  // Formulario de producto abierto: el código va al campo enfocado o al primero vacío
  const vc = $("#vrows input[name=v_code]:focus") || [...document.querySelectorAll("#vrows input[name=v_code]")].find(i => !i.value.trim());
  if ($("#vrows")) { if (r) return toast(`El código ${code} ya es de ${r.p.name} ${r.v.size}`, true); if (!vc) return toast("Agregá una fila para ese código", true); vc.value = code; vc.classList.add("flash"); setTimeout(() => vc.classList.remove("flash"), 900); return toast(`Código ${code} cargado`); }
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
    const r = varById(f.get("vid"));
    if (CLOUD) return act(() => sbq(sb.from("variants").update({ barcode: code }).eq("id", r.v.id)), `Código asignado a ${r.p.name} ${r.v.size}`).then(ok => { if (ok && role().views.includes("venta")) { if (view() !== "venta") location.hash = "venta"; setTimeout(() => addToCart(r.v.id, true), 0); } return ok; });
    r.v.code = code; save(); toast(`Código asignado a ${r.p.name} ${r.v.size}`);
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
let scanES = null, scanCh = null, phoneSeen = 0;
const phoneOnline = () => Date.now() - phoneSeen < 75000;
function pairTopic(create) {
  let t = localStorage.getItem(SCAN_KEY);
  if (!t && create) { t = "aris-" + Array.from(crypto.getRandomValues(new Uint8Array(10)), b => (b % 36).toString(36)).join(""); localStorage.setItem(SCAN_KEY, t); }
  return t;
}
function listenScanner() {
  const t = pairTopic(false); if (!t || !me) return;
  if (CLOUD) {
    if (scanCh) return;
    scanCh = sb.channel("scan-" + t, { config: { broadcast: { self: false } } }).on("broadcast", { event: "m" }, ({ payload }) => payload && onPhoneMsg(payload)).subscribe();
    return;
  }
  if (scanES || !window.EventSource) return;
  scanES = new EventSource(`${relay()}/${t}/sse`);
  scanES.onmessage = (e) => { let d, m; try { d = JSON.parse(e.data); } catch { return; } if (d.event && d.event !== "message") return; try { m = JSON.parse(d.message); } catch { return; } onPhoneMsg(m); };
  scanES.onerror = () => { if ($("#pairStatus") && !phoneOnline()) $("#pairStatus").innerHTML = `<div class="pair-wait">Reconectando con el servidor…</div>`; };
}
function stopScanner() { if (scanES) { scanES.close(); scanES = null; } if (scanCh) { sb.removeChannel(scanCh); scanCh = null; } }
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
  const url = `${location.origin}${location.pathname}${location.search}#escaner=${t}${!CLOUD && relay() !== DEFAULT_RELAY ? "&r=" + encodeURIComponent(relay()) : ""}`;
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
  let send = async (msg) => { const r = await fetch(`${P.relay}/${P.topic}`, { method: "POST", body: JSON.stringify(msg) }); if (!r.ok) throw new Error("HTTP " + r.status); };
  if (CLOUD) {
    // Canal en tiempo real de Supabase: el celular no necesita iniciar sesión, solo conocer el código del vínculo
    const ch = sb.channel("scan-" + P.topic, { config: { broadcast: { self: false, ack: true } } });
    const ready = new Promise((res, rej) => { ch.subscribe(st => { if (st === "SUBSCRIBED") res(); else if (st === "CHANNEL_ERROR" || st === "TIMED_OUT") rej(new Error(st)); }); setTimeout(() => rej(new Error("timeout")), 12000); });
    ready.catch(() => {});
    send = async (msg) => { await ready; const r = await ch.send({ type: "broadcast", event: "m", payload: msg }); if (r !== "ok") throw new Error(String(r)); };
  }
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
  setPage("@page{size:letter;margin:8mm}");
  setTimeout(() => window.print(), 50);
}

/* ---------- Inicio ---------- */
if (CLOUD) DB = emptyDB(); else load();
if (scannerParams()) startScannerMode();
else if (CLOUD) {
  bootScreen("Conectando…");
  sb.auth.onAuthStateChange((ev) => {
    if (ev === "PASSWORD_RECOVERY") setTimeout(newPasswordModal, 300);
    if (ev === "SIGNED_OUT" && me) { me = null; cloudUnsubscribe(); stopScanner(); DB = emptyDB(); render(); }
  });
  sb.auth.getSession().then(({ data }) => { if (data && data.session) cloudStart(data.session.user); else render(); }, () => render());
} else {
  const sid = sessionStorage.getItem(SESSION); if (sid) me = DB.users.find(u => u.id === sid && u.active) || null;
  render(); listenScanner();
}
function newPasswordModal() {
  modal(`<div class="modal-h"><h3>Contraseña nueva</h3><button class="btn icon ghost" data-close>${I.x}</button></div>
    <form id="f" class="form"><div class="field full"><label>Contraseña nueva (mínimo 6)</label><input name="p" type="password" minlength="6" autocomplete="new-password" required></div>
    <button class="btn dark lg full">Guardar contraseña</button></form>`, async f => {
    const { error } = await sb.auth.updateUser({ password: f.get("p") });
    if (error) { toast(errMsg(error), true); return false; }
    toast("Contraseña actualizada");
  });
}
window.addEventListener("afterprint", () => { $("#print-root").innerHTML = ""; });
})();
