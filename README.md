# Nuestras Finanzas · Facu y Marti

App para el celular (se instala desde el navegador, sin App Store) con las finanzas de la pareja.
Tiene un sector **Casa** (lo ven los dos, 50/50 o de uno solo), una sección **personal y privada**
para cada uno (ingresos, gastos propios, ahorros) y un **lector de audios y capturas** que carga solo.

## Probarla ya en la compu (modo demo)

    node dev-server.js        # abre http://localhost:5180

En demo los datos quedan en ese navegador y se puede cambiar de Facu a Marti en Ajustes.

## Pasarla a los celulares (sincronizada)

1. **Supabase** (gratis): crear cuenta y un proyecto en supabase.com.
2. SQL Editor → pegar `supabase/schema.sql` → Run.
3. Authentication → Sign In / Providers → Email: desactivar "Confirm email" (opcional, más simple).
4. Copiar `Project URL` y `anon public key` (Project Settings → API) en `public/js/config.js`.
5. Subir el lector de audios:

       npx supabase login
       npx supabase link --project-ref <ref-del-proyecto>
       npx supabase secrets set APIMART_API_KEY=<llave>
       npx supabase functions deploy leer-gasto

6. Publicar la carpeta `public/` en un hosting con HTTPS (GitHub Pages, Netlify o Cloudflare Pages).
7. Cada uno abre el link, crea su cuenta y elige quién es. Después de que entren los dos,
   la base no deja anotar a una tercera persona.
8. Instalar: iPhone → Safari → Compartir → *Agregar a pantalla de inicio*.
   Android → Chrome → ⋮ → *Instalar app*.

## Archivos

| Archivo | Qué es |
|---|---|
| `public/js/categorias.js` | Categorías y reglas (qué es 50/50, qué paga uno solo). Única fuente: la IA lee esta lista. |
| `public/js/calc.js` | Las cuentas: quién le debe a quién, parte de cada uno, lo que queda en el mes. |
| `public/js/app.js` | Pantallas (La casa / Lo mío), chat anotador y carga con botones. |
| `public/js/store.js` | Datos: demo (navegador) o Supabase (nube). |
| `supabase/functions/_shared/lector.js` | Audio → texto (whisper-1) → movimientos (gpt-4.1-mini), vía APIMART. |
| `supabase/schema.sql` | Tablas y reglas de privacidad. |

Costo del lector: unos centavos de dólar por mes con uso normal (cada audio o captura ≈ US$ 0,001–0,003).
