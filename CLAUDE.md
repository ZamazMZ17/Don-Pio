# Don Pio — contexto del proyecto

Este archivo es la memoria del proyecto. Léelo entero antes de escribir código.
Las decisiones marcadas como **cerradas** ya se discutieron y no se vuelven a abrir
salvo que el dueño del proyecto lo pida.

---

## 1. Qué es

App de control de reparto de pollos para **un solo repartidor** que atiende 50+ tiendas,
de lunes a domingo, y **cobra en el retorno de la misma ruta**.

Registra tres cosas: con cuánto salió, qué entregó en cada tienda, y cuánto cobró.
Al final del día cuadra la caja física contra lo que dice la app.

## 2. El principio rector

**El repartidor casi nunca puede escribir.** Está manejando, cargando pollos o pesando.
Y a las 5 a.m. y en ruta **no hay señal**.

De ahí salen las dos reglas que mandan sobre todo lo demás:

1. **La voz es la entrada principal, no un extra.** El micrófono es el botón más grande
   de la app. La pantalla sirve para *confirmar y corregir*, no para capturar a mano
   (aunque siempre se pueda).
2. **Offline de verdad.** Todo se resuelve en el teléfono: registrar una entrega no toca
   la red en ningún momento. **Si la app necesita señal para registrar una entrega, es
   inusable.** Esto no es negociable. (Gemini quedó fuera del dictado por eso mismo — y
   porque esperar a la nube con el dedo en el botón se hacía eterno; ver §3.)

Corolario: cada acción por voz se confirma con **sonido y vibración**, para que él sepa
que quedó registrado sin mirar la pantalla.

---

## 3. Decisiones técnicas cerradas

| Tema | Decisión |
|---|---|
| Plataforma | **PWA + APK por Capacitor**, pensada para Android. Mismo stack que LyKari |
| Almacenamiento | **IndexedDB vía Dexie**, local-first. Nada de servidor propio |
| Dictado | **Todo local**: lo transcribe el teclado (Gboard) o el reconocedor nativo de Android, y lo interpreta el **parser de reglas**. Sin red de por medio: la tarjeta sale al instante y funciona igual sin señal |
| Gemini | **No interviene en el dictado.** Queda reservado para los informes — el resumen al cerrar el día y el de la semana —, donde tardar unos segundos no estorba |
| API key | Vive en el dispositivo, pegada desde Ajustes. **Nunca en el repo, nunca en el APK** |
| Directorio de tiendas | **Se construye solo, desde los dictados.** No hay carga manual masiva |
| Desambiguar homónimos | Por **nombre + hora del día + posición en la ruta**. Ver §6 |
| Dirección visual | **A — Agenda**, del handoff de diseño |

---

## 4. Sistema de diseño

Sale de Nocturne pero **con la escala subida**, y esto es deliberado: la densidad 0.7×
del sistema no se lee a sol directo con las manos ocupadas. Texto base 17–20px, dinero
hasta 44px, ninguna zona táctil por debajo de 52px.

Tokens exactos en `src/estilos.css`. Los de estado:

```
--verde   #7bbf8f   pagado · cobrado · stock inicial
--ambar   #e0a06a   lo que queda · deuda de días anteriores
--rojo    #e07a6a   pendiente · por cobrar
```

Reglas que no se rompen:

- **Por defecto la app es clara** — pedido explícito del dueño (antes era oscura por
  defecto; se reabrió esa decisión). Actualizar la app no le puede cambiar la
  pantalla sin que él lo pida: ni oscuro ni «sistema» son el arranque por defecto,
  aunque los dos siguen ahí (Ajustes → Apariencia: Oscuro/Claro/Sistema).
  Cada token de color mantiene su rol en los dos temas (ver `src/estilos.css`,
  bloque `:root[data-theme="claro"]`) — no es el oscuro con los valores invertidos,
  los verdes/ámbares/rojos pastel del oscuro se recalcularon más saturados para
  leerse sobre blanco. El claro es **crema, no blanco frío**: pedido explícito del
  dueño. El acento morado se dejó frío a propósito — el contraste con la base
  cálida es lo que lo hace notarse, igual que ya pasaba con verde/ámbar/rojo sobre
  el gris de fondo.
- Un color, un significado. El ámbar es «lo que falta»; si se usa para otra cosa deja
  de funcionar como señal — en los dos temas.
- **Íconos de `lucide-react`, nunca emojis.** El prototipo usa glifos unicode
  (`▤ ↩ ☷ ⋯ 🎙`) porque era un mockup; en Android cada fabricante los dibuja distinto.
- Tipografía **Inter**, cargada localmente con `@fontsource-variable`. A las 5 a.m. no
  hay red para pedirle nada a Google Fonts. Para lo que actúa como título —los
  nombres de pantalla (`Cabecera`), los rótulos en mayúsculas (`S.rotulo`) y el día
  en Hoy— hay una segunda familia, **Bebas Neue** (`--fuente-titulo` en
  `estilos.css`), condensada y en mayúsculas: cargada local igual que Inter. Todo lo
  que se lee de corrido —texto, dinero, menús— se queda en Inter.
- Todo el código en español: archivos, tipos, variables, comentarios.

---

## 5. Pantallas

Pestañas inferiores de 4: **Hoy · Cobranza · Tiendas · Más**, con el micrófono flotante
de 84px encima, abajo a la derecha.

Dos reglas de navegación que ya costaron un fallo:

- **Las cuatro pestañas siempre enseñan la barra.** Una pestaña que la esconde es una
  trampa: se entra a Menú y no hay forma de salir.
- **El micrófono solo aparece en Hoy.** En Cobranza no se dicta —se cobra tocando las tarjetas—
  y encima tapaba el último botón; en Tiendas o Menú no hay nada que dictar.

Junto al micrófono hay un botón de teclado: **escribir tiene que ser siempre posible**.
Si el micrófono no tiene permiso, si el mercado está a tope de ruido o si simplemente no
lo entiende, tiene que poder registrar la entrega igual. Lo escrito pasa por el mismo
intérprete que lo dictado.

