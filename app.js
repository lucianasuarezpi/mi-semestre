// Une tres fuentes en una sola línea de tiempo:
//   datos/semestre.json  — los syllabus (fijo)
//   datos/agenda.json    — los feeds iCal, lo escribe la GitHub Action
//   localStorage         — las notas y las entregas marcadas
// Si agenda.json no existe todavía, la app funciona igual con los syllabus.

import { resumenMateria, leerObjetivo, aDecima, ESCALA } from "./calculo.js";
import * as almacen from "./almacenamiento.js";

// Alto de una hora en el calendario. Debe coincidir con --hora-alto en estilos.css.
const ALTO_HORA = 46;

const $ = (s) => document.querySelector(s);
const crear = (tag, clase, texto) => {
  const el = document.createElement(tag);
  if (clase) el.className = clase;
  if (texto != null) el.textContent = texto;
  return el;
};
const PREF = {
  get: (k, d) => { try { return localStorage.getItem("mi-semestre:pref:" + k) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem("mi-semestre:pref:" + k, v); } catch {} },
};

/* ── Fechas ─────────────────────────────────────────────────────────────── */

const MESES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
const MESES_LARGO = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const DIAS_CORTO = ["lun","mar","mié","jue","vie","sáb","dom"];

// Mediodía local: así un cambio de huso nunca corre el día.
const aFecha = (iso) => { const [a,m,d] = iso.split("-").map(Number); return new Date(a, m-1, d, 12); };
const hoy = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate(), 12); };
const aISO = (f) => `${f.getFullYear()}-${String(f.getMonth()+1).padStart(2,"0")}-${String(f.getDate()).padStart(2,"0")}`;
const diasEntre = (a, b) => Math.round((b - a) / 86400000);
const sumarDias = (f, n) => { const g = new Date(f); g.setDate(g.getDate() + n); return g; };
// 1 = lunes … 7 = domingo
const diaSemana = (f) => (f.getDay() === 0 ? 7 : f.getDay());
const lunesDe = (f) => sumarDias(f, -(diaSemana(f) - 1));
const enMinutos = (hhmm) => { const [h,m] = hhmm.split(":").map(Number); return h*60 + m; };
const fechaLarga = (iso) => { const f = aFecha(iso); return `${f.getDate()} de ${MESES_LARGO[f.getMonth()]}`; };

function cubeta(d) {
  if (d === 0) return "Hoy";
  if (d === 1) return "Mañana";
  if (d <= 7) return "Esta semana";
  if (d <= 14) return "La otra semana";
  if (d <= 31) return "Este mes";
  return "Más adelante";
}

/* ── Emparejar texto libre con una materia ──────────────────────────────── */

