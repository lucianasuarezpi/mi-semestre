# Mi semestre — contexto del proyecto

Documento para retomar el proyecto desde cero en un chat nuevo. El `README.md`
es el manual de instalación; esto es el *por qué* de cada decisión.

---

## Qué es

Un dashboard personal de la universidad para **Luciana Suárez Piedrahita**,
estudiante de Ingeniería Industrial en la Universidad de los Andes (Bogotá),
tercer semestre, periodo **2026-20** (3 de agosto – 5 de diciembre de 2026).

Lo que quiere: abrirlo **desde el celular**, que **se sincronice solo**, ver sus
clases y entregas en un solo lugar, y **llevar la cuenta de sus notas**.

**En línea:** https://lucianasuarezpi.github.io/mi-semestre/
**Repo:** https://github.com/lucianasuarezpi/mi-semestre (público)
**Local:** `~/Proyectos/mi-semestre`

## Estado: funcionando

- Publicado en GitHub Pages, instalable en el celular como app.
- Sincroniza cada hora (minuto 17) por GitHub Actions.
- **303 eventos** entrando desde su Google Calendar: 8 materias con sus
  complementarias y laboratorios, más entregas y quices que ella anota.
- Registro de notas funcionando, con respaldo descargable.
- 37 pruebas en terminal + 17 en navegador, todas pasando.

---

## Tres caminos cerrados por investigación

No volver a proponerlos: ya se descartaron con evidencia.

### 1. Bloque Neón no se puede conectar por API

Bloque Neón es la instalación de **D2L Brightspace** de Uniandes. Registrar una
app OAuth exige el permiso *Can Manage API Applications*, que es **de
administrador**. Un estudiante no se puede autorregistrar.

**La app Pulse no tiene API pública** — lo confirma la propia comunidad de D2L.
Pulse no es un servicio: es otro cliente más de la misma API Valence, y lo que
la mantiene con sesión es un *refresh token* de vida larga, no algo especial.

Queda la vía de extraer el `client_id`/`secret` del binario de Pulse. **Se
descartó a propósito**: viola los términos de D2L y el reglamento de la
universidad, se rompe cuando roten credenciales, y le puede marcar la cuenta.

Lo único aprovechable de Bloque Neón es el **feed iCal del calendario**, cuyo
token va en la URL y por eso no caduca con la sesión web. Sigue pendiente
comprobar si Uniandes lo tiene habilitado.

### 2. Las notas no se pueden traer solas

El *Export* de calificaciones de Brightspace vive en la página *Enter Grades*,
que es **la vista del profesor**. Como estudiante no hay exportación ni API.

Por eso se entran a mano — pero todo lo que se deriva de ellas sí es
automático: promedio ponderado, porcentaje ya calificado, y qué necesita en lo
que falta para cerrar en un objetivo.

### 3. Sus clases NO están en Notion

Esto costó varias vueltas. Ella creía que su horario estaba en Notion porque lo
veía en **Notion Calendar** — pero esa app es solo un *visor* que junta
calendarios externos con bases de Notion.

Sus clases están en **Google Calendar** (`lusuarezpi2007@gmail.com`).

Las páginas «Álgebra lineal 1 @Next Monday 11:00 AM» que aparecían en Notion
**las genera Notion solo**, una por sesión de clase, colgando del workspace sin
base de datos padre. Se verificó por API: 15 páginas sueltas, todas con
`parent: workspace`. No hay nada que conectar «de una vez para siempre», y
conectarlas a mano sería trabajo eterno para una semana de horario.

La ruta buena fue la **dirección secreta iCal** de Google Calendar.

---

## Arquitectura

Sin servidor, sin base de datos, sin autenticación.

```
   GitHub Action (cada hora, minuto :17)
      │  lee los secretos desde GitHub Secrets
      │  consulta los feeds iCal
      ▼
   datos/agenda.json ─────────▶ GitHub Pages
                                     │
                     su celular ◀────┘
                     (las notas se guardan aquí)
```

| Pieza | Elección | Por qué |
|---|---|---|
| Frontend | HTML + CSS + JS puro, módulos ES | Sin framework, sin build, **cero dependencias npm**. Son 6 materias y 4 vistas; React solo añadiría pipeline. |
| Sincronización | GitHub Action + Node sin dependencias | Único sitio donde los tokens están seguros sin montar servidor. |
| Almacenamiento | `localStorage` | Ella eligió esto sabiendo que las notas no siguen entre aparatos. |
| Hosting | GitHub Pages, repo **público** | Gratis solo así; en privado cuesta GitHub Pro. |
| Autenticación | **Ninguna** | Decisión suya, explícita: «es una herramienta solo para mí, no me importa que la gente entre». No volver a proponerla. |

Costo total: **$0**.

## Estructura

```
~/Proyectos/mi-semestre/
├── index.html · app.js · estilos.css   la interfaz
├── calculo.js                          aritmética de notas (sin DOM, testeable)
├── almacenamiento.js                   ÚNICA pieza que sabe dónde viven los datos
├── sw.js · manifest.webmanifest         instalable y offline
├── iconos/
├── datos/
│   ├── semestre.json                   los syllabus, a mano
│   └── agenda.json                     marcador; la Action lo regenera al publicar
├── scripts/
│   ├── sincronizar.mjs                 feeds iCal + Notion
│   └── probar.mjs                      pruebas de terminal
├── pruebas/                            banco de pruebas visual + LEEME
└── .github/workflows/sincronizar.yml
```