| Pantalla | Para qué |
|---|---|
| **Hoy** | Encabezado con las cuatro cifras (salí con → me quedan · cobrado · por cobrar) y la lista. Por defecto **solo Ruta**, sin interruptor: reparte tocando la Ruta y casi no usaba la Agenda, así que esa fila se la queda la lista. El interruptor **Agenda / Ruta** se enciende y se apaga en Ajustes (`CLAVE_VER_AGENDA`, ver §5 bis). *Agenda* es la lista de lo ya hecho hoy, tipo agenda, con punto de color por estado; *Ruta* es **todos** los clientes en orden de ruta para ir tocando de uno en uno: al que aún no se le entregó abre la tarjeta de confirmación del dictado para registrar; al que **ya** se le entregó abre su **Detalle** para editar cantidades y precio (el precio por kilo casi siempre varía), igual que tocar su fila en Agenda. Con un **+** en lugar del micrófono para dar de alta a alguien que no está en el directorio |
| **Detalle de entrega** | Cantidades con +/−, tandas de peso que se suman solas, precio por kilo, total en grande, pago y saldo, la deuda anterior arriba y **los cobros de ese día**, cada uno con su «Deshacer» (§8). Se abre desde Hoy, desde Cobranza y desde un día del Historial, y vuelve al que lo abrió |
| **Cobranza** | El modo del retorno: solo tiendas con saldo, con la cuenta ya sacada (día + deuda). Ordenada **del último al primero** por defecto: reparte de ida y cobra de vuelta, así que la última tienda a la que dejó es la primera que reencuentra. Las que ya **abonaron una parte** (pago parcial, `tocada`) se hunden al final con una etiqueta «ya abonó», para que no estorben arriba y suba la siguiente por cobrar del todo |
| **Cierre del día** | «Deberías tener S/ X en la caja» para cuadrar contra la plata física. Ya cerrado, un botón pide a Gemini el informe del día |
| **Tiendas** | El directorio que se construyó solo, con buscador y orden **por ruta o alfabético (A–Z)**. Tocar un cliente abre su panel (renombrar, deuda, borrar) y, arriba, **Ver su historial** |
| **Ficha del cliente** | Todo lo que se sabe de él: lo que debe ahora, su precio por kilo de hoy y entre qué precios se ha movido, lo que ha comprado, cuántas veces quedó debiendo, lo regalado en redondeos y sus últimas entregas |
| **Historial** | Días cerrados y la semana, con un botón para el informe de Gemini de esos 7 días |
| **Detalle de día** | Un día cerrado, entrega por entrega, cada una con **Corregir esta entrega** — y lo que cambie llega hasta la deuda del cliente (§8) |
| **Ajustes** | Apariencia (oscuro/claro/sistema), hora de cierre, redondeo, sonido, respaldo, la API key de Gemini (solo para informes) y **Actualización**: qué versión tiene puesta y el enlace para bajar la última |
| **Cargar stock** | «¿Con cuánto sales hoy?», con la sugerencia aprendida por día de semana |
| **Menú** | Cuadrícula de 7 fichas, detrás de la pestaña «Más» |

**5 bis. Vistas que se pueden esconder.** La Agenda de Hoy se enseña solo si él lo pide
(`CLAVE_VER_AGENDA`, apagado por defecto). Dos reglas para cualquier vista que se esconda
así:

- **Esconder no borra.** `CLAVE_MODO_HOY` se conserva intacto, así que al volver a
  encenderla desde Ajustes reaparece donde la dejó.
- **El modo efectivo se calcula en un solo sitio** (`modoHoyEfectivo()` en `voz/ajustes.ts`),
  y lo leen **los dos** lados, `Hoy.tsx` y `App.tsx`. Importa por dos motivos. Uno: sin el
  interruptor a la vista no hay forma de salir de la vista escondida, así que el modo
  guardado no puede mandar — quien dejó Hoy en «agenda» antes de la actualización se
  quedaría atrapado en una vista sin botones para cambiarla. Dos: App decide con ese mismo
  modo si el flotante es el micrófono o el «+», así que si cada lado lo dedujera por su
  cuenta acabaría el micrófono de la Agenda encima de una lista de Ruta.

**Novedades.** Al abrir la app tras instalar una actualización, una hoja (`ui/Novedades.tsx`,
`useNovedades()`) le enseña qué cambió desde la última vez, tomado de `src/cambios.ts`. Se
compara **cuántas entradas ya vio** (guardado en Ajustes, `CLAVE_CAMBIOS_VISTOS`) contra
`CAMBIOS.length` — no la versión del build (`fecha · commit`, que cambia en cada push y no
sirve para saber qué es «nuevo para él»). Si `CLAVE_CAMBIOS_VISTOS` no existe todavía, no
asumas que es una instalación nueva sin más: mira si ya hay una tienda o una jornada
guardada. Si las hay, es un teléfono que ya venía usando la app **antes de que esta función
existiera** y toca enseñarle el registro entero; solo si de verdad no hay nada de nada es una
instalación nueva, y ahí sí no hay nada que comparar — se marca el punto de partida en
silencio, sin interrumpir. **Toda vez que se publique un cambio que él vaya a notar, hay que
agregar una entrada al final de `CAMBIOS`** — nunca reordenar ni borrar las que ya existen, o
se rompe la cuenta de qué es viejo y qué es nuevo para quien ya abrió la app antes.

---

## 6. La correlación de tiendas — lo más delicado

Pedido literal del dueño:

> «La lista empieza vacía cada mañana. De acuerdo al dictado extrae los datos y
> correlaciona con los días anteriores. Hay muchos clientes con el mismo nombre, así que
> de preferencia correlaciona **nombre y hora**, porque los que se entregan más cerca al
> punto de partida son en la mañanita y otros más tarde, o después de ciertos clientes.»

Por lo tanto **el nombre solo no basta para identificar a una tienda**. `emparejar.ts`
puntúa cada candidata con tres señales:

```
puntaje = 0.50 · similitudNombre      normalizado, difuso, contra nombre y alias
        + 0.18 · proximidadHora       gaussiana sobre la mediana de sus horas, σ 45 min
        + 0.32 · coherenciaSecuencia  quién suele ir antes + posición típica en la ruta
```

Y decide:

- Bajo el umbral → **tienda nueva**, creada al vuelo desde el dictado.
- 1ª y 2ª muy cerca → **ambiguo**: la tarjeta muestra las candidatas con su dato
  distintivo («Doña Elsa · parada 7 · sueles verla 10:40»).
- Si no → la mejor, siempre visible y corregible de un toque.

Al confirmar, `aprender()` actualiza las señales. **En frío todo es tienda nueva**; la
precisión sube sola con el uso. Nunca se crea un duplicado en silencio ni se secuestra
una tienda existente en silencio: **el emparejamiento siempre se muestra antes de guardar**.

