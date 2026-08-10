# Don Pio — Plan de diseño, funcionalidades y arquitectura

App móvil para el control de reparto de pollos de **un solo repartidor** que atiende a más de 50 tiendas, de lunes a domingo, cobrando por lo general en el retorno de la misma ruta.

---

## 1. Principio rector: "manos ocupadas, ojos en la ruta"

Todo el diseño gira alrededor de una idea: **el repartidor casi nunca puede escribir**. Está manejando, cargando pollos o pesando. Por eso:

- La **voz es la entrada principal**, no un extra. El micrófono es el botón más importante de la app.
- La pantalla sirve para **confirmar y corregir**, no para capturar datos a mano (aunque siempre se puede).
- Cada acción por voz debe **confirmarse con sonido/vibración**, para que él sepa que quedó registrado sin mirar.
- La app debe funcionar **sin señal** (a las 5am y en ruta la cobertura falla). Los datos se guardan en el teléfono y se procesan/sincronizan cuando hay internet. Esto es crítico y lo detallo en la sección técnica.

---

## 2. Arquitectura de información (mapa de la app)

```
Don Pio
│
├── HOY  ← pantalla principal (arranca aquí)
│   ├── Encabezado: día · stock inicial (verde) · restante (naranja) · cobrado · por cobrar
│   ├── Botón micrófono (abajo a la derecha, grande)
│   ├── Lista de entregas del día (estilo agenda de contactos)
│   └── Tarjeta de confirmación (aparece tras dictar)
│
├── DETALLE DE ENTREGA  ← al tocar un nombre de la lista
│   ├── Datos editables (cantidad, tandas de peso, precio, total)
│   ├── Estado de pago y saldo
│   └── Deuda de días anteriores (si tiene)
│
├── COBRANZA / RETORNO  ← modo para cobrar de vuelta
│   └── Solo tiendas con saldo pendiente, en orden de ruta
│
├── CIERRE DEL DÍA  ← resumen para cuadrar caja
│
├── TIENDAS  ← directorio maestro de clientes
│   └── Precio por defecto, ¿pesa sí/no?, orden de ruta, notas, saldo
│
├── HISTORIAL  ← días anteriores + reportes semana/mes
│
└── AJUSTES  ← hora de cierre, redondeo, stock por defecto, respaldo, PIN
```

Es una app de un solo usuario, así que la estructura es plana y directa: casi todo vive en **Hoy** y **Cobranza**. El resto es apoyo.

---

## 3. Un día típico (flujo completo)

1. **Noche / 5am — cargar stock.** Abre la app, dicta o escribe: *"Hoy salgo con 120 pollos y 40 piernas."* El encabezado muestra `Inicial: 120 🟢 · Restante: 120 🟠`.
2. **En ruta — entregar.** En cada tienda pulsa el micrófono y dicta al cliente con sus datos. La app arma la entrega, la agrega a la lista y **descuenta del restante**.
3. **Pago inmediato (a veces).** Si le pagan ahí mismo, lo dice: *"Rosa pagó todo"* o *"me abonó 30 de lo de ayer"*.
4. **Retorno — cobrar.** Cambia a **Cobranza**. Ve la lista en orden de ruta con la cuenta ya sacada (día + deuda). En cada tienda cobra rápido, indica cuánto recibe y la app muestra el saldo que queda.
5. **Redondeo.** Si la cuenta es 56.90 y solo le pagan 56.50, registra lo recibido; la diferencia queda como *descuento a favor del cliente*.
6. **Cierre.** A la hora que él elija, ve el resumen del día y **cuadra contra su caja física**.

---

## 4. El corazón: diseño de voz + Gemini

### 4.1 Cómo procesar el audio

El repartidor habla natural, por ejemplo:

- *"Para don Julio, 8 pollos, primera tanda 14 kilos 200, segunda tanda 12 kilos, a 9.50 el kilo."*
- *"Señora Rosa, 5 pollos, total 42 soles."*
- *"A la bodega Milagros, 6 pollos sin pesar, lo de siempre."*
- *"Rosa me pagó los 42 de hoy y 30 que debía."*

