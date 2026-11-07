// Lector de audios y capturas: convierte una nota de voz o una captura de
// pantalla (transferencia, ticket, factura) en movimientos listos para guardar.
// JavaScript puro: lo usa la función de Supabase (Deno) y el servidor de prueba (Node).

const BASE = 'https://api.apimart.ai/v1';
const MODELO_TRANSCRIPCION = 'whisper-1';
const MODELO_LECTURA = (globalThis.process?.env?.MODELO_LECTURA) || (globalThis.Deno?.env?.get('MODELO_LECTURA')) || 'gpt-4.1-mini';

const EXT = { 'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'm4a',
  'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/opus': 'ogg', 'audio/wav': 'wav', 'video/mp4': 'mp4' };

export async function transcribir(apiKey, audioBlob) {
  const tipo = (audioBlob.type || 'audio/webm').split(';')[0];
  const fd = new FormData();
  fd.append('file', audioBlob, `nota.${EXT[tipo] || 'webm'}`);
  fd.append('model', MODELO_TRANSCRIPCION);
  fd.append('language', 'es');
  const r = await fetch(`${BASE}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: fd,
  });
  if (!r.ok) throw new Error(`No pude escuchar el audio (${r.status}): ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return (j.text || '').trim();
}

function instrucciones(cat, hoy) {
  const nombre = { facu: 'Facu', marti: 'Marti' };
  return `Sos el asistente de finanzas de una pareja argentina: Facu y Marti.
Quien te habla o te manda la captura es ${nombre[cat.quien]} (id "${cat.quien}"). La otra persona es ${nombre[cat.otra_persona]} (id "${cat.otra_persona}").
Hoy es ${hoy}. Moneda por defecto: pesos argentinos (ARS). Si dice "dólares", "USD" o "verdes", la moneda es USD.

Tu trabajo: detectar uno o más movimientos de plata y devolverlos en JSON.

Hay tres lugares donde puede ir cada movimiento:
1. "casa": gastos del hogar que ven los dos. Categorías (id → nombre, reparto por defecto):
${cat.casa.map((c) => `   - ${c.id} → ${c.nombre} (${c.reparto_por_defecto})`).join('\n')}
   "pago" = quién puso la plata ("facu" o "marti"). Si no lo dice, pagó quien habla.
   "reparto" = de quién es el gasto: "mitad" (50/50), "facu" o "marti". Usá el reparto por defecto de la categoría salvo que diga otra cosa ("esto es solo mío", "lo pago yo solo", "es de Marti").
   Marti es vegetariana: carnicería y pollería son de Facu.
2. "personal": gastos privados de quien habla. Categorías: ${cat.personal.map((c) => `${c.id} (${c.nombre})`).join(', ')}.
3. Ingresos de quien habla (tipo "ingreso", ambito "personal"). Categorías: ${cat.ingresos.map((c) => `${c.id} (${c.nombre})`).join(', ')}.
Además:
- Ahorro: tipo "ahorro", categoria "ahorro". Ambito "casa" si es un ahorro en conjunto, "personal" si es propio. Si saca plata del ahorro, monto negativo.
- Saldar cuentas entre ellos ("le pasé a Marti lo que le debía", "Facu me devolvió"): tipo "saldo", ambito "casa", categoria "saldo", pago = quien le pasó la plata a la otra persona.

Reglas para decidir:
- Uber, Cabify, DiDi, taxi, remís, colectivo, SUBE: SOLO es casa / transporte_casa si queda claro que viajaron los dos ("fuimos", "nos tomamos", "con Marti", "con Facu"). En cualquier otro caso (viajó sola/solo, "fui", "al trabajo", o no se sabe) → personal / transporte.
- Cada movimiento tiene su propia fecha: "ayer" afecta solo a lo que se dijo en esa frase, el resto es hoy.
- Super, chino, almacén, verdulería, dietética, farmacia, servicios del hogar → casa.
- Salidas, restaurantes, delivery para los dos → casa / salidas. Algo solo para quien habla → personal / gustos.
- Ropa, gimnasio, médico, kinesiólogo, obra social, monotributo, anuncios (Meta, Facebook Ads, Google Ads) → personal.
- Una captura de una transferencia RECIBIDA por quien habla (sueldo, cobro, pago de un cliente) es un ingreso. Una transferencia ENVIADA o un ticket es un gasto.
- Montos argentinos: "$12.500" = 12500; "12.500,50" = 12500.5; "15 lucas" o "15 mil" = 15000; "una luca" = 1000; "un palo" = 1000000.
- Fecha: la que figure en la captura o la que diga ("ayer", "el lunes"). Si no hay, hoy. Formato AAAA-MM-DD.
- "nota": 2 a 6 palabras con lo que se dijo o se ve (comercio, motivo). No inventes datos que no estén.
- Si no hay ningún movimiento de plata claro, devolvé la lista vacía y explicá por qué en "duda".

Respondé SOLO este JSON:
{"movimientos":[{"tipo":"gasto|ingreso|ahorro|saldo","ambito":"casa|personal","categoria":"<id>","monto":<número>,"moneda":"ARS|USD","pago":"facu|marti","reparto":"mitad|facu|marti","fecha":"AAAA-MM-DD","nota":"..."}],"duda":null}
En "personal" e "ingreso", "pago" y "reparto" son quien habla.`;
}

/**
 * @param {object} p
 * @param {string} p.apiKey
 * @param {object} p.catalogo  catalogoParaIA(quien) del cliente
 * @param {string} [p.hoy]     AAAA-MM-DD
 * @param {Blob}   [p.audio]
 * @param {Blob}   [p.imagen]
 * @param {string} [p.texto]
 */
export async function leer({ apiKey, catalogo, hoy, audio, imagen, texto }) {
  if (!apiKey) throw new Error('Falta la llave de APIMART en el servidor.');
  if (!catalogo || !['facu', 'marti'].includes(catalogo.quien)) throw new Error('Falta saber quién manda esto.');
  hoy = hoy || new Date().toISOString().slice(0, 10);

  let transcripcion = null;
  const contenido = [];
  if (audio) {
    transcripcion = await transcribir(apiKey, audio);
    contenido.push({ type: 'text', text: `Nota de voz transcripta: "${transcripcion}"` });
  }
  if (texto) contenido.push({ type: 'text', text: `Mensaje: "${texto}"` });
  if (imagen) {
    const buf = new Uint8Array(await imagen.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    contenido.push({ type: 'text', text: 'Captura de pantalla:' });
    contenido.push({ type: 'image_url', image_url: { url: `data:${imagen.type || 'image/png'};base64,${btoa(bin)}` } });
  }
  if (!contenido.length) throw new Error('No llegó ni audio, ni imagen, ni texto.');

  const r = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODELO_LECTURA,
      stream: false,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: instrucciones(catalogo, hoy) },
        { role: 'user', content: contenido },
      ],
    }),
  });
  if (!r.ok) throw new Error(`No pude leerlo (${r.status}): ${(await r.text()).slice(0, 200)}`);
  const crudo = await r.text();
  let texto_respuesta = '';
  if (crudo.trimStart().startsWith('data:')) {
    // Respuesta en streaming (SSE): juntar los pedazos.
    for (const linea of crudo.split('\n')) {
      const l = linea.trim();
      if (!l.startsWith('data:') || l === 'data: [DONE]') continue;
      try { texto_respuesta += JSON.parse(l.slice(5)).choices?.[0]?.delta?.content || ''; } catch { /* línea parcial */ }
    }
  } else {
    texto_respuesta = JSON.parse(crudo).choices[0].message.content;
  }
  let salida;
  try {
    salida = JSON.parse(texto_respuesta.replace(/^```(json)?|```$/g, '').trim());
  } catch {
    throw new Error('La lectura no devolvió un formato válido.');
  }
  return { transcripcion, ...limpiar(salida, catalogo, hoy) };
}