Esto también vale para el nombre escrito a mano, no solo el dictado: el botón **+** de
Ruta abre la tarjeta en blanco y, según se escribe, busca en vivo con el mismo emparejador
(`identificar()`, con `debounce` de 250 ms) — si ya existe una «Olga» parecida, aparece
como sugerencia antes de tocar «Crear», igual que la lista de candidatas del dictado.

---

## 7. Reglas de negocio

- **Precio distinto por cliente.** Cada tienda tiene el suyo por defecto; si dicta otro,
  manda el dictado y queda en el historial de esa tienda.
- **Precio base del día + diferencia por tienda.** Hay días que el precio por kilo sube o
  baja para todos. En «¿Con cuánto sales?» se pone el **precio base del día**
  (`Jornada.precioBaseKg`) y cada tienda guarda cuánto más o menos cobra respecto de él
  (`Tienda.precioOffsetKg`, puede ser negativo: «dos puntos más», «uno menos»). **Con base
  fijado, el base manda para todas**: el precio que se muestra ya puesto en cada entrega es
  `precioEfectivoKg` = base + diferencia (0 si aún no se le conoce), así que poner el base en
  8.80 baja a todas a 8.80 salvo a las que ya se les aprendió una diferencia — que es lo que
  se espera al cambiar el precio del día. Sin base fijado se usa el precio absoluto de siempre
  (`precioKgDefecto`). La diferencia se **aprende sola** al registrar: si un día con base 9.50
  se le cobra 9.70, su offset queda en +0.20, y cuando el base cambie otro día su precio se
  recalcula solo. Todo editable en cada entrega.
- **El peso son tandas**, una lista de pesadas que se suman. Se pueden agregar después.
- **Entregas sin pesar** (clientes de confianza): usa total dictado o precio acordado.
- **Las deudas viven en la tienda, no en el día.** Al cobrar se salda día + deuda en un
  solo movimiento, y **la deuda se paga primero**.
- **Redondeo a favor del cliente:** se guardan `totalCalculado` (56.90) y `totalCobrado`
  (56.50) **por separado**; la diferencia es un descuento registrado. El cálculo exacto
  no se pierde nunca — es lo que permite saber cuánto regala al mes.
- **Varias entregas al mismo cliente el mismo día** no se mezclan.
- **Pollos partidos.** A veces parte un pollo en dos: pecho por un lado, pierna por otro,
  y cada parte puede ir a una tienda distinta. Las presas se pesan y se cobran **al mismo
  precio por kilo** que el pollo entero, así que la cuenta no cambia. Lo que cambia es el
  inventario, y se resuelve en dos líneas (`resumenDe`):
  - cada **pecho entregado** descuenta un pollo entero del stock — para sacarlo hubo que
    romper uno;
  - y ese mismo pollo **suma una pierna** al montón por vender.

  Las `piernas` del stock inicial son producto que **compra aparte**, no salen de partir.

  El reverso también pasa: si un día entrega más piernas de las que tiene sueltas
  (las que compró más las que sacó de partir pechos), esas de más solo pudieron salir
  de partir pollos enteros por la pierna. Cada una gasta un pollo más y deja un
  **pecho suelto** sin vender — `pechosLibres` en `resumenDe`, y se enseña en Hoy
  junto al resto de piernas.

## 7 bis. Fallos que ya costaron una versión

- **`pointer-events`.** La capa que flota sobre la lista va con `pointer-events: none` para
  no tapar lo de abajo; **cada hijo tiene que reactivarlo**. Sin eso el micrófono se ve
  perfecto y no responde a nada. No se detectó en pruebas porque `element.click()` desde la
  consola **ignora `pointer-events`**: para esto hay que probar con un toque de verdad.
- **Android deja de escuchar solo** tras un par de segundos de silencio. Como él dicta con
  pausas, hay que recoger el texto también cuando el reconocedor corta por su cuenta
  (evento `listeningState: stopped`), no solo al pulsar el botón.
- **No obligar con la carga de stock.** Salta sola por la mañana y una vez al día; el resto
  del tiempo se llega tocando el encabezado de Hoy o por el menú. Y siempre hay salida.
- **Nada flotante encima de lo que está usando.** Con la tarjeta de confirmación, el cuadro
  de escribir, la escucha o un cobro abiertos, el micrófono y el botón de teclado se
  esconden — tapaban el botón «Confirmar» y las teclas 7-8-9-0 —, y con un cobro abierto se
  esconde también la barra de pestañas, que era la que de verdad tapaba el teclado.
- **Si la escucha no se corta sola, tiene que haber un botón de parar visible.** Va dentro
  de la tarjeta de escucha («Ya terminé», con su cuadrado), no en un flotante que tape lo
  que se está transcribiendo.
- **El botón atrás de Android** se intercepta en `lib/atras.ts`. Cierra de fuera hacia
  dentro (escucha → tarjeta → cobro → pantalla) y solo manda la app a segundo plano desde
  Hoy. Por defecto Capacitor la cerraba entera de un toque, en mitad de la ruta.
- **A dónde vuelve el atrás es una propiedad fija de cada pantalla, no un historial.**
  Está en `lib/navegacion.ts` (`PADRE`, `atrasDesde()`), y de ahí leen **los dos** caminos:
  el atrás de Android y el botón «volver» de la pantalla (`salir()` en App.tsx). Si cada
  uno lleva su destino escrito a mano, acaban discrepando y la misma pantalla sale a un
  sitio distinto según qué botón se toque.

  Antes había una pila de por dónde había pasado, y **retroceder apilaba**: el `volver` de
  cada pantalla llamaba a `ir()`, que guarda el origen cuando no es pestaña. Salir del
  Detalle dejaba un `"detalle"` quemado en la pila —con `entregaSel` todavía apuntando a esa
  entrega—, así que bastaba un día de reparto y luego Más → Historial → un día → atrás para
  que lo sacara de ahí y **abriera a editar una entrega cualquiera**. Con `"dia"` pasaba lo
  mismo y Historial-Día se quedaba dando vueltas entre las dos. Se había intentado arreglar
  parcheando solo el lado de Android (`setPantalla` directo para `detalle`/`dia`/`gastos`),
  pero el lado que ensuciaba la pila era el `volver` de la pantalla, así que volvió.

  El arreglo es estructural: no hay pila. `Record<Rama, Pantalla>` obliga a TypeScript a
  exigir un destino para cada pantalla nueva, y `navegacion.test.ts` comprueba que desde
  cualquiera se llega a Hoy sin repetir ninguna — que es lo que detecta un ciclo.

  **Las excepciones son el Detalle y la Ficha**, y son deliberadas: el Detalle se abre desde Hoy, desde Cobranza y desde un día del Historial;
  y tiene que volver a la lista que lo abrió (salir a Hoy tras corregir una entrega en plena
  vuelta cobrando es perder el sitio). Lo lleva `OrigenDetalle`, un **solo dato puesto al
  abrir** — no un registro de por dónde se pasó: no lo alimenta el retroceder, no crece, y
  no crece. Lo mismo la Ficha, que se abre desde el directorio y desde el Detalle
  (`OrigenFicha`). Los dos encadenan —ficha → detalle → cobranza → hoy— sin ciclo, y eso
  **depende de que la Ficha no abra ningún Detalle**: si sus entregas fueran tocables, el
  atrás podría quedarse rebotando detalle → ficha → detalle. Por eso la Ficha es de solo
  lectura. `navegacion.test.ts` recorre todas las combinaciones de orígenes y comprueba que
  desde cualquier pantalla se llega a Hoy sin repetir ninguna.