El flujo recomendado tiene **3 pasos**:

1. **Audio → texto.** Transcripción del dictado. (En Android puedes usar el reconocimiento del sistema, que funciona incluso offline; Gemini también entiende audio directamente cuando hay internet.)
2. **Texto → datos estructurados (Gemini).** Le pides a Gemini que devuelva **solo un JSON** con la intención y los campos. Aquí está la clave: Gemini clasifica *qué* está haciendo el repartidor y extrae los números.
3. **App valida y confirma.** La app hace el cálculo (peso × precio), busca al cliente en el directorio (aunque el nombre venga mal transcrito), y muestra una **tarjeta de confirmación** antes de guardar.

### 4.2 Intenciones que Gemini debe reconocer

| Intención | Ejemplo de dictado |
|---|---|
| `nueva_entrega` | "Para Julio, 8 pollos, 26 kilos, a 9.50" |
| `registrar_pago` | "Rosa pagó todo" / "me dio 50" |
| `abono_deuda` | "Abonó 30 de lo que debía" |
| `ajuste_entrega` | "A Julio agrégale 2 pollos más" / "a Rosa bájale medio kilo por merma" |
| `consulta` | "¿Cuánto me debe la bodega Milagros?" |
| `cargar_stock` | "Salgo con 120 pollos y 40 piernas" |

### 4.3 Esquema JSON sugerido (para `nueva_entrega`)

```json
{
  "intencion": "nueva_entrega",
  "cliente": "Julio",
  "pollos": 8,
  "piernas": 0,
  "sin_pesar": false,
  "tandas_kg": [14.2, 12.0],
  "peso_total_kg": 26.2,
  "precio_por_kg": 9.5,
  "total_dictado": null,
  "notas": ""
}
```

Reglas de cálculo que la app aplica sobre ese JSON:

- Si vienen `tandas_kg` → `peso_total = suma de tandas`.
- Si viene `precio_por_kg` → `total = peso_total × precio`.
- Si viene `total_dictado` (él dijo el total directo) → se usa ese y, si hay peso, se calcula el precio implícito para el historial.
- Si `sin_pesar = true` → no exige peso; usa precio acordado o total dictado.
- El nombre se compara **de forma difusa** contra el directorio ("Julio" ≈ "don Julio" ≈ "J. Ramírez") para no crear duplicados.

### 4.4 Punto crítico de Gemini: los nombres

La transcripción va a confundir nombres ("Rosa" / "Rossa" / "la señora Rosa"). Solución: Gemini extrae el nombre tal cual, y **la app lo empareja con el directorio** mostrando el candidato más probable en la tarjeta de confirmación ("¿Es *Rosa Quispe*?"). Si no existe, ofrece **crear cliente nuevo al vuelo**.

---

## 5. Modelo de datos

**Cliente / Tienda**
`id · nombre · alias[] · precioKgPorDefecto · pesaSiONo · ordenRuta · notas · saldoAcumulado`

**Jornada (día de reparto)**
`fecha · stockInicialPollos · stockInicialPiernas · horaCierre · estado`

**Entrega (línea del día)**
`jornadaId · clienteId · cantidadPollos · cantidadPiernas · sinPesar · tandasKg[] · pesoTotal · precioKg · totalCalculado · totalCobrado · descuentoRedondeo · estadoPago(pendiente/parcial/pagado)`

**Pago**
`clienteId · monto · fecha · tipo(delDia / deudaAnterior)`

**Deuda**
`clienteId · monto · fechaOrigen` (se va reduciendo con los abonos)

Guardar **`totalCalculado` y `totalCobrado` por separado** es lo que permite manejar bien el redondeo y sacar reportes de cuánto ha "regalado".

---

## 6. Pantalla por pantalla (UI/UX)

### 6.1 HOY (principal)

- **Encabezado fijo** con lo esencial de un vistazo:
  - `Lunes 8 · Pollos 120 🟢 → 45 🟠 restantes`
  - `Cobrado: S/ 1,240 · Por cobrar: S/ 890`
