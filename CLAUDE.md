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
2. **Offline de verdad.** Todo se escribe primero en el teléfono. Gemini solo *refina*
   cuando hay internet. **Si la app necesita señal para registrar una entrega, es
   inusable.** Esto no es negociable.

Corolario: cada acción por voz se confirma con **sonido y vibración**, para que él sepa
que quedó registrado sin mirar la pantalla.

---

## 3. Decisiones técnicas cerradas

| Tema | Decisión |
|---|---|
| Plataforma | **PWA + APK por Capacitor**, pensada para Android. Mismo stack que LyKari |
| Almacenamiento | **IndexedDB vía Dexie**, local-first. Nada de servidor propio |
| Dictado (camino normal) | **Se graba el audio y va entero a Gemini**, que transcribe y estructura de una vez |
| Dictado (sin key o sin señal) | Reconocedor nativo de Android (offline) + **parser local de reglas** |
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

- **La app es oscura y punto.** No hay tema claro: se usa de madrugada.
- Un color, un significado. El ámbar es «lo que falta»; si se usa para otra cosa deja
  de funcionar como señal.
- **Íconos de `lucide-react`, nunca emojis.** El prototipo usa glifos unicode
  (`▤ ↩ ☷ ⋯ 🎙`) porque era un mockup; en Android cada fabricante los dibuja distinto.
- Tipografía **Inter**, cargada localmente con `@fontsource-variable`. A las 5 a.m. no
  hay red para pedirle nada a Google Fonts.
- Todo el código en español: archivos, tipos, variables, comentarios.

---

## 5. Pantallas

Pestañas inferiores de 4: **Hoy · Cobranza · Tiendas · Más**, con el micrófono flotante
de 84px encima, abajo a la derecha.

Dos reglas de navegación que ya costaron un fallo:

- **Las cuatro pestañas siempre enseñan la barra.** Una pestaña que la esconde es una
  trampa: se entra a Menú y no hay forma de salir.
- **El micrófono solo aparece en Hoy y Cobranza.** En Tiendas o Menú no hay nada que dictar.

Junto al micrófono hay un botón de teclado: **escribir tiene que ser siempre posible**.
Si el micrófono no tiene permiso, si el mercado está a tope de ruido o si simplemente no
lo entiende, tiene que poder registrar la entrega igual. Lo escrito pasa por el mismo
intérprete que lo dictado.

| Pantalla | Para qué |
|---|---|
| **Hoy** | Encabezado con las cuatro cifras (salí con → me quedan · cobrado · por cobrar) y la lista de entregas tipo agenda, con punto de color por estado |
| **Detalle de entrega** | Cantidades con +/−, tandas de peso que se suman solas, precio por kilo, total en grande, pago y saldo, y la deuda anterior arriba |
| **Cobranza** | El modo del retorno: solo tiendas con saldo, con la cuenta ya sacada (día + deuda). Ordenada **del último al primero** por defecto: reparte de ida y cobra de vuelta, así que la última tienda a la que dejó es la primera que reencuentra |
| **Cierre del día** | «Deberías tener S/ X en la caja» para cuadrar contra la plata física |
| **Tiendas** | El directorio que se construyó solo |
| **Historial** | Días cerrados y la semana |
| **Detalle de día** | Un día cerrado, entrega por entrega |
| **Ajustes** | Hora de cierre, redondeo, sonido, respaldo, y la API key de Gemini |
| **Cargar stock** | «¿Con cuánto sales hoy?», con la sugerencia aprendida por día de semana |
| **Menú** | Cuadrícula de 6 fichas, detrás de la pestaña «Más» |

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
puntaje = 0.5 · similitudNombre      normalizado, difuso, contra nombre y alias
        + 0.3 · proximidadHora       gaussiana sobre la mediana de sus horas, σ 45 min
        + 0.2 · coherenciaSecuencia  quién suele ir antes + posición típica en la ruta
```

Y decide:

- Bajo el umbral → **tienda nueva**, creada al vuelo desde el dictado.
- 1ª y 2ª muy cerca → **ambiguo**: la tarjeta muestra las candidatas con su dato
  distintivo («Doña Elsa · parada 7 · sueles verla 10:40»).
- Si no → la mejor, siempre visible y corregible de un toque.

Al confirmar, `aprender()` actualiza las señales. **En frío todo es tienda nueva**; la
precisión sube sola con el uso. Nunca se crea un duplicado en silencio ni se secuestra
una tienda existente en silencio: **el emparejamiento siempre se muestra antes de guardar**.

---

## 7. Reglas de negocio

- **Precio distinto por cliente.** Cada tienda tiene el suyo por defecto; si dicta otro,
  manda el dictado y queda en el historial de esa tienda.
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
- **Cerrar dos veces no puede duplicar las deudas.** `cerrarDia()` sale sin hacer nada si
  la jornada ya está cerrada.

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
