import { crearStore } from './store.js';
import { PERSONAS, CASA, PERSONAL, INGRESOS, categoria, otra } from './categorias.js';
import { balance, resumenCasa, resumenPersonal, ahorroTotal, estadoVencimientos, delMes } from './calc.js';
import { leerConIA, Grabadora } from './lector.js';

// ── Estado ───────────────────────────────────────────────────────────────────
const hoyISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
// vista: 'casa' | 'mio' | 'todo' | 'ajustes'
const E = { store: null, quien: null, vista: 'casa', lado: 'casa', mes: hoyISO().slice(0, 7), movs: [], venc: [], metas: [], chat: [] };
const $ = (s, r = document) => r.querySelector(s);
const vista = $('#vista');

// ── Formatos ─────────────────────────────────────────────────────────────────
const fARS = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const plata = (v, moneda = 'ARS') => `${v < 0 ? '−' : ''}${moneda === 'USD' ? 'US$' : '$'} ${fARS.format(Math.abs(v))}`;
const plataDoble = (o) => {
  if (!Math.round(o.USD)) return plata(o.ARS);
  if (!Math.round(o.ARS)) return plata(o.USD, 'USD');
  return `${plata(o.ARS)} <small>${o.USD < 0 ? '−' : '+'} ${plata(Math.abs(o.USD), 'USD')}</small>`;
};
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const nombreMes = (mes, conAnio) => { const [a, m] = mes.split('-'); return MESES[m - 1] + (conAnio ? ` ${a}` : ''); };
const fechaCorta = (f) => { const [, m, d] = f.split('-'); return `${Number(d)} ${MESES[m - 1].slice(0, 3)}`; };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nom = (q) => PERSONAS[q]?.nombre || q;
const leerMonto = (s) => {
  s = String(s).trim().replace(/\$|\s/g, '');
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/[.,]/g, '');
  return Number(s);
};
const moverMes = (mes, d) => { const [a, m] = mes.split('-').map(Number); const x = new Date(a, m - 1 + d, 1); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`; };

/** Borra lo guardado en el celular (no los datos, que están en la nube) y vuelve a bajar todo. */
async function actualizarApp() {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations()) || [];
    await Promise.all(regs.map((r) => r.unregister()));
    const claves = await caches.keys();
    await Promise.all(claves.filter((k) => k !== 'compartidos').map((k) => caches.delete(k)));
  } catch { /* si falla, igual recargamos */ }
  location.reload();
}

// ── Arranque ─────────────────────────────────────────────────────────────────
async function iniciar() {
  if ('serviceWorker' in navigator) {
    // Si había una versión instalada y llega otra nueva, recargar una vez para mostrarla.
    const tenia = !!navigator.serviceWorker.controller;
    let recargado = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (tenia && !recargado) { recargado = true; location.reload(); }
    });
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
      reg.update().catch(() => {});
      // La app instalada queda abierta días: buscar novedades cada vez que vuelven a ella.
      document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
    }).catch(() => {});
  }
  E.store = await crearStore();
  E.store.alCambiar(() => recargar());
  const s = await E.store.sesion();
  if (!s) return E.store.modo === 'nube' ? pantallaLogin() : pantallaQuienSos();
  if (!s.quien) return pantallaQuienSos();
  await entrar(s.quien);
}

async function entrar(quien) {
  E.quien = quien;
  document.body.dataset.quien = quien;
  document.body.classList.add('adentro');
  $('#quien-chip').innerHTML = `<i></i>${nom(quien)} ⚙️`;
  $('#lado-mio').innerHTML = `🔒 Lo mío`;
  try { E.chat = JSON.parse(localStorage.getItem('chat.' + quien)) || []; } catch { E.chat = []; }
  await recargar();
  revisarCompartidos();
}

async function recargar() {
  if (!E.quien) return;
  [E.movs, E.venc, E.metas] = await Promise.all([E.store.movimientos(), E.store.vencimientos(), E.store.metas()]);
  pintar();
}

function irA(v) { E.vista = v; if (v === 'casa' || v === 'mio') E.lado = v; window.scrollTo(0, 0); pintar(); }

function pintar() {
  const y = window.scrollY;
  document.querySelectorAll('[data-lado]').forEach((b) => b.classList.toggle('on', b.dataset.lado === E.lado));
  $('#lados').hidden = E.vista === 'ajustes';
  vista.innerHTML = { casa: vistaCasa, mio: vistaMio, todo: vistaTodo, ajustes: vistaAjustes }[E.vista]();
  window.scrollTo(0, y);
}

// ── Pantallas de entrada ─────────────────────────────────────────────────────
function pantallaLogin(error = '') {
  vista.innerHTML = `
    <section class="vidrio bienvenida">
      <img src="img/icono-512.png" class="logo-grande" alt="">
      <h1>Mort’s Finanzas</h1>
      <p class="suave">Entrá con tu mail. Lo de la casa lo ven los dos; lo tuyo, solo vos.</p>
      <form id="form-login" class="form">
        <input name="email" type="email" placeholder="Tu mail" autocomplete="email" required>
        <input name="clave" type="password" placeholder="Contraseña (mínimo 6)" autocomplete="current-password" minlength="6" required>
        ${error ? `<p class="error">${esc(error)}</p>` : ''}
        <button class="boton verde grande" name="accion" value="entrar">Entrar</button>
        <button class="boton vidrio-btn" name="accion" value="registrarse">Crear mi cuenta</button>
      </form>
    </section>`;
  $('#form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      if (e.submitter?.value === 'registrarse') await E.store.registrarse(f.get('email'), f.get('clave'));
      else await E.store.entrar(f.get('email'), f.get('clave'));
      const s = await E.store.sesion();
      if (!s) return pantallaLogin('Revisá tu mail para confirmar la cuenta y después entrá.');
      s.quien ? entrar(s.quien) : pantallaQuienSos();
    } catch (err) { pantallaLogin(err.message.includes('Invalid login') ? 'Mail o contraseña incorrectos.' : err.message); }
  });
}

function pantallaQuienSos() {
  vista.innerHTML = `
    <section class="vidrio bienvenida">
      <img src="img/icono-512.png" class="logo-grande" alt="">
      <h1>¿Quién sos?</h1>
      <p class="suave">${E.store.modo === 'demo' ? 'Modo demo: los datos quedan solo en este navegador.' : 'Se elige una sola vez.'}</p>
      <div class="dos">
        <button class="boton facu grande" data-accion="soy" data-q="facu">Facu</button>
        <button class="boton marti grande" data-accion="soy" data-q="marti">Marti</button>
      </div>
    </section>`;
}

// ── Piezas comunes ───────────────────────────────────────────────────────────
function cabeceraMes() {
  return `<div class="mes-chico">
    <button data-accion="mes" data-d="-1" aria-label="Mes anterior">‹</button>
    <span>${nombreMes(E.mes, E.mes.slice(0, 4) !== hoyISO().slice(0, 4))}</span>
    <button data-accion="mes" data-d="1" aria-label="Mes siguiente" ${E.mes >= hoyISO().slice(0, 7) ? 'disabled' : ''}>›</button></div>`;
}

function barrasCategorias(filasIn, max = 5) {
  const filas = filasIn.filter(([, v]) => v.ARS > 0 || v.USD > 0).sort((a, b) => b[1].ARS - a[1].ARS).slice(0, max);
  if (!filas.length) return '';
  const tope = Math.max(...filas.map(([, v]) => v.ARS), 1);
  return `<div class="barras">${filas.map(([id, v]) => {
    const c = id === '_casa' ? { icono: '🏠', nombre: 'Tu parte de la casa' } : categoria(id, E.quien);
    return `<div class="barra-fila"><span class="barra-nom">${c.icono} ${esc(c.nombre)}</span>
      <span class="barra-tubo"><i style="width:${Math.max(4, (v.ARS / tope) * 100)}%"></i></span>
      <span class="barra-monto">${plataDoble(v)}</span></div>`;
  }).join('')}</div>`;
}

function filaMov(m) {
  const c = categoria(m.categoria, E.quien);
  let detalle = '';
  if (m.tipo === 'saldo') detalle = `${nom(m.pago)} le pasó a ${nom(otra(m.pago))}`;
  else if (m.ambito === 'casa' && m.tipo === 'gasto') detalle = `pagó ${nom(m.pago)} · ${m.reparto === 'mitad' ? 'a medias' : 'solo de ' + nom(m.reparto)}`;
  else if (m.tipo === 'ahorro') detalle = m.ambito === 'casa' ? 'ahorro juntos' : 'ahorro';
  else if (m.tipo === 'ingreso') detalle = 'ingreso';
  else detalle = c.nombre;
  const signo = m.tipo === 'ingreso' ? '+' : '';
  return `<li class="fila" data-accion="editar" data-id="${m.id}">
    <span class="ico ${m.ambito === 'casa' ? 'casa' : E.quien}">${c.icono}</span>
    <span class="fila-txt"><b>${esc(m.nota || c.nombre)}</b><small>${fechaCorta(m.fecha)} · ${esc(detalle)}</small></span>
    <span class="fila-monto ${m.tipo === 'ingreso' ? 'verde-t' : ''}">${signo}${plata(Math.abs(m.monto), m.moneda)}</span></li>`;
}

const ordenar = (l) => [...l].sort((x, y) => (y.fecha + (y.creado || '')).localeCompare(x.fecha + (x.creado || '')));

function ultimos(lista, lado) {
  if (!lista.length) return `<div class="vacio"><div class="vacio-burbuja">🫧</div><p>Todavía no hay nada.<br>Escribí abajo, por ejemplo <b>"súper 25 lucas"</b>.</p></div>`;
  return `<ul class="lista">${ordenar(lista).slice(0, 5).map(filaMov).join('')}</ul>
    ${lista.length > 5 ? `<button class="ver-todo" data-accion="ver-todo" data-lado="${lado}">Ver los ${lista.length} movimientos ›</button>` : ''}`;
}

// ── LA CASA ──────────────────────────────────────────────────────────────────
function vistaCasa() {
  const q = E.quien, o = otra(q), hoy = hoyISO();
  const b = balance(E.movs, q);
  const r = resumenCasa(E.movs, E.mes);
  const lista = delMes(E.movs, E.mes).filter((m) => m.ambito === 'casa');
  const urgentes = estadoVencimientos(E.venc.filter((v) => v.ambito === 'casa' || true), E.movs, hoy.slice(0, 7), hoy)
    .filter((v) => !v.pagado && v.faltan <= 7);

  // Quién le debe a quién: una sola frase.
  const ars = Math.round(b.ARS);
  const deuda = Math.abs(ars) < 1
    ? `<div class="hero-num">Están a mano 🤝</div>`
    : `<div class="hero-sub">${ars > 0 ? `${nom(o)} te debe` : `Le debés a ${nom(o)}`}</div>
       <div class="hero-num ${ars > 0 ? 'verde-t' : 'rosa-t'}">${plata(Math.abs(ars))}</div>
       <button class="link" data-accion="saldar">Ya nos pasamos la plata ›</button>`;

  const persona = (p) => `
    <div class="persona ${p}">
      <span class="av ${p}">${nom(p)[0]}</span>
      <b>${nom(p)}</b>
      <small>puso</small><span class="persona-num">${plataDoble(r.pago[p])}</span>
      <small>le toca</small><span class="persona-toca">${plataDoble(r.parte[p])}</span>
    </div>`;

  return `
    <section class="vidrio hero">
      <div class="avatares"><span class="av facu">F</span><span class="av marti">M</span></div>
      ${deuda}
    </section>

    <section class="vidrio">
      <div class="tarjeta-titulo">La casa en ${cabeceraMes()}</div>
      <div class="cifra-grande">${plataDoble(r.total)}</div>
      <div class="personas">${persona('facu')}${persona('marti')}</div>
    </section>

    <section class="vidrio">
      <div class="tarjeta-titulo">¿En qué se fue?</div>
      ${barrasCategorias(Object.entries(r.porCat)) || '<p class="suave">Sin gastos este mes.</p>'}
    </section>

    ${urgentes.length ? `<section class="vidrio">
      <div class="tarjeta-titulo">Para pagar pronto</div>
      <ul class="lista">${urgentes.map(filaVencimiento).join('')}</ul>
    </section>` : ''}

    <section class="vidrio">
      <div class="tarjeta-titulo">Últimos</div>
      ${ultimos(lista, 'casa')}
    </section>`;
}

function filaVencimiento(v) {
  const c = categoria(v.categoria, E.quien);
  const estado = v.faltan < 0 ? `<span class="pastilla mal">Venció</span>`
    : v.faltan === 0 ? `<span class="pastilla alerta">Hoy</span>`
    : `<span class="pastilla alerta">En ${v.faltan} ${v.faltan === 1 ? 'día' : 'días'}</span>`;
  return `<li class="fila" data-accion="pagar-venc" data-cat="${v.categoria}" data-ambito="${v.ambito}">
    <span class="ico">${c.icono}</span>
    <span class="fila-txt"><b>${esc(c.nombre)}</b><small>vence el ${v.dia} · tocá para anotar el pago</small></span>
    ${estado}</li>`;
}

// ── LO MÍO (privado) ─────────────────────────────────────────────────────────
function vistaMio() {
  const q = E.quien;
  const r = resumenPersonal(E.movs, E.mes, q);
  const ahorro = ahorroTotal(E.movs, 'personal');
  const metas = E.metas.filter((m) => m.ambito === 'personal');
  const gastado = { ARS: r.gastos.ARS + r.parteCasa.ARS, USD: r.gastos.USD + r.parteCasa.USD };
  const filasGasto = [...Object.entries(r.porCatGas), ['_casa', r.parteCasa]];
  const sinIngresos = !r.ingresos.ARS && !r.ingresos.USD;
  return `
    <section class="vidrio hero">
      <div class="hero-sub">Te queda en ${cabeceraMes()}</div>
      <div class="hero-num ${r.queda.ARS < 0 ? 'rosa-t' : ''}">${plataDoble(r.queda)}</div>
      <div class="hero-fila">
        <div><small>Entró</small><b class="verde-t">${plataDoble(r.ingresos)}</b></div>
        <div><small>Gastaste</small><b>${plataDoble(gastado)}</b></div>
      </div>
      ${sinIngresos ? `<p class="pista">💡 Anotá lo que ${q === 'marti' ? 'te depositaron' : 'entró'} este mes, ej. <b>"${q === 'marti' ? 'me depositaron el sueldo 850 mil' : 'entraron 1,2 palos del negocio'}"</b></p>` : ''}
      <p class="privado">🔒 Solo vos ves esto</p>
    </section>

    <section class="vidrio">
      <div class="tarjeta-titulo">¿En qué gastaste?</div>
      ${barrasCategorias(filasGasto, 6) || '<p class="suave">Sin gastos este mes.</p>'}
      ${r.transporte.ARS ? `<p class="nota-chica">🚕 Viajes: ${plata(r.transporte.ARS)} (los tuyos + tu mitad de los compartidos)</p>` : ''}
    </section>

    <section class="vidrio">
      <div class="tarjeta-titulo">Tus ahorros</div>
      <div class="cifra-grande">${plataDoble(ahorro)}</div>
      ${metas.map((m) => barraMeta(m, ahorro)).join('')}
      <button class="link" data-accion="nueva-meta" data-ambito="personal">+ Ponerme una meta</button>
    </section>

    <section class="vidrio">
      <div class="tarjeta-titulo">Últimos</div>
      ${ultimos(r.lista, 'mio')}
    </section>`;
}

function barraMeta(m, ahorro) {
  const tengo = ahorro[m.moneda] || 0;
  const pct = Math.max(0, Math.min(100, (tengo / m.objetivo) * 100));
  return `<div class="meta" data-accion="editar-meta" data-id="${m.id}">
    <div class="meta-top"><b>🎯 ${esc(m.nombre)}</b><span>${plata(tengo, m.moneda)} de ${plata(m.objetivo, m.moneda)}</span></div>
    <div class="barra-tubo grande"><i style="width:${Math.max(3, pct)}%"></i><em>${Math.round(pct)}%</em></div></div>`;
}

// ── VER TODO ─────────────────────────────────────────────────────────────────
function vistaTodo() {
  const delmes = delMes(E.movs, E.mes);
  const lista = E.lado === 'casa' ? delmes.filter((m) => m.ambito === 'casa') : delmes.filter((m) => m.ambito === 'personal');
  return `
    <button class="volver" data-accion="volver">‹ Volver</button>
    <section class="vidrio">
      <div class="tarjeta-titulo">${E.lado === 'casa' ? 'Todo lo de la casa' : 'Todo lo tuyo'} en ${cabeceraMes()}</div>
      ${lista.length ? `<ul class="lista">${ordenar(lista).map(filaMov).join('')}</ul>` : '<p class="suave">Nada en este mes.</p>'}
    </section>
    ${E.lado === 'casa' ? (() => {
      const ahorro = ahorroTotal(E.movs, 'casa');
      const metas = E.metas.filter((m) => m.ambito === 'casa');
      return `<section class="vidrio">
        <div class="tarjeta-titulo">Ahorro juntos</div>
        <div class="cifra-grande">${plataDoble(ahorro)}</div>
        ${metas.map((m) => barraMeta(m, ahorro)).join('')}
        <button class="link" data-accion="nueva-meta" data-ambito="casa">+ Meta juntos</button>
      </section>`;
    })() : ''}`;
}

// ── AJUSTES ──────────────────────────────────────────────────────────────────
function vistaAjustes() {
  const venc = [...E.venc].sort((a, b) => a.dia - b.dia);
  const opciones = [...CASA.map((c) => ({ ...c, ambito: 'casa' })), ...PERSONAL[E.quien].map((c) => ({ ...c, ambito: 'personal' }))]
    .filter((c) => !E.venc.some((v) => v.categoria === c.id));
  return `
    <button class="volver" data-accion="volver">‹ Volver</button>
    <section class="vidrio">
      <div class="tarjeta-titulo">📅 Qué vence y qué día</div>
      <p class="suave">Te aviso en la pantalla de la casa cuando falta una semana.</p>
      <ul class="lista">${venc.map((v) => {
        const c = categoria(v.categoria, E.quien);
        return `<li class="fila"><span class="ico">${c.icono}</span>
          <span class="fila-txt"><b>${esc(c.nombre)}</b><small>${v.ambito === 'personal' ? '🔒 tuyo' : 'casa'}</small></span>
          <label class="dia">día <input type="number" min="1" max="31" value="${v.dia}" data-cambio="dia-venc" data-id="${v.id}"></label>
          <button class="x" data-accion="borrar-venc" data-id="${v.id}" aria-label="Quitar">✕</button></li>`;
      }).join('')}</ul>
      ${opciones.length ? `<div class="agregar-venc">
        <select id="nuevo-venc">${opciones.map((c) => `<option value="${c.id}|${c.ambito}">${c.icono} ${esc(c.nombre)}${c.ambito === 'personal' ? ' (tuyo)' : ''}</option>`).join('')}</select>
        <input id="nuevo-venc-dia" type="number" min="1" max="31" value="10">
        <button class="boton verde chico" data-accion="agregar-venc">Agregar</button></div>` : ''}
    </section>
    <section class="vidrio">
      <div class="tarjeta-titulo">🖼️ Fondo</div>
      <div class="fondos">${[['depto', 'Depto'], ['edificios', 'Edificios'], ['balcon', 'Ventana']].map(([v, t]) =>
        `<button class="fondo-op ${document.documentElement.dataset.fondo === v ? 'on' : ''}" data-accion="fondo" data-v="${v}" style="background-image:url(img/fondo-${v}.jpg)"><span>${t}</span></button>`).join('')}</div>
    </section>
    <section class="vidrio">
      <div class="tarjeta-titulo">📲 Tenerla como app</div>
      <p><b>iPhone:</b> Safari → Compartir → <i>Agregar a pantalla de inicio</i>.</p>
      <p><b>Android:</b> Chrome → ⋮ → <i>Instalar app</i>. Después podés compartirle audios de WhatsApp o capturas directo.</p>
    </section>
    <section class="vidrio">
      <div class="tarjeta-titulo">🔄 Actualizar la app</div>
      <p>Si ves algo viejo, tocá acá: baja la última versión y se reinicia.</p>
      <button class="boton vidrio-btn chico" data-accion="actualizar">Actualizar ahora</button>
    </section>
    <section class="vidrio">
      <div class="tarjeta-titulo">👤 Cuenta</div>
      <p>Estás como <b>${nom(E.quien)}</b>${E.store.modo === 'demo' ? ' (demo: los datos quedan en este navegador)' : ''}.</p>
      <div class="dos">
        ${E.store.modo === 'demo' ? `<button class="boton vidrio-btn chico" data-accion="cambiar-persona">Ver como ${nom(otra(E.quien))}</button>` : ''}
        <button class="boton vidrio-btn chico" data-accion="exportar">⬇️ Planilla</button>
        <button class="boton rojo chico" data-accion="salir">${E.store.modo === 'demo' ? 'Salir' : 'Cerrar sesión'}</button>
      </div>
    </section>`;
}

// ── CHAT ─────────────────────────────────────────────────────────────────────
const chat = $('#chat');
const chatLista = $('#chat-lista');
const entrada = $('#entrada');

function guardarChat() { localStorage.setItem('chat.' + E.quien, JSON.stringify(E.chat.slice(-40))); }

function abrirChat() {
  pintarChat();
  chat.hidden = false;
  requestAnimationFrame(() => { chat.classList.add('abierto'); chatLista.scrollTop = chatLista.scrollHeight; });
}
function cerrarChat() { chat.classList.remove('abierto'); setTimeout(() => { chat.hidden = true; }, 220); }

function pintarChat() {
  const ejemplos = E.quien === 'marti'
    ? ['dietética 12 mil', 'Uber al trabajo 3.500', 'me depositaron el sueldo 850 mil']
    : ['súper 25 lucas', 'carnicería 18.500', 'pagué el monotributo 68 mil'];
  const bienvenida = `<div class="msj app">¡Hola ${nom(E.quien)}! Contame qué pagaste o qué te entró, como le escribirías a alguien. También podés mandarme un audio 🎤 o una captura 📷 de la transferencia. Yo lo anoto donde va.</div>
    <div class="ejemplos">${ejemplos.map((t) => `<button class="ejemplo" data-ejemplo="${esc(t)}">${esc(t)}</button>`).join('')}</div>`;
  chatLista.innerHTML = bienvenida + E.chat.map((m) => `<div class="msj ${m.de}">${m.html}</div>`).join('');
}

function decir(de, html) {
  E.chat.push({ de, html });
  guardarChat();
  if (!chat.hidden) { pintarChat(); chatLista.scrollTop = chatLista.scrollHeight; }
}

function resumenCargado(m) {
  const c = categoria(m.categoria, E.quien);
  const donde = m.tipo === 'saldo' ? `${nom(m.pago)} le pasó plata a ${nom(otra(m.pago))}`
    : m.ambito === 'casa'
      ? (m.tipo === 'ahorro' ? 'ahorro juntos' : `🏠 casa · pagó ${nom(m.pago)} · ${m.reparto === 'mitad' ? 'a medias' : 'solo de ' + nom(m.reparto)}`)
      : m.tipo === 'ingreso' ? '🔒 ingreso tuyo' : m.tipo === 'ahorro' ? '🔒 tu ahorro' : '🔒 gasto tuyo';
  return `<div class="cargado" data-accion="editar" data-id="${m.id}">${c.icono} <b>${esc(c.nombre)}</b> ${plata(Math.abs(m.monto), m.moneda)}<small>${donde} · tocá para corregir</small></div>`;
}

async function procesar({ audio, imagen, texto }) {
  abrirChat();
  if (texto) decir('yo', esc(texto));
  else if (audio) decir('yo', '🎤 Nota de voz');
  else if (imagen) decir('yo', '📷 Captura');
  const pensando = document.createElement('div');
  pensando.className = 'msj app pensando';
  pensando.innerHTML = '<span></span><span></span><span></span>';
  chatLista.appendChild(pensando);
  chatLista.scrollTop = chatLista.scrollHeight;
  try {
    const r = await leerConIA({ store: E.store, quien: E.quien, audio, imagen, texto, hoy: hoyISO() });
    pensando.remove();
    if (audio && r.transcripcion) { E.chat[E.chat.length - 1].html = `🎤 <i>"${esc(r.transcripcion)}"</i>`; guardarChat(); }
    if (!r.movimientos?.length) return decir('app', `Mmm, no encontré ningún monto 🤔 ${esc(r.duda || '')}<br>Probá con algo como <b>"luz 41 mil"</b>.`);
    const origen = audio ? 'audio' : imagen ? 'captura' : 'manual';
    const guardados = [];
    for (const m of r.movimientos) guardados.push(await E.store.agregar({ ...m, origen }));
    decir('app', `Listo, anoté ${guardados.length === 1 ? 'esto' : 'estas ' + guardados.length + ' cosas'} ✅${guardados.map(resumenCargado).join('')}
      <button class="link" data-deshacer="${guardados.map((g) => g.id).join(',')}">Deshacer</button>`);
  } catch (e) {
    pensando.remove();
    decir('app', `Uy, no pude leerlo: ${esc(e.message)}`);
  }
}

// Barra de abajo: escribir, grabar, captura, cargar a mano.
const btnMic = $('#btn-mic');
let grabadora = null;

function actualizarBotonEnviar() {
  const hay = entrada.value.trim().length > 0;
  btnMic.innerHTML = hay ? '➤' : '🎤';
  btnMic.classList.toggle('enviar', hay);
}
entrada.addEventListener('input', actualizarBotonEnviar);
entrada.addEventListener('focus', () => { if (E.chat.length || chat.hidden) abrirChat(); });
$('#form-chat').addEventListener('submit', (e) => { e.preventDefault(); enviarTexto(); });

function enviarTexto() {
  const t = entrada.value.trim();
  if (!t) return;
  entrada.value = '';
  actualizarBotonEnviar();
  procesar({ texto: t });
}

btnMic.addEventListener('click', async (e) => {
  e.preventDefault();
  if (entrada.value.trim()) return enviarTexto();
  if (!grabadora) {
    try { grabadora = new Grabadora(); await grabadora.empezar(); }
    catch { grabadora = null; abrirChat(); return decir('app', 'No tengo permiso para usar el micrófono 🎤. Activalo en los ajustes del navegador.'); }
    document.body.classList.add('grabando');
    const t0 = Date.now();
    entrada.placeholder = 'Grabando… tocá ⏹ para terminar';
    btnMic.innerHTML = '⏹';
    const reloj = setInterval(() => {
      if (!grabadora) { clearInterval(reloj); return; }
      const s = Math.floor((Date.now() - t0) / 1000);
      entrada.placeholder = `🔴 Grabando 0:${String(s).padStart(2, '0')} · tocá ⏹ para terminar`;
      if (s >= 59) btnMic.click();
    }, 300);
    return;
  }
  const audio = await grabadora.terminar();
  grabadora = null;
  document.body.classList.remove('grabando');
  entrada.placeholder = 'Escribí un gasto…';
  btnMic.innerHTML = '🎤';
  procesar({ audio });
});

const inputArchivo = $('#archivo');
inputArchivo.addEventListener('change', () => {
  const f = inputArchivo.files[0];
  inputArchivo.value = '';
  if (!f) return;
  if (f.type.startsWith('image/')) procesar({ imagen: f });
  else procesar({ audio: f });
});

/** Android: lo que se compartió a la app desde WhatsApp / galería. */
async function revisarCompartidos() {
  if (!new URLSearchParams(location.search).has('compartido') || !('caches' in window)) return;
  history.replaceState(null, '', location.pathname);
  const cache = await caches.open('compartidos');
  for (const req of await cache.keys()) {
    const blob = await (await cache.match(req)).blob();
    await cache.delete(req);
    if (blob.type.startsWith('image/')) await procesar({ imagen: blob });
    else if (blob.type.startsWith('text/')) await procesar({ texto: await blob.text() });
    else await procesar({ audio: blob });
  }
}

// ── Hoja para cargar a mano / corregir ───────────────────────────────────────
const hoja = $('#hoja');
let F = null;

function abrirHoja(base = {}) {
  const modo = base.tipo === 'ingreso' ? 'ingreso' : base.tipo === 'ahorro' ? 'ahorro' : base.tipo === 'saldo' ? 'saldo'
    : base.ambito === 'personal' ? 'personal' : base.modo || (E.lado === 'mio' ? 'personal' : 'casa');
  F = { id: base.id || null, modo, monto: base.monto ? String(Math.abs(base.monto)).replace('.', ',') : '',
    moneda: base.moneda || 'ARS', categoria: base.categoria || null, pago: base.pago || E.quien,
    reparto: base.reparto || 'mitad', fecha: base.fecha || hoyISO(), nota: base.nota || '',
    ambitoAhorro: base.tipo === 'ahorro' ? base.ambito : 'personal', retiro: base.tipo === 'ahorro' && base.monto < 0,
    origen: base.origen || 'manual' };
  cerrarChat();
  pintarHoja();
  hoja.hidden = false;
  requestAnimationFrame(() => hoja.classList.add('abierta'));
}

function cerrarHoja() {
  hoja.classList.remove('abierta');
  setTimeout(() => { hoja.hidden = true; hoja.innerHTML = ''; }, 250);
}

function catsDelModo() {
  if (F.modo === 'casa') return CASA;
  if (F.modo === 'personal') return PERSONAL[E.quien];
  if (F.modo === 'ingreso') return INGRESOS[E.quien];
  return [];
}

function pintarHoja() {
  const cats = catsDelModo();
  const seg = (v, t) => `<button class="seg ${F.modo === v ? 'on' : ''}" data-hoja="modo" data-v="${v}">${t}</button>`;
  const tog = (campo, v, t, extra = '') => `<button class="seg ${F[campo] === v ? 'on' : ''} ${extra}" data-hoja="${campo}" data-v="${v}">${t}</button>`;
  hoja.innerHTML = `
    <div class="hoja vidrio">
      <div class="hoja-asa"></div>
      <div class="hoja-top"><b>${F.id ? 'Corregir' : F.modo === 'saldo' ? 'Saldar cuentas' : 'Anotar'}</b><button class="x" data-hoja="cerrar" aria-label="Cerrar">✕</button></div>
      ${F.modo === 'saldo' ? '' : `<div class="paso">1. ¿Qué es?</div><div class="segmentos">${seg('casa', '🏠 De la casa')}${seg('personal', '🔒 Mío')}${seg('ingreso', '💵 Me entró')}${seg('ahorro', '🐷 Ahorro')}</div>`}
      <div class="paso">${F.modo === 'saldo' ? '' : '2. '}¿Cuánto?</div>
      <div class="monto-caja">
        <span>$</span><input id="h-monto" inputmode="decimal" placeholder="0" value="${esc(F.monto)}" autocomplete="off">
        <div class="mini-seg">${tog('moneda', 'ARS', 'Pesos')}${tog('moneda', 'USD', 'Dólares')}</div>
      </div>
      ${cats.length ? `<div class="paso">3. ¿En qué?</div><div class="cats">${cats.map((c) => `<button class="cat ${F.categoria === c.id ? 'on' : ''}" data-hoja="cat" data-v="${c.id}"><span>${c.icono}</span>${esc(c.nombre)}</button>`).join('')}</div>` : ''}
      ${F.modo === 'casa' ? `
        <div class="campo"><span>Pagó</span><div class="mini-seg">${tog('pago', 'facu', 'Facu', 'facu')}${tog('pago', 'marti', 'Marti', 'marti')}</div></div>
        <div class="campo"><span>Es de</span><div class="mini-seg">${tog('reparto', 'mitad', 'Los dos')}${tog('reparto', 'facu', 'Facu', 'facu')}${tog('reparto', 'marti', 'Marti', 'marti')}</div></div>` : ''}
      ${F.modo === 'saldo' ? `<div class="campo"><span>¿Quién le pasó a quién?</span><div class="mini-seg">${tog('pago', 'facu', 'Facu → Marti', 'facu')}${tog('pago', 'marti', 'Marti → Facu', 'marti')}</div></div>` : ''}
      ${F.modo === 'ahorro' ? `
        <div class="campo"><span>De</span><div class="mini-seg">${tog('ambitoAhorro', 'personal', '🔒 Mío')}${tog('ambitoAhorro', 'casa', '💞 Juntos')}</div></div>
        <div class="campo"><span></span><div class="mini-seg"><button class="seg ${!F.retiro ? 'on' : ''}" data-hoja="retiro" data-v="0">Guardo</button><button class="seg ${F.retiro ? 'on' : ''}" data-hoja="retiro" data-v="1">Saco</button></div></div>` : ''}
      <details class="mas" ${F.id ? 'open' : ''}><summary>Fecha y nota</summary>
        <div class="campo"><span>Fecha</span><input id="h-fecha" type="date" value="${F.fecha}"></div>
        <input id="h-nota" class="nota" placeholder="Nota: Coto, Uber a lo de mamá…" value="${esc(F.nota)}">
      </details>
      <div class="dos">
        ${F.id ? `<button class="boton rojo" data-hoja="borrar">Borrar</button>` : ''}
        <button class="boton verde grande" data-hoja="guardar">Guardar</button>
      </div>
    </div>`;
}

function leerCamposHoja() {
  F.monto = $('#h-monto')?.value ?? F.monto;
  F.fecha = $('#h-fecha')?.value || F.fecha;
  F.nota = $('#h-nota')?.value ?? F.nota;
}

async function guardarHoja() {
  leerCamposHoja();
  const monto = leerMonto(F.monto);
  if (!monto || monto <= 0) return aviso('Poné cuánto fue 🙂', 'mal');
  let m;
  if (F.modo === 'saldo') m = { tipo: 'saldo', ambito: 'casa', categoria: 'saldo', pago: F.pago, reparto: null, monto };
  else if (F.modo === 'ahorro') m = { tipo: 'ahorro', ambito: F.ambitoAhorro, categoria: 'ahorro', pago: E.quien, reparto: null, monto: F.retiro ? -monto : monto };
  else {
    if (!F.categoria) return aviso('Elegí en qué fue', 'mal');
    m = F.modo === 'casa'
      ? { tipo: 'gasto', ambito: 'casa', categoria: F.categoria, pago: F.pago, reparto: F.reparto, monto }
      : { tipo: F.modo === 'ingreso' ? 'ingreso' : 'gasto', ambito: 'personal', categoria: F.categoria, pago: E.quien, reparto: null, monto };
  }
  Object.assign(m, { moneda: F.moneda, fecha: F.fecha, nota: F.nota.trim(), origen: F.origen });
  try {
    if (F.id) await E.store.editar(F.id, m); else await E.store.agregar(m);
    cerrarHoja();
    aviso(`${F.id ? 'Corregido' : 'Anotado'} ✓ ${categoria(m.categoria, E.quien).icono} ${plata(Math.abs(m.monto), m.moneda)}`, 'ok');
  } catch (e) { aviso('No se pudo guardar: ' + e.message, 'mal'); }
}

// ── Avisos ───────────────────────────────────────────────────────────────────
function aviso(html, tipo = 'info', ms = 3000) {
  const el = document.createElement('div');
  el.className = `aviso vidrio ${tipo}`;
  el.innerHTML = html;
  $('#avisos').appendChild(el);
  if (ms) setTimeout(() => el.remove(), ms);
  return el;
}

// ── Eventos ──────────────────────────────────────────────────────────────────
document.addEventListener('click', async (e) => {
  const ej = e.target.closest('[data-ejemplo]');
  if (ej) { entrada.value = ej.dataset.ejemplo; actualizarBotonEnviar(); entrada.focus(); return; }
  const des = e.target.closest('[data-deshacer]');
  if (des) {
    for (const id of des.dataset.deshacer.split(',')) await E.store.borrar(id);
    des.replaceWith(Object.assign(document.createElement('small'), { textContent: '↩️ Deshecho' }));
    E.chat[E.chat.length - 1].html = chatLista.lastElementChild.innerHTML; guardarChat();
    return;
  }
  if (e.target === chat) return cerrarChat();

  const t = e.target.closest('[data-lado],[data-accion],[data-hoja]');
  if (!t) { if (e.target === hoja) cerrarHoja(); return; }

  if (t.dataset.lado && !t.dataset.accion) return irA(t.dataset.lado);

  if (t.dataset.hoja) {
    const v = t.dataset.v;
    leerCamposHoja();
    switch (t.dataset.hoja) {
      case 'cerrar': return cerrarHoja();
      case 'modo': F.modo = v; F.categoria = null; return pintarHoja();
      case 'cat': {
        F.categoria = v;
        const c = CASA.find((x) => x.id === v);
        if (c && F.modo === 'casa') F.reparto = c.reparto;
        return pintarHoja();
      }
      case 'retiro': F.retiro = v === '1'; return pintarHoja();
      case 'guardar': return guardarHoja();
      case 'borrar':
        if (!confirm('¿Borrar este movimiento?')) return;
        await E.store.borrar(F.id); cerrarHoja(); return aviso('Borrado', 'info');
      default: F[t.dataset.hoja] = v; return pintarHoja();
    }
  }

  const id = t.dataset.id;
  switch (t.dataset.accion) {
    case 'soy': {
      try { await E.store.elegirPersona(t.dataset.q); await entrar(t.dataset.q); }
      catch (err) { aviso(err.message.includes('duplicate') ? `${nom(t.dataset.q)} ya tiene cuenta.` : err.message, 'mal'); }
      return;
    }
    case 'manual': return abrirHoja({});
    case 'captura': return inputArchivo.click();
    case 'cerrar-chat': return cerrarChat();
    case 'ajustes': return irA(E.vista === 'ajustes' ? E.lado : 'ajustes');
    case 'volver': return irA(E.lado);
    case 'ver-todo': E.lado = t.dataset.lado; return irA('todo');
    case 'editar': {
      const m = E.movs.find((x) => x.id === id);
      if (m) abrirHoja(m);
      return;
    }
    case 'pagar-venc': return abrirHoja({ modo: t.dataset.ambito, ambito: t.dataset.ambito, categoria: t.dataset.cat, reparto: CASA.find((c) => c.id === t.dataset.cat)?.reparto });
    case 'mes': E.mes = moverMes(E.mes, Number(t.dataset.d)); return pintar();
    case 'saldar': {
      const b = balance(E.movs, E.quien);
      return abrirHoja({ tipo: 'saldo', ambito: 'casa', pago: b.ARS > 0 ? otra(E.quien) : E.quien, monto: Math.round(Math.abs(b.ARS)), nota: 'Saldamos cuentas' });
    }
    case 'nueva-meta': return editarMeta({ ambito: t.dataset.ambito });
    case 'editar-meta': return editarMeta(E.metas.find((m) => m.id === id));
    case 'agregar-venc': {
      const [cat, ambito] = $('#nuevo-venc').value.split('|');
      await E.store.guardarVencimiento({ categoria: cat, ambito, dia: Number($('#nuevo-venc-dia').value) || 10 });
      return aviso('Agregado', 'ok');
    }
    case 'borrar-venc': return E.store.borrarVencimiento(id);
    case 'cambiar-persona': await E.store.elegirPersona(otra(E.quien)); E.vista = 'casa'; E.lado = 'casa'; return entrar(otra(E.quien));
    case 'exportar': return exportar();
    case 'actualizar': return actualizarApp();
    case 'fondo': document.documentElement.dataset.fondo = t.dataset.v; localStorage.setItem('fondo', t.dataset.v); return pintar();
    case 'salir':
      await E.store.salir(); E.quien = null; document.body.classList.remove('adentro'); $('#quien-chip').innerHTML = '';
      return E.store.modo === 'nube' ? pantallaLogin() : pantallaQuienSos();
  }
});

document.addEventListener('change', async (e) => {
  if (e.target.dataset.cambio === 'dia-venc') {
    const dia = Math.max(1, Math.min(31, Number(e.target.value) || 1));
    await E.store.guardarVencimiento({ id: e.target.dataset.id, dia, categoria: E.venc.find((v) => v.id === e.target.dataset.id)?.categoria });
    aviso('Día actualizado', 'ok', 1500);
  }
});

async function editarMeta(m) {
  const nombre = prompt('¿Para qué querés ahorrar? (ej. Vacaciones, Fondo de emergencia)', m.nombre || '');
  if (nombre === null) return;
  if (!nombre.trim()) { if (m.id && confirm('¿Borrar esta meta?')) await E.store.borrarMeta(m.id); return; }
  const obj = prompt('¿Cuánto querés juntar? Si es en dólares, poné "USD 2000"', m.objetivo ? `${m.moneda === 'USD' ? 'USD ' : ''}${m.objetivo}` : '');
  if (obj === null) return;
  const moneda = /usd|u\$s|dólar|dolar/i.test(obj) ? 'USD' : 'ARS';
  const objetivo = leerMonto(obj.replace(/usd|u\$s|dólares|dolares|dólar|dolar/gi, ''));
  if (!objetivo) return aviso('Monto inválido', 'mal');
  await E.store.guardarMeta({ ...m, nombre: nombre.trim(), objetivo, moneda });
}

function exportar() {
  const filas = [['fecha', 'tipo', 'ambito', 'categoria', 'monto', 'moneda', 'pago', 'es de', 'nota']];
  for (const m of [...E.movs].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    filas.push([m.fecha, m.tipo, m.ambito, categoria(m.categoria, E.quien).nombre, String(m.monto).replace('.', ','), m.moneda, m.pago ? nom(m.pago) : '', m.reparto ? (m.reparto === 'mitad' ? 'los dos' : nom(m.reparto)) : '', m.nota || '']);
  }
  const csv = '﻿' + filas.map((f) => f.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `finanzas-${hoyISO()}.csv`;
  a.click();
}

iniciar();
