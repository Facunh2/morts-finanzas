// Cuentas de la app. Todo devuelve montos separados por moneda: { ARS, USD }.
import { otra } from './categorias.js';

export const cero = () => ({ ARS: 0, USD: 0 });
const suma = (acc, m, valor) => { acc[m.moneda === 'USD' ? 'USD' : 'ARS'] += valor; return acc; };
export const delMes = (movs, mes) => movs.filter((m) => (m.fecha || '').slice(0, 7) === mes);

/** Parte que le toca a `q` de un gasto de la casa. */
export function parteDe(m, q) {
  if (m.tipo !== 'gasto' || m.ambito !== 'casa') return 0;
  if (m.reparto === 'mitad') return Number(m.monto) / 2;
  return m.reparto === q ? Number(m.monto) : 0;
}

/**
 * Cuánto le debe la otra persona a `q` (positivo) o cuánto le debe `q` (negativo).
 * Cada gasto de la casa: quien pagó adelanta la parte que no es suya.
 * Un "saldo": quien pasa la plata achica lo que debe.
 */
export function balance(movs, q) {
  const r = cero();
  for (const m of movs) {
    if (m.ambito !== 'casa') continue;
    const monto = Number(m.monto);
    if (m.tipo === 'gasto') {
      const ajeno = monto - parteDe(m, m.pago); // lo que el que pagó adelantó por el otro
      suma(r, m, m.pago === q ? ajeno : -ajeno);
    } else if (m.tipo === 'saldo') {
      suma(r, m, m.pago === q ? monto : -monto);
    }
  }
  return r;
}

export function resumenCasa(movs, mes) {
  const lista = delMes(movs, mes).filter((m) => m.ambito === 'casa' && m.tipo === 'gasto');
  const total = cero(), pago = { facu: cero(), marti: cero() }, parte = { facu: cero(), marti: cero() };
  const porCat = {};
  for (const m of lista) {
    const v = Number(m.monto);
    suma(total, m, v);
    suma(pago[m.pago] || pago.facu, m, v);
    suma(parte.facu, m, parteDe(m, 'facu'));
    suma(parte.marti, m, parteDe(m, 'marti'));
    porCat[m.categoria] = suma(porCat[m.categoria] || cero(), m, v);
  }
  return { lista, total, pago, parte, porCat };
}

export function resumenPersonal(movs, mes, q) {
  const delmes = delMes(movs, mes);
  const ingresos = cero(), gastos = cero(), ahorro = cero(), parteCasa = cero(), transporte = cero();
  const porCatIng = {}, porCatGas = {};
  for (const m of delmes) {
    const v = Number(m.monto);
    if (m.ambito === 'personal' && m.tipo === 'ingreso') {
      suma(ingresos, m, v); porCatIng[m.categoria] = suma(porCatIng[m.categoria] || cero(), m, v);
    } else if (m.ambito === 'personal' && m.tipo === 'gasto') {
      suma(gastos, m, v); porCatGas[m.categoria] = suma(porCatGas[m.categoria] || cero(), m, v);
      if (m.categoria === 'transporte') suma(transporte, m, v);
    } else if (m.ambito === 'personal' && m.tipo === 'ahorro') {
      suma(ahorro, m, v);
    } else if (m.ambito === 'casa' && m.tipo === 'gasto') {
      suma(parteCasa, m, parteDe(m, q));
      if (m.categoria === 'transporte_casa') suma(transporte, m, parteDe(m, q));
    }
  }
  const queda = {
    ARS: ingresos.ARS - gastos.ARS - parteCasa.ARS - ahorro.ARS,
    // Los dólares ahorrados se compran con pesos que ya se fueron: no se restan de nuevo.
    USD: ingresos.USD - gastos.USD - parteCasa.USD,
  };
  return { ingresos, gastos, ahorro, parteCasa, transporte, queda, porCatIng, porCatGas,
    lista: delmes.filter((m) => m.ambito === 'personal') };
}

/** Ahorro acumulado (todos los meses) de un ámbito. */
export function ahorroTotal(movs, ambito) {
  return movs.filter((m) => m.tipo === 'ahorro' && m.ambito === ambito)
    .reduce((acc, m) => suma(acc, m, Number(m.monto)), cero());
}

/** Estado de cada vencimiento en el mes: pagado si hay un gasto de esa categoría. */
export function estadoVencimientos(venc, movs, mes, hoy) {
  const delmes = delMes(movs, mes);
  const [a, me] = mes.split('-').map(Number);
  const ultimo = new Date(a, me, 0).getDate();
  return venc.map((v) => {
    const pago = delmes.find((m) => m.categoria === v.categoria && m.tipo === 'gasto');
    const dia = Math.min(v.dia, ultimo);
    const fecha = `${mes}-${String(dia).padStart(2, '0')}`;
    const faltan = Math.round((new Date(fecha + 'T12:00') - new Date(hoy + 'T12:00')) / 86400000);
    return { ...v, dia, fecha, pagado: !!pago, monto: pago?.monto, faltan };
  }).sort((x, y) => (x.pagado - y.pagado) || (x.dia - y.dia));
}

export { otra };
