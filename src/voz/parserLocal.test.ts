import { describe, expect, it } from "vitest";
import { palabrasANumeros } from "./numeros";
import { interpretarLocal } from "./parserLocal";

describe("números dictados", () => {
  it("convierte los que se componen", () => {
    expect(palabrasANumeros("ocho pollos")).toBe("8 pollos");
    expect(palabrasANumeros("ciento veinte pollos")).toBe("120 pollos");
    expect(palabrasANumeros("treinta y cinco")).toBe("35");
    expect(palabrasANumeros("doscientos cincuenta")).toBe("250");
    expect(palabrasANumeros("mil doscientos cuarenta")).toBe("1240");
  });

  it("parte «nueve cincuenta» en dos, que es lo que él quiere decir", () => {
    // Cincuenta y nueve se dice al revés, así que esto no es 59: es un precio.
    expect(palabrasANumeros("a nueve cincuenta el kilo")).toBe("a 9 50 el kilo");
  });

  it("mantiene juntas las palabras que no son números", () => {
    expect(palabrasANumeros("Para don Julio, ocho pollos")).toBe("para don julio, 8 pollos");
  });

  it("no se come la «y» de verdad", () => {
    expect(palabrasANumeros("120 pollos y 40 piernas")).toBe("120 pollos y 40 piernas");
  });

  it("entiende «medio»", () => {
    expect(palabrasANumeros("bajale medio kilo")).toBe("bajale 0.5 kilo");
  });
});

describe("dictados reales del plan §4.1", () => {
  it("«Para don Julio, 8 pollos, primera tanda 14 kilos 200, segunda tanda 12 kilos, a 9.50 el kilo»", () => {
    const i = interpretarLocal(
      "Para don Julio, 8 pollos, primera tanda 14 kilos 200, segunda tanda 12 kilos, a 9.50 el kilo",
    );
    expect(i.intencion).toBe("nueva_entrega");
    expect(i.cliente).toBe("don Julio");
    expect(i.pollos).toBe(8);
    expect(i.tandasKg).toEqual([14.2, 12]);
    expect(i.pesoTotalKg).toBe(26.2);
    expect(i.precioPorKg).toBe(9.5);
  });

  it("«Señora Rosa, 5 pollos, total 42 soles»", () => {
    const i = interpretarLocal("Señora Rosa, 5 pollos, total 42 soles");
    expect(i.intencion).toBe("nueva_entrega");
    expect(i.cliente).toBe("Señora Rosa");
    expect(i.pollos).toBe(5);
    expect(i.totalDictado).toBe(42);
    expect(i.tandasKg).toEqual([]);
  });

  it("«A la bodega Milagros, 6 pollos sin pesar, lo de siempre»", () => {
    const i = interpretarLocal("A la bodega Milagros, 6 pollos sin pesar, lo de siempre");
    expect(i.intencion).toBe("nueva_entrega");
    expect(i.cliente).toBe("bodega Milagros");
    expect(i.pollos).toBe(6);
    expect(i.sinPesar).toBe(true);
    // Sin precio: la app usa el que ya tiene guardado de esa tienda.
    expect(i.precioPorKg).toBe(null);
    expect(i.notas).toBe("lo de siempre");
  });

  it("«Rosa me pagó los 42 de hoy y 30 que debía»", () => {
    const i = interpretarLocal("Rosa me pagó los 42 de hoy y 30 que debía");
    expect(i.intencion).toBe("abono_deuda");
    expect(i.cliente).toBe("Rosa");
    // Las dos cuentas juntas: registrarCobro ya sabe repartirlas.
    expect(i.monto).toBe(72);
  });
});

