// Conexión a Supabase. La "anon key" es pública por diseño: la seguridad la ponen
// las reglas de la base de datos (RLS). Nunca pongas aquí la service_role key.
window.ARIS_CONFIG = {
  url: "https://fmdjqjfnmccfixzurnjj.supabase.co",
  // Los usuarios entran con un nombre corto (mvaldivia). En Supabase se crean como mvaldivia@ariscloset.app
  userDomain: "ariscloset.app",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtZGpxamZubWNjZml4enVybmpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUxMTkxMTUsImV4cCI6MjExMDY5NTExNX0.uZfVcGvhMvYdkOwPl5b5oqFXR46TWTXkExqxIgfyBIw"
};