- **El reconocedor del teléfono no vale como camino principal.** Transcribe a ciegas y se
  comía el nombre del cliente: «hay de cinco pollos 12 kg 750 a 9 soles 30». Con audio,
  Gemini tiene las pausas y la entonación, que es donde está la separación entre el nombre
  y las cantidades. El reconocedor se queda solo para cuando no hay señal.
- **`detener()` no puede esperar al plugin.** Hacía `await SpeechRecognition.stop()` antes
  de cerrar y esa promesa no resolvía en el teléfono: la escucha se quedaba abierta para
  siempre. Se cierra primero y se para el plugin después, siempre desde `soltar()`.
- **El peso no siempre sale de las tandas.** Muchas entregas son de una sola pesada y se
  guardan con `peso` y sin tandas; recalcularlo desde una lista vacía lo ponía a cero, y
  cambiar el precio por kilo borraba el peso.
- **Total 0 no es «pagado».** Una entrega que dejó sin pesar salía en verde porque
  `0 >= 0`. Sin total no hay nada que dar por cobrado: está pendiente.
- **Las zonas seguras** (`--seguro-arriba` / `--seguro-abajo`) no son opcionales: Android
  dibuja de borde a borde y sin ellas el encabezado queda bajo la hora y la barra bajo los
  gestos.
- **El micrófono flotante puede tapar el último botón de Hoy y Cobranza — pero solo hay
  que arreglarlo para listas cortas.** El `padding-bottom` del cuadro de scroll (230px
  Cobranza, 250px Hoy) despeja el micrófono, pero solo **una vez que ya se hizo scroll
  hasta el fondo**: con pocas entregas, que ni piden scroll, ese padding nunca llega a
  verse y el micrófono tapa el botón de abajo desde el primer vistazo.

  El primer intento fue ponerle `margin-bottom` fijo al cuadro de scroll, siempre — se veía
  bien en Playwright, pero en el teléfono de verdad **encogía también las listas largas que
  nunca tuvieron el problema**, y con muchas entregas eso cortaba tarjetas a la mitad al
  hacer scroll. Peor que el bug original.

  La solución que quedó (`useHolguraMic` en `lib/ganchos.ts`, usada por Hoy.tsx y
  Cobranza.tsx) **mide antes de decidir**: solo reserva ese margen cuando el contenido real
  —sin contar el padding de seguridad— ya cabría entero en la pantalla sin pedir scroll. Si
  la lista es lo bastante larga como para necesitar scroll de todas formas, no le toca nada:
  el diseño de siempre queda exactamente igual, que es el caso que se rompió la primera vez.
  Ojo con la matemática si se toca: `scrollHeight` **incluye** el padding-bottom fijo, hay
  que restarlo antes de comparar contra el alto disponible, o el cálculo sale al revés.
- **Un ícono dentro de una columna flex, sin `flexShrink: 0`, se puede aplastar.** Pasó en
  las fichas del Menú: en pantallas angostas, la ficha con el subtítulo más largo («Gastos»)
  envuelve a dos líneas, la cuadrícula le da menos alto del que el contenido necesita, y sin
  protección el ícono se encoge para hacerle sitio al texto en vez del texto ceder. Cualquier
  ícono que conviva con texto de largo variable en una columna necesita `flexShrink: 0`.
- **`box-shadow: 0 0 0 Npx color` como sustituto de un borde se ve entrecortado en Android.**
  Un anillo dúro (sin difuminado) sobre una esquina redondeada es un caso conocido de
  costuras de renderizado en algunos Android/Skia — invisible en un navegador de escritorio,
  visible a simple vista en el teléfono. Usar `border` de verdad; como toda la app ya tiene
  `box-sizing: border-box`, no le come nada al padding. (Si además hace falta una sombra
  difuminada, esa sí sigue siendo `box-shadow`, por separado — el problema es solo el anillo
  sin difuminado.)
- **«Me pagó todo» tenía que perdonar el resto por debajo de la moneda, y no lo hacía.** El
  botón cobraba `c.total`, que ya viene redondeado a monedas de 10 céntimos (`aCobrar`), pero
  pasaba `aceptarRedondeo: false`. Los pocos céntimos que sobran —los que ninguna moneda puede
  cubrir, el redondeo a favor del cliente que el modelo ya da por perdonado— quedaban sin
  perdonar. Al cerrar el día se volvían una `deuda` de S/ 0.05, y al día siguiente reaparecía
  en Cobranza con **«A cobrar S/ 0.00»**: imposible de cobrar (cobrar cero no hace nada) y
  colgada para siempre. Dos arreglos: el botón ahora pasa `aceptarRedondeo: true` (raíz, no
  nacen más migajas), y `cuentasPendientes()` no lista una cuenta cuyo `aCobrar(saldo)` sea 0
  (limpia las que ya existían). El umbral mira el **saldo entero**, no cada deuda suelta:
  tres migajas de 4 céntimos sí suman una moneda y esa sí se cobra.
