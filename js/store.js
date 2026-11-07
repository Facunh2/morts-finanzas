// Capa de datos. Dos implementaciones con la misma forma:
//  - Demo: localStorage (para probar sin servidor; simula a Facu y a Marti).
//  - Supabase: base en la nube, sincroniza al instante entre los dos celulares.
//    Lo personal es privado por reglas de la base (RLS), no solo por la app.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { VENCIMIENTOS_INICIALES, VENCIMIENTOS_PERSONALES } from './categorias.js';

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());

// ── DEMO ─────────────────────────────────────────────────────────────────────
class StoreDemo {
  constructor() {
    this.modo = 'demo';
    this.oyentes = new Set();
    this.yo = localStorage.getItem('demo.yo') || null;
    window.addEventListener('storage', () => this.avisar());
  }
  leer(k, def) { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } }
  escribir(k, v) { localStorage.setItem(k, JSON.stringify(v)); this.avisar(); }
  avisar() { this.oyentes.forEach((f) => f()); }
  alCambiar(f) { this.oyentes.add(f); return () => this.oyentes.delete(f); }

  async sesion() { return this.yo ? { quien: this.yo } : null; }
  async elegirPersona(q) {
    this.yo = q; localStorage.setItem('demo.yo', q);
    if (!this.leer('demo.venc', null)) {
      const v = VENCIMIENTOS_INICIALES.map((x) => ({ id: uid(), ...x, dueno: null }));
      for (const p of ['facu', 'marti']) VENCIMIENTOS_PERSONALES[p].forEach((x) => v.push({ id: uid(), ...x, dueno: p }));
      this.escribir('demo.venc', v);
    }
    return { quien: q };
  }
  async salir() { this.yo = null; localStorage.removeItem('demo.yo'); }

  visible(fila) { return fila.ambito === 'casa' || fila.dueno === this.yo; }
  async movimientos() { return this.leer('demo.mov', []).filter((m) => this.visible(m)); }
  async agregar(m) {
    const fila = { id: uid(), creado: new Date().toISOString(), ...m, dueno: this.yo, autor: this.yo };
    this.escribir('demo.mov', [...this.leer('demo.mov', []), fila]);
    return fila;
  }
  async editar(id, cambios) {
    this.escribir('demo.mov', this.leer('demo.mov', []).map((m) => (m.id === id && this.visible(m) ? { ...m, ...cambios } : m)));
  }
  async borrar(id) { this.escribir('demo.mov', this.leer('demo.mov', []).filter((m) => !(m.id === id && this.visible(m)))); }

  async vencimientos() { return this.leer('demo.venc', []).filter((v) => this.visible(v)); }
  async guardarVencimiento(v) {
    const todos = this.leer('demo.venc', []);
    if (v.id) this.escribir('demo.venc', todos.map((x) => (x.id === v.id ? { ...x, ...v } : x)));
    else this.escribir('demo.venc', [...todos, { ...v, id: uid(), dueno: v.ambito === 'personal' ? this.yo : null }]);
  }
  async borrarVencimiento(id) { this.escribir('demo.venc', this.leer('demo.venc', []).filter((x) => x.id !== id)); }

  async metas() { return this.leer('demo.metas', []).filter((v) => this.visible(v)); }
  async guardarMeta(m) {
    const todas = this.leer('demo.metas', []);
    if (m.id) this.escribir('demo.metas', todas.map((x) => (x.id === m.id ? { ...x, ...m } : x)));
    else this.escribir('demo.metas', [...todas, { ...m, id: uid(), dueno: m.ambito === 'personal' ? this.yo : null }]);
  }
  async borrarMeta(id) { this.escribir('demo.metas', this.leer('demo.metas', []).filter((x) => x.id !== id)); }

  async token() { return null; }
}

