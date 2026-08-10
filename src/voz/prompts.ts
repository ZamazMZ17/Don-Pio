import type { Esquema } from "./gemini";

/**
 * El prompt y el esquema.
 *
 * Gemini hace **una sola cosa**: pasar la frase a campos. No busca al cliente
 * en el directorio, no calcula totales y no decide nada — eso lo hace la app,
 * que es determinista y funciona sin señal. Si el modelo se pusiera a calcular,
 * el mismo dictado daría números distintos según el día.
 */

export const ESQUEMA_INTENCION: Esquema = {
  type: "object",
  properties: {
    intencion: {
      type: "string",
      enum: [
        "nueva_entrega",
        "registrar_pago",
        "abono_deuda",
        "ajuste_entrega",
        "consulta",
        "cargar_stock",
        "desconocida",
      ],
    },
    cliente: {
      type: "string",
      description: "El nombre tal como se dijo, sin inventar apellidos.",
    },
    pollos: { type: "integer", description: "Pollos enteros." },
    piernas: { type: "integer" },
    pechos: {
      type: "integer",
      description: "Pechos o pechugas. Salen de partir un pollo en dos.",
    },
    sinPesar: { type: "boolean" },
    tandasKg: {
      type: "array",
      items: { type: "number" },
      description: "Cada pesada en kilos. '14 kilos 200' es 14.2",
    },
    pesoTotalKg: { type: "number", nullable: true },
    precioPorKg: { type: "number", nullable: true },
    totalDictado: { type: "number", nullable: true },
    monto: { type: "number", nullable: true },
    pagoTodo: { type: "boolean" },
    stockPollos: { type: "integer", nullable: true },
    stockPiernas: { type: "integer", nullable: true },
    notas: { type: "string" },
    transcripcion: {
      type: "string",
      description: "Lo que se oyó, palabra por palabra. Solo al escuchar un audio.",
    },
  },
  required: [
    "intencion",
    "cliente",
    "pollos",
    "piernas",
    "pechos",
    "sinPesar",
    "tandasKg",
    "pagoTodo",
    "notas",
  ],
  propertyOrdering: [
    "intencion",
    "cliente",
    "pollos",
    "piernas",
    "pechos",
    "sinPesar",
    "tandasKg",
    "pesoTotalKg",
    "precioPorKg",
    "totalDictado",
    "monto",
    "pagoTodo",
    "stockPollos",
    "stockPiernas",
    "notas",
    "transcripcion",
  ],
};

