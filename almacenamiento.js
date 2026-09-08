// Única pieza que sabe DÓNDE viven las notas. Hoy es localStorage; si algún día
// se muda a una base de datos, se reescribe este archivo y nada más.
//
// Advertencia real: iOS borra el almacenamiento del navegador tras 7 días sin
// abrir el sitio. Las apps añadidas a la pantalla de inicio llevan su propio
// contador y se salvan mientras se usen — por eso la app insiste en instalarse
// y en que exista un respaldo.

const CLAVE = "mi-semestre:v1";
const VACIO = { notas: {}, hechas: {}, meta: { ultimoRespaldo: null, cambiosDesdeRespaldo: 0 } };

function leer() {
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (!crudo) return structuredClone(VACIO);
    const d = JSON.parse(crudo);
    return {
      notas: d.notas || {},
      hechas: d.hechas || {},
      meta: { ...VACIO.meta, ...(d.meta || {}) },
    };
  } catch {
    // Modo privado, almacenamiento lleno o datos corruptos: seguimos en memoria.
    return structuredClone(VACIO);
  }
}

let estado = leer();
let disponible = true;

function escribir() {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(estado));
    disponible = true;
  } catch {
    disponible = false; // Se lo decimos a la interfaz, no lo escondemos.
  }
  return disponible;
}

/** ¿Se pudo escribir la última vez? Si no, la app lo advierte. */
export const hayAlmacenamiento = () => disponible;

/* ── Notas ──────────────────────────────────────────────────────────────── */

export const notasDe = (materiaId) => estado.notas[materiaId] || {};

/** `nota` en null borra el registro. */
export function guardarNota(materiaId, rubro, nota) {
  const previa = estado.notas[materiaId]?.[rubro] ?? null;
  if (previa === nota) return true;

  if (nota == null) {
    if (estado.notas[materiaId]) delete estado.notas[materiaId][rubro];
  } else {
    (estado.notas[materiaId] ||= {})[rubro] = nota;
  }
  estado.meta.cambiosDesdeRespaldo++;
  return escribir();
}

/* ── Entregas marcadas ──────────────────────────────────────────────────── */

export const estaHecha = (clave) => Boolean(estado.hechas[clave]);

export function marcar(clave, hecha) {
  if (hecha) estado.hechas[clave] = new Date().toISOString();
  else delete estado.hechas[clave];
  estado.meta.cambiosDesdeRespaldo++;
  return escribir();
}

/**
 * Identificador estable de un evento. No puede depender del orden de las
 * fuentes ni del índice en la lista: si Notion reordena, la marca se perdería.
 */
export function claveEvento(ev) {
  return [ev.fuente || "syllabus", ev.materiaId || ev.materiaTexto || "", ev.fecha, ev.titulo]
    .join("|")
    .replace(/\s+/g, " ");
}

/* ── Respaldo ───────────────────────────────────────────────────────────── */

export const respaldoPendiente = () => estado.meta.cambiosDesdeRespaldo;
export const ultimoRespaldo = () => estado.meta.ultimoRespaldo;

export function exportar() {
  const paquete = {
    _formato: "mi-semestre/respaldo",
    _version: 1,
    exportado: new Date().toISOString(),
    notas: estado.notas,
    hechas: estado.hechas,
  };
  estado.meta.ultimoRespaldo = paquete.exportado;
  estado.meta.cambiosDesdeRespaldo = 0;
  escribir();
  return JSON.stringify(paquete, null, 1);
}

/** Fusiona un respaldo con lo que ya hay; lo del archivo gana en caso de choque. */
export function importar(textoJson) {
  const d = JSON.parse(textoJson);
  if (d._formato !== "mi-semestre/respaldo") {
    throw new Error("Ese archivo no es un respaldo de esta app.");
  }
  let notas = 0;
  for (const [materia, rubros] of Object.entries(d.notas || {})) {
    for (const [rubro, valor] of Object.entries(rubros)) {
      (estado.notas[materia] ||= {})[rubro] = valor;
      notas++;
    }
  }
  const hechas = Object.keys(d.hechas || {}).length;
  Object.assign(estado.hechas, d.hechas || {});
  escribir();
  return { notas, hechas };
}

export function borrarTodo() {
  estado = structuredClone(VACIO);
  escribir();
}