- **Un botón que en el navegador funciona y en el teléfono «no responde» suele ser una zona
  táctil por debajo de 52px, no un fallo de lógica.** Pasó con el botón que cambia el orden de
  la lista en Hoy y Cobranza («Por ruta ⇅» / «Del último ⇅»): tenía `padding: 6`, medía ~28px
  de alto, y el dedo no lo acertaba a la intemperie. En pruebas no se veía porque un
  `.click()` —o un clic de ratón— cae al píxel exacto del centro y **siempre** acierta; el
  dedo no. Es el mismo aviso del bug de `pointer-events`: hay cosas que solo se ven con un
  toque de verdad. La cura es el mínimo de 52px de §4; para no engordar la fila, se consigue
  con `minHeight: 52` + `margin` negativo (el área que se toca crece, el dibujo no; las
  tarjetas que vienen después en el DOM tapan cualquier desborde hacia abajo, así que no le
  roban el toque a la primera de la lista).
- **La vista de ruta reutiliza la tarjeta del dictado, no la duplica.** Tocar una tienda (o el
  botón +) arma una `Propuesta` «manual» ya apuntada a esa tienda y la manda por el mismo
  `TarjetaConfirmacion` / `confirmar` / `editarPropuesta` de siempre. Dos detalles que lo hacen
  posible: `Propuesta.dictadoId` es **opcional** (tocando no hubo dictado que ligar, así que
  `ligarAEntrega`/`descartarDictado` se saltan si falta), y el flag `manual` oculta la
  transcripción y el «¿es esta?» (ya sabemos a quién, la tocó él). El + en blanco confirma con
  el nombre escrito y `confirmar` crea la tienda y registra de una vez, como el «cliente nuevo»
  del dictado.
- **El scroll de Hoy se recuerda fuera del componente, o «se devuelve al inicio».** Hoy se
  desmonta al abrir el Detalle y se vuelve a montar al regresar; su scroll interno se perdía y
  la lista saltaba arriba del todo. La posición vive en un objeto a nivel de módulo
  (`memoriaScroll`, uno por modo), se guarda en `onScroll` y se restaura en un `useLayoutEffect`
  al montar y al cambiar de modo — **no** en cada actualización de `datos`: mientras sigue
  montado el nodo conserva su scroll solo, y pisarlo pelearía con el dedo cuando entra un cobro
  nuevo. La vista de ruta además **no se reordena** al registrar (orden de ruta fijo), para que
  el sitio no se mueva bajo el dedo.
- **Agregar una tanda a una entrega de una sola pesada borraba el peso.** La mayoría de
  entregas se guardan con `peso` y sin `tandas` (una pesada, escrita como total). En el
  Detalle, «Agregar» otra pesada hacía `[...e.tandas, nueva]` = `[nueva]`, y como el peso se
  recalcula desde las tandas cuando las hay, los kilos ya pesados se perdían y el total se
  descuadraba. El peso de esa única pesada **ya es la primera tanda**: `agregarTanda()`
  (en `entregas.ts`, no en la pantalla) siembra la lista con `[e.peso]` antes de sumar la
  nueva cuando no había tandas. Cualquier función que convierta un `peso` suelto en `tandas`
  tiene que arrastrar el peso que ya estaba, nunca arrancar de cero.
- **La tarjeta no espera a Gemini: sale con el parser local y se afina después.** Al pulsar
  «Continuar» se esperaba la respuesta de la IA antes de enseñar nada, y el teléfono se
  quedaba parado varios segundos con el dedo encima del botón. Ahora `interpretarYa()` llena
  la tarjeta al instante (~200 ms, solo parser local, sin red) y `refinar()` la corrige cuando
  Gemini responde, con un «afinando…» discreto mientras tanto. Tres cuidados: el repaso solo
  pisa la tarjeta si **sigue siendo la misma** (`dictadoId`) y **él no la ha tocado**
  (`editadaAMano`, que ponen `editarPropuesta` y `elegirOtra`) — lo que corrige a mano manda
  sobre la IA; y la llamada lleva `AbortSignal.timeout` (§`TOPE_REPASO_MS`), o una petición
  colgada dejaba el «afinando…» para siempre.
- **En Hoy, entregas y cobros sueltos son una sola lista ordenada, no dos bloques.** Los
  cobros sueltos —pasar solo a cobrar deuda vieja, sin dejar nada hoy— se pintaban fijos
  arriba y el botón de orden solo movía las entregas: se veía primero lo ya cobrado y recién
  después lo entregado hoy, dijera «del primero» o «del último», y parecía que el orden «no
  reordena». La clave es darles a los dos tipos una **misma llave de orden**: `creada` (cuándo
  pasó), que para una entrega es su secuencia de ruta y para un cobro es cuándo lo cobró.
  «Por pendientes» ordena por lo que falta cobrar, y un cobro suelto (falta 0) cae al fondo
  con las entregas ya pagadas.
- **«Agrégale 2 piernas» creaba una entrega fantasma, no corregía la que tocaba.**
  `parserLocal.ts` reconoce frases de corrección («agrégale», «quítale», «bájale», «merma»…)
  como `ajuste_entrega` y las prueba (`parserLocal.test.ts`) esperando que los números sean
  una **diferencia** a aplicar sobre una entrega ya registrada, no un total. Pero
  `confirmar()` en App.tsx nunca tuvo una rama para ese caso — solo distingue pagos — así que
  caía al camino de siempre y llamaba a `registrarEntrega()`: creaba una entrega **nueva**
  tratando esa diferencia como si fuera el total, para la tienda que le tocara por contexto
  de ruta (`contextoDeRuta`, «quién fue justo antes» — casi siempre la misma tienda de la
  entrega que se quería corregir). Esa entrega fantasma quedaba marcada como «ya entregada
  hoy»; si después se tocaba esa tienda en la vista de Ruta, abría su Detalle —no una tarjeta
  en blanco— con esos números ya puestos, y lo que él tecleara ahí a mano se sumaba encima sin
  que lo notara. Mientras no haya una forma confiable de saber **a cuál** entrega corregir y
  si sumar o restar, `proponer()` (App.tsx) corta esas frases antes de la tarjeta: avisa con
  sonido y un aviso en pantalla, y no registra nada — se corrige tocando la entrega, que es lo
  que ya funciona.