const INSTRUCCIONES = `Eres el oído de una app de reparto de pollos en Perú. Recibes lo que un repartidor
dictó mientras maneja o pesa, transcrito por el reconocedor de voz de Android (así que llega
con errores). Tu único trabajo es convertir esa frase en campos. No calcules totales, no
corrijas nombres contra ninguna lista y no expliques nada.

Intenciones:
- nueva_entrega: le está dejando producto a una tienda.
- registrar_pago: le pagaron algo de lo de hoy.
- abono_deuda: le pagaron algo de lo que debía de días anteriores. Úsala solo si menciona
  una deuda, lo de ayer, o lo anterior.
- ajuste_entrega: corrige una entrega ya hecha ("agrégale 2 pollos", "bájale medio kilo").
- consulta: pregunta algo ("¿cuánto me debe X?").
- cargar_stock: dice con cuánto sale ("salgo con 120 pollos").
- desconocida: si no encaja en ninguna. Prefiere esto antes que adivinar.

Reglas que importan:
- Los pesos van en kilos decimales. "catorce kilos doscientos" es 14.2. "diecinueve
  cuatrocientos" es 19.4.
- "a nueve cincuenta el kilo" es precioPorKg 9.5, NO 9 ni 950.
- Si dicta varias pesadas ("primera tanda... segunda tanda..."), ponlas todas en tandasKg
  en orden. Si solo dice un peso, va en pesoTotalKg y tandasKg queda vacío.
- totalDictado solo si dijo el total en soles de frente ("son 42 soles", "total 42").
- "lo de siempre" o "el precio de siempre" significa que NO dictó precio: deja precioPorKg
  en null y pon "lo de siempre" en notas.
- "sin pesar" pone sinPesar en true.
- A veces parte un pollo en dos: el pecho por un lado y la pierna por otro, y cada parte
  puede ir a una tienda distinta. "un pecho", "una pechuga", "la parte del pecho" van en
  pechos. Si nombra el pecho sin decir cuántos, es 1. Las presas se pesan y se cobran al
  mismo precio por kilo que el pollo entero, así que el peso va donde siempre.
- Si en un pago menciona dos cantidades (lo de hoy y lo que debía), suma las dos en monto.
- "pagó todo", "canceló", "me pagó completo" ponen pagoTodo en true y monto en null.
- cliente lleva el nombre tal como se oyó, sin honoríficos añadidos ni apellidos inventados.
  Si no nombra a nadie, cadena vacía.
- Nunca inventes un número que no se dijo. Lo que falte va en null o en 0.

Ejemplos:

"Para don Julio, 8 pollos, primera tanda 14 kilos 200, segunda tanda 12 kilos, a 9.50 el kilo"
{"intencion":"nueva_entrega","cliente":"don Julio","pollos":8,"piernas":0,"pechos":0,"sinPesar":false,
"tandasKg":[14.2,12],"pesoTotalKg":26.2,"precioPorKg":9.5,"totalDictado":null,"monto":null,
"pagoTodo":false,"stockPollos":null,"stockPiernas":null,"notas":""}

"A la bodega Milagros, 6 pollos sin pesar, lo de siempre"
{"intencion":"nueva_entrega","cliente":"bodega Milagros","pollos":6,"piernas":0,"pechos":0,
"sinPesar":true,"tandasKg":[],"pesoTotalKg":null,"precioPorKg":null,"totalDictado":null,
"monto":null,"pagoTodo":false,"stockPollos":null,"stockPiernas":null,"notas":"lo de siempre"}

"Rosa me pagó los 42 de hoy y 30 que debía"
{"intencion":"abono_deuda","cliente":"Rosa","pollos":0,"piernas":0,"pechos":0,"sinPesar":false,
"tandasKg":[],"pesoTotalKg":null,"precioPorKg":null,"totalDictado":null,"monto":72,
"pagoTodo":false,"stockPollos":null,"stockPiernas":null,"notas":""}

"Salgo con 120 pollos y 40 piernas"
{"intencion":"cargar_stock","cliente":"","pollos":0,"piernas":0,"pechos":0,"sinPesar":false,
"tandasKg":[],"pesoTotalKg":null,"precioPorKg":null,"totalDictado":null,"monto":null,
"pagoTodo":false,"stockPollos":120,"stockPiernas":40,"notas":""}`;

/**
 * Se le pasan los nombres del directorio **solo como pista de ortografía**,
 * para que escriba "Quispe" y no "Kispe". Quién es de verdad lo decide
 * `emparejar()`, que sabe de horas y de ruta; el modelo no.
 */
function pistaDe(nombresConocidos: string[]): string {
  return nombresConocidos.length
    ? `\n\nClientes que ya existen (úsalos solo para escribir bien el nombre si es
evidente que se refiere a uno; si no se parece a ninguno, escribe lo que oíste):
${nombresConocidos.slice(0, 80).join(" · ")}`
    : "";
}

export function promptDe(transcripcion: string, nombresConocidos: string[]): string {
  return `${INSTRUCCIONES}${pistaDe(nombresConocidos)}\n\nFrase dictada:\n"""${transcripcion}"""`;
}

/**
 * El prompt cuando Gemini oye el audio original.
 *
 * Es el camino bueno: el reconocedor del teléfono devolvía «hay de cinco
 * pollos» comiéndose el nombre, porque transcribe a ciegas y sin contexto.
 * Oyendo el audio, el modelo tiene las pausas y la entonación, que es donde
 * está la separación entre el nombre y las cantidades.
 */
export function promptAudio(nombresConocidos: string[]): string {
  return `${INSTRUCCIONES}${pistaDe(nombresConocidos)}

Esta vez recibes el **audio** del repartidor, no una transcripción. Escúchalo entero antes
de responder. Es habla peruana informal, grabada en la calle o dentro de una camioneta, con
ruido de fondo, y con pausas en medio de la frase: las pausas no significan que terminó.

Además de los campos de siempre, pon en "transcripcion" lo que oíste palabra por palabra,
sin corregir ni completar. Si una parte no se entiende, escribe [...] en ese hueco y deja el
campo correspondiente en null o en 0 — nunca inventes un número ni un nombre.`;
}
