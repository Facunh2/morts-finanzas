// Función de Supabase: recibe un audio o una captura y devuelve los movimientos.
// La llave de APIMART vive acá (secreto del servidor), nunca en el celular.
// Supabase verifica el login antes de dejar pasar el pedido (verify_jwt).
import { leer } from '../_shared/lector.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

/** Solo pasan Facu y Marti con la sesión iniciada: así nadie más gasta la llave de APIMART. */
async function esMiembro(req: Request): Promise<boolean> {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY') || req.headers.get('apikey') || '';
  if (!token || !url || token === anon || token.startsWith('sb_')) return false;
  const u = await fetch(`${url}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: anon } });
  if (!u.ok) return false;
  const { id } = await u.json();
  const m = await fetch(`${url}/rest/v1/miembros?select=quien&user_id=eq.${id}`, {
    headers: { Authorization: `Bearer ${token}`, apikey: anon },
  });
  return m.ok && (await m.json()).length === 1;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (!(await esMiembro(req))) return json({ error: 'Tenés que entrar a la app con tu cuenta.' }, 401);
  try {
    const fd = await req.formData();
    const archivo = (k: string) => (fd.get(k) instanceof File ? (fd.get(k) as File) : undefined);
    const r = await leer({
      apiKey: Deno.env.get('APIMART_API_KEY'),
      catalogo: JSON.parse(String(fd.get('catalogo'))),
      hoy: String(fd.get('hoy') || ''),
      audio: archivo('audio'),
      imagen: archivo('imagen'),
      texto: fd.get('texto') ? String(fd.get('texto')) : undefined,
    });
    return new Response(JSON.stringify(r), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
