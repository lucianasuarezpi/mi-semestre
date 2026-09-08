// Pruebas de las piezas delicadas: el parser de iCal, la detección del esquema
// de Notion y el cálculo de notas.  Correr con:  node scripts/probar.mjs
import { parsearICS, detectarCampos, desescapar } from "./sincronizar.mjs";
import { resumenMateria } from "../calculo.js";

let fallos = 0;
const igual = (nombre, obtenido, esperado) => {
  const a = JSON.stringify(obtenido), b = JSON.stringify(esperado);
  if (a === b) { console.log(`  ok    ${nombre}`); return; }
  fallos++;
  console.log(`  FALLA ${nombre}\n        obtuvo:   ${a}\n        esperaba: ${b}`);
};

/* ── iCal ─────────────────────────────────────────────────────────────── */
console.log("\niCal");

// Línea plegada (RFC 5545), escapes, fecha con hora en UTC y fecha suelta.
const ics = [
  "BEGIN:VCALENDAR",
  "BEGIN:VEVENT",
  "DTSTART:20260920T235900Z",
  "SUMMARY:Entrega Taller 2\\, parte final",
  "CATEGORIES:Fundamentos de Analítica Financiera",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART;VALUE=DATE:20261023",
  "SUMMARY:Un título muy largo que el servidor",
  "  parte en dos líneas",
  "DESCRIPTION:Sección 3\; grupo B",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

const ev = parsearICS(ics);
igual("cuenta los eventos", ev.length, 2);
// 23:59 UTC del 20 son las 18:59 en Bogotá, del mismo día.
igual("convierte UTC a Bogotá", [ev[0].fecha, ev[0].hora], ["2026-09-20", "18:59"]);
igual("desescapa la coma", ev[0].titulo, "Entrega Taller 2, parte final");
igual("lee CATEGORIES", ev[0].materiaTexto, "Fundamentos de Analítica Financiera");
igual("fecha sin hora", [ev[1].fecha, ev[1].hora], ["2026-10-23", null]);
igual("une la línea plegada", ev[1].titulo, "Un título muy largo que el servidor parte en dos líneas");
igual("desescapa el punto y coma", ev[1].descripcion, "Sección 3; grupo B");
igual("iCal vacío no revienta", parsearICS("BEGIN:VCALENDAR\r\nEND:VCALENDAR").length, 0);
igual("basura no revienta", parsearICS("no soy un calendario").length, 0);

/* ── Esquema de Notion ────────────────────────────────────────────────── */
console.log("\nEsquema de Notion");

igual("detecta por nombre", detectarCampos({
  "Nombre":  { type: "title" },
  "Creado":  { type: "date" },
  "Fecha":   { type: "date" },
  "Materia": { type: "select" },
  "Tipo":    { type: "select" },
  "Estado":  { type: "status" },
}), { fecha: "Fecha", titulo: "Nombre", materia: "Materia", tipo: "Tipo", estado: "Estado", lugar: null });

// Sin nombres reconocibles, cae en la primera propiedad de cada tipo.
igual("cae en la primera si no reconoce", detectarCampos({
  "Título": { type: "title" },
  "Cuándo": { type: "date" },
}), { fecha: "Cuándo", titulo: "Título", materia: null, tipo: null, estado: null, lugar: null });

igual("sin fecha devuelve null", detectarCampos({ "T": { type: "title" } }).fecha, null);

/* ── Cálculo de notas ─────────────────────────────────────────────────── */
console.log("\nCálculo de notas");

const fisica = [
  { rubro: "Eval 1", peso: 11.25 }, { rubro: "Eval 2", peso: 11.25 },
  { rubro: "Eval 3", peso: 11.25 }, { rubro: "Eval 4", peso: 11.25 },
  { rubro: "Final", peso: 25 }, { rubro: "Lab", peso: 15 }, { rubro: "Compl", peso: 15 },
];

const aMedias = resumenMateria(fisica, { "Eval 1": 4.2, "Eval 2": 3.8, "Lab": 4.5 });
igual("suma el peso calificado", aMedias.pesoCalificado, 37.5);
// (4.2·11.25 + 3.8·11.25 + 4.5·15) / 37.5 = 4.2
igual("promedio ponderado", aMedias.promedio, 4.2);
// Para cerrar en 4.0: (400 − 157.5) / 62.5 = 3.88
igual("qué necesita para 4.0", aMedias.necesitaPara(4.0), 3.88);
igual("4.0 es alcanzable", aMedias.necesitaPara(4.0) <= 5, true);
igual("5.0 es inalcanzable", aMedias.necesitaPara(5.0) > 5, true);

const vacia = resumenMateria(fisica, {});
igual("sin notas: promedio null", vacia.promedio, null);
igual("sin notas: 3.0 necesita 3.0", vacia.necesitaPara(3.0), 3.0);

const completa = resumenMateria(
  [{ rubro: "A", peso: 50 }, { rubro: "B", peso: 50 }],
  { A: 4.0, B: 3.0 },
);
igual("curso completo: definitiva", completa.promedio, 3.5);
igual("curso completo: nada por calificar", completa.pesoRestante, 0);
// Ya no queda nada por calificar: no hay división por cero, devuelve null.
igual("curso completo: necesitaPara es null", completa.necesitaPara(4.0), null);

const bono = resumenMateria(
  [{ rubro: "A", peso: 100 }, { rubro: "Bono", peso: 5, bono: true }],
  { A: 3.0 },
);
igual("los bonos no cuentan en el peso", bono.pesoCalificado, 100);

console.log(fallos ? `\n${fallos} prueba(s) fallando\n` : "\nTodas las pruebas pasan\n");
process.exit(fallos ? 1 : 0);