- **Lista tipo agenda:** cada tienda es una tarjeta con nombre grande, cantidad, total, y un **badge de estado** (🔴 pendiente / 🟡 parcial / 🟢 pagado). Ordenable por ruta o por pendientes.
- **Micrófono abajo a la derecha**, grande, redondo, siempre visible. Al pulsar: se pone a escuchar, vibra al empezar y al terminar.
- **Tarjeta de confirmación:** tras dictar, aparece un resumen ("Julio · 8 pollos · 26.2 kg · S/ 248.90") con botones grandes **Confirmar / Corregir**. Puede confirmar también por voz ("sí" / "confirma").

### 6.2 DETALLE DE ENTREGA (al tocar un nombre)

Todo editable, pensado para cuando piden más o hay merma:

- Cantidad de pollos / piernas (+ / −).
- **Tandas de peso**: lista donde puede agregar o quitar pesadas; el total se recalcula solo.
- Precio por kg (con el del cliente precargado).
- **Total siempre visible y en grande.**
- Sección de pago: total, cobrado, saldo, y campo de **redondeo/descuento**.
- Si el cliente arrastra deuda, aparece arriba: *"Debe S/ 30 del jueves"* con opción de cobrarla aquí.

### 6.3 COBRANZA / RETORNO

El modo estrella para volver cobrando rápido:

- Muestra **solo las tiendas con saldo** (del día + deudas anteriores), **en orden de ruta**.
- Cada fila: nombre · **total a cobrar** (día + deuda desglosado) · botón **Cobrado**.
- Al cobrar, dicta o toca lo que recibe; la app muestra al instante *"Cobras S/ 56.50 · Queda saldo S/ 0.40 a favor del cliente"* o el saldo pendiente si fue pago parcial.
- Contador de progreso: *"Cobradas 32 de 41"*.

### 6.4 CIERRE DEL DÍA

A la hora que él configure (o manual):

- **Repartido:** pollos y piernas entregados vs. stock inicial (y cuántos sobraron/faltan).
- **Cobrado hoy:** total en efectivo → *"Deberías tener S/ 2,130 en caja."* Él lo compara con su plata.
- **Por cobrar:** lo que queda pendiente (pasa como deuda al historial del cliente).
- **Descuentos/redondeos del día:** cuánto dejó de cobrar en total.
- Botón **Cerrar día** que congela la jornada.

### 6.5 TIENDAS (directorio)

Lista maestra de los 50+ clientes: nombre, precio por defecto, si se pesa o no, orden de ruta, saldo actual, notas. Es donde vive la información que hace que el dictado sea corto ("lo de siempre" ya sabe el precio).

### 6.6 HISTORIAL

Días cerrados, con reportes por semana y por mes: total repartido, total cobrado, deudas abiertas por cliente, y descuentos acumulados.

---

## 7. Reglas de negocio clave (lo específico de tu caso)

- **Precio distinto por cliente:** cada tienda tiene su precio por defecto; si dicta uno distinto, manda el dictado y se registra en el historial de ese cliente.
- **Pesar en tandas:** el peso es una lista de pesadas que se suman. Puede agregar tandas después.
- **Entregas sin pesar (clientes de confianza):** marca `sin_pesar`; usa el total dictado o un precio/acuerdo fijo. La tarjeta lo muestra claramente para que no se confunda.
- **Deudas de días anteriores:** viven en el cliente, no en el día. Al cobrar puede saldar día + deuda en un solo movimiento, y la app desglosa cuánto va a cada cosa.
- **Redondeo a favor del cliente:** guardas `totalCalculado` (56.90) y `totalCobrado` (56.50). La diferencia (0.40) se registra como descuento. Puedes tener un ajuste opcional de "redondear siempre hacia abajo a .50 / a .00", pero **el cálculo exacto nunca se pierde**.
- **Merma:** al editar el peso hacia abajo, el total baja solo; opcionalmente registra el motivo "merma".

---

## 8. Inventario y sugerencia de pedido

