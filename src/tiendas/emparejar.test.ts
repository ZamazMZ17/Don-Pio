import { describe, expect, it } from "vitest";
import { tiendaNueva, type Tienda } from "../db/db";
import { aprender, emparejar, mediana, type Contexto } from "./emparejar";
import { normalizar, parecido } from "./normalizar";

/** Una tienda de prueba con las señales ya pobladas. */
function tienda(
  id: number,
  nombre: string,
  señales: Partial<Pick<Tienda, "minutos" | "posiciones" | "precedentes" | "ordenRuta">> = {},
): Tienda {
  return {
    ...tiendaNueva(nombre, normalizar(nombre)),
    id,
    minutos: [],
    posiciones: [],
    precedentes: {},
    ordenRuta: 0,
    ...señales,
  };
}

const ctx = (minuto: number, posicion = 1, anteriorId?: number): Contexto => ({
  minuto,
  posicion,
  anteriorId,
});

describe("normalizar nombres dictados", () => {
  it("quita honoríficos y artículos", () => {
    expect(normalizar("Para la señora Rosa Quispe")).toBe("rosa quispe");
    expect(normalizar("don Julio Ramírez")).toBe("julio ramirez");
  });

  it("quita el tipo de local, que él dicta unas veces sí y otras no", () => {
    expect(normalizar("Bodega Milagros")).toBe("milagros");
    expect(normalizar("A la bodega Milagros")).toBe("milagros");
  });

  it("empareja pese a los errores del reconocedor", () => {
    expect(parecido(normalizar("Rossa Kispe"), normalizar("Rosa Quispe"))).toBeGreaterThan(
      0.7,
    );
  });

  it("no confunde a dos personas con el mismo nombre de pila", () => {
    expect(parecido(normalizar("Rosa Flores"), normalizar("Rosa Quispe"))).toBeLessThan(
      0.7,
    );
  });

  it("devuelve vacío si el dictado no nombró a nadie", () => {
    expect(normalizar("para la señora de la bodega")).toBe("");
  });
});

describe("mediana", () => {
  it("resiste un día raro que el promedio sí movería", () => {
    // Cuatro días normales a las 7:00 y uno que se atrasó a las 14:00.
    expect(mediana([420, 425, 430, 428, 840])).toBe(428);
  });

  it("es null sin datos", () => {
    expect(mediana([])).toBe(null);
  });
});

describe("en frío, con la base vacía", () => {
  it("todo dictado crea tienda nueva", () => {
    const r = emparejar("Doña Elsa", [], ctx(430));
    expect(r.decision).toBe("nueva");
  });

  it("un dictado sin nombre no inventa una tienda", () => {
    const r = emparejar("para la bodega", [tienda(1, "Doña Elsa")], ctx(430));
    expect(r.decision).toBe("nueva");
    expect(r.buscado).toBe("");
  });
});

describe("★ homónimas: nombre + hora", () => {
  // El caso exacto del dueño: dos clientas que se llaman igual, una temprano
  // cerca del punto de partida y otra bastante más tarde.
  const elsaTemprano = tienda(1, "Doña Elsa", {
    minutos: [380, 390, 385, 395], // ~6:25
    posiciones: [1, 2, 1, 2],
    ordenRuta: 2,
  });
  const elsaTarde = tienda(2, "Doña Elsa", {
    minutos: [640, 650, 655, 645], // ~10:45
    posiciones: [7, 8, 7, 7],
    ordenRuta: 7,
  });
  const dos = [elsaTemprano, elsaTarde];

  it("a las 6:30 elige a la de la mañanita", () => {
    const r = emparejar("Elsa", dos, ctx(390, 2));
    expect(r.decision).toBe("encontrada");
    expect(r.mejor?.tienda.id).toBe(1);
  });

  it("a las 10:45 elige a la de la tarde", () => {
    const r = emparejar("Elsa", dos, ctx(645, 7));
    expect(r.decision).toBe("encontrada");
    expect(r.mejor?.tienda.id).toBe(2);
  });

  it("a media mañana no adivina: pregunta", () => {
    // Justo en el medio, ninguna señal manda. Equivocarse aquí le cobraría
    // a quien no era, así que se muestra la lista para elegir.
    const r = emparejar("Elsa", dos, ctx(515, 4));
    expect(r.decision).toBe("ambiguo");
    expect(r.candidatas).toHaveLength(2);
  });

  it("cada candidata trae con qué distinguirla", () => {
    const r = emparejar("Elsa", dos, ctx(515, 4));
    const textos = r.candidatas.map((c) => c.distintivo);
    expect(textos).toContain("parada 2 · sueles verla 6:28");
    expect(textos).toContain("parada 7 · sueles verla 10:48");
  });
});