- **Por voz, «pagó todo» no redondeaba a la moneda mínima ni perdonaba el resto.**
  `cuentaTotalDe()` devuelve el total exacto (entregas + deudas) sin redondear. El camino de
  Cobranza ya envolvía ese total en `aCobrar()` y pasaba `aceptarRedondeo: true` (§7bis, bug
  de las migajas), pero el camino de voz (`confirmar()`, rama `registrar_pago` con
  `i.pagoTodo`) pasaba el total crudo: cobraba S/ 69.12 cuando solo existen monedas de 10
  céntimos, y los 2 céntimos sobrantes quedaban como deuda perpetua. Arreglo: en `confirmar()`
  se envuelve en `aCobrar()` y se pasa `aceptarRedondeo: i.pagoTodo`.
- **En Detalle, el botón de cobrar la deuda no redondeaba y el aviso sonaba antes de
  guardar.** El botón «Cobrar S/ X» de deuda antigua pasaba `deuda.monto` sin `aCobrar()` y
  `aceptarRedondeo` estaba en `false` — misma mecánica de migajas que el bug anterior. Además
  `avisoGuardado()` se ejecutaba síncronamente antes de que `registrarCobro` terminara, así
  que el sonido de confirmación no coincidía con el guardado real. Arreglo: se envuelve en
  `aCobrar()`, se pasa `aceptarRedondeo: true`, y `avisoGuardado()` se mueve a `.then()`.
- **Dictados de consulta o ininteligibles creaban entregas fantasma.** Intenciones de tipo
  `consulta` («¿Cuánto me debe Rosa?») o `desconocida` (ruido, frase cortada) caían por el
  camino por defecto de `proponer()`: armaban una `Propuesta` sin datos útiles y, si se
  confirmaba, `confirmar()` llamaba a `registrarEntrega()` con todo a cero — una entrega
  vacía para la tienda que el emparejador encontrara. Arreglo: `proponer()` intercepta ambas
  intenciones antes de armar la propuesta, descarta el dictado, y muestra un aviso
  explicando qué hacer en su lugar.
- **La hoja de Novedades no le decía nada la primera vez, que era justo cuando más
  importaba.** `useNovedades()` trataba «`CLAVE_CAMBIOS_VISTOS` no existe» como sinónimo de
  «instalación nueva, nada que anunciar» y se sembraba en silencio. Pero la primera vez que
  se publicó esta función, esa clave no existía en **ningún** teléfono — ni siquiera en el
  suyo, que ya venía usando la app hace días con el directorio lleno. Confundir «la clave es
  nueva» con «el teléfono es nuevo» dejó la actualización sin avisar nada, la primera vez que
  tenía algo que avisar. Arreglo: si la clave no existe, se mira si ya hay una tienda o una
  jornada guardada — si las hay, es un teléfono con historial y se le enseña el registro
  entero (`CAMBIOS` completo); solo si de verdad no hay nada de nada es una instalación nueva
  y ahí sí se siembra en silencio.
- **Restaurar un respaldo podía pegarle el historial de un cliente borrado a uno que no
  tenía nada que ver.** `borrarTienda()` (Tiendas) solo borra la fila de la tienda cuando ya
  no debe nada — no toca sus entregas pasadas, que se quedan en la base apuntando a un
  `tiendaId` que ya no existe. Un respaldo sacado después trae esas entregas «huérfanas»
  pero no a la tienda (`generarRespaldo()` solo vuelca las que siguen en el directorio). Al
  restaurar ese archivo en **otro** celular, `restaurarRespaldo()` no encontraba ese
  `tiendaId` entre las tiendas remapeadas y caía al número crudo del celular de origen — que
  en el celular destino podía ser, por pura casualidad de los contadores autoincrementales,
  el id de una tienda real sin ninguna relación: le pegaba un historial ajeno a un cliente
  que no era. Arreglo: todo `tiendaId` de una entrega/pago/deuda que no venga en la lista de
  tiendas del respaldo se remapea a una tienda de reemplazo nueva («Tienda borrada»), una
  sola por id huérfano, nunca al número crudo.
- **La diferencia de precio de una tienda se quedaba pegada al valor viejo cuando solo se
  dictaba el total.** `aprenderDeEntrega()` recibía `datos.precioKg` para reaprender la
  diferencia (offset) — pero cuando no dictó un precio por kilo explícito, ese campo no era
  el precio real de la entrega: era la **sugerencia** con la que se armó la tarjeta
  (`precioEfectivoKg`, base + la diferencia ya conocida), fijada en `App.tsx` antes de saber
  qué iba a pasar. Reaprender de la propia sugerencia es casi siempre un no-op (sale la misma
  diferencia que ya tenía) — el problema es que **siempre** es un no-op, así que si un día
  dictaba solo el total («son 17.68 soles») y ese total ya no coincidía con la sugerencia
  vieja, la diferencia real que eso implicaba (`cuenta.precioKg`, la que de verdad se guarda
  en la entrega) se perdía y la vieja quedaba pegada para siempre — aunque llevara días
  cobrando otra cosa. Arreglo: `registrarEntrega()` le pasa a `aprenderDeEntrega()` el
  `cuenta.precioKg` que de verdad resultó calculado (coincide con `entrega.precioKg`, lo que
  ya se guarda), no la sugerencia de entrada. En las entregas sin pesar `cuenta.precioKg` es
  0 y `aprenderDeEntrega` ya ignora un precio en 0, así que esas siguen sin aprender nada,
  como corresponde.
- **El logo de Hoy no tenía una versión propia para el oscuro — se le aplicaba un filtro.**
  Invertirlo a blanco liso (`brightness(0) invert(1)`) le quitaba toda la gracia al dibujo.
  Se probó ponerle un relleno crema por dentro del mismo trazo marrón (con flood-fill,
  separando los huecos transparentes que tocan el borde de la imagen —exterior— de los que
  quedan encerrados por el trazo —interior—), pero el dueño pidió mejor una figura hecha a
  propósito para el oscuro: trazo dorado sobre transparente, recortada de una imagen que
  traía fondo azul marino sólido (chroma-key contra el color de fondo real de la muestra,
  no un valor fijo, para no dejar bordes duros). Ahora son dos `<img>` distintos en
  `Hoy.tsx` (`logo.png` / `logo-oscuro.png`), alternados por CSS según `[data-theme]` —
  igual que ya hacía el filtro, pero sin filtro: cada tema tiene su propia figura.
