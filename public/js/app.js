import { crearStore } from './store.js';
import { PERSONAS, CASA, PERSONAL, INGRESOS, AHORRO, categoria, otra } from './categorias.js';
import { balance, resumenCasa, resumenPersonal, ahorroTotal, estadoVencimientos, delMes } from './calc.js';
import { leerConIA, Grabadora } from './lector.js';

// ── Estado ───────────────────────────────────────────────────────────────────
const hoyISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const E = { store: null, quien: null, tab: 'inicio', mes: hoyISO().slice(0, 7), movs: [], venc: [], metas: [] };
const $ = (s, r = document) => r.querySelector(s);
const vista = $('#vista');

// ── Formatos ─────────────────────────────────────────────────────────────────
const fARS = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const fUSD = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const plata = (v, moneda = 'ARS') => {
  const s = (moneda === 'USD' ? fUSD : fARS).format(Math.abs(v)).replace(/US\$|\$/, '').trim();
  return `${v < 0 ? '−' : ''}${moneda === 'USD' ? 'US$' : '$'} ${s}`;
};
const plataDoble = (o) => (Math.round(o.USD) ? `${plata(o.ARS)} <small>${o.USD < 0 ? '−' : '+'} ${plata(Math.abs(o.USD), 'USD')}</small>` : plata(o.ARS));
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const nombreMes = (mes) => { const [a, m] = mes.split('-'); return `${MESES[m - 1]} ${a}`; };
const fechaCorta = (f) => { const [, m, d] = f.split('-'); return `${Number(d)} ${MESES[m - 1].slice(0, 3)}`; };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nom = (q) => PERSONAS[q]?.nombre || q;
const leerMonto = (s) => {
  s = String(s).trim().replace(/\$|\s/g, '');
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); // 12.500,50
  else s = s.replace(/[.,]/g, '');                                     // 12.500 / 12,500
  return Number(s);
};
const moverMes = (mes, d) => { const [a, m] = mes.split('-').map(Number); const x = new Date(a, m - 1 + d, 1); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`; };

// ── Arranque ─────────────────────────────────────────────────────────────────
async function iniciar() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
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
  $('#quien-chip').innerHTML = `<i></i>${nom(quien)}${E.store.modo === 'demo' ? ' · demo' : ''}`;
  $('#nav-yo').textContent = nom(quien);
  $('#nav-yo-ico').textContent = quien === 'facu' ? '🧢' : '🌸';
  $('#nav').hidden = false;
  await recargar();
  revisarCompartidos();
}

async function recargar() {
  if (!E.quien) return;
  [E.movs, E.venc, E.metas] = await Promise.all([E.store.movimientos(), E.store.vencimientos(), E.store.metas()]);
  pintar();
}

function pintar() {
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('activo', b.dataset.tab === E.tab));
  const y = window.scrollY;
  vista.innerHTML = { inicio: vistaInicio, casa: vistaCasa, yo: vistaYo, ajustes: vistaAjustes }[E.tab]();
  window.scrollTo(0, y);
}

// ── Pantallas de entrada ─────────────────────────────────────────────────────
function pantallaLogin(error = '') {
  vista.innerHTML = `
    <section class="vidrio bienvenida">
      <img src="img/icono-512.png" class="logo-grande" alt="">
      <h1>Nuestras Finanzas</h1>
      <p class="suave">Entrá con tu mail. Cada uno tiene su cuenta: lo de la casa lo ven los dos, lo personal solo vos.</p>
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
      <p class="suave">${E.store.modo === 'demo' ? 'Modo demo: los datos quedan solo en este navegador. Podés cambiar de persona en Ajustes para ver cómo lo ve el otro.' : 'Se elige una sola vez.'}</p>
      <div class="dos">
        <button class="boton facu grande" data-accion="soy" data-q="facu">🧢 Facu</button>
        <button class="boton marti grande" data-accion="soy" data-q="marti">🌸 Marti</button>
      </div>
    </section>`;
}

// ── INICIO ───────────────────────────────────────────────────────────────────
function vistaInicio() {
  const q = E.quien, o = otra(q), hoy = hoyISO(), mesHoy = hoy.slice(0, 7);
  const b = balance(E.movs, q);
  const casa = resumenCasa(E.movs, mesHoy);
  const yo = resumenPersonal(E.movs, mesHoy, q);
  const venc = estadoVencimientos(E.venc, E.movs, mesHoy, hoy);
  const ultimos = [...E.movs].sort((x, y) => (y.fecha + (y.creado || '')).localeCompare(x.fecha + (x.creado || ''))).slice(0, 6);
  const hora = new Date().getHours();
  const saludo = hora < 13 ? 'Buen día' : hora < 20 ? 'Buenas tardes' : 'Buenas noches';

  let txtBalance, claseB = '';
  const ars = Math.round(b.ARS), usd = Math.round(b.USD);
  if (Math.abs(ars) < 1 && Math.abs(usd) < 1) txtBalance = `<div class="balance-num">Están a mano 🤝</div><div class="suave">Nadie le debe nada a nadie.</div>`;
  else {
    const meDeben = ars > 0 || (ars === 0 && usd > 0);
    claseB = meDeben ? 'a-favor' : 'en-contra';
    const monto = { ARS: Math.abs(ars), USD: Math.abs(usd) };
    txtBalance = `<div class="suave">${meDeben ? `${nom(o)} te debe` : `Le debés a ${nom(o)}`}</div>
      <div class="balance-num">${plataDoble(monto)}</div>
      <button class="boton vidrio-btn chico" data-accion="saldar">🤝 Saldar cuentas</button>`;
  }

  return `
    <h2 class="saludo">${saludo}, ${nom(q)} ${q === 'facu' ? '☀️' : '🌷'}</h2>

    <section class="vidrio balance ${claseB}">
      <div class="avatares"><span class="av facu">F</span><span class="av marti">M</span></div>
      ${txtBalance}
    </section>

    <section class="vidrio">
      <div class="tarjeta-titulo">🧺 La casa en ${MESES[Number(mesHoy.slice(5)) - 1]}</div>
      <div class="cifra-grande">${plataDoble(casa.total)}</div>
      <div class="dos-cifras">
        <div><span class="punto facu"></span>Parte de Facu<br><b>${plataDoble(casa.parte.facu)}</b></div>
        <div><span class="punto marti"></span>Parte de Marti<br><b>${plataDoble(casa.parte.marti)}</b></div>
      </div>
      ${barrasCategorias(casa.porCat, 4)}
    </section>

    <section class="vidrio">
      <div class="tarjeta-titulo">📅 Vencimientos de ${MESES[Number(mesHoy.slice(5)) - 1]}</div>
      ${venc.length ? `<ul class="lista">${venc.map(filaVencimiento).join('')}</ul>` : '<p class="suave">No hay vencimientos cargados. Agregalos en Ajustes.</p>'}
    </section>

    <section class="vidrio">
      <div class="tarjeta-titulo">${q === 'facu' ? '🧢' : '🌸'} Tu mes <span class="candado">🔒 solo vos</span></div>
      <div class="tres-cifras">
        <div>Entró<br><b class="verde-t">${plataDoble(yo.ingresos)}</b></div>
        <div>Gastaste<br><b class="rojo-t">${plataDoble({ ARS: yo.gastos.ARS + yo.parteCasa.ARS, USD: yo.gastos.USD + yo.parteCasa.USD })}</b></div>
        <div>Te queda<br><b>${plataDoble(yo.queda)}</b></div>
      </div>
    </section>

    <section class="vidrio">
      <div class="tarjeta-titulo">🕒 Últimos movimientos</div>
      ${ultimos.length ? `<ul class="lista">${ultimos.map(filaMov).join('')}</ul>` : vacio()}
    </section>`;
}

function vacio() {
  return `<div class="vacio"><div class="vacio-burbuja">🫧</div><p>Todavía no hay nada cargado.<br>Tocá <b>+</b>, mandá un audio 🎤 o subí una captura 📷.</p></div>`;
}

function filaVencimiento(v) {
  const c = categoria(v.categoria, E.quien);
  let estado;
  if (v.pagado) estado = `<span class="pastilla ok">Pagado ✓</span>`;
  else if (v.faltan < 0) estado = `<span class="pastilla mal">Venció hace ${-v.faltan} d</span>`;
  else if (v.faltan === 0) estado = `<span class="pastilla alerta">Vence hoy</span>`;
  else if (v.faltan <= 3) estado = `<span class="pastilla alerta">En ${v.faltan} d</span>`;
  else estado = `<span class="pastilla">Día ${v.dia}</span>`;
  return `<li class="fila" ${v.pagado ? '' : `data-accion="pagar-venc" data-cat="${v.categoria}" data-ambito="${v.ambito}"`}>
    <span class="ico">${c.icono}</span>
    <span class="fila-txt"><b>${esc(c.nombre)}</b><small>${v.pagado ? plata(v.monto) : v.ambito === 'personal' ? '🔒 personal' : 'casa'}</small></span>
    ${estado}</li>`;
}

function filaMov(m) {
  const c = categoria(m.categoria, E.quien);
  let detalle = '';
  if (m.tipo === 'saldo') detalle = `${nom(m.pago)} le pasó a ${nom(otra(m.pago))}`;
  else if (m.ambito === 'casa' && m.tipo === 'gasto') {
    const rep = m.reparto === 'mitad' ? 'mitad y mitad' : `solo ${nom(m.reparto)}`;
    detalle = `pagó ${nom(m.pago)} · ${rep}`;
  } else if (m.tipo === 'ahorro') detalle = m.ambito === 'casa' ? `ahorro en conjunto · ${nom(m.pago)}` : '🔒 ahorro tuyo';
  else detalle = '🔒 personal';
  const signo = m.tipo === 'ingreso' ? '+' : m.tipo === 'ahorro' ? (m.monto < 0 ? '↑' : '↓') : '';
  const origen = m.origen === 'audio' ? ' 🎤' : m.origen === 'captura' ? ' 📷' : '';
  return `<li class="fila" data-accion="editar" data-id="${m.id}">
    <span class="ico ${m.ambito === 'casa' ? 'casa' : E.quien}">${c.icono}</span>
    <span class="fila-txt"><b>${esc(m.nota || c.nombre)}${origen}</b><small>${fechaCorta(m.fecha)} · ${esc(detalle)}</small></span>
    <span class="fila-monto ${m.tipo === 'ingreso' ? 'verde-t' : ''}">${signo}${plata(Math.abs(m.monto), m.moneda)}</span></li>`;
}

function barrasCategorias(porCat, max = 99) {
  const filas = Object.entries(porCat).sort((a, b) => b[1].ARS - a[1].ARS).slice(0, max);
  if (!filas.length) return '';
  const tope = Math.max(...filas.map(([, v]) => v.ARS), 1);
  return `<div class="barras">${filas.map(([id, v]) => {
    const c = categoria(id, E.quien);
    return `<div class="barra-fila"><span class="barra-nom">${c.icono} ${esc(c.nombre)}</span>
      <span class="barra-tubo"><i style="width:${Math.max(4, (v.ARS / tope) * 100)}%"></i></span>
      <span class="barra-monto">${plataDoble(v)}</span></div>`;
  }).join('')}</div>`;
}

function selectorMes() {
  return `<div class="selector-mes vidrio">
    <button data-accion="mes" data-d="-1" aria-label="Mes anterior">‹</button>
    <span>${nombreMes(E.mes)}</span>
    <button data-accion="mes" data-d="1" aria-label="Mes siguiente">›</button></div>`;
}

// ── CASA ─────────────────────────────────────────────────────────────────────
function vistaCasa() {
  const r = resumenCasa(E.movs, E.mes);
  const ahorro = ahorroTotal(E.movs, 'casa');
  const metas = E.metas.filter((m) => m.ambito === 'casa');
  const saldos = delMes(E.movs, E.mes).filter((m) => m.tipo === 'saldo' || (m.tipo === 'ahorro' && m.ambito === 'casa'));
  const lista = [...r.lista, ...saldos].sort((a, b) => b.fecha.localeCompare(a.fecha));
  const totalPago = r.pago.facu.ARS + r.pago.marti.ARS || 1;
  return `
    ${selectorMes()}
    <section class="vidrio">
      <div class="tarjeta-titulo">🧺 Gastos de la casa</div>
      <div class="cifra-grande">${plataDoble(r.total)}</div>
      <div class="tubo-doble"><i class="facu" style="width:${(r.pago.facu.ARS / totalPago) * 100}%"></i><i class="marti" style="width:${(r.pago.marti.ARS / totalPago) * 100}%"></i></div>
      <div class="dos-cifras">
        <div><span class="punto facu"></span>Pagó Facu<br><b>${plataDoble(r.pago.facu)}</b><small>le toca ${plataDoble(r.parte.facu)}</small></div>
        <div><span class="punto marti"></span>Pagó Marti<br><b>${plataDoble(r.pago.marti)}</b><small>le toca ${plataDoble(r.parte.marti)}</small></div>
      </div>
    </section>
    <section class="vidrio">
      <div class="tarjeta-titulo">📊 Por categoría</div>
      ${barrasCategorias(r.porCat) || '<p class="suave">Sin gastos este mes.</p>'}
    </section>
    <section class="vidrio">
      <div class="tarjeta-titulo">🐷 Ahorro en conjunto</div>
      <div class="cifra-grande">${plataDoble(ahorro)}</div>
      ${metas.map((m) => barraMeta(m, ahorro)).join('')}
      <button class="boton vidrio-btn chico" data-accion="nueva-meta" data-ambito="casa">+ Meta en conjunto</button>
    </section>
    <section class="vidrio">
      <div class="tarjeta-titulo">🧾 Movimientos de ${MESES[Number(E.mes.slice(5)) - 1]}</div>
      ${lista.length ? `<ul class="lista">${lista.map(filaMov).join('')}</ul>` : vacio()}
    </section>`;
}

function barraMeta(m, ahorro) {
  const tengo = ahorro[m.moneda] || 0;
  const pct = Math.max(0, Math.min(100, (tengo / m.objetivo) * 100));
  return `<div class="meta" data-accion="editar-meta" data-id="${m.id}">
    <div class="meta-top"><b>🎯 ${esc(m.nombre)}</b><span>${plata(tengo, m.moneda)} / ${plata(m.objetivo, m.moneda)}</span></div>
    <div class="barra-tubo grande"><i style="width:${Math.max(3, pct)}%"></i><em>${Math.round(pct)}%</em></div></div>`;
}

// ── YO (privado) ─────────────────────────────────────────────────────────────
function vistaYo() {
  const q = E.quien;
  const r = resumenPersonal(E.movs, E.mes, q);
  const ahorro = ahorroTotal(E.movs, 'personal');
  const metas = E.metas.filter((m) => m.ambito === 'personal');
  const lista = [...r.lista].sort((a, b) => b.fecha.localeCompare(a.fecha));
  return `
    ${selectorMes()}
    <p class="aviso-privado">🔒 Esta sección es solo tuya. ${nom(otra(q))} no la ve.</p>
    <section class="vidrio">
      <div class="tarjeta-titulo">💸 Tu ${MESES[Number(E.mes.slice(5)) - 1]}</div>
      <div class="cuenta">
        <div><span>Entró</span><b class="verde-t">${plataDoble(r.ingresos)}</b></div>
        <div><span>Tus gastos personales</span><b>− ${plataDoble(r.gastos)}</b></div>
        <div><span>Tu parte de la casa</span><b>− ${plataDoble(r.parteCasa)}</b></div>
        <div><span>Guardaste en ahorro</span><b>− ${plataDoble(r.ahorro)}</b></div>
        <div class="total"><span>Te queda</span><b>${plataDoble(r.queda)}</b></div>
      </div>
    </section>
    <section class="vidrio">
      <div class="tarjeta-titulo">💵 Ingresos</div>
      ${barrasCategorias(r.porCatIng) || `<p class="suave">${q === 'marti' ? 'Cargá lo que te depositaron este mes (sueldo, aguinaldo, horas extra).' : 'Cargá lo que entró del negocio este mes.'}</p>`}
      <button class="boton vidrio-btn chico" data-accion="nuevo" data-modo="ingreso">+ Ingreso</button>
    </section>
    <section class="vidrio">
      <div class="tarjeta-titulo">🛍️ Gastos personales</div>
      ${barrasCategorias(r.porCatGas) || '<p class="suave">Sin gastos personales este mes.</p>'}
    </section>
    <section class="vidrio">
      <div class="tarjeta-titulo">🚕 Tus viajes del mes</div>
      <div class="cifra-grande">${plataDoble(r.transporte)}</div>
      <p class="suave">Suma tus Uber/transporte personales + tu mitad de los viajes juntos.</p>
    </section>
    <section class="vidrio">
      <div class="tarjeta-titulo">🐷 Tus ahorros</div>
      <div class="cifra-grande">${plataDoble(ahorro)}</div>
      ${metas.map((m) => barraMeta(m, ahorro)).join('')}
      <div class="dos">
        <button class="boton vidrio-btn chico" data-accion="nuevo" data-modo="ahorro">+ Ahorro</button>
        <button class="boton vidrio-btn chico" data-accion="nueva-meta" data-ambito="personal">+ Meta</button>
      </div>
    </section>
    <section class="vidrio">
      <div class="tarjeta-titulo">🧾 Tus movimientos</div>
      ${lista.length ? `<ul class="lista">${lista.map(filaMov).join('')}</ul>` : vacio()}
    </section>`;
}

// ── AJUSTES ──────────────────────────────────────────────────────────────────
function vistaAjustes() {
  const venc = [...E.venc].sort((a, b) => a.dia - b.dia);
  const opciones = [...CASA.map((c) => ({ ...c, ambito: 'casa' })), ...PERSONAL[E.quien].map((c) => ({ ...c, ambito: 'personal' }))]
    .filter((c) => !E.venc.some((v) => v.categoria === c.id));
  return `
    <section class="vidrio">
      <div class="tarjeta-titulo">📅 Vencimientos</div>
      <p class="suave">El día del mes en que vence cada cosa. Se marca "Pagado" sola cuando cargan ese gasto.</p>
      <ul class="lista">${venc.map((v) => {
        const c = categoria(v.categoria, E.quien);
        return `<li class="fila"><span class="ico">${c.icono}</span>
          <span class="fila-txt"><b>${esc(c.nombre)}</b><small>${v.ambito === 'personal' ? '🔒 personal' : 'casa'}</small></span>
          <label class="dia">día <input type="number" min="1" max="31" value="${v.dia}" data-cambio="dia-venc" data-id="${v.id}"></label>
          <button class="x" data-accion="borrar-venc" data-id="${v.id}" aria-label="Quitar">✕</button></li>`;
      }).join('')}</ul>
      ${opciones.length ? `<div class="agregar-venc">
        <select id="nuevo-venc">${opciones.map((c) => `<option value="${c.id}|${c.ambito}">${c.icono} ${esc(c.nombre)}${c.ambito === 'personal' ? ' (personal)' : ''}</option>`).join('')}</select>
        <input id="nuevo-venc-dia" type="number" min="1" max="31" value="10">
        <button class="boton verde chico" data-accion="agregar-venc">Agregar</button></div>` : ''}
    </section>
    <section class="vidrio">
      <div class="tarjeta-titulo">📲 Instalarla en el celular</div>
      <p><b>iPhone (Facu):</b> abrila en Safari → botón Compartir → <i>Agregar a pantalla de inicio</i>.</p>
      <p><b>Android (Marti):</b> abrila en Chrome → menú ⋮ → <i>Instalar app</i>. Después podés compartirle audios de WhatsApp o capturas directo desde el botón Compartir.</p>
    </section>
    <section class="vidrio">
      <div class="tarjeta-titulo">👤 Cuenta</div>
      <p>Estás como <b>${nom(E.quien)}</b>${E.store.modo === 'demo' ? ' (modo demo: los datos quedan solo en este navegador)' : ''}.</p>
      <div class="dos">
        ${E.store.modo === 'demo' ? `<button class="boton vidrio-btn chico" data-accion="cambiar-persona">Ver como ${nom(otra(E.quien))}</button>` : ''}
        <button class="boton vidrio-btn chico" data-accion="exportar">⬇️ Descargar planilla</button>
        <button class="boton rojo chico" data-accion="salir">${E.store.modo === 'demo' ? 'Salir' : 'Cerrar sesión'}</button>
      </div>
    </section>`;
}

// ── Hoja para cargar / editar ────────────────────────────────────────────────
const hoja = $('#hoja');
let F = null; // borrador del formulario

function abrirHoja(base = {}) {
  const modo = base.tipo === 'ingreso' ? 'ingreso' : base.tipo === 'ahorro' ? 'ahorro' : base.tipo === 'saldo' ? 'saldo'
    : base.ambito === 'personal' ? 'personal' : base.modo || 'casa';
  F = { id: base.id || null, modo, monto: base.monto ? String(Math.abs(base.monto)).replace('.', ',') : '',
    moneda: base.moneda || 'ARS', categoria: base.categoria || null, pago: base.pago || E.quien,
    reparto: base.reparto || 'mitad', fecha: base.fecha || hoyISO(), nota: base.nota || '',
    ambitoAhorro: base.tipo === 'ahorro' ? base.ambito : 'personal', retiro: base.tipo === 'ahorro' && base.monto < 0,
    origen: base.origen || 'manual' };
  pintarHoja();
  hoja.hidden = false;
  requestAnimationFrame(() => hoja.classList.add('abierta'));
}

function cerrarHoja() {
  hoja.classList.remove('abierta');
  setTimeout(() => { hoja.hidden = true; hoja.innerHTML = ''; }, 250);
  grabadora?.cancelar(); grabadora = null;
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
      <div class="hoja-top">
        <b>${F.id ? 'Editar movimiento' : 'Cargar'}</b>
        <button class="x" data-hoja="cerrar" aria-label="Cerrar">✕</button>
      </div>
      ${F.id ? '' : `<div class="ia-botones">
        <button class="boton orbe-mic" data-hoja="grabar"><span>🎤</span>Dictar</button>
        <button class="boton orbe-foto" data-hoja="captura"><span>📷</span>Captura o audio</button>
      </div>
      <p class="suave centro">Decí algo como <i>"pagué 18 lucas en la carnicería"</i> y se carga solo.</p>`}
      ${F.modo === 'saldo' ? '' : `<div class="segmentos">${seg('casa', '🧺 Casa')}${seg('personal', '🔒 Mío')}${seg('ingreso', '💵 Ingreso')}${seg('ahorro', '🐷 Ahorro')}</div>`}
      <div class="monto-caja">
        <span>$</span><input id="h-monto" inputmode="decimal" placeholder="0" value="${esc(F.monto)}" autocomplete="off">
        <div class="mini-seg">${tog('moneda', 'ARS', 'ARS')}${tog('moneda', 'USD', 'USD')}</div>
      </div>
      ${cats.length ? `<div class="cats">${cats.map((c) => `<button class="cat ${F.categoria === c.id ? 'on' : ''}" data-hoja="cat" data-v="${c.id}"><span>${c.icono}</span>${esc(c.nombre)}</button>`).join('')}</div>` : ''}
      ${F.modo === 'casa' ? `
        <div class="campo"><span>¿Quién pagó?</span><div class="mini-seg">${tog('pago', 'facu', 'Facu', 'facu')}${tog('pago', 'marti', 'Marti', 'marti')}</div></div>
        <div class="campo"><span>¿De quién es?</span><div class="mini-seg">${tog('reparto', 'mitad', '50/50')}${tog('reparto', 'facu', 'Facu', 'facu')}${tog('reparto', 'marti', 'Marti', 'marti')}</div></div>` : ''}
      ${F.modo === 'saldo' ? `<div class="campo"><span>¿Quién le pasó plata a quién?</span><div class="mini-seg">${tog('pago', 'facu', 'Facu → Marti', 'facu')}${tog('pago', 'marti', 'Marti → Facu', 'marti')}</div></div>` : ''}
      ${F.modo === 'ahorro' ? `
        <div class="campo"><span>¿De quién?</span><div class="mini-seg">${tog('ambitoAhorro', 'personal', '🔒 Mío')}${tog('ambitoAhorro', 'casa', '💞 En conjunto')}</div></div>
        <div class="campo"><span>Movimiento</span><div class="mini-seg"><button class="seg ${!F.retiro ? 'on' : ''}" data-hoja="retiro" data-v="0">Guardo</button><button class="seg ${F.retiro ? 'on' : ''}" data-hoja="retiro" data-v="1">Saco</button></div></div>` : ''}
      <div class="campo"><span>Fecha</span><input id="h-fecha" type="date" value="${F.fecha}"></div>
      <input id="h-nota" class="nota" placeholder="Nota (opcional): Coto, Uber a lo de mamá…" value="${esc(F.nota)}">
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
  if (!monto || monto <= 0) return aviso('Poné un monto 🙂', 'mal');
  let m;
  if (F.modo === 'saldo') m = { tipo: 'saldo', ambito: 'casa', categoria: 'saldo', pago: F.pago, reparto: null, monto };
  else if (F.modo === 'ahorro') m = { tipo: 'ahorro', ambito: F.ambitoAhorro, categoria: 'ahorro', pago: E.quien, reparto: null, monto: F.retiro ? -monto : monto };
  else {
    if (!F.categoria) return aviso('Elegí una categoría', 'mal');
    m = F.modo === 'casa'
      ? { tipo: 'gasto', ambito: 'casa', categoria: F.categoria, pago: F.pago, reparto: F.reparto, monto }
      : { tipo: F.modo === 'ingreso' ? 'ingreso' : 'gasto', ambito: 'personal', categoria: F.categoria, pago: E.quien, reparto: null, monto };
  }
  Object.assign(m, { moneda: F.moneda, fecha: F.fecha, nota: F.nota.trim(), origen: F.origen });
  try {
    if (F.id) await E.store.editar(F.id, m); else await E.store.agregar(m);
    cerrarHoja();
    aviso(`${F.id ? 'Guardado' : 'Cargado'} ✓ ${categoria(m.categoria, E.quien).icono} ${plata(Math.abs(m.monto), m.moneda)}`, 'ok');
  } catch (e) { aviso('No se pudo guardar: ' + e.message, 'mal'); }
}

// ── Audio y capturas ─────────────────────────────────────────────────────────
let grabadora = null;

async function grabar(boton) {
  if (!grabadora) {
    try {
      grabadora = new Grabadora();
      await grabadora.empezar();
    } catch { grabadora = null; return aviso('No tengo permiso para usar el micrófono.', 'mal'); }
    boton.classList.add('grabando');
    boton.innerHTML = '<span>⏹</span>Listo, leer';
    const t0 = Date.now();
    const reloj = setInterval(() => {
      if (!grabadora) return clearInterval(reloj);
      const s = Math.floor((Date.now() - t0) / 1000);
      boton.innerHTML = `<span>⏹</span>Grabando 0:${String(s).padStart(2, '0')}`;
      if (s >= 59) grabar(boton);
    }, 500);
    return;
  }
  const audio = await grabadora.terminar();
  grabadora = null;
  cerrarHoja();
  procesar({ audio });
}

async function procesar({ audio, imagen, texto }) {
  const espera = aviso(`<span class="girando">🫧</span> ${audio ? 'Escuchando el audio…' : imagen ? 'Leyendo la captura…' : 'Leyendo…'}`, 'info', 0);
  try {
    const r = await leerConIA({ store: E.store, quien: E.quien, audio, imagen, texto, hoy: hoyISO() });
    espera.remove();
    if (!r.movimientos?.length) return aviso(`🤔 ${esc(r.duda || 'No encontré ningún gasto.')}${r.transcripcion ? `<br><small>Escuché: "${esc(r.transcripcion)}"</small>` : ''}`, 'mal', 9000);
    const origen = audio ? 'audio' : imagen ? 'captura' : 'manual';
    const guardados = [];
    for (const m of r.movimientos) guardados.push(await E.store.agregar({ ...m, origen }));
    avisoCargados(guardados, r.transcripcion);
  } catch (e) {
    espera.remove();
    aviso('No pude leerlo: ' + esc(e.message), 'mal', 8000);
  }
}

function avisoCargados(guardados, transcripcion) {
  const filas = guardados.map((m) => {
    const c = categoria(m.categoria, E.quien);
    const donde = m.tipo === 'saldo' ? 'saldo de cuentas' : m.ambito === 'casa'
      ? (m.tipo === 'ahorro' ? 'ahorro en conjunto' : `casa · ${m.reparto === 'mitad' ? '50/50' : 'solo ' + nom(m.reparto)}`)
      : m.tipo === 'ingreso' ? 'ingreso 🔒' : m.tipo === 'ahorro' ? 'tu ahorro 🔒' : 'personal 🔒';
    return `<div class="cargado" data-accion="editar" data-id="${m.id}">${c.icono} <b>${esc(c.nombre)}</b> ${plata(Math.abs(m.monto), m.moneda)} <small>${donde}</small></div>`;
  }).join('');
  const el = aviso(`<b>✅ Cargué ${guardados.length === 1 ? 'esto' : guardados.length + ' movimientos'}:</b>${filas}
    ${transcripcion ? `<small class="escuche">Escuché: "${esc(transcripcion)}"</small>` : ''}
    <div class="dos"><button class="boton vidrio-btn chico" data-deshacer>Deshacer</button><button class="boton verde chico" data-ok>Perfecto</button></div>`, 'ok', 15000);
  el.querySelector('[data-deshacer]').onclick = async () => { for (const m of guardados) await E.store.borrar(m.id); el.remove(); aviso('Deshecho ↩️', 'info'); };
  el.querySelector('[data-ok]').onclick = () => el.remove();
}

const inputArchivo = $('#archivo');
inputArchivo.addEventListener('change', () => {
  const f = inputArchivo.files[0];
  inputArchivo.value = '';
  if (!f) return;
  cerrarHoja();
  if (f.type.startsWith('image/')) procesar({ imagen: f });
  else procesar({ audio: f });
});

/** Android: lo que se compartió a la app desde WhatsApp / galería. */
async function revisarCompartidos() {
  if (!new URLSearchParams(location.search).has('compartido') || !('caches' in window)) return;
  history.replaceState(null, '', location.pathname);
  const cache = await caches.open('compartidos');
  for (const req of await cache.keys()) {
    const res = await cache.match(req);
    const blob = await res.blob();
    await cache.delete(req);
    if (blob.type.startsWith('image/')) procesar({ imagen: blob });
    else if (blob.type.startsWith('text/')) procesar({ texto: await blob.text() });
    else procesar({ audio: blob });
  }
}

// ── Avisos ───────────────────────────────────────────────────────────────────
function aviso(html, tipo = 'info', ms = 3500) {
  const el = document.createElement('div');
  el.className = `aviso vidrio ${tipo}`;
  el.innerHTML = html;
  $('#avisos').appendChild(el);
  if (ms) setTimeout(() => el.remove(), ms);
  return el;
}

// ── Eventos ──────────────────────────────────────────────────────────────────
document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-tab],[data-accion],[data-hoja]');
  if (!t) { if (e.target === hoja) cerrarHoja(); return; }

  if (t.dataset.tab) { E.tab = t.dataset.tab; window.scrollTo(0, 0); return pintar(); }

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
      case 'grabar': return grabar(t);
      case 'captura': return inputArchivo.click();
      default: F[t.dataset.hoja] = v; return pintarHoja();
    }
  }

  const id = t.dataset.id;
  switch (t.dataset.accion) {
    case 'soy': {
      try { await E.store.elegirPersona(t.dataset.q); await entrar(t.dataset.q); }
      catch (err) { aviso(err.message.includes('duplicate') ? `${nom(t.dataset.q)} ya tiene cuenta. Elegí la otra persona.` : err.message, 'mal'); }
      return;
    }
    case 'nuevo': return abrirHoja({ modo: t.dataset.modo || 'casa', tipo: t.dataset.modo === 'ingreso' ? 'ingreso' : t.dataset.modo === 'ahorro' ? 'ahorro' : undefined, ambito: t.dataset.modo === 'ahorro' ? 'personal' : undefined });
    case 'editar': {
      const m = E.movs.find((x) => x.id === id);
      if (m) { document.querySelectorAll('.aviso').forEach((a) => a.remove()); abrirHoja(m); }
      return;
    }
    case 'pagar-venc': return abrirHoja({ modo: t.dataset.ambito, ambito: t.dataset.ambito, categoria: t.dataset.cat, reparto: CASA.find((c) => c.id === t.dataset.cat)?.reparto });
    case 'mes': E.mes = moverMes(E.mes, Number(t.dataset.d)); return pintar();
    case 'saldar': {
      const b = balance(E.movs, E.quien);
      const deudor = b.ARS > 0 ? otra(E.quien) : E.quien;
      return abrirHoja({ tipo: 'saldo', ambito: 'casa', pago: deudor, monto: Math.round(Math.abs(b.ARS)), nota: 'Saldamos cuentas' });
    }
    case 'nueva-meta': return editarMeta({ ambito: t.dataset.ambito });
    case 'editar-meta': return editarMeta(E.metas.find((m) => m.id === id));
    case 'agregar-venc': {
      const [categoria_, ambito] = $('#nuevo-venc').value.split('|');
      await E.store.guardarVencimiento({ categoria: categoria_, ambito, dia: Number($('#nuevo-venc-dia').value) || 10 });
      return aviso('Vencimiento agregado', 'ok');
    }
    case 'borrar-venc': return E.store.borrarVencimiento(id);
    case 'cambiar-persona': await E.store.elegirPersona(otra(E.quien)); return entrar(otra(E.quien));
    case 'exportar': return exportar();
    case 'salir':
      await E.store.salir(); E.quien = null; $('#nav').hidden = true; $('#quien-chip').innerHTML = '';
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
  const nombre = prompt('¿Para qué ahorran? (ej. Vacaciones, Fondo de emergencia)', m.nombre || '');
  if (nombre === null) return;
  if (!nombre.trim()) { if (m.id && confirm('¿Borrar esta meta?')) await E.store.borrarMeta(m.id); return; }
  const obj = prompt('¿Cuánto quieren juntar? Si es en dólares, poné "USD 2000"', m.objetivo ? `${m.moneda === 'USD' ? 'USD ' : ''}${m.objetivo}` : '');
  if (obj === null) return;
  const moneda = /usd|u\$s|dólar|dolar/i.test(obj) ? 'USD' : 'ARS';
  const objetivo = leerMonto(obj.replace(/usd|u\$s|dólares|dolares|dólar|dolar/gi, ''));
  if (!objetivo) return aviso('Monto inválido', 'mal');
  await E.store.guardarMeta({ ...m, nombre: nombre.trim(), objetivo, moneda });
}

function exportar() {
  const filas = [['fecha', 'tipo', 'ambito', 'categoria', 'monto', 'moneda', 'pago', 'reparto', 'nota']];
  for (const m of [...E.movs].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    filas.push([m.fecha, m.tipo, m.ambito, categoria(m.categoria, E.quien).nombre, String(m.monto).replace('.', ','), m.moneda, m.pago ? nom(m.pago) : '', m.reparto ? (m.reparto === 'mitad' ? '50/50' : nom(m.reparto)) : '', m.nota || '']);
  }
  const csv = '﻿' + filas.map((f) => f.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `finanzas-${hoyISO()}.csv`;
  a.click();
}

iniciar();