## Los datos

**`datos/semestre.json`** — extraído a mano de los seis programas. Profesores,
correos, salones, horarios, y `evaluacion` con los rubros y sus pesos (suman
100; los `bono: true` no cuentan). Los `eventos` con `rubro` quedan enlazados a
su casilla de nota.

Materias: Cálculo Integral (MATE-1214), Álgebra Lineal (MATE-1105), Física 1
(FISI-1518), Fundamentos de Analítica Financiera, Diseño en Ingeniería
Industrial, Empresas de Familia (ADMI-3138).

**`datos/agenda.json`** — lo genera la Action. Trae `eventos` y `fuentes` (el
estado de cada fuente, con su error si falló).

**`localStorage`** — las notas y las entregas marcadas. Nada más.

## Las cuatro vistas

1. **Lo que viene** — indicadores y línea de tiempo con casillas.
2. **Calendario** — semanal, con las clases por hora y la línea de «ahora».
3. **Materias** — datos del curso y el registro de notas.
4. **Pendientes** — lista marcable y los botones de respaldo.

---

## Cosas que hay que saber antes de tocar el código

**Los colores de materia están validados contra daltonismo** en modo claro y
oscuro. El *orden* de la paleta es el mecanismo de seguridad, no decoración. No
cambiarlos sin volver a validar (hay un verificador en la skill `dataviz`).

**Las repeticiones del calendario hay que expandirlas.** El feed manda una clase
semanal como UN evento con `RRULE`, no como 16. `scripts/sincronizar.mjs` tiene
el expansor: soporta FREQ semanal/diaria/mensual/anual, INTERVAL, BYDAY, UNTIL,
COUNT, más `EXDATE` (clases canceladas) y `RECURRENCE-ID` (clases movidas).

Las ocurrencias van marcadas `recurrente: true` y **no** salen en la línea de
tiempo: si no, dieciséis clases por semana taparían las entregas reales. Solo
aparecen en el calendario.

**Chrome headless fuerza un viewport mínimo de 500 px.** Para ver el layout
móvil de verdad hay que usar `pruebas/banco.html`, que mete la app en un iframe
de 390 px y reporta si algo se desborda. Sin ese truco las capturas engañan.

**iOS borra el `localStorage` tras 7 días sin abrir el sitio.** Las apps de la
pantalla de inicio llevan su propio contador y se salvan mientras se usen. Por
eso la app insiste en instalarse y por eso existe el respaldo descargable.

**`~/Desktop/U` NO es un repositorio git, y así debe seguir.** Es su carpeta de
documentos: 483 archivos, incluidos los libros de Stewart y Sears–Zemansky, con
derechos de autor. El proyecto vive fuera justamente para que no puedan subirse
por error. Si VS Code ofrece *Initialize Repository* ahí, no aceptar.

**Rutas siempre relativas** (`./estilos.css`). GitHub Pages sirve el sitio bajo
`/mi-semestre/`, no en la raíz del dominio.

**Hay duplicación de fechas a propósito.** Las entregas aparecen dos veces, una
desde el syllabus y otra desde su calendario («Examen Parcial 1» y «Parcial 1
Algebra !!!!»). Se dejó así porque confirma que las fuentes coinciden. Ella sabe;
si estorba, se pueden fusionar por fecha + materia + tipo.

## Cómo verificar

```bash
node scripts/probar.mjs          # iCal, repeticiones, esquema de Notion, notas
python3 -m http.server 8080      # y abrir pruebas/banco.html y pruebas/almacenamiento.html
```

Ver `pruebas/LEEME.md`. Las pruebas de terminal también corren en la Action
antes de cada publicación.

## Secretos

En **GitHub → Settings → Secrets and variables → Actions**, y en `.env` local
(ignorado por git).

| Secreto | Estado |
|---|---|
| `CLASES_ICS_URL` | cargado — dirección secreta iCal de su Google Calendar |
| `NOTION_TOKEN` / `NOTION_DB_ID` | sin cargar; el código está listo pero apagado |
| `BLOQUENEON_ICS_URL` | sin cargar; falta ver si Uniandes lo permite |

## Pendientes

- [ ] Que ella **instale la app en la pantalla de inicio** del iPhone. No es
      opcional: de eso depende que no se le borren las notas.
- [ ] Ver si en Bloque Neón aparece *Calendario → Configuración → Enable
      Calendar Feeds → Subscribe*. Si no aparece, esa fuente no va.
- [ ] **Regenerar el token de Notion y la dirección iCal**: ambos quedaron
      escritos en el chat del 8 de septiembre de 2026.
- [ ] Iteración de diseño — quedó a medias cuando se cambió de chat.
- [ ] Decidir si se quita el soporte de Notion (hoy está apagado) o se usa para
      alguna de sus bases.

## Cómo trabajar con ella

**Presentar el plan antes de construir.** Ya hubo un reclamo justo por esto:
se escribió código sin exponer antes el lenguaje, dónde vivirían las cosas, cómo
se lanzaría ni si habría base de datos. Terminamos borrando todo y empezando de
nuevo. Nombrar explícitamente las decisiones que cierran puertas.

**Ella decide sobre sus datos.** Ya dijo que no quiere autenticación y que las
notas en un solo aparato le sirven. Son decisiones tomadas, no dudas abiertas.

Habla español; el código, los comentarios y los commits van en español.