describe("dictado con todo en palabras, que es como sale del reconocedor", () => {
  it("«Para la señora Carmen, seis pollos, diecinueve kilos cuatrocientos, a nueve cincuenta el kilo»", () => {
    const i = interpretarLocal(
      "Para la señora Carmen, seis pollos, diecinueve kilos cuatrocientos, a nueve cincuenta el kilo",
    );
    expect(i.intencion).toBe("nueva_entrega");
    expect(i.cliente).toBe("señora Carmen");
    expect(i.pollos).toBe(6);
    expect(i.pesoTotalKg).toBe(19.4);
    expect(i.precioPorKg).toBe(9.5);
    // 19.4 x 9.50 = 184.30, el número de la tarjeta del diseño.
    expect(Math.round(i.pesoTotalKg! * i.precioPorKg! * 100) / 100).toBe(184.3);
  });
});

describe("el nombre se guarda como él lo dice", () => {
  it("conserva mayúsculas y tildes", () => {
    // Si se guardara «don julio ramirez», el directorio mostraría algo que él
    // no reconoce cuando lo ve escrito.
    expect(interpretarLocal("Para don Julio Ramírez, 8 pollos").cliente).toBe(
      "don Julio Ramírez",
    );
    expect(interpretarLocal("Doña Elsa, 7 pollos").cliente).toBe("Doña Elsa");
  });

  it("corta el nombre aunque la cantidad venga en palabras", () => {
    expect(interpretarLocal("Para la señora Carmen ocho pollos").cliente).toBe("señora Carmen");
  });

  it("no se queda con media frase si no hay coma ni número", () => {
    expect(interpretarLocal("Rosa pagó todo").cliente).toBe("Rosa");
  });
});

describe("pesos como los dice de verdad", () => {
  it("«7 kilos con 200» son 7.2, no 7", () => {
    // Este se le guardó como 7 kg pelados y le faltaban 200 gramos.
    expect(interpretarLocal("Juan, 5 pollos, 7 kilos con 200").pesoTotalKg).toBe(7.2);
  });

  it("«siete kilos y doscientos» también", () => {
    expect(interpretarLocal("Juan, 5 pollos, siete kilos y doscientos").pesoTotalKg).toBe(7.2);
  });

  it("«7.200 kilos» de una sola pieza", () => {
    expect(interpretarLocal("Juan, 5 pollos, 7.200 kilos").pesoTotalKg).toBe(7.2);
  });

  it("«7 kilos» a secas siguen siendo 7", () => {
    expect(interpretarLocal("Juan, 5 pollos, 7 kilos").pesoTotalKg).toBe(7);
  });

  it("el precio sin artículo: «a 5.50 kg»", () => {
    expect(interpretarLocal("Juan, 5 pollos, 7 kilos, a 5.50 kg").precioPorKg).toBe(5.5);
  });

  it("y dicho en palabras: «a cinco cincuenta el kilo»", () => {
    expect(interpretarLocal("Juan, 5 pollos, a cinco cincuenta el kilo").precioPorKg).toBe(5.5);
  });

  it("el «con» del peso no se confunde con el precio", () => {
    const i = interpretarLocal("Juan, 5 pollos, 7 kilos con 200, a 9.50 el kilo");
    expect(i.pesoTotalKg).toBe(7.2);
    expect(i.precioPorKg).toBe(9.5);
  });
});

describe("cuando el dictado no dice «kilos» ni «el kilo»", () => {
  it("«cinco pollos 12 750 a 9 30» rellena peso y precio igual", () => {
    // Es como sale del reconocedor cuando habla rápido: sin las palabras que
    // marcan los campos. Antes esos dos quedaban vacíos.
    const i = interpretarLocal("Juanita cinco pollos 12 750 a 9 30");
    expect(i.pollos).toBe(5);
    expect(i.pesoTotalKg).toBe(12.75);
    expect(i.precioPorKg).toBe(9.3);
  });

  it("no se inventa el precio cuando no hay decimales que lo delaten", () => {
    const i = interpretarLocal("Juanita cinco pollos 12 kilos");
    expect(i.pesoTotalKg).toBe(12);
    expect(i.precioPorKg).toBe(null);
  });

  it("lo que sí se reconoció no se pisa", () => {
    const i = interpretarLocal("Juanita 5 pollos, 12 kilos 750, a 9.30 el kilo");
    expect(i.pesoTotalKg).toBe(12.75);
    expect(i.precioPorKg).toBe(9.3);
  });
});