// ── SUPABASE ─────────────────────────────────────────────────────────────────
class StoreSupabase {
  constructor(sb) {
    this.modo = 'nube';
    this.sb = sb;
    this.oyentes = new Set();
    this.yo = null;
    this.canal = null;
  }
  avisar() { this.oyentes.forEach((f) => f()); }
  alCambiar(f) { this.oyentes.add(f); return () => this.oyentes.delete(f); }
  ok({ data, error }) { if (error) throw new Error(error.message); return data; }

  escuchar() {
    if (this.canal) return;
    this.canal = this.sb.channel('cambios')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'movimientos' }, () => this.avisar())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vencimientos' }, () => this.avisar())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'metas' }, () => this.avisar())
      .subscribe();
  }

  async sesion() {
    const { data } = await this.sb.auth.getSession();
    if (!data.session) return null;
    const fila = this.ok(await this.sb.from('miembros').select('quien').eq('user_id', data.session.user.id).maybeSingle());
    this.yo = fila?.quien || null;
    if (this.yo) this.escuchar();
    return { email: data.session.user.email, quien: this.yo };
  }
  async entrar(email, clave) { this.ok(await this.sb.auth.signInWithPassword({ email, password: clave })); }
  async registrarse(email, clave) { this.ok(await this.sb.auth.signUp({ email, password: clave })); }
  async elegirPersona(q) {
    const { data } = await this.sb.auth.getUser();
    this.ok(await this.sb.from('miembros').insert({ user_id: data.user.id, quien: q }));
    this.yo = q;
    // Vencimientos iniciales (la casa una sola vez; los personales, cada uno los suyos).
    const casa = this.ok(await this.sb.from('vencimientos').select('id').eq('ambito', 'casa').limit(1));
    const nuevos = VENCIMIENTOS_PERSONALES[q].map((v) => ({ ...v, dueno: data.user.id }));
    if (!casa.length) VENCIMIENTOS_INICIALES.forEach((v) => nuevos.push({ ...v, dueno: null }));
    this.ok(await this.sb.from('vencimientos').insert(nuevos));
    this.escuchar();
    return { quien: q };
  }
  async salir() { await this.sb.auth.signOut(); this.yo = null; }

  async movimientos() {
    return this.ok(await this.sb.from('movimientos').select('*').order('fecha', { ascending: true }));
  }
  async agregar(m) {
    const fila = this.ok(await this.sb.from('movimientos').insert({ ...m, autor: this.yo }).select().single());
    this.avisar();
    return fila;
  }
  async editar(id, cambios) { this.ok(await this.sb.from('movimientos').update(cambios).eq('id', id)); this.avisar(); }
  async borrar(id) { this.ok(await this.sb.from('movimientos').delete().eq('id', id)); this.avisar(); }

  async vencimientos() { return this.ok(await this.sb.from('vencimientos').select('*')); }
  async guardarVencimiento(v) {
    if (v.id) this.ok(await this.sb.from('vencimientos').update({ categoria: v.categoria, dia: v.dia }).eq('id', v.id));
    else this.ok(await this.sb.from('vencimientos').insert({ categoria: v.categoria, dia: v.dia, ambito: v.ambito }));
    this.avisar();
  }
  async borrarVencimiento(id) { this.ok(await this.sb.from('vencimientos').delete().eq('id', id)); this.avisar(); }

  async metas() { return this.ok(await this.sb.from('metas').select('*')); }
  async guardarMeta(m) {
    const datos = { nombre: m.nombre, objetivo: m.objetivo, moneda: m.moneda, ambito: m.ambito };
    if (m.id) this.ok(await this.sb.from('metas').update(datos).eq('id', m.id));
    else this.ok(await this.sb.from('metas').insert(datos));
    this.avisar();
  }
  async borrarMeta(id) { this.ok(await this.sb.from('metas').delete().eq('id', id)); this.avisar(); }

  async token() { const { data } = await this.sb.auth.getSession(); return data.session?.access_token || null; }
}

export async function crearStore() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return new StoreDemo();
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  return new StoreSupabase(createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true } }));
}