describe("★ homónimas: la secuencia de la ruta", () => {
  it("desempata por a quién le entregó justo antes", () => {
    // Dos Carmen a la misma hora. La única diferencia es que una va siempre
    // después de la tienda 9 y la otra después de la 10.
    const a = tienda(1, "Carmen", {
      minutos: [500, 505],
      posiciones: [4, 4],
      precedentes: { 9: 6 },
    });
    const b = tienda(2, "Carmen", {
      minutos: [500, 505],
      posiciones: [4, 4],
      precedentes: { 10: 6 },
    });

    expect(emparejar("Carmen", [a, b], ctx(502, 4, 9)).mejor?.tienda.id).toBe(1);
    expect(emparejar("Carmen", [a, b], ctx(502, 4, 10)).mejor?.tienda.id).toBe(2);
  });
});

describe("la hora desempata, pero nunca inventa", () => {
  it("un nombre nuevo no secuestra a una tienda que encaja en hora", () => {
    // Carmen es clienta nueva. Que Elsa cuadre perfecto con la hora y la
    // parada no puede convertir a Carmen en Elsa.
    const elsa = tienda(1, "Doña Elsa", {
      minutos: [430, 430, 430],
      posiciones: [3, 3, 3],
      ordenRuta: 3,
    });
    const r = emparejar("Carmen Huamán", [elsa], ctx(430, 3));
    expect(r.decision).toBe("nueva");
  });

  it("reconoce a la de siempre aunque llegue a deshora", () => {
    // Se le pinchó la llanta y llega tres horas tarde. Sigue siendo ella.
    const julio = tienda(1, "Don Julio Ramírez", {
      minutos: [420, 425, 430],
      posiciones: [2, 2, 2],
    });
    const r = emparejar("don Julio", [julio], ctx(610, 2));
    expect(r.decision).toBe("encontrada");
    expect(r.mejor?.tienda.id).toBe(1);
  });

  it("empareja pese a una transcripción mala", () => {
    const rosa = tienda(1, "Sra. Rosa Quispe", { minutos: [480], posiciones: [3] });
    const r = emparejar("la señora Rossa Kispe", [rosa], ctx(485, 3));
    expect(r.decision).toBe("encontrada");
  });

  it("«Milagros» encuentra a «Bodega Milagros»", () => {
    const m = tienda(1, "Bodega Milagros", { minutos: [400], posiciones: [1] });
    expect(emparejar("Milagros", [m], ctx(400, 1)).decision).toBe("encontrada");
    expect(emparejar("la bodega Milagros", [m], ctx(400, 1)).decision).toBe("encontrada");
  });

  it("no mezcla a dos tiendas de nombres distintos", () => {
    const sarita = tienda(1, "Bodega Sarita", { minutos: [500], posiciones: [6] });
    const r = emparejar("Bodega Milagros", [sarita], ctx(500, 6));
    expect(r.decision).toBe("nueva");
  });
});

