// Cuando exista el proyecto de Supabase, completar estos dos datos
// (Supabase → Project Settings → API). La "anon key" es pública por diseño:
// lo que protege los datos son las reglas de la base (secciones privadas).
// Si quedan vacíos, la app arranca en MODO DEMO (datos solo en este navegador).
export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';

// Lector de audios y capturas. En demo usa el servidor de prueba local.
export const LECTOR_URL = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/leer-gasto` : '/api/leer';
