// Categorías y reglas de la app. Es la única fuente: el lector de audios y
// capturas recibe esta misma lista, así que si agregás una acá, la IA la conoce.

export const PERSONAS = {
  facu: { nombre: 'Facu', color: 'var(--facu)' },
  marti: { nombre: 'Marti', color: 'var(--marti)' },
};

export const otra = (q) => (q === 'facu' ? 'marti' : 'facu');

// ── Gastos de la casa (los ven los dos) ─────────────────────────────────────
// reparto: 'mitad' = se divide 50/50 · 'facu' / 'marti' = lo paga solo esa persona
export const CASA = [
  { id: 'alquiler', nombre: 'Alquiler', icono: '🏠', reparto: 'mitad' },
  { id: 'super', nombre: 'Supermercado', icono: '🛒', reparto: 'mitad' },
  { id: 'almacen', nombre: 'Almacén', icono: '🥫', reparto: 'mitad' },
  { id: 'chino', nombre: 'Chino', icono: '🏮', reparto: 'mitad' },
  { id: 'dietetica', nombre: 'Dietética', icono: '🌾', reparto: 'mitad' },
  { id: 'farmacia', nombre: 'Farmacia', icono: '💊', reparto: 'mitad' },
  { id: 'luz', nombre: 'Luz', icono: '💡', reparto: 'mitad' },
  { id: 'agua', nombre: 'Agua', icono: '💧', reparto: 'mitad' },
  { id: 'gas', nombre: 'Gas', icono: '🔥', reparto: 'mitad' },
  { id: 'arqui', nombre: 'Arqui', icono: '📐', reparto: 'mitad' },
  { id: 'salidas', nombre: 'Salidas y comidas', icono: '🍕', reparto: 'mitad' },
  { id: 'transporte_casa', nombre: 'Uber / viajes juntos', icono: '🚕', reparto: 'mitad', transporte: true },
  { id: 'otros_casa', nombre: 'Otro compartido', icono: '✨', reparto: 'mitad' },
  { id: 'internet', nombre: 'Internet', icono: '🌐', reparto: 'facu' },
  { id: 'alarma', nombre: 'Alarma', icono: '🚨', reparto: 'facu' },
  { id: 'carniceria', nombre: 'Carnicería', icono: '🥩', reparto: 'facu' },
  { id: 'polleria', nombre: 'Pollería', icono: '🍗', reparto: 'facu' },
];

// ── Gastos personales (privados: solo los ve su dueño) ──────────────────────
const PERSONAL_COMUN = [
  { id: 'transporte', nombre: 'Uber / transporte', icono: '🚕', transporte: true },
  { id: 'ropa', nombre: 'Ropa', icono: '👕' },
  { id: 'gym', nombre: 'Gimnasio', icono: '🏋️' },
  { id: 'medico', nombre: 'Médico', icono: '🩺' },
  { id: 'kinesio', nombre: 'Kinesiología', icono: '💆' },
  { id: 'gustos', nombre: 'Gustos y comida', icono: '🍦' },
  { id: 'regalos', nombre: 'Regalos', icono: '🎁' },
  { id: 'otros', nombre: 'Otro gasto', icono: '📦' },
];

export const PERSONAL = {
  facu: [
    { id: 'anuncios', nombre: 'Anuncios del negocio', icono: '📣' },
    { id: 'negocio', nombre: 'Herramientas del negocio', icono: '💻' },
    { id: 'monotributo', nombre: 'Monotributo', icono: '🧾' },
    ...PERSONAL_COMUN,
  ],
  marti: [
    { id: 'obra_social', nombre: 'Obra social', icono: '🏥' },
    ...PERSONAL_COMUN,
  ],
};

// ── Ingresos (privados) ─────────────────────────────────────────────────────
export const INGRESOS = {
  facu: [
    { id: 'ingreso_negocio', nombre: 'Ingreso del negocio', icono: '💼' },
    { id: 'otro_ingreso', nombre: 'Otro ingreso', icono: '💰' },
  ],
  marti: [
    { id: 'sueldo', nombre: 'Sueldo', icono: '💵' },
    { id: 'aguinaldo', nombre: 'Aguinaldo', icono: '🎉' },
    { id: 'horas_extra', nombre: 'Horas extra / temporada', icono: '⏱️' },
    { id: 'otro_ingreso', nombre: 'Otro ingreso', icono: '💰' },
  ],
};

export const AHORRO = { id: 'ahorro', nombre: 'Ahorro', icono: '🐷' };

// Vencimientos que se cargan la primera vez (después se editan en Ajustes).
export const VENCIMIENTOS_INICIALES = [
  { categoria: 'alquiler', dia: 1, ambito: 'casa' },
  { categoria: 'luz', dia: 10, ambito: 'casa' },
  { categoria: 'agua', dia: 10, ambito: 'casa' },
  { categoria: 'gas', dia: 10, ambito: 'casa' },
  { categoria: 'arqui', dia: 10, ambito: 'casa' },
  { categoria: 'internet', dia: 10, ambito: 'casa' },
  { categoria: 'alarma', dia: 10, ambito: 'casa' },
];
export const VENCIMIENTOS_PERSONALES = {
  facu: [{ categoria: 'monotributo', dia: 20, ambito: 'personal' }],
  marti: [{ categoria: 'obra_social', dia: 10, ambito: 'personal' }],
};

/** Busca una categoría por id dentro de todo lo que puede ver esta persona. */
export function categoria(id, quien) {
  return (
    CASA.find((c) => c.id === id) ||
    (quien && PERSONAL[quien].find((c) => c.id === id)) ||
    (quien && INGRESOS[quien].find((c) => c.id === id)) ||
    PERSONAL.facu.find((c) => c.id === id) ||
    PERSONAL.marti.find((c) => c.id === id) ||
    INGRESOS.facu.find((c) => c.id === id) ||
    INGRESOS.marti.find((c) => c.id === id) ||
    (id === 'ahorro' ? AHORRO : null) ||
    (id === 'saldo' ? { id: 'saldo', nombre: 'Saldar cuentas', icono: '🤝' } : null) || {
      id,
      nombre: id,
      icono: '•',
    }
  );
}

/** Lo que se le manda al lector (IA) para que sepa dónde va cada cosa. */
export function catalogoParaIA(quien) {
  return {
    quien,
    otra_persona: otra(quien),
    casa: CASA.map((c) => ({ id: c.id, nombre: c.nombre, reparto_por_defecto: c.reparto })),
    personal: PERSONAL[quien].map((c) => ({ id: c.id, nombre: c.nombre })),
    ingresos: INGRESOS[quien].map((c) => ({ id: c.id, nombre: c.nombre })),
  };
}
