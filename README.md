# Mi semestre

Dashboard de materias, entregas, parciales y notas. Se instala en el celular
como app y se sincroniza sola.

Sin servidor y sin base de datos: GitHub Pages sirve el sitio, una GitHub Action
consulta Notion y Bloque Neón una vez por hora, y las notas viven en el
navegador del celular.

```
   GitHub Action (cada hora)
      │  lee los secretos: NOTION_TOKEN, NOTION_DB_ID, BLOQUENEON_ICS_URL
      ▼
   datos/agenda.json ─────────────────▶ GitHub Pages
                                              │
                              tu celular ◀────┘
                              (las notas se guardan aquí)
```

El token de Notion vive **solo en GitHub Secrets**. Nunca entra al repo ni al
sitio publicado.

## Puesta en marcha

### 1 · Subir el repo

```bash
cd ~/Proyectos/mi-semestre
git remote add origin https://github.com/TU-USUARIO/mi-semestre.git
git push -u origin main
```

El repo tiene que ser **público**: GitHub Pages solo es gratis así. En repos
privados hace falta GitHub Pro.

### 2 · Activar Pages

En el repo → **Settings → Pages → Source: GitHub Actions**.

No escojas «Deploy from a branch»: el workflow publica explícitamente, porque
los commits hechos por la Action no disparan de forma fiable la reconstrucción
automática.

### 3 · Conectar Notion

1. **notion.so/my-integrations** → *New integration*.
2. Nombre: `Mi semestre`. En *Capabilities* deja solo **Read content** — la app
   nunca necesita escribir en tu Notion.
3. Copia el **Internal Integration Secret**.
4. Abre tu base de calendario en Notion → menú `⋯` → **Connections** → conecta
   `Mi semestre`. **Sin este paso la integración no ve nada.**
5. El id de la base son los 32 caracteres del link, antes del `?`:

   ```
   notion.so/tuespacio/28f1a4b7c9d34e5f8a0b1c2d3e4f5678?v=...
                       └──────── NOTION_DB_ID ────────┘
   ```

No hace falta que las columnas se llamen de ninguna forma en particular: el
script lee el esquema de la base y detecta solo cuál es la fecha, cuál el
título y cuál la materia.

### 4 · Conectar tu calendario de clases

Tus clases viven en tu cuenta de calendario, no en Notion (Notion Calendar solo
las muestra). Google Calendar da una URL privada en formato iCal que no depende
de tu sesión:

Google Calendar → engranaje de **Configuración** → en *Configuración de mis
calendarios*, el calendario de las clases → **Integrar calendario** → copia
**Dirección secreta en formato iCal**.

```
https://calendar.google.com/calendar/ical/.../private-XXXXXXXX/basic.ics
```

Va en el secreto `CLASES_ICS_URL`. Es una contraseña: si se filtra, en esa misma
pantalla hay un botón *Restablecer*.

> En cuentas de Google Workspace (las institucionales) el administrador puede
> tener esa opción desactivada, y entonces no aparece.

Cuando este feed trae eventos, la app deja de dibujar los horarios fijos de
`semestre.json` y usa el calendario real, para que las clases no salgan dos veces.

### 5 · Conectar Bloque Neón (opcional)

Bloque Neón no tiene API para estudiantes, pero sí un feed de calendario con
token propio que **no depende de tu sesión web**:

Bloque Neón → **Calendario** → **Configuración** → marca **Enable Calendar
Feeds** → guarda → botón **Subscribe** → escoge *All Calendars* → copia la URL.

> Si el botón *Subscribe* no aparece, Uniandes tiene los feeds desactivados a
> nivel de institución y no se puede habilitar desde tu cuenta. La app funciona
> igual, solo sin esa fuente.

Ese token da acceso de lectura a tu calendario: trátalo como una contraseña.

### 6 · Cargar los secretos

Repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Nombre | Valor |
|---|---|
| `NOTION_TOKEN` | el Internal Integration Secret |
| `NOTION_DB_ID` | los 32 caracteres del link |
| `CLASES_ICS_URL` | la dirección secreta iCal de tu calendario de clases |
| `BLOQUENEON_ICS_URL` | la URL del feed de Bloque Neón (si la conseguiste) |

Luego, en la pestaña **Actions**, corre *Sincronizar y publicar* a mano la
primera vez.

### 7 · Instalarla en el celular

Abre la URL en Safari y usa **Compartir → Añadir a pantalla de inicio**.

**Esto no es opcional.** iOS borra el almacenamiento del navegador tras 7 días
sin abrir un sitio; las apps de la pantalla de inicio llevan su propio contador
y se salvan mientras las uses. Como pestaña suelta de Safari, tus notas se
pueden perder.

## Tus notas

Viven en el navegador de ese aparato. No se sincronizan entre el celular y el
computador, y desaparecen si borras los datos del sitio.

Por eso hay respaldo: en **Pendientes → Descargar respaldo** bajas un archivo
con todas tus notas, y con **Restaurar desde archivo** las devuelves. La app te
avisa cuando lleves varios cambios sin respaldar.

Si algún día quieres que las notas te sigan entre aparatos, hay que cambiar
`almacenamiento.js` por algo con servidor. Es el único archivo que sabe dónde
se guardan las cosas; el resto de la app no se entera.

## Mantenimiento

**Cuando cambie un syllabus** (una fecha que corrieron, un porcentaje): edita
`datos/semestre.json` y haz push. Cada materia tiene `evaluacion` (los rubros
con su peso, que deben sumar 100) y `eventos` (las fechas). Un evento con
`rubro` queda enlazado a esa casilla de nota.

Los tipos de evento que la interfaz reconoce: `parcial`, `final`, `entrega`,
`presentacion`, `publicacion`, `bono`, `clase`. Los cuatro primeros salen con
casilla para marcarlos como hechos.

**Para el semestre siguiente:** cambia `periodo`, `inicio`, `fin` y las
materias. Los colores se asignan por orden, así que las primeras seis materias
toman los seis colores de la paleta.

**Antes de tocar los colores** de `estilos.css`, léete el comentario de arriba
del archivo: el orden está validado contra daltonismo y no es decorativo.

## Verificar cambios

Ver [`pruebas/LEEME.md`](pruebas/LEEME.md).

## Estructura

```
index.html · app.js · estilos.css     la interfaz
calculo.js                            aritmética de notas (sin DOM, testeable)
almacenamiento.js                     lo único que sabe dónde viven las notas
sw.js · manifest.webmanifest          lo que la hace instalable y offline
datos/semestre.json                   los syllabus, a mano
datos/agenda.json                     marcador; la Action lo regenera al publicar
scripts/sincronizar.mjs               Notion + iCal
scripts/probar.mjs                    pruebas de terminal
.github/workflows/sincronizar.yml     el cron y la publicación
```