describe("pollos partidos", () => {
  it("«un pecho y una pierna» reparte las dos presas", () => {
    const i = interpretarLocal("Para Doña Elsa, un pecho y una pierna, 2 kilos, a 9.60 el kilo");
    expect(i.intencion).toBe("nueva_entrega");
    expect(i.pechos).toBe(1);
    expect(i.piernas).toBe(1);
    expect(i.pollos).toBe(0);
    expect(i.precioPorKg).toBe(9.6);
  });

  it("nombrar el pecho sin cantidad cuenta como uno", () => {
    // «el pecho para la Rosa» — no dice «un», pero es uno.
    expect(interpretarLocal("Rosa, el pecho, 1 kilo 200").pechos).toBe(1);
  });

  it("entiende «pechuga» igual que «pecho»", () => {
    expect(interpretarLocal("Sarita, 2 pechugas, 2 kilos 400").pechos).toBe(2);
  });

  it("una entrega solo de presas sigue siendo una entrega", () => {
    // Sin pollos enteros ni peso dictado, antes salía «desconocida».
    expect(interpretarLocal("Para Elsa, 3 pechos").intencion).toBe("nueva_entrega");
  });

  it("no confunde pollos enteros con presas", () => {
    const i = interpretarLocal("Julio, 8 pollos, 26 kilos, a 9.50 el kilo");
    expect(i.pollos).toBe(8);
    expect(i.pechos).toBe(0);
  });
});

describe("pagos", () => {
  it("«Rosa pagó todo»", () => {
    const i = interpretarLocal("Rosa pagó todo");
    expect(i.intencion).toBe("registrar_pago");
    expect(i.pagoTodo).toBe(true);
    expect(i.monto).toBe(null);
  });

  it("«me dio 50»", () => {
    const i = interpretarLocal("Julio me dio 50");
    expect(i.intencion).toBe("registrar_pago");
    expect(i.monto).toBe(50);
    expect(i.pagoTodo).toBe(false);
  });

  it("«abonó 30 de lo que debía» es abono a la deuda", () => {
    const i = interpretarLocal("Elsa abonó 30 de lo que debía");
    expect(i.intencion).toBe("abono_deuda");
    expect(i.monto).toBe(30);
  });

  it("un pago no se lleva por delante las cantidades", () => {
    const i = interpretarLocal("Rosa pagó todo");
    expect(i.pollos).toBe(0);
  });
});

describe("las demás intenciones", () => {
  it("«Salgo con 120 pollos y 40 piernas»", () => {
    const i = interpretarLocal("Salgo con 120 pollos y 40 piernas");
    expect(i.intencion).toBe("cargar_stock");
    expect(i.stockPollos).toBe(120);
    expect(i.stockPiernas).toBe(40);
    expect(i.cliente).toBe("");
  });

  it("«¿Cuánto me debe la bodega Milagros?»", () => {
    const i = interpretarLocal("¿Cuánto me debe la bodega Milagros?");
    expect(i.intencion).toBe("consulta");
  });

  it("«A Julio agrégale 2 pollos más»", () => {
    const i = interpretarLocal("A Julio agrégale 2 pollos más");
    expect(i.intencion).toBe("ajuste_entrega");
    expect(i.pollos).toBe(2);
  });

  it("«a Rosa bájale medio kilo por merma»", () => {
    const i = interpretarLocal("a Rosa bájale medio kilo por merma");
    expect(i.intencion).toBe("ajuste_entrega");
    expect(i.tandasKg).toEqual([0.5]);
  });
});

describe("lo que no entiende", () => {
  it("no se traga un dictado vacío", () => {
    expect(interpretarLocal("").intencion).toBe("desconocida");
  });

  it("marca desconocida en vez de inventar una entrega", () => {
    // Sin cantidad ni peso no hay entrega que registrar: la tarjeta lo pide.
    expect(interpretarLocal("este micrófono no sirve").intencion).toBe("desconocida");
  });
});
