// Datos iniciales del demo. En producción esto vive en Supabase.
window.SEED = {
  settings: { store: "Ari's Closet", currency: "C$", lowStock: 2, minMargin: 5 },
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
  categories: ["Blusas","Pantalones","Vestidos","Faldas","Sandalias","Tacones","Tenis","Bolsos","Carteras","Accesorios"],
  brands: ["Ari's","Flor","Denim Co","Sol","Vela","Luna","Bella"],
  payMethods: ["Efectivo","Tarjeta","Transferencia"],
  expenseCats: ["Alquiler","Servicios","Mercadería","Salarios","Transporte","Otros"],
  discountCodes: [
    { code: "ARI15", pct: 15, maxUses: 50, uses: 7, active: true },
    { code: "BIENVENIDA", pct: 10, maxUses: 100, uses: 31, active: true }
  ],
  products: [
    { id: "p1", name: "Blusa floral", cat: "Blusas", brand: "Flor", cost: 280, price: 520,
      variants: [ {id:"p1a",size:"S",color:"Rosa",stock:2},{id:"p1b",size:"M",color:"Rosa",stock:4},{id:"p1c",size:"M",color:"Blanco",stock:5},{id:"p1d",size:"L",color:"Blanco",stock:3} ] },
    { id: "p2", name: "Jeans skinny tiro alto", cat: "Pantalones", brand: "Denim Co", cost: 450, price: 780,
      variants: [ {id:"p2a",size:"28",color:"Azul",stock:1},{id:"p2b",size:"30",color:"Azul",stock:5},{id:"p2c",size:"32",color:"Azul",stock:4},{id:"p2d",size:"30",color:"Negro",stock:4} ] },
    { id: "p3", name: "Vestido midi", cat: "Vestidos", brand: "Ari's", cost: 520, price: 950,
      variants: [ {id:"p3a",size:"S",color:"Negro",stock:3},{id:"p3b",size:"M",color:"Negro",stock:4},{id:"p3c",size:"M",color:"Vino",stock:2} ] },
    { id: "p4", name: "Falda plisada", cat: "Faldas", brand: "Luna", cost: 260, price: 480,
      variants: [ {id:"p4a",size:"S",color:"Beige",stock:3},{id:"p4b",size:"M",color:"Beige",stock:2},{id:"p4c",size:"M",color:"Negro",stock:4} ] },
    { id: "p5", name: "Sandalias de tiras", cat: "Sandalias", brand: "Sol", cost: 320, price: 595,
      variants: [ {id:"p5a",size:"36",color:"Beige",stock:2},{id:"p5b",size:"37",color:"Beige",stock:3},{id:"p5c",size:"38",color:"Beige",stock:3},{id:"p5d",size:"37",color:"Dorado",stock:2} ] },
    { id: "p6", name: "Tacones stiletto", cat: "Tacones", brand: "Bella", cost: 620, price: 1150,
      variants: [ {id:"p6a",size:"36",color:"Negro",stock:2},{id:"p6b",size:"37",color:"Negro",stock:0},{id:"p6c",size:"38",color:"Nude",stock:3} ] },
    { id: "p7", name: "Tenis urbanos", cat: "Tenis", brand: "Vela", cost: 650, price: 1150,
      variants: [ {id:"p7a",size:"36",color:"Blanco",stock:3},{id:"p7b",size:"37",color:"Blanco",stock:4},{id:"p7c",size:"38",color:"Blanco",stock:1} ] },
    { id: "p8", name: "Bolso tote", cat: "Bolsos", brand: "Ari's", cost: 480, price: 890,
      variants: [ {id:"p8a",size:"Única",color:"Camel",stock:3},{id:"p8b",size:"Única",color:"Negro",stock:2} ] },
    { id: "p9", name: "Bolso bandolera", cat: "Bolsos", brand: "Luna", cost: 390, price: 720,
      variants: [ {id:"p9a",size:"Única",color:"Negro",stock:4},{id:"p9b",size:"Única",color:"Rojo",stock:2} ] },
    { id: "p10", name: "Cartera de mano", cat: "Carteras", brand: "Bella", cost: 180, price: 350,
      variants: [ {id:"p10a",size:"Única",color:"Negro",stock:6},{id:"p10b",size:"Única",color:"Rosa",stock:3},{id:"p10c",size:"Única",color:"Dorado",stock:1} ] },
    { id: "p11", name: "Aretes argolla", cat: "Accesorios", brand: "Bella", cost: 45, price: 120,
      variants: [ {id:"p11a",size:"Única",color:"Dorado",stock:12},{id:"p11b",size:"Única",color:"Plata",stock:9} ] },
    { id: "p12", name: "Cinturón delgado", cat: "Accesorios", brand: "Ari's", cost: 70, price: 160,
      variants: [ {id:"p12a",size:"S",color:"Negro",stock:5},{id:"p12b",size:"M",color:"Negro",stock:4},{id:"p12c",size:"M",color:"Camel",stock:2} ] }
  ],
  // ventas y gastos de ejemplo se generan al iniciar (ver app.js seedHistory)
};
