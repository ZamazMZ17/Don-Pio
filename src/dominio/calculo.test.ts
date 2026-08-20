import { describe, expect, it } from "vitest";
import {
  calcular,
  estadoDe,
  precioImplicito,
  redondearAbajo,
  repartirPago,
  sumarTandas,
} from "./calculo";
import { aCentimos, aGramos, money, totalDePeso } from "../lib/dinero";

describe("peso y total", () => {
  it("suma las tandas exactamente", () => {
    // 14.2 + 12.0 del ejemplo del plan §4.3. En gramos no hay resto flotante.
    expect(sumarTandas([aGramos(14.2), aGramos(12.0)])).toBe(26200);
  });

  it("calcula peso x precio como en el prototipo", () => {
    const c = calcular({
      tandas: [aGramos(14.2), aGramos(12.0)],
      precioKg: aCentimos(9.5),
    });
    expect(c.peso).toBe(26200);
    expect(c.origen).toBe("peso");
    // 26.2 kg x 9.50 = 248.90, el número que muestra la tarjeta del diseño.
    expect(money(c.total)).toBe("S/ 248.90");
  });

  it("las tandas mandan sobre un peso suelto contradictorio", () => {
    // Si agregó una pesada después, el peso viejo ya no vale.
    const c = calcular({
      tandas: [aGramos(10), aGramos(5)],
      peso: aGramos(99),
      precioKg: aCentimos(10),
    });
    expect(c.peso).toBe(15000);
    expect(money(c.total)).toBe("S/ 150.00");
  });

  it("el total dictado manda sobre el cálculo", () => {
    // «Señora Rosa, 5 pollos, total 42 soles.»
    const c = calcular({ totalDictado: aCentimos(42), sinPesar: true, pollos: 5 });
    expect(c.origen).toBe("dictado");
    expect(money(c.total)).toBe("S/ 42.00");
  });

  it("deduce el precio por kilo cuando dicta total y peso", () => {
    // Es lo que luego deja ver si a alguien le está dejando el kilo muy barato.
    const c = calcular({ peso: aGramos(20), totalDictado: aCentimos(190) });
    expect(c.precioKg).toBe(aCentimos(9.5));
  });

  it("sin pesar cobra por pollo", () => {
    // «A la bodega Milagros, 6 pollos sin pesar, lo de siempre.»
    const c = calcular({ sinPesar: true, pollos: 6, precioPollo: aCentimos(28) });
    expect(c.origen).toBe("pollos");
    expect(money(c.total)).toBe("S/ 168.00");
    expect(c.peso).toBe(0);
  });

  it("marca incompleto en vez de inventar un total", () => {
    // Si Gemini no sacó el precio, la tarjeta tiene que pedirlo, no poner 0
    // como si fuera gratis.
    expect(calcular({ pollos: 8 }).origen).toBe("incompleto");
    expect(calcular({ peso: aGramos(20) }).origen).toBe("incompleto");
  });

  it("no acumula error flotante en una jornada entera", () => {
    // 41 entregas de 248.90: con flotantes esto deja un resto que el
    // repartidor no encuentra en el bolsillo.
    const una = totalDePeso(aCentimos(9.5), aGramos(26.2));
    const total = Array.from({ length: 41 }).reduce<number>((a) => a + una, 0);
    expect(total).toBe(41 * 24890);
    expect(money(total)).toBe("S/ 10,204.90");
  });
});

describe("precio implícito", () => {
  it("devuelve 0 si no hay peso, en vez de dividir por cero", () => {
    expect(precioImplicito(aCentimos(42), 0)).toBe(0);
  });
});

describe("reparto de un pago", () => {
  const deuda = aCentimos(30); // «Debe S/ 30 del jueves»
  const dia = aCentimos(248.9);

  it("paga primero la deuda vieja", () => {
    const r = repartirPago(aCentimos(50), deuda, dia);
    expect(money(r.aDeuda)).toBe("S/ 30.00");
    expect(money(r.aHoy)).toBe("S/ 20.00");
    expect(money(r.restante)).toBe("S/ 228.90");
  });

  it("un pago menor a la deuda no toca lo de hoy", () => {
    const r = repartirPago(aCentimos(10), deuda, dia);
    expect(money(r.aDeuda)).toBe("S/ 10.00");
    expect(r.aHoy).toBe(0);
  });

  it("pagar todo deja saldo cero y sin vuelto", () => {
    const r = repartirPago(deuda + dia, deuda, dia);
    expect(r.restante).toBe(0);
    expect(r.vuelto).toBe(0);
    expect(r.esRedondeo).toBe(false);
  });

  it("reconoce el redondeo a favor del cliente", () => {
    // El caso del plan §3.5: la cuenta es 56.90 y le dan 56.50.
    const r = repartirPago(aCentimos(56.5), 0, aCentimos(56.9));
    expect(money(r.restante)).toBe("S/ 0.40");
    expect(r.esRedondeo).toBe(true);
  });

  it("no llama redondeo a lo que es una deuda de verdad", () => {
    // Veinte soles es el tope, inclusive: hasta ahí puede ser un descuento por
    // producto en mal estado. Por encima se quedó debiendo, y perdonarlo solo
    // le escondería plata.
    expect(repartirPago(aCentimos(36.9), 0, aCentimos(56.9)).esRedondeo).toBe(true);
    expect(repartirPago(aCentimos(36.89), 0, aCentimos(56.9)).esRedondeo).toBe(false);
    expect(repartirPago(aCentimos(20), 0, aCentimos(56.9)).esRedondeo).toBe(false);
  });

  it("registra el vuelto cuando da de más", () => {
    const r = repartirPago(aCentimos(300), deuda, dia);
    expect(r.restante).toBe(0);
    expect(money(r.vuelto)).toBe("S/ 21.10");
  });

  it("ignora un monto negativo en vez de regalar plata", () => {
    const r = repartirPago(aCentimos(-50), deuda, dia);
    expect(r.aDeuda).toBe(0);
    expect(r.aHoy).toBe(0);
  });
});

describe("redondeo hacia abajo", () => {
  it("baja al medio sol y al sol", () => {
    expect(money(redondearAbajo(aCentimos(56.9), 50))).toBe("S/ 56.50");
    expect(money(redondearAbajo(aCentimos(56.9), 100))).toBe("S/ 56.00");
  });

  it("deja quieto lo que ya es redondo", () => {
    expect(redondearAbajo(aCentimos(56.5), 50)).toBe(aCentimos(56.5));
  });
});

describe("estado de pago", () => {
  it("distingue los tres estados", () => {
    expect(estadoDe(aCentimos(100), 0)).toBe("pendiente");
    expect(estadoDe(aCentimos(100), aCentimos(40))).toBe("parcial");
    expect(estadoDe(aCentimos(100), aCentimos(100))).toBe("pagado");
  });

  it("cuenta como pagado si dio de más", () => {
    expect(estadoDe(aCentimos(100), aCentimos(120))).toBe("pagado");
  });
});
