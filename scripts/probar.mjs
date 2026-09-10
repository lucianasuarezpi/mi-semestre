// Pruebas de las piezas delicadas: el parser de iCal, la expansión de
// repeticiones y el cálculo de notas.  Correr con:  node scripts/probar.mjs
import { parsearICS, desescapar, parsearRRULE, fechasDeRepeticion, expandirEventos, soloEntregas } from "./sincronizar.mjs";
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

/* ── Bloque Neón: solo las entregas ───────────────────────────────────── */
console.log("\nBloque Neón");

const brutosNeon = [
  { titulo: "Entrega 1: Cultura - Vencimiento", lugar: "ELEC EMPRESAS DE FAMILIA", fecha: "2026-09-16" },
  { titulo: "Taller 1 - Rúbrica - Disponible", lugar: "FUNDAMENTOS DE ANALÍTICA FINANCIERA", fecha: "2026-08-18" },
  { titulo: "Parcial 1 - La disponibilidad finaliza", lugar: "PRECÁLCULO", fecha: "2026-09-01" },
];
const entregasNeon = soloEntregas(brutosNeon);

igual("descarta lo que no es entrega", entregasNeon.length, 1);
igual("le quita el sufijo al título", entregasNeon[0].titulo, "Entrega 1: Cultura");
igual("el curso pasa a materiaTexto", entregasNeon[0].materiaTexto, "ELEC EMPRESAS DE FAMILIA");
igual("el curso no queda como salón", entregasNeon[0].lugar, null);
igual("no pierde la fecha", entregasNeon[0].fecha, "2026-09-16");
igual("lista vacía no revienta", soloEntregas([]).length, 0);
igual("evento sin título no revienta", soloEntregas([{ fecha: "2026-01-01" }]).length, 0);

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

/* ── Repeticiones ─────────────────────────────────────────────────────── */
console.log("\nRepeticiones");

// El caso real: Álgebra lineal, lunes/jueves/viernes hasta el 29 de noviembre.
const algebra = {
  fecha: "2026-08-03", titulo: "Álgebra lineal 1",
  rrule: "FREQ=WEEKLY;UNTIL=20261129T045959Z;INTERVAL=1;BYDAY=MO,TH,FR",
};
igual("lee la regla", parsearRRULE(algebra.rrule),
      { freq: "WEEKLY", intervalo: 1, dias: [1, 4, 5], hasta: "2026-11-29", cuenta: null });

const sem1 = fechasDeRepeticion(algebra, "2026-08-03", "2026-08-09");
igual("primera semana: lun, jue y vie", sem1, ["2026-08-03", "2026-08-06", "2026-08-07"]);

// No debe generar nada antes del arranque ni después del UNTIL.
igual("no se pasa del UNTIL",
      fechasDeRepeticion(algebra, "2026-11-25", "2027-03-01"),
      ["2026-11-26", "2026-11-27"]);
igual("no genera antes de empezar", fechasDeRepeticion(algebra, "2026-07-01", "2026-08-02"), []);

// Un semestre entero: 17 semanas × 3 días, menos los que caen tras el UNTIL.
const todas = fechasDeRepeticion(algebra, "2026-01-01", "2027-01-01");
igual("todas caen en lun/jue/vie",
      [...new Set(todas.map((f) => new Date(f + "T12:00").getDay()))].sort(), [1, 4, 5]);
igual("van en orden", todas.join() === [...todas].sort().join(), true);

// EXDATE: una clase cancelada desaparece.
const conFestivo = { ...algebra, exdates: ["2026-08-07"] };
igual("EXDATE quita la fecha",
      fechasDeRepeticion(conFestivo, "2026-08-03", "2026-08-09"), ["2026-08-03", "2026-08-06"]);

igual("COUNT limita",
      fechasDeRepeticion({ fecha: "2026-08-04", rrule: "FREQ=WEEKLY;COUNT=3;BYDAY=TU" }, "2026-01-01", "2027-01-01"),
      ["2026-08-04", "2026-08-11", "2026-08-18"]);

igual("cada dos semanas",
      fechasDeRepeticion({ fecha: "2026-08-03", rrule: "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO" }, "2026-08-01", "2026-09-01"),
      ["2026-08-03", "2026-08-17", "2026-08-31"]);

igual("cumpleaños anual",
      fechasDeRepeticion({ fecha: "2026-09-20", rrule: "FREQ=YEARLY" }, "2026-01-01", "2028-01-01"),
      ["2026-09-20", "2027-09-20"]);

igual("regla desconocida no revienta",
      fechasDeRepeticion({ fecha: "2026-08-03", rrule: "FREQ=HOURLY" }, "2026-01-01", "2027-01-01"),
      ["2026-08-03"]);

console.log("\nExpansión completa");
const crudos = [
  { uid: "a", fecha: "2026-08-03", hora: "11:00", titulo: "Álgebra", rrule: "FREQ=WEEKLY;BYDAY=MO", exdates: null, recurrenciaDe: null },
  { uid: "b", fecha: "2026-08-05", titulo: "Parcial", rrule: null, exdates: null, recurrenciaDe: null },
  // Esta reemplaza la ocurrencia del 10 de agosto de la serie "a".
  { uid: "a", fecha: "2026-08-10", hora: "15:00", titulo: "Álgebra (movida)", rrule: null, exdates: null, recurrenciaDe: "2026-08-10" },
];
const exp = expandirEventos(crudos, "2026-08-01", "2026-08-17");
igual("marca las repetidas", exp.filter((e) => e.recurrente).map((e) => e.fecha), ["2026-08-03", "2026-08-17"]);
igual("el evento suelto no se marca", exp.find((e) => e.titulo === "Parcial").recurrente, undefined);
igual("RECURRENCE-ID reemplaza la ocurrencia",
      exp.filter((e) => e.fecha === "2026-08-10").map((e) => e.titulo), ["Álgebra (movida)"]);
igual("no deja pasar campos internos", Object.keys(exp[0]).filter((k) => ["rrule","exdates","uid","recurrenciaDe"].includes(k)), []);

console.log(fallos ? `\n${fallos} prueba(s) fallando\n` : "\nTodas las pruebas pasan\n");
process.exit(fallos ? 1 : 0);