Como cada día registra stock inicial y lo repartido, la app aprende el patrón:

- Guarda cuántos pollos/piernas mueve por **día de la semana**.
- Con eso sugiere: *"Los lunes repartes ~120 pollos (promedio de las últimas 4 semanas). Sobraron 3 el último lunes. Sugerencia: pide 120."*
- Ajusta según sobrantes/faltantes recientes. Es una recomendación, él decide.

---

## 9. Cosas que quizás estás obviando (sugerencias)

Estas no las mencionaste y valen oro para que la app no falle en la vida real:

1. **Modo offline de verdad.** A las 5am y en ruta la señal falla. La app debe guardar todo localmente y sincronizar/procesar con Gemini cuando vuelva el internet. Sin esto, la app es inusable en campo. *(Lo más importante de toda la lista.)*
2. **Respaldo automático.** Lleva plata y datos de cuentas; si pierde o se le malogra el teléfono, no puede perder el historial. Respaldo en la nube o exportable.
3. **PIN o huella para abrir.** Maneja efectivo y deudas; conviene proteger la app.
4. **Confirmación por sonido/vibración.** Para no mirar la pantalla mientras maneja o pesa.
5. **Cliente que no pagó / deuda vieja.** Marcar deudas incobrables o muy antiguas para que no ensucien el "por cobrar".
6. **Piernas con precio propio.** Las piernas pueden ir por unidad o a otro precio; conviene manejarlas como línea aparte del pollo.
7. **Devoluciones.** A veces devuelven producto; poder registrar una devolución que ajusta el total.
8. **Varias entregas al mismo cliente el mismo día.** Que no las mezcle si vuelve a pasar.
9. **Historial de precios por cliente.** Para detectar si le está dejando muy barato a alguien.
10. **Búsqueda rápida de cliente** por voz o texto ("¿cuánto me debe Milagros?").
11. **Corrección fácil de errores de transcripción.** Un botón "corregir" siempre a mano en la tarjeta de confirmación.
12. **Reporte de cuánto "regala" al mes** por redondeos: puede ser bastante sumado.

---

## 10. Recomendaciones técnicas

- **Offline-first con base de datos local** (por ejemplo SQLite). Toda entrega y cobro se escribe primero en el teléfono; Gemini se llama para interpretar el audio cuando hay internet, y una cola pendiente procesa los audios grabados sin señal.
- **Transcripción:** el reconocimiento de voz de Android funciona offline y es gratis; úsalo para transcribir, y manda el **texto** a Gemini para estructurarlo (más barato y confiable que mandar audio siempre). Cuando hay buena señal, Gemini también acepta el audio directo.
- **Gemini con salida estructurada:** pídele que responda **solo JSON** (sin texto extra, sin ```), define el esquema de la sección 4, y parsea con manejo de errores. Un buen *system prompt* con 3–4 ejemplos de dictados reales tuyos mejora muchísimo la precisión.
- **Stack sugerido:** como ya programas en C#, **.NET MAUI** te deja hacer la app móvil aprovechando lo que sabes. Alternativas sólidas: **Flutter** o **React Native**. Cualquiera sirve; MAUI reduce tu curva de aprendizaje.

---

## 11. Roadmap por fases

**MVP (lo mínimo para usarla en la calle):**
Pantalla Hoy con micrófono · dictado de entrega con Gemini · lista del día · detalle editable · modo cobranza en orden de ruta · cierre del día para cuadrar caja · directorio básico de clientes · **funcionamiento offline**.

**v2 (comodidad):**
Deudas entre días · redondeo con registro de descuento · sugerencia de pedido · reportes semana/mes · respaldo en la nube.

**v3 (pulido):**
Consultas por voz ("¿cuánto me debe X?") · métricas de descuentos y merma · alertas de clientes que deben mucho · afinado del emparejamiento de nombres.

---

*Empieza por el MVP con foco absoluto en el flujo de voz + offline. Si ese circuito (dictar → confirmar → cobrar de vuelta → cuadrar caja) funciona sin fricción, ya tienes una app que él va a usar todos los días.*