// Valida lo que devolvió el modelo: nada sale de las categorías permitidas.
function limpiar(salida, cat, hoy) {
  const casa = new Map(cat.casa.map((c) => [c.id, c]));
  const personal = new Set(cat.personal.map((c) => c.id));
  const ingresos = new Set(cat.ingresos.map((c) => c.id));
  const personas = ['facu', 'marti'];
  const ok = [];
  for (const m of salida.movimientos || []) {
    const monto = Number(m.monto);
    if (!isFinite(monto) || monto === 0) continue;
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(m.fecha || '') ? m.fecha : hoy;
    const moneda = m.moneda === 'USD' ? 'USD' : 'ARS';
    const nota = String(m.nota || '').slice(0, 80);
    const base = { monto, moneda, fecha, nota };
    if (m.tipo === 'saldo') {
      ok.push({ ...base, tipo: 'saldo', ambito: 'casa', categoria: 'saldo', monto: Math.abs(monto),
        pago: personas.includes(m.pago) ? m.pago : cat.quien, reparto: null });
    } else if (m.tipo === 'ahorro') {
      const ambito = m.ambito === 'casa' ? 'casa' : 'personal';
      ok.push({ ...base, tipo: 'ahorro', ambito, categoria: 'ahorro',
        pago: ambito === 'casa' && personas.includes(m.pago) ? m.pago : cat.quien, reparto: null });
    } else if (m.tipo === 'ingreso') {
      ok.push({ ...base, tipo: 'ingreso', ambito: 'personal', monto: Math.abs(monto),
        categoria: ingresos.has(m.categoria) ? m.categoria : 'otro_ingreso', pago: cat.quien, reparto: null });
    } else if (m.ambito === 'casa' || casa.has(m.categoria)) {
      const c = casa.get(m.categoria) || casa.get('otros_casa');
      ok.push({ ...base, tipo: 'gasto', ambito: 'casa', categoria: c.id, monto: Math.abs(monto),
        pago: personas.includes(m.pago) ? m.pago : cat.quien,
        reparto: ['mitad', ...personas].includes(m.reparto) ? m.reparto : c.reparto_por_defecto });
    } else {
      ok.push({ ...base, tipo: 'gasto', ambito: 'personal', monto: Math.abs(monto),
        categoria: personal.has(m.categoria) ? m.categoria : 'otros', pago: cat.quien, reparto: null });
    }
  }
  return { movimientos: ok, duda: ok.length ? null : salida.duda || 'No encontré ningún monto claro.' };
}