const normalizar = (s) => (s || "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

function emparejar(texto, materias) {
  const t = normalizar(texto);
  if (!t) return null;
  for (const m of materias) {
    const cands = [m.corto, m.nombre, m.codigo, m.carpeta].filter(Boolean).map(normalizar);
    if (cands.some((c) => c && (t.includes(c) || c.includes(t)))) return m;
  }
  const palabras = t.split(" ").filter((p) => p.length >= 5);
  for (const m of materias) {
    const c = normalizar(`${m.nombre} ${m.corto} ${m.carpeta}`);
    if (palabras.some((p) => c.includes(p))) return m;
  }
  return null;
}

function inferirTipo(titulo, extra) {
  const t = normalizar(`${titulo} ${extra || ""}`);
  if (/\b(final)\b/.test(t)) return "final";
  if (/\b(parcial|examen|quiz|quices|evaluacion)\b/.test(t)) return "parcial";
  if (/\b(entrega|taller|tarea|caso|informe|proyecto)\b/.test(t)) return "entrega";
  if (/\b(present|sustenta|pitch|expo)/.test(t)) return "presentacion";
  return null;
}

const ETIQUETA = {
  parcial: "Parcial", final: "Final", entrega: "Entrega", presentacion: "Presentación",
  publicacion: "Se publica", bono: "Bono", clase: "Clase",
};
const MARCABLE = new Set(["entrega", "presentacion", "parcial", "final"]);

const NOMBRE_FUENTE = { bloqueneon: "Bloque Neón", clases: "Calendario" };

/* ── Estado ─────────────────────────────────────────────────────────────── */

const estado = { semestre: null, agenda: null, vista: "hoy", semana: lunesDe(hoy()) };

async function cargar() {
  const pedir = (u) => fetch(u, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const [semestre, agenda] = await Promise.all([pedir("./datos/semestre.json"), pedir("./datos/agenda.json")]);
  if (!semestre) throw new Error("No pude leer datos/semestre.json");
  estado.semestre = semestre;
  estado.agenda = agenda;
  semestre.materias.forEach((m, i) => (m.color = `var(--m${(i % 6) + 1})`));
}

/** Lo que va en la línea de tiempo: sin las clases semanales. */
const sinClasesRepetidas = (lista) => lista.filter((e) => !e.recurrente);

/** Todos los eventos con fecha, de las tres fuentes, ordenados. */
function eventos() {
  const materias = estado.semestre.materias;
  const lista = [];
  for (const m of materias) {
    for (const ev of m.eventos || []) lista.push({ ...ev, fuente: "syllabus", materia: m, materiaId: m.id });
  }
  for (const ev of estado.agenda?.eventos || []) {
    const materia = emparejar(ev.materiaTexto || ev.titulo, materias);
    lista.push({ ...ev, materia, materiaId: materia?.id, tipo: ev.tipo || inferirTipo(ev.titulo, ev.tipoTexto) });
  }
  return lista.sort((a, b) => (a.fecha + (a.hora || "00:00")).localeCompare(b.fecha + (b.hora || "00:00")));
}

/* ── Fila de evento ─────────────────────────────────────────────────────── */

function filaEvento(ev, { conCasilla = true } = {}) {
  const f = aFecha(ev.fecha);
  const d = diasEntre(hoy(), f);
  const clave = almacen.claveEvento(ev);
  const marcable = conCasilla && MARCABLE.has(ev.tipo);
  const hecha = marcable && almacen.estaHecha(clave);

  const fila = crear("div", "evento");
  if (hecha) fila.classList.add("listo");
  else if (d >= 0 && d <= 2 && MARCABLE.has(ev.tipo)) fila.classList.add("urgente");

  const cuando = crear("div", "cuando");
  cuando.append(crear("div", "dia", String(f.getDate())), crear("div", "mes", MESES[f.getMonth()]));

  const cuerpo = crear("div", "cuerpo");
  cuerpo.append(crear("div", "titulo", ev.titulo));
  const meta = crear("div", "meta");
  if (ev.materia) {
    const chip = crear("span", "chip-materia");
    const p = crear("span", "punto");
    p.style.background = ev.materia.color;
    chip.append(p, crear("span", null, ev.materia.corto));
    meta.append(chip);
  } else if (ev.materiaTexto) meta.append(crear("span", null, ev.materiaTexto));
  if (ETIQUETA[ev.tipo]) meta.append(crear("span", `insignia ${ev.tipo}`, ETIQUETA[ev.tipo]));
  if (ev.hora) meta.append(crear("span", null, ev.hora));
  if (ev.impreciso) meta.append(crear("span", null, "fecha por confirmar"));
  if (NOMBRE_FUENTE[ev.fuente]) meta.append(crear("span", "insignia fuente", NOMBRE_FUENTE[ev.fuente]));
  if (meta.childNodes.length) cuerpo.append(meta);

  fila.append(cuando, cuerpo);

  if (marcable) {
    const casilla = crear("input", "casilla");
    casilla.type = "checkbox";
    casilla.checked = hecha;
    casilla.title = "Marcar como hecha";
    casilla.addEventListener("change", () => {
      almacen.marcar(clave, casilla.checked);
      pintar();
    });
    fila.append(casilla);
  }
  return fila;
}

/* ── Vista: lo que viene ────────────────────────────────────────────────── */

function vistaHoy() {
  const cont = $("#vista-hoy");
  cont.replaceChildren();
  const h = hoy();
  const s = estado.semestre;
  const todos = sinClasesRepetidas(eventos());
  const futuros = todos.filter((e) => diasEntre(h, aFecha(e.fecha)) >= 0);

  // Indicadores
  const ind = crear("div", "indicadores");
  const pendiente = futuros.find((e) => MARCABLE.has(e.tipo) && !almacen.estaHecha(almacen.claveEvento(e)));
  const t1 = crear("div", "tarjeta indicador");
  if (pendiente) {
    const d = diasEntre(h, aFecha(pendiente.fecha));
    t1.append(crear("div","valor", d===0?"Hoy":d===1?"Mañana":`${d} días`),
              crear("div","etiqueta","Lo próximo"), crear("div","pie", pendiente.titulo));
  } else t1.append(crear("div","valor","—"), crear("div","etiqueta","Nada pendiente"));

  const evals = futuros.filter((e) => e.tipo === "parcial" || e.tipo === "final");
  const t2 = crear("div", "tarjeta indicador");
  t2.append(crear("div","valor",String(evals.length)),
            crear("div","etiqueta", evals.length===1?"Evaluación restante":"Evaluaciones restantes"));
  if (evals[0]) t2.append(crear("div","pie",`La próxima: ${fechaLarga(evals[0].fecha)}`));

  const semana = futuros.filter((e) => diasEntre(h, aFecha(e.fecha)) <= 7 && MARCABLE.has(e.tipo)
                                       && !almacen.estaHecha(almacen.claveEvento(e)));
  const t3 = crear("div", "tarjeta indicador");
  t3.append(crear("div","valor",String(semana.length)), crear("div","etiqueta","Sin hacer, en 7 días"));

  const total = diasEntre(aFecha(s.inicio), aFecha(s.fin));
  const pct = Math.max(0, Math.min(100, Math.round((diasEntre(aFecha(s.inicio), h) / total) * 100)));
  const t4 = crear("div", "tarjeta indicador");
  const riel = crear("div", "riel"); const relleno = crear("i");
  relleno.style.width = `${pct}%`; riel.append(relleno);
  t4.append(crear("div","valor",`${pct}%`), crear("div","etiqueta","Del semestre va corrido"), riel);

  ind.append(t1, t2, t3, t4);
  cont.append(ind);
  cont.append(...avisos());

  // Línea de tiempo
  if (!futuros.length) {
    const t = crear("div", "tarjeta seccion");
    t.append(crear("div", "vacio", "No queda nada en el calendario."));
    cont.append(t);
    return;
  }
  const sec = crear("div", "seccion");
  sec.append(crear("h2", null, "Lo que viene"));
  let grupo = null, tarjeta = null;
  for (const ev of futuros) {
    const c = cubeta(diasEntre(h, aFecha(ev.fecha)));
    if (c !== grupo) {
      grupo = c;
      sec.append(crear("div", "grupo-fecha", c));
      tarjeta = crear("div", "tarjeta");
      sec.append(tarjeta);
    }
    tarjeta.append(filaEvento(ev));
  }
  cont.append(sec);
}

function avisos() {
  const out = [];
  const caja = crear("div");
  caja.style.marginTop = "16px";

  if (!almacen.hayAlmacenamiento()) {
    const a = crear("div", "alerta grave");
    a.append(crear("span", null, "!"), crear("span", null, ""));
    a.lastChild.append(crear("b", null, "No puedo guardar nada. "),
      document.createTextNode("El navegador bloqueó el almacenamiento (¿ventana privada?). Lo que escribas se pierde al cerrar."));
    caja.append(a);
  }
  if (!estado.agenda) {
    const a = crear("div", "alerta");
    a.append(crear("span", null, "!"), crear("span", null, ""));
    a.lastChild.append(crear("b", null, "Todavía no hay agenda sincronizada. "),
      document.createTextNode("Estás viendo solo lo que dicen los syllabus."));
    caja.append(a);
  }
  for (const [nombre, info] of Object.entries(estado.agenda?.fuentes || {})) {
    if (info.ok) continue;
    const a = crear("div", "alerta");
    a.append(crear("span", null, "!"), crear("span", null, ""));
    a.lastChild.append(crear("b", null, `${NOMBRE_FUENTE[nombre] || nombre} no está conectado. `),
      document.createTextNode(info.error));
    caja.append(a);
  }
  const sinRespaldo = almacen.respaldoPendiente();
  if (sinRespaldo >= 8) {
    const a = crear("div", "alerta");
    a.append(crear("span", null, "!"), crear("span", null, ""));
    a.lastChild.append(crear("b", null, `${sinRespaldo} cambios sin respaldar. `),
      document.createTextNode("Descarga una copia desde Pendientes."));
    caja.append(a);
  }
  if (caja.childNodes.length) out.push(caja);
  return out;
}

/* ── Vista: calendario ──────────────────────────────────────────────────── */

function vistaCalendario() {
  const cont = $("#vista-calendario");
  cont.replaceChildren();
  const h = hoy();
  const lunes = estado.semana;
  const dias = [...Array(7)].map((_, i) => sumarDias(lunes, i));

  // Bloques con hora: clases del syllabus (semanales) + eventos con hora.
  const bloques = [];
  const sueltos = [];  // sin hora → van arriba, como chips

  const fuenteClases = estado.agenda?.fuentes?.clases;
  const hayCalendarioReal = Boolean(fuenteClases?.ok && fuenteClases.total > 0);

  for (const m of hayCalendarioReal ? [] : estado.semestre.materias) {
    for (const hor of m.horario || []) {
      const f = dias[hor.dia - 1];
      if (!f) continue;
      const iso = aISO(f);
      if (iso < estado.semestre.inicio || iso > estado.semestre.fin) continue;
      if (hor.inicio && hor.fin) {
        bloques.push({ col: hor.dia - 1, desde: enMinutos(hor.inicio), hasta: enMinutos(hor.fin),
                       titulo: m.corto, detalle: hor.salon || m.salon || "", color: m.color });
      } else {
        sueltos.push({ col: hor.dia - 1, titulo: m.corto, color: m.color });
      }
    }
  }

  const desdeISO = aISO(dias[0]), hastaISO = aISO(dias[6]);
  for (const ev of eventos()) {
    if (ev.fecha < desdeISO || ev.fecha > hastaISO) continue;
    const col = diaSemana(aFecha(ev.fecha)) - 1;
    const color = ev.materia?.color;
    if (ev.hora) {
      const desde = enMinutos(ev.hora);
      const hasta = ev.horaFin ? enMinutos(ev.horaFin) : desde + 60;
      bloques.push({ col, desde, hasta: Math.max(hasta, desde + 30), titulo: ev.titulo,
                     detalle: ev.lugar || "", color: color || "var(--tinta-3)" });
    } else {
      sueltos.push({ col, titulo: ev.titulo, color: color || "var(--tinta-3)" });
    }
  }

  // Rango de horas que hay que mostrar, ajustado a lo que realmente hay.
  let min = 7 * 60, max = 18 * 60;
  for (const b of bloques) { min = Math.min(min, b.desde); max = Math.max(max, b.hasta); }
  const h0 = Math.floor(min / 60), h1 = Math.ceil(max / 60);

  // Barra de navegación
  const barra = crear("div", "cal-barra");
  const atras = crear("button", "boton-icono", "‹");
  const adelante = crear("button", "boton-icono", "›");
  const ultimo = dias[4];
  const rango = crear("div", "rango",
    `${dias[0].getDate()} ${MESES[dias[0].getMonth()]} – ${ultimo.getDate()} ${MESES[ultimo.getMonth()]}`);
  const btnHoy = crear("button", "cal-hoy", "Hoy");
  atras.onclick = () => { estado.semana = sumarDias(lunes, -7); vistaCalendario(); };
  adelante.onclick = () => { estado.semana = sumarDias(lunes, 7); vistaCalendario(); };
  btnHoy.onclick = () => { estado.semana = lunesDe(hoy()); vistaCalendario(); };
  barra.append(atras, rango, btnHoy, adelante);
  cont.append(barra);

  const tarjeta = crear("div", "tarjeta");

  if (sueltos.length) {
    const zona = crear("div", "cal-todo-el-dia");
    for (const s of sueltos) {
      const chip = crear("div", "cal-chip");
      chip.style.setProperty("--color-materia", s.color);
      chip.append(crear("span", "dia-corto", DIAS_CORTO[s.col]), crear("span", null, s.titulo));
      zona.append(chip);
    }
    tarjeta.append(zona);
  }

  // Lunes a viernes siempre; el fin de semana solo si hay algo. Con 7 columnas
  // en un celular el texto de cada bloque queda ilegible.
  // Solo las clases con hora deciden si aparece el fin de semana: un cumpleaños
  // el sábado no debe apretar las cinco columnas entre semana. Los eventos sin
  // hora salen igual, arriba, con su día escrito.
  const ocupados = new Set(bloques.map((b) => b.col));
  const visibles = [0, 1, 2, 3, 4].concat([5, 6].filter((c) => ocupados.has(c)));

  const rejilla = crear("div", "cal-rejilla");
  rejilla.style.setProperty("--dias", String(visibles.length));

  const enc = crear("div", "cal-encabezado");
  enc.append(crear("div", null, ""));
  visibles.forEach((i) => {
    const f = dias[i];
    const d = crear("div");
    if (aISO(f) === aISO(h)) d.classList.add("es-hoy");
    d.append(crear("span", null, DIAS_CORTO[i] + " "), crear("b", null, String(f.getDate())));
    enc.append(d);
  });
  rejilla.append(enc);

  const horas = crear("div", "cal-horas");
  for (let x = h0; x < h1; x++) horas.append(crear("div", null, `${x}:00`));
  rejilla.append(horas);

  visibles.forEach((i) => {
    const f = dias[i];
    const col = crear("div", "cal-columna");
    for (let x = h0; x < h1; x++) col.append(crear("div", "linea-hora"));

    for (const b of bloques.filter((b) => b.col === i)) {
      const el = crear("div", "cal-bloque");
      el.style.setProperty("--color-materia", b.color);
      el.style.top = `${((b.desde - h0 * 60) / 60) * ALTO_HORA}px`;
      el.style.height = `${Math.max(18, ((b.hasta - b.desde) / 60) * ALTO_HORA - 2)}px`;
      el.append(crear("b", null, b.titulo));
      if (b.detalle) el.append(crear("span", null, b.detalle));
      col.append(el);
    }

    // La línea de "ahora", solo en la columna de hoy.
    if (aISO(f) === aISO(h)) {
      const ahora = new Date();
      const min = ahora.getHours() * 60 + ahora.getMinutes();
      if (min >= h0 * 60 && min <= h1 * 60) {
        const l = crear("div", "cal-ahora");
        l.style.top = `${((min - h0 * 60) / 60) * ALTO_HORA}px`;
        col.append(l);
      }
    }
    rejilla.append(col);
  });

  tarjeta.append(rejilla);
  cont.append(tarjeta);

  if (!bloques.length && !sueltos.length) {
    const t = crear("div", "tarjeta seccion");
    t.append(crear("div", "vacio", "No hay nada esta semana."));
    cont.append(t);
  }
}

/* ── Vista: materias y notas ────────────────────────────────────────────── */

function vistaMaterias() {
  const cont = $("#vista-materias");
  cont.replaceChildren();
  const objetivo = Number(PREF.get("objetivo", "4.0"));
  const sec = crear("div", "seccion");
  sec.style.marginTop = "18px";

  for (const m of estado.semestre.materias) {
    const notas = almacen.notasDe(m.id);
    const r = resumenMateria(m.evaluacion, notas);
    const t = crear("div", "tarjeta materia");
    t.style.setProperty("--color-materia", m.color);

    // Encabezado
    const cab = crear("div", "materia-cabeza");
    const barra = crear("div", "barra");
    barra.style.background = m.color;
    const info = crear("div");
    info.style.flex = "1";
    info.append(crear("h3", null, m.nombre));
    const sub = [m.codigo, m.seccion ? `Sección ${m.seccion}` : null].filter(Boolean).join(" · ");
    if (sub) info.append(crear("div", "codigo", sub));

    const datos = crear("div", "datos");
    const dato = (et, v) => { if (!v) return; const d = crear("div"); d.append(crear("b", null, et), crear("span", null, v)); datos.append(d); };
    dato("Profesor", m.profesor?.nombre);
    dato("Correo", m.profesor?.correo);
    if (m.horario?.length) {
      dato("Horario", m.horario.map((x) => DIAS_CORTO[x.dia-1] + (x.inicio ? ` ${x.inicio}–${x.fin}` : "")).join(" · "));
    }
    dato("Salón", m.salon);
    dato("Atención", m.atencion);
    dato("Monitor", m.monitor ? `${m.monitor.nombre} (${m.monitor.correo})` : null);
    dato("Proyecto", m.proyecto);
    dato("Texto guía", m.texto);
    if (datos.childNodes.length) info.append(datos);
    cab.append(barra, info);
    t.append(cab);

    // Medidor: un segmento por rubro; gris el que aún no tiene nota.
    const cal = m.evaluacion.filter((e) => !e.bono);
    const medidor = crear("div", "medidor");
    cal.forEach((e, i) => {
      const seg = crear("i");
      seg.style.flex = String(e.peso);
      if (notas[e.rubro] == null) seg.classList.add("sin-nota");
      else seg.style.opacity = String(1 - i * (0.5 / Math.max(1, cal.length - 1)));
      seg.title = `${e.rubro} — ${e.peso}%`;
      medidor.append(seg);
    });
    t.append(medidor);

    // Resumen
    const res = crear("div", "resumen-nota");
    if (r.promedio != null) {
      const g = crear("div", "grande", aDecima(r.promedio).toFixed(1));
      if (r.promedio < ESCALA.aprueba) g.classList.add("reprobando");
      res.append(g, crear("div", "chico",
        r.definitiva != null ? "definitiva" : `sobre el ${r.porcentajeCalificado}% ya calificado`));
    } else {
      res.append(crear("div", "grande", "—"), crear("div", "chico", "todavía sin notas"));
    }
    t.append(res);

    // Objetivo
    const obj = crear("div", "objetivo");
    obj.append(crear("span", null, "Para cerrar en"));
    const sel = crear("select");
    for (const v of [3.0, 3.5, 4.0, 4.5, 5.0]) {
      const o = crear("option", null, v.toFixed(1));
      o.value = String(v);
      if (v === objetivo) o.selected = true;
      sel.append(o);
    }
    sel.onchange = () => { PREF.set("objetivo", sel.value); pintar(); };
    const v = leerObjetivo(r.necesitaPara(objetivo));
    obj.append(sel, crear("span", `veredicto ${v.estado}`, v.texto));
    t.append(obj);

    // Rubros con su casilla de nota
    for (const e of m.evaluacion) {
      const fila = crear("div", "rubro");
      if (e.bono) fila.classList.add("bono");
      const p = crear("span", "punto");
      p.style.background = m.color;
      fila.append(p, crear("span", "nombre", e.rubro), crear("span", "peso", `${e.peso}%`));

      const inp = crear("input");
      inp.type = "text";
      inp.inputMode = "decimal";
      inp.placeholder = "—";
      inp.value = notas[e.rubro] != null ? String(notas[e.rubro]) : "";
      inp.setAttribute("aria-label", `Nota de ${e.rubro}`);
      inp.addEventListener("change", () => {
        const crudo = inp.value.trim().replace(",", ".");
        if (crudo === "") { almacen.guardarNota(m.id, e.rubro, null); pintar(); return; }
        const n = Number(crudo);
        if (!Number.isFinite(n) || n < 0 || n > ESCALA.max) { inp.classList.add("malo"); return; }
        inp.classList.remove("malo");
        almacen.guardarNota(m.id, e.rubro, n);
        pintar();
      });
      fila.append(inp);
      t.append(fila);
    }

    if (m.nota) t.append(crear("p", "nota-curso", m.nota));
    sec.append(t);
  }
  cont.append(sec);
}

/* ── Vista: pendientes y respaldo ───────────────────────────────────────── */

function vistaPendientes() {
  const cont = $("#vista-pendientes");
  cont.replaceChildren();
  const h = hoy();
  const marcables = sinClasesRepetidas(eventos())
    .filter((e) => MARCABLE.has(e.tipo) && diasEntre(h, aFecha(e.fecha)) >= -30);

  const sec = crear("div", "seccion");
  sec.style.marginTop = "18px";
  sec.append(crear("h2", null, `Entregas y evaluaciones (${marcables.filter((e) => !almacen.estaHecha(almacen.claveEvento(e))).length} sin hacer)`));
  const t = crear("div", "tarjeta");
  if (!marcables.length) t.append(crear("div", "vacio", "Nada por acá."));
  for (const ev of marcables) t.append(filaEvento(ev));
  sec.append(t);
  cont.append(sec);

  // Respaldo
  const sec2 = crear("div", "seccion");
  sec2.append(crear("h2", null, "Respaldo"));
  const t2 = crear("div", "tarjeta");
  const ult = almacen.ultimoRespaldo();
  const p = crear("p", "nota-curso",
    (ult ? `Último respaldo: ${new Date(ult).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}. ` : "Nunca has respaldado. ") +
    `${almacen.respaldoPendiente()} cambios desde entonces. Tus notas viven solo en este navegador: si borras los datos del sitio, se pierden.`);
  p.style.borderTop = "0";
  t2.append(p);

  const acciones = crear("div", "acciones");
  const bajar = crear("button", "boton principal", "Descargar respaldo");
  bajar.onclick = () => {
    const blob = new Blob([almacen.exportar()], { type: "application/json" });
    const a = crear("a");
    a.href = URL.createObjectURL(blob);
    a.download = `mi-semestre-${aISO(hoy())}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    pintar();
  };
  const subir = crear("button", "boton", "Restaurar desde archivo");
  subir.onclick = () => $("#archivo-respaldo").click();
  acciones.append(bajar, subir);
  t2.append(acciones);
  sec2.append(t2);
  cont.append(sec2);
}

/* ── Orquestación ───────────────────────────────────────────────────────── */

function pintar() {
  const s = estado.semestre;
  const h = hoy();
  const semana = Math.floor(diasEntre(aFecha(s.inicio), h) / 7) + 1;
  $("#titulo").textContent = s.etiqueta;
  $("#subtitulo").textContent =
    h > aFecha(s.fin) ? "Semestre terminado"
    : h < aFecha(s.inicio) ? "Aún no empieza"
    : `Semana ${Math.max(1, semana)} · ${s.periodo}`;

  vistaHoy(); vistaCalendario(); vistaMaterias(); vistaPendientes();

  const g = estado.agenda?.generado;
  $("#pie").textContent = g
    ? `Agenda sincronizada ${new Date(g).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}`
    : "Sin agenda sincronizada — solo los syllabus";
}

function cambiarVista(v) {
  estado.vista = v;
  for (const b of document.querySelectorAll(".pestana")) b.setAttribute("aria-selected", String(b.dataset.vista === v));
  for (const id of ["hoy", "calendario", "materias", "pendientes"]) $(`#vista-${id}`).hidden = id !== v;
  window.scrollTo({ top: 0 });
}

async function iniciar() {
  const tema = PREF.get("tema", null);
  if (tema) document.documentElement.dataset.tema = tema;

  document.querySelectorAll(".pestana").forEach((b) => b.addEventListener("click", () => cambiarVista(b.dataset.vista)));
  $("#btn-tema").addEventListener("click", () => {
    const orden = [null, "claro", "oscuro"];
    const sig = orden[(orden.indexOf(PREF.get("tema", null)) + 1) % orden.length];
    if (sig) { PREF.set("tema", sig); document.documentElement.dataset.tema = sig; }
    else { try { localStorage.removeItem("mi-semestre:pref:tema"); } catch {} delete document.documentElement.dataset.tema; }
  });
  $("#archivo-respaldo").addEventListener("change", async (e) => {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    try {
      const { notas, hechas } = almacen.importar(await archivo.text());
      alert(`Restaurado: ${notas} notas y ${hechas} entregas marcadas.`);
      pintar();
    } catch (err) {
      alert(`No pude leer ese archivo: ${err.message}`);
    }
    e.target.value = "";
  });

  try {
    await cargar();
  } catch (err) {
    document.querySelector("main").innerHTML =
      `<div class="alerta grave" style="margin-top:20px">No pude cargar los datos del semestre: ${err.message}</div>`;
    return;
  }
  pintar();

  // Pedimos almacenamiento persistente: en iOS ayuda a que no lo borren.
  navigator.storage?.persist?.().catch(() => {});
}

iniciar();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}
