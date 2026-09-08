# Cómo verificar cambios

Levanta el sitio y abre estas dos páginas:

```bash
cd ~/Proyectos/mi-semestre
python3 -m http.server 8791
```

- **`banco.html`** — muestra la app dentro de un iframe de 390 px y reporta si
  algo se desborda del ancho. Hace falta porque **Chrome headless fuerza un
  viewport mínimo de 500 px**: sin el iframe nunca ves el layout móvil de verdad.
  Parámetros: `?vista=hoy|calendario|materias|pendientes`, `&tema=claro|oscuro`,
  `&notas=demo` para sembrar notas de ejemplo.

  ```
  http://localhost:8791/pruebas/banco.html?vista=materias&notas=demo
  ```

  Lo que debe decir arriba: `docScroll` igual a `viewport`, y
  «sin desbordamiento».

- **`almacenamiento.html`** — pruebas del guardado, el respaldo y la
  restauración. Deben pasar todas.

Y desde la terminal, las pruebas del parser de iCal y del cálculo de notas:

```bash
node scripts/probar.mjs
```

Estas últimas también corren solas en GitHub Actions antes de cada publicación.