- **Las deudas de Hoy se enseñaban con los céntimos exactos, no con lo que de verdad se
  puede cobrar.** «Debe S/ 18.72 de antes» no se puede cobrar con monedas de 10 céntimos
  (`aCobrar`, §7), y «Debe S/ 0.02 de antes» es una migaja que ya no vale la pena perseguir
  — Cobranza ya no las lista (`cuentasPendientes()` filtra las que redondean a 0, ver arriba)
  pero Hoy usa su propio `deudasPorTienda()`, que no pasaba por ese filtro. Arreglo: las tres
  cifras de deuda que enseña Hoy (Agenda, Ruta y el «a cobrar» combinado con lo de hoy) pasan
  por `aCobrar()`, y si eso redondea a 0 no se enseña la línea — igual que en Cobranza.
- **Dos entregas sin precio el mismo día a la misma tienda: la segunda perdía su dinero.**
  `registrarCobro()` reparte un pago entre deudas viejas, entregas ya calculadas, y por último
  las que aún no tienen total (`sinPrecioHoy`, cuando `calcular()` cayó en `origen: "incompleto"`
  — sin peso, sin precio, sin total dictado). Esa última rama tomaba **todo** el resto y se lo
  ponía a la **primera** entrega sin precio que encontraba, y como después ponía `resto = 0`, la
  segunda se quedaba en S/ 0.00 para siempre: pendiente en Cobranza, sin dinero asignado y sin
  forma real de cobrarla (el botón se deshabilita en 0). Pasa cada vez que se le deja algo dos
  veces sin pesar el mismo día y luego se cobra todo junto. Arreglo: el resto se reparte entre
  **todas** las que faltan, a prorrata de pollos (o en partes iguales si son puras piernas/pechos
  sueltos, con 0 pollos); la última se lleva el resto exacto para que la suma nunca falle por
  redondeo. Se encontró con una **sonda dirigida**: leer el código, preguntarse «¿y si le deja
  dos veces sin pesar el mismo día?» y escribir el caso a propósito. Conviene recordar cómo NO
  se encontró: la simulación de dos meses (`db/simulacion.test.ts`) pasa con 0 anomalías contra
  el código roto — comprobado a posteriori. Recorre mucho camino pero comprueba poco en cada
  punto, y este bug deja la base en un estado que sus verificaciones no distinguen de uno sano.
  Para buscar bugs nuevos vale más una sonda dirigida que simular más días.
- **Deshacer un cobro de un día ya cerrado hacía desaparecer la plata.** `deshacerCobro()`
  restaba `totalCobrado` (y, si aplicaba, ponía `totalCalculado` en 0) directo sobre la
  entrega, pero **nunca llamaba a `ajustarDeudaTrasCorregir()`** — el mismo paso que
  `editarEntrega`/`fijarTotal` sí hacen desde el arreglo de días cerrados (§8). Si la entrega
  era de un día ya cerrado, el saldo que volvía a faltar se quedaba **solo en la entrega**, y
  ni Cobranza ni la ficha del cliente lo veían: las dos confían en `deudas` para todo lo que
  ya cerró, y ahí no nacía nada. Deshacer un cobro de S/ 50 en un día cerrado dejaba a la
  tienda «al día» en la app aunque en la calle siguiera debiendo esos 50 soles. Arreglo: el
  mismo `ajustarDeudaTrasCorregir(e, saldoAntes, saldoDespues)` que ya usan las otras
  correcciones, y `db.jornadas` se suma a la transacción de `deshacerCobro` porque esa función
  la necesita para saber si el día cerró. Encontrado en la misma auditoría dirigida que el
  bug de arriba — probando a propósito «cobro en un día que después se cierra, y luego se
  deshace ese cobro».
- **Borrar una entrega vieja podía recortar el «cobrado» de un día completamente distinto,
  ya cerrado.** `borrarEntrega()` hacía `db.pagos.where("entregaId").equals(id).delete()` sin
  mirar el `tipo`. `Pago.entregaId` significa dos cosas distintas según el tipo: en un pago
  `"delDia"` es la entrega que se está pagando (borrarla con la entrega tiene sentido); en uno
  `"deudaAnterior"` es la entrega que **originó** la deuda que se está pagando, y ese pago
  puede haberse hecho días después, en una fecha completamente distinta y ya cerrada. Un
  `.where("entregaId")` sin distinguir tipo se llevaba también ese segundo pago: borrar una
  entrega vieja ya del todo cobrada le borraba a un día futuro y cerrado el registro de que
  ese dinero se había cobrado — el «Cobrado» de `Dia.tsx` y `resumenDe()` de ese otro día
  bajaban solos, sin que nadie hubiera tocado nada de ese día. Arreglo: el `.delete()` se
  filtra a `tipo === "delDia"`. Encontrado en la misma auditoría dirigida.
- **El «+» de Ruta para dar de alta a alguien nuevo nunca sugería tiendas parecidas —
  escribir «Olga» no encontraba a la Olga que ya existía.** La tarjeta en blanco arranca con
  `candidatas: []` a propósito (no hay nada que dictar todavía), pero nada corría el
  emparejador **según se escribía** el nombre, así que la lista se quedaba vacía para
  siempre y «Crear» terminaba armando un duplicado. Arreglo: `TarjetaConfirmacion` recibe un
  nuevo `onBuscar` (App.tsx, `buscarCandidatas` — el mismo `identificar()` de siempre) y lo
  llama con `debounce` de 250 ms mientras escribe; las sugerencias en vivo reemplazan a las
  del dictado original en cuanto toca el campo (`tocoNombre`), porque si estaba corrigiendo
  un nombre mal oído, las candidatas de la transcripción vieja ya no sirven de nada.
  Al arreglarlo salió un segundo bug, más viejo: elegir una candidata de la lista (por voz o
  por esta búsqueda nueva) nunca actualizaba el campo de nombre en pantalla, que se quedaba
  con lo último escrito a mano. El botón «Confirmar» decide si es la tienda encontrada o una
  nueva **comparando ese campo contra `em.mejor.tienda.nombre`** — con el campo desactualizado
  («Olg» en vez de «Olga»), confirmar creaba una tienda nueva aunque él acabara de elegir la
  correcta. Arreglo: elegir una candidata también pone su nombre real en el campo.