describe("un nombre a medias no se confirma solo porque la tienda es nueva", () => {
  it("una tienda recién creada a mano, sin historial, no 'respalda' un nombre parecido", () => {
    // "Rosi" contra "Rosa": nombre a medias (ni calcado ni descartable). La
    // tienda es de las que se agregan a mano desde Tiendas, sin una sola
    // entrega encima — cero historial, no un historial flojo de verdad.
    // `puntajeHora`/`puntajeSecuencia` devuelven 0.5 ("ni a favor ni en
    // contra") justamente para no penalizarla frente a otras tiendas al
    // ordenar candidatas, pero ese mismo neutral no puede colarse como si
    // fuera "el contexto sí la respalda": sin ninguna entrega previa no hay
    // nada que respalde nada, y confirmarla en automático le cargaría la
    // entrega de "Rosi" a la cuenta de "Rosa".
    const rosa = tienda(1, "Rosa");
    const r = emparejar("Rosi", [rosa], ctx(500, 1));
    expect(r.decision).toBe("ambiguo");
  });

  it("pero si el contexto sí respalda de verdad (aunque el nombre sea el mismo a medias), se confirma", () => {
    const rosa = tienda(1, "Rosa", { minutos: [500, 500, 500], posiciones: [1, 1, 1] });
    const r = emparejar("Rosi", [rosa], ctx(500, 1));
    expect(r.decision).toBe("encontrada");
  });
});

describe("★ dos clientas del mismo nombre en un mismo día", () => {
  it("si ya le dejó a esa Juanita, la siguiente es otra", () => {
    // «En la entrega 5 hay una Juanita y en la 35 hay otra Juanita, no son
    // iguales.» Casi nunca reparte dos veces al mismo cliente en el día.
    const juanita = tienda(1, "Juanita", { minutos: [400], posiciones: [5], ordenRuta: 5 });

    // Sin haberle dejado hoy: la encuentra.
    expect(emparejar("Juanita", [juanita], ctx(410, 6)).decision).toBe("encontrada");

    // Ya le dejó hoy: propone crear otra.
    const r = emparejar("Juanita", [juanita], { ...ctx(640, 35), yaEntregadas: [1] });
    expect(r.decision).toBe("nueva");
  });

  it("pero la existente sigue en la lista, por si de verdad repitió", () => {
    const juanita = tienda(1, "Juanita", { minutos: [400], posiciones: [5] });
    const r = emparejar("Juanita", [juanita], { ...ctx(640, 35), yaEntregadas: [1] });
    expect(r.candidatas).toHaveLength(1);
    expect(r.candidatas[0].distintivo).toContain("ya le dejaste hoy");
  });
});

describe("aprender", () => {
  it("acumula las señales de una entrega confirmada", () => {
    const t = aprender(tienda(1, "Doña Elsa"), ctx(430, 3, 7));
    expect(t.minutos).toEqual([430]);
    expect(t.posiciones).toEqual([3]);
    expect(t.precedentes).toEqual({ 7: 1 });
    expect(t.vistas).toBe(1);
    expect(t.ordenRuta).toBe(3);
  });

  it("guarda como alias la forma nueva en que la nombró", () => {
    const t = aprender(tienda(1, "Doña Elsa"), ctx(430, 3), "Elsita la del mercado");
    expect(t.alias).toEqual(["elsita"]);
  });

  it("no duplica un alias ni guarda el nombre que ya tiene", () => {
    const uno = aprender(tienda(1, "Doña Elsa"), ctx(430, 3), "Elsita");
    const dos = aprender(uno, ctx(435, 3), "Elsita");
    const tres = aprender(dos, ctx(440, 3), "doña Elsa");
    expect(tres.alias).toEqual(["elsita"]);
  });

  it("el alias aprendido sirve para emparejar después", () => {
    const t = aprender(tienda(1, "Bodega Milagros"), ctx(400, 1), "la tienda de Yuli");
    expect(emparejar("Yuli", [t], ctx(405, 1)).decision).toBe("encontrada");
  });

  it("recorta la memoria y sigue el orden de ruta si la parada cambia", () => {
    // Si la ruta se reordena, las paradas viejas van saliendo solas.
    let t = tienda(1, "Doña Elsa");
    for (let i = 0; i < 45; i++) t = aprender(t, ctx(430, 3));
    expect(t.minutos).toHaveLength(40);
    for (let i = 0; i < 40; i++) t = aprender(t, ctx(600, 8));
    expect(t.ordenRuta).toBe(8);
  });
});
