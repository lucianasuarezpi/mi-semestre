// Trae los feeds iCal (su Google Calendar y, si se habilita, Bloque Neón) y los
// escribe en datos/agenda.json. Corre en GitHub Actions una vez por hora; los
// secretos vienen de GitHub Secrets y nunca entran al repo.
//
// Regla de oro: este script SIEMPRE escribe un agenda.json válido. Si una
// fuente falla, lo anota en "fuentes" y sigue. El sitio nunca se rompe porque
// un feed esté caído.
//
// Local:  node scripts/sincronizar.mjs   (lee un .env si existe)

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const DESTINO = join(RAIZ, "datos", "agenda.json");

// .env casero, sin dependencias, solo para pruebas locales.
if (existsSync(join(RAIZ, ".env"))) {
  for (const linea of readFileSync(join(RAIZ, ".env"), "utf8").split("\n")) {
    const m = linea.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

/* ── Bloque Neón (iCalendar) ────────────────────────────────────────────── */

export const desescapar = (v) =>
  v.replace(/\\n/gi, " ").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\").trim();

// Bogotá es UTC−5 todo el año, sin horario de verano.
export function fechaICS(valor, params) {
  const m = valor.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const [, a, mes, d, hh, mm, , esUTC] = m;
  if (!hh) return { fecha: `${a}-${mes}-${d}`, hora: null };
  if (esUTC || params.includes("TZID=UTC")) {
    const bog = new Date(Date.UTC(+a, +mes - 1, +d, +hh, +mm) - 5 * 3600 * 1000);
    return { fecha: bog.toISOString().slice(0, 10), hora: bog.toISOString().slice(11, 16) };
  }
  return { fecha: `${a}-${mes}-${d}`, hora: `${hh}:${mm}` };
}

export function parsearICS(ics) {
  // RFC 5545: una línea que empieza con espacio o tab continúa la anterior.
  const lineas = ics.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n");
  const eventos = [];
  let ev = null;

  for (const linea of lineas) {
    if (linea === "BEGIN:VEVENT") { ev = {}; continue; }
    if (linea === "END:VEVENT") {
      if (ev?.inicio) {
        eventos.push({
          fuente: "bloqueneon",
          titulo: ev.resumen || "(sin título)",
          fecha: ev.inicio.fecha,
          hora: ev.inicio.hora,
          horaFin: ev.fin?.hora || null,
          materiaTexto: ev.categoria || null,
          descripcion: ev.descripcion || null,
          lugar: ev.lugar || null,
          uid: ev.uid || null,
          rrule: ev.rrule || null,
          exdates: ev.exdates || null,
          recurrenciaDe: ev.recurrenciaDe || null,
        });
      }
      ev = null;
      continue;
    }
    if (!ev) continue;

    const corte = linea.indexOf(":");
    if (corte === -1) continue;
    const [clave, ...params] = linea.slice(0, corte).split(";");
    const valor = linea.slice(corte + 1);

    switch (clave.toUpperCase()) {
      case "DTSTART":     ev.inicio = fechaICS(valor, params); break;
      case "DTEND":       ev.fin = fechaICS(valor, params); break;
      case "SUMMARY":     ev.resumen = desescapar(valor); break;
      case "DESCRIPTION": ev.descripcion = desescapar(valor).slice(0, 300) || null; break;
      case "CATEGORIES":  ev.categoria = desescapar(valor); break;
      case "LOCATION":    ev.lugar = desescapar(valor) || null; break;
      case "UID":         ev.uid = valor.trim(); break;
      case "RRULE":       ev.rrule = valor.trim(); break;
      case "EXDATE":
        // Fechas canceladas de una serie; pueden venir varias separadas por coma.
        ev.exdates = (ev.exdates || []).concat(
          valor.split(",").map((v) => fechaICS(v.trim(), params)?.fecha).filter(Boolean),
        );
        break;
      case "RECURRENCE-ID":
        // Esta entrada reemplaza una ocurrencia concreta de la serie.
        ev.recurrenciaDe = fechaICS(valor, params)?.fecha || null;
        break;
    }
  }
  return eventos;
}

// Los dos feeds hablan iCalendar, así que los leemos igual. `id` viaja con
// cada evento para que la interfaz sepa de dónde salió.
const FEEDS = [
  { id: "clases",     env: "CLASES_ICS_URL",     etiqueta: "tu calendario" },
  { id: "bloqueneon", env: "BLOQUENEON_ICS_URL", etiqueta: "Bloque Neón" },
];

/* ── Expandir repeticiones ──────────────────────────────────────────────── */
// Sin esto, una clase semanal aparecería una sola vez en todo el semestre:
// el feed la manda como UN evento con una regla de repetición, no como 16.

const DIA_RRULE = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

const aISOFecha = (f) =>
  `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}-${String(f.getDate()).padStart(2, "0")}`;
// Mediodía: así ningún cambio de huso corre el día.
const deISO = (iso) => { const [a, m, d] = iso.split("-").map(Number); return new Date(a, m - 1, d, 12); };

export function parsearRRULE(txt) {
  const r = {};
  for (const parte of txt.split(";")) {
    const [k, v] = parte.split("=");
    if (k) r[k.toUpperCase()] = v;
  }
  return {
    freq: (r.FREQ || "").toUpperCase(),
    intervalo: Math.max(1, Number(r.INTERVAL || 1)),
    // "2MO" (segundo lunes) no lo soportamos: nos quedamos con el día.
    dias: r.BYDAY ? r.BYDAY.split(",").map((d) => DIA_RRULE[d.trim().slice(-2).toUpperCase()]).filter((d) => d != null) : null,
    hasta: r.UNTIL ? `${r.UNTIL.slice(0, 4)}-${r.UNTIL.slice(4, 6)}-${r.UNTIL.slice(6, 8)}` : null,
    cuenta: r.COUNT ? Number(r.COUNT) : null,
  };
}

/** Fechas en que ocurre `ev` dentro de [desde, hasta]. */
export function fechasDeRepeticion(ev, desde, hasta) {
  const regla = parsearRRULE(ev.rrule);
  const excluidas = new Set(ev.exdates || []);
  const tope = regla.hasta && regla.hasta < hasta ? regla.hasta : hasta;
  const inicio = deISO(ev.fecha);
  const fechas = [];
  let generadas = 0;
  const TECHO = 1000; // cinturón de seguridad contra una regla malformada

  const registrar = (iso) => {
    if (iso < ev.fecha || iso > tope) return true;
    generadas++;
    if (!excluidas.has(iso) && iso >= desde) fechas.push(iso);
    return !(regla.cuenta && generadas >= regla.cuenta);
  };

  if (regla.freq === "WEEKLY") {
    const dias = (regla.dias?.length ? regla.dias : [inicio.getDay()]).slice().sort((a, b) => a - b);
    const domingo0 = new Date(inicio);
    domingo0.setDate(domingo0.getDate() - domingo0.getDay());
    for (let semana = 0; semana < TECHO; semana++) {
      const base = new Date(domingo0);
      base.setDate(base.getDate() + semana * 7 * regla.intervalo);
      if (aISOFecha(base) > tope) break;
      for (const d of dias) {
        const f = new Date(base);
        f.setDate(f.getDate() + d);
        if (!registrar(aISOFecha(f))) return fechas;
      }
    }
  } else if (regla.freq === "DAILY") {
    for (let i = 0; i < TECHO; i++) {
      const f = new Date(inicio);
      f.setDate(f.getDate() + i * regla.intervalo);
      if (aISOFecha(f) > tope) break;
      if (!registrar(aISOFecha(f))) return fechas;
    }
  } else if (regla.freq === "MONTHLY") {
    for (let i = 0; i < TECHO; i++) {
      const f = new Date(inicio);
      f.setMonth(f.getMonth() + i * regla.intervalo);
      if (aISOFecha(f) > tope) break;
      if (!registrar(aISOFecha(f))) return fechas;
    }
  } else if (regla.freq === "YEARLY") {
    for (let i = 0; i < TECHO; i++) {
      const f = new Date(inicio);
      f.setFullYear(f.getFullYear() + i * regla.intervalo);
      if (aISOFecha(f) > tope) break;
      if (!registrar(aISOFecha(f))) return fechas;
    }
  } else {
    return [ev.fecha]; // regla desconocida: al menos la primera fecha
  }
  return fechas;
}

/**
 * Convierte la lista cruda del feed en una lista plana de ocurrencias dentro
 * de la ventana. Marca las repetidas con `recurrente` para que la interfaz no
 * llene la línea de tiempo con dieciséis clases por semana.
 */
export function expandirEventos(eventos, desde, hasta) {
  // Una entrada con RECURRENCE-ID reemplaza esa fecha de su serie.
  const reemplazadas = new Set(
    eventos.filter((e) => e.recurrenciaDe).map((e) => `${e.uid}|${e.recurrenciaDe}`),
  );

  const salida = [];
  for (const ev of eventos) {
    const { rrule, exdates, recurrenciaDe, uid, ...limpio } = ev;
    if (!rrule) {
      if (ev.fecha >= desde && ev.fecha <= hasta) salida.push(limpio);
      continue;
    }
    for (const fecha of fechasDeRepeticion(ev, desde, hasta)) {
      if (reemplazadas.has(`${uid}|${fecha}`)) continue;
      salida.push({ ...limpio, fecha, recurrente: true });
    }
  }
  return salida;
}

/* ── Bloque Neón: quedarse solo con las entregas ────────────────────────── */

// Brightspace publica hasta tres eventos por actividad: cuándo aparece el
// material ("- Disponible"), cuándo se cierra ("- La disponibilidad finaliza")
// y cuándo hay que entregarla ("- Vencimiento"). Solo la última es una fecha
// que ella tenga que cumplir; las otras dos llenarían la línea de tiempo de
// avisos de que un PDF quedó colgado.
const SUFIJO_ENTREGA = /\s*-\s*Vencimiento$/i;

export function soloEntregas(eventos) {
  return eventos
    .filter((e) => SUFIJO_ENTREGA.test(e.titulo || ""))
    .map((e) => ({
      ...e,
      titulo: e.titulo.replace(SUFIJO_ENTREGA, "").trim() || "(sin título)",
      // En este feed LOCATION no es un salón: es el curso de Brightspace
      // ("ELEC EMPRESAS DE FAMILIA"). Va como materiaTexto para que la app lo
      // empareje con la materia y el evento herede su color.
      materiaTexto: e.materiaTexto || e.lugar || null,
      lugar: null,
    }));
}

async function leerFeed(variable, id) {
  const url = process.env[variable].replace(/^webcal:/i, "https:");
  const r = await fetch(url, { headers: { "User-Agent": "mi-semestre/1.0" } });
  if (!r.ok) throw new Error(`El servidor respondió ${r.status}`);
  const texto = await r.text();
  if (!texto.includes("BEGIN:VCALENDAR")) {
    throw new Error("La URL no devolvió un calendario iCalendar. ¿Sigue siendo válido el token?");
  }
  const hoy = new Date();
  const corrido = (dias) => aISOFecha(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + dias, 12));
  // Ventana: un mes atrás para lo recién pasado, y lo que queda del semestre.
  const eventos = expandirEventos(parsearICS(texto), corrido(-30), corrido(210))
    .map((e) => ({ ...e, fuente: id }));
  return id === "bloqueneon" ? soloEntregas(eventos) : eventos;
}

/* ── Main ───────────────────────────────────────────────────────────────── */

const esPrincipal = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (esPrincipal) {
  const salida = { generado: new Date().toISOString(), eventos: [], fuentes: {} };

  for (const feed of FEEDS) {
    if (!process.env[feed.env]) {
      salida.fuentes[feed.id] = { ok: false, error: `Falta el secreto ${feed.env}.` };
      continue;
    }
    try {
      const eventos = await leerFeed(feed.env, feed.id);
      salida.eventos.push(...eventos);
      salida.fuentes[feed.id] = { ok: true, total: eventos.length };
    } catch (e) {
      salida.fuentes[feed.id] = { ok: false, error: e.message };
    }
  }

  salida.eventos.sort((a, b) =>
    (a.fecha + (a.hora || "00:00")).localeCompare(b.fecha + (b.hora || "00:00")),
  );

  writeFileSync(DESTINO, JSON.stringify(salida, null, 1) + "\n");

  for (const [nombre, info] of Object.entries(salida.fuentes)) {
    console.log(info.ok ? `  ok    ${nombre}: ${info.total} eventos` : `  falla ${nombre}: ${info.error}`);
  }
  console.log(`\n${salida.eventos.length} eventos -> datos/agenda.json`);
}
