// Función de Supabase: recibe un audio o una captura y devuelve los movimientos.
// La llave de APIMART vive acá (secreto del servidor), nunca en el celular.
// Supabase verifica el login antes de dejar pasar el pedido (verify_jwt).
import { leer } from '../_shared/lector.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
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