- **Corregir el precio en el Detalle no le enseñaba nada a la tienda.** Es la otra mitad del
  fallo de arriba, y la que de verdad lo mantenía roto: `registrarEntrega()` aprende, pero
  **`editarEntrega()` y `fijarTotal()` no llamaban a nadie**. Y así es como él trabaja: deja
  la entrega y al rato cuadra el precio en el Detalle. Resultado — la entrega quedaba con el
  precio bueno y la tienda seguía con la diferencia vieja, así que al día siguiente volvía a
  proponer el de antes. Se vio con Chela: su entrega del 19-ago está guardada a 7.00 con base
  8.00 (diferencia real −1.00), pero la tienda tenía `precioOffsetKg` −0.30, aprendido el 18
  cuando el base era 8.80 — y por eso el 20 le proponía 7.70. Arreglo: `aprenderPrecioDeEntrega()`
  (tiendas.ts), que **solo** toca `precioKgDefecto`/`precioOffsetKg`, llamada desde
  `editarEntrega` y `fijarTotal` cuando el precio cambia de verdad. No reusa `aprenderDeEntrega`
  a propósito: esa además apila hora, parada y precedente, y editar un número no es una parada
  nueva — contarla dos veces torcería la correlación de §6. Se mide contra el base de **su**
  jornada (`e.fecha`), no el de hoy: una entrega de un día cerrado se corrige contra el precio
  que regía ese día.
- **Al cerrar el día nacían deudas que ninguna moneda puede pagar.** `cerrarDia()` convertía en
  deuda **cualquier** saldo > 0, incluidos los restos por debajo de la moneda de 10 céntimos.
  Esos quedaban como «Debe S/ 0.05 del jueves» con un «Cobrar aquí» que no hacía nada —
  `aCobrar(5)` es 0 y cobrar cero no mueve nada—, así que la migaja reaparecía cada día y no
  había forma de saldarla («por más que cobre me sale así»). Es el mismo redondeo a favor del
  cliente que el modelo ya da por perdonado (§7), solo que llegando por otra puerta. Dos
  arreglos: `cerrarDia()` suma ese resto a `descuentoRedondeo` de la entrega en vez de crear la
  deuda (raíz), y `limpiarMigajas()` —que corre al abrir la app, después de `cerrarDiasPasados()`—
  cierra las que ya existían. El umbral mira el **saldo entero de la tienda**, no cada deuda
  suelta: tres migajas de 4 céntimos sí suman una moneda y esas se dejan en paz. Y en Detalle
  el aviso de deuda se enseña y se ofrece cobrar solo si `aCobrar()` da más de 0.

---

## 8. Modelo de datos

Ver `src/db/db.ts`. Notas de implementación:

- IndexedDB **no indexa booleanos**: los campos indexados van como `0 | 1` (tipo `Bandera`).
- El **audio se guarda antes de llamar a nada**. Si Gemini falla o no hay key, el dictado
  queda como `pendiente` y se reintenta. Nada de lo dicho se pierde jamás.
- El dinero se guarda en **céntimos enteros** y el peso en **gramos enteros**, nunca en
  flotantes. `0.1 + 0.2 !== 0.3` y aquí estamos cuadrando una caja física contra la app.
- **Nada que se llame desde `useLiveQuery` puede escribir.** Dexie corre esas consultas en
  una transacción de solo lectura y una escritura las revienta con `ReadOnlyError`. Por eso
  `leerJornada()` no crea la fila: la crean `guardarStock()` y `cerrarDia()`.
- **Al cerrar el día, el saldo pendiente pasa a `deudas` y deja de contarse como saldo del
  día.** Si se contara en los dos sitios, el «por cobrar» enseñaría el doble. Por eso
  `resumenDe()` y `cuentasPendientes()` miran el estado de la jornada.
- **Corregir una entrega de un día cerrado tiene que llegar hasta `deudas`, y por
  diferencia.** Es el corolario del punto anterior: una vez cerrado, lo que falta por cobrar
  ya no vive en la entrega, así que subir su `totalCalculado` no se lo cobra a nadie — la
  plata se evaporaba. Lo arregla `ajustarDeudaTrasCorregir()` (`entregas.ts`), llamada desde
  `editarEntrega`, `fijarTotal` y `borrarEntrega`.

  **Va por diferencia y no por absoluto**, y eso es lo delicado: cobrar una deuda mueve
  `deudas.saldado` pero **no toca la entrega**, así que el saldo de una entrega de un día
  cerrado se queda congelado en lo que valía al cerrar. Igualar la deuda a ese saldo
  congelado resucitaría una deuda ya pagada. Lo único cierto es que la corrección cambió la
  cuenta en `delta`, y eso es lo que se suma a lo que debe. `monto` nunca baja de `saldado`:
  si corrigió tan abajo que le cobró de más, la deuda se cierra y de ahí para abajo es plata
  que le debe al cliente, no una deuda negativa.
- **Cerrar dos veces no puede duplicar las deudas.** `cerrarDia()` sale sin hacer nada si
  la jornada ya está cerrada.
- **Un cobro se deshace por grupo, no por fila.** `registrarCobro()` reparte un solo billete
  entre varias filas de `pagos` —primero las deudas viejas, después las entregas del día—,
  así que lo que para él fue «Rosa me pagó 80» pueden ser tres filas. `cobrosDe()` las agrupa
  por el instante en que se guardaron (`creada`) y `deshacerCobro()` deshace el grupo entero:
  media entrega de plata deshecha no significa nada. Se llega desde el Detalle, que a su vez
  se abre desde Hoy, Cobranza y un día del Historial.
- **`Pago.totalFijado` marca el pago que le puso el total a una entrega sin precio.** La
  última rama de `registrarCobro()` le fija `totalCalculado` a una entrega que valía 0 («sin
  pesar», y pagó tanto). Al deshacer hay que quitarle ese total, pero sin esa marca no se
  puede distinguir de un total dictado («son 42 soles»): las dos se ven idénticas, sin peso y
  sin precio por kilo. No está indexado, así que no necesitó migración — los pagos viejos lo
  traen `undefined`, que es justo «este pago no fijó ningún total».

---

## 9. Comandos

```
npm run dev      servidor de desarrollo (probar a 393×852)
npm test         los tests de la lógica pura
npm run apk      compila el APK y lo instala en el teléfono conectado
npm run iconos   regenera los iconos desde marca/logo.png
```

`apk.mjs` busca solo un JDK 17+ (usa el de Android Studio; el `java` del PATH es un
Java 8 viejo que Gradle rechaza).

---

## 10. Referencia

- `referencia/DonPioApp.dc.html` — el prototipo navegable de las 10 pantallas. Los
  colores, tamaños, espaciados y microcopy se toman **literalmente** de ahí.
- `referencia/Don-Pio-Plan.md` — el plan funcional del dueño.

Son prototipos: el código es referencia visual, no la arquitectura final.
