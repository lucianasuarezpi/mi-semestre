// Trae el calendario de Notion y el feed iCal de Bloque Neón, y los escribe en
// datos/agenda.json. Corre en GitHub Actions una vez por hora; los secretos
// vienen de GitHub Secrets y nunca entran al repo.
//
// Regla de oro: este script SIEMPRE escribe un agenda.json válido. Si una
// fuente falla, lo anota en "fuentes" y sigue. El sitio nunca se rompe porque
// Notion esté caído.
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

const NOTION_VERSION = process.env.NOTION_VERSION || "2022-06-28";

/* ── Notion ─────────────────────────────────────────────────────────────── */

async function notion(ruta, opciones = {}) {
  const r = await fetch(`https://api.notion.com/v1${ruta}`, {
    ...opciones,
    headers: {
      Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...opciones.headers,
    },
  });
  const cuerpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Notion ${r.status}: ${cuerpo.message || r.statusText}`);
  return cuerpo;
}

// No damos por hecho cómo se llaman sus columnas: leemos el esquema y deducimos
// cuál es la fecha, cuál el título y cuál la materia.
export function detectarCampos(propiedades) {
  const deTipo = (...tipos) =>
    Object.entries(propiedades).filter(([, p]) => tipos.includes(p.type)).map(([n]) => n);

  const preferida = (lista, palabras) =>
    lista.find((n) => palabras.some((p) => n.toLowerCase().includes(p))) || lista[0] || null;

  const fechas = deTipo("date");
  const categorias = deTipo("select", "multi_select", "relation");
  const materia = preferida(categorias, ["materia", "curso", "clase", "course", "asignatura", "subject"]);

  return {
    fecha: preferida(fechas, ["fecha", "date", "entrega", "cuándo", "cuando", "día", "dia"]),
    titulo: deTipo("title")[0] || null,
    materia,
    tipo: preferida(categorias.filter((n) => n !== materia), ["tipo", "categoría", "categoria", "type"]),
    estado: deTipo("status", "checkbox")[0] || null,
    lugar: preferida(deTipo("rich_text"), ["salón", "salon", "lugar", "aula", "sitio"]),
  };
}

function texto(prop) {
  if (!prop) return null;
  switch (prop.type) {
    case "title":
    case "rich_text":
      return prop[prop.type].map((t) => t.plain_text).join("").trim() || null;
    case "select":   return prop.select?.name || null;
    case "status":   return prop.status?.name || null;
    case "multi_select": return prop.multi_select.map((s) => s.name).join(", ") || null;
    case "checkbox": return prop.checkbox ? "Hecho" : null;
    case "formula":  return prop.formula?.string ?? prop.formula?.number?.toString() ?? null;
    default:         return null;
  }
}

const parteFecha = (iso) => (iso ? iso.slice(0, 10) : null);
const parteHora = (iso) => (iso && iso.length > 10 ? iso.slice(11, 16) : null);

async function leerNotion() {
  const dbId = (process.env.NOTION_DB_ID || "").replace(/-/g, "");
  const db = await notion(`/databases/${dbId}`);
  const campos = detectarCampos(db.properties);
  if (!campos.fecha) throw new Error("La base de Notion no tiene ninguna propiedad de tipo fecha.");

  const eventos = [];
  let cursor;
  do {
    const pagina = await notion(`/databases/${dbId}/query`, {
      method: "POST",
      body: JSON.stringify({
        page_size: 100,
        start_cursor: cursor,
        sorts: [{ property: campos.fecha, direction: "ascending" }],
      }),
    });

    for (const fila of pagina.results) {
      const f = fila.properties[campos.fecha]?.date;
      if (!f?.start) continue;
      eventos.push({
        fuente: "notion",
        titulo: texto(fila.properties[campos.titulo]) || "(sin título)",
        fecha: parteFecha(f.start),
        hora: parteHora(f.start),
        horaFin: parteHora(f.end),
        fechaFin: f.end ? parteFecha(f.end) : null,
        materiaTexto: campos.materia ? texto(fila.properties[campos.materia]) : null,
        tipoTexto: campos.tipo ? texto(fila.properties[campos.tipo]) : null,
        estado: campos.estado ? texto(fila.properties[campos.estado]) : null,
        lugar: campos.lugar ? texto(fila.properties[campos.lugar]) : null,
      });
    }
    cursor = pagina.has_more ? pagina.next_cursor : null;
  } while (cursor);

  return { eventos, campos };
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

async function leerFeed(variable, id) {
  const url = process.env[variable].replace(/^webcal:/i, "https:");
  const r = await fetch(url, { headers: { "User-Agent": "mi-semestre/1.0" } });
  if (!r.ok) throw new Error(`El servidor respondió ${r.status}`);
  const texto = await r.text();
  if (!texto.includes("BEGIN:VCALENDAR")) {
    throw new Error("La URL no devolvió un calendario iCalendar. ¿Sigue siendo válido el token?");
  }
  return parsearICS(texto).map((e) => ({ ...e, fuente: id }));
}

/* ── Main ───────────────────────────────────────────────────────────────── */

const esPrincipal = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (esPrincipal) {
  const salida = { generado: new Date().toISOString(), eventos: [], fuentes: {} };

  if (process.env.NOTION_TOKEN && process.env.NOTION_DB_ID) {
    try {
      const { eventos, campos } = await leerNotion();
      salida.eventos.push(...eventos);
      salida.fuentes.notion = { ok: true, total: eventos.length, campos };
    } catch (e) {
      salida.fuentes.notion = { ok: false, error: e.message };
    }
  } else {
    salida.fuentes.notion = { ok: false, error: "Faltan los secretos NOTION_TOKEN o NOTION_DB_ID." };
  }

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
