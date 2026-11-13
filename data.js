// Datos iniciales del demo. En producción esto vive en Supabase.
window.SEED = {
  settings: { store: "Ari's Closet", currency: "Q", lowStock: 2, minMargin: 5 },
  users: [
    { id: "u1", name: "Ariana", email: "ariana@arischoset.com", role: "propietaria", pin: "1234", pass: "1234", active: true },
    { id: "u2", name: "Karla", email: "karla@arischoset.com", role: "admin", pin: "2222", pass: "1234", active: true },
    { id: "u3", name: "José", email: "jose@arischoset.com", role: "vendedor", pin: "", pass: "1234", active: true }
  ],
  roles: {
    propietaria: { label: "Propietaria", maxDisc: 100, views: ["panel","venta","inventario","gastos","reportes","catalogos","usuarios"], canEditCatalog: true, canSeeProfit: true, canExpense: true, canStockIn: true, canUsers: true, canVoid: true },
    admin:       { label: "Administradora", maxDisc: 15, views: ["panel","venta","inventario","gastos","reportes","catalogos"], canEditCatalog: true, canSeeProfit: false, canExpense: true, canStockIn: true, canUsers: false, canVoid: true },
    vendedor:    { label: "Vendedor", maxDisc: 10, views: ["venta","inventario","panel"], canEditCatalog: false, canSeeProfit: false, canExpense: false, canStockIn: false, canUsers: false, canVoid: false }
  },
  categories: ["Blusas","Pantalones","Vestidos","Camisas","Calzado","Accesorios"],
  brands: ["Denim Co","Flor","Vela","Sol","Lino & Co","Ari's"],
  payMethods: ["Efectivo","Tarjeta","Transferencia"],
  expenseCats: ["Alquiler","Servicios","Mercadería","Salarios","Transporte","Otros"],
  discountCodes: [
    { code: "ARI15", pct: 15, maxUses: 50, uses: 7, active: true },
    { code: "BIENVENIDA", pct: 10, maxUses: 100, uses: 31, active: true }
  ],
  products: [
    { id: "p1", name: "Blusa floral", cat: "Blusas", brand: "Flor", cost: 280, price: 520, color: "c1",
      variants: [ {id:"p1a",size:"S",color:"Rosa",stock:2},{id:"p1b",size:"M",color:"Rosa",stock:4},{id:"p1c",size:"M",color:"Blanco",stock:5},{id:"p1d",size:"L",color:"Blanco",stock:3} ] },
    { id: "p2", name: "Jeans skinny", cat: "Pantalones", brand: "Denim Co", cost: 450, price: 780, color: "c2",
      variants: [ {id:"p2a",size:"28",color:"Azul",stock:1},{id:"p2b",size:"30",color:"Azul",stock:5},{id:"p2c",size:"32",color:"Azul",stock:4},{id:"p2d",size:"30",color:"Negro",stock:4} ] },
    { id: "p3", name: "Tenis running", cat: "Calzado", brand: "Vela", cost: 1100, price: 1850, color: "c4",
      variants: [ {id:"p3a",size:"40",color:"Negro",stock:0},{id:"p3b",size:"41",color:"Negro",stock:3},{id:"p3c",size:"42",color:"Negro",stock:2},{id:"p3d",size:"42",color:"Blanco",stock:4} ] },
    { id: "p4", name: "Sandalias", cat: "Calzado", brand: "Sol", cost: 320, price: 595, color: "c5",
      variants: [ {id:"p4a",size:"36",color:"Beige",stock:2},{id:"p4b",size:"37",color:"Beige",stock:3},{id:"p4c",size:"38",color:"Beige",stock:3} ] },
    { id: "p5", name: "Vestido midi", cat: "Vestidos", brand: "Ari's", cost: 520, price: 950, color: "c6",
      variants: [ {id:"p5a",size:"S",color:"Negro",stock:3},{id:"p5b",size:"M",color:"Negro",stock:4},{id:"p5c",size:"M",color:"Vino",stock:2} ] },
    { id: "p6", name: "Camisa lino", cat: "Camisas", brand: "Lino & Co", cost: 390, price: 690, color: "c3",
      variants: [ {id:"p6a",size:"M",color:"Blanco",stock:5},{id:"p6b",size:"L",color:"Blanco",stock:4},{id:"p6c",size:"L",color:"Arena",stock:3} ] },
    { id: "p7", name: "Calcetas deportivas", cat: "Accesorios", brand: "Vela", cost: 55, price: 120, color: "c3",
      variants: [ {id:"p7a",size:"Única",color:"Blanco",stock:24},{id:"p7b",size:"Única",color:"Negro",stock:18} ] },
    { id: "p8", name: "Botas cuero", cat: "Calzado", brand: "Sol", cost: 1500, price: 2500, color: "c5",
      variants: [ {id:"p8a",size:"37",color:"Café",stock:2},{id:"p8b",size:"38",color:"Café",stock:2},{id:"p8c",size:"39",color:"Negro",stock:1} ] }
  ],
  // ventas y gastos de ejemplo se generan al iniciar (ver app.js seedHistory)
};
