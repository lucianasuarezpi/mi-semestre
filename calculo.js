// Aritmética de notas. Sin DOM y sin estado: lo usan igual el navegador y las
// pruebas. Escala Uniandes 1.5–5.0, aprueba en 3.0.

export const ESCALA = { min: 1.5, max: 5.0, aprueba: 3.0 };

const dosDecimales = (n) => Math.round(n * 100) / 100;

/** Redondeo a la décima, como reporta la universidad. */
export const aDecima = (n) => (n == null ? null : Math.round(n * 10) / 10);

/**
 * @param evaluacion  [{ rubro, peso, bono? }]  — los pesos suman 100; los bonos no cuentan
 * @param notas       { [rubro]: number }       — solo los rubros ya calificados
 */
export function resumenMateria(evaluacion, notas = {}) {
  const items = evaluacion.filter((e) => !e.bono);

  let pesoCalificado = 0;
  let puntos = 0; // Σ nota × peso
  const filas = items.map((e) => {
    const nota = typeof notas[e.rubro] === "number" ? notas[e.rubro] : null;
    if (nota != null) {
      pesoCalificado += e.peso;
      puntos += nota * e.peso;
    }
    return { ...e, nota };
  });

  pesoCalificado = dosDecimales(pesoCalificado);
  const pesoTotal = dosDecimales(items.reduce((a, e) => a + e.peso, 0));
  const pesoRestante = dosDecimales(pesoTotal - pesoCalificado);

  const promedio = pesoCalificado > 0 ? dosDecimales(puntos / pesoCalificado) : null;

  return {
    filas,
    pesoTotal,
    pesoCalificado,
    pesoRestante,
    porcentajeCalificado: pesoTotal > 0 ? dosDecimales((pesoCalificado / pesoTotal) * 100) : 0,

    /** Promedio sobre lo ya calificado. null si todavía no hay notas. */
    promedio,

    /** La definitiva, solo cuando ya no queda nada por calificar. */
    definitiva: pesoRestante === 0 && pesoCalificado > 0 ? promedio : null,

    /**
     * Qué nota promedio necesita en lo que falta para cerrar en `objetivo`.
     * null cuando ya no queda nada por calificar (evita dividir por cero).
     * Puede dar > 5 (inalcanzable) o < 1.5 (ya está asegurado): quien llame
     * decide cómo mostrarlo.
     */
    necesitaPara(objetivo) {
      if (pesoRestante <= 0) return null;
      return dosDecimales((objetivo * pesoTotal - puntos) / pesoRestante);
    },

    /** Si el resto le sale igual a como va, ¿en cuánto cierra? */
    get proyeccion() {
      return promedio;
    },
  };
}

/** Cómo mostrar el resultado de necesitaPara. */
export function leerObjetivo(necesita) {
  if (necesita == null) return { estado: "cerrado", texto: "El curso ya está calificado" };
  if (necesita > ESCALA.max) return { estado: "imposible", texto: `Necesitarías ${necesita}, y el máximo es ${ESCALA.max}` };
  if (necesita <= ESCALA.min) return { estado: "asegurado", texto: "Ya lo tienes asegurado" };
  return { estado: "posible", texto: `Necesitas ${necesita} en lo que falta` };
}
