import { describe, expect, it } from "vitest";
import { interpretarLocal } from "./parserLocal";

/**
 * Dictados reales, sacados del teléfono después de un día de reparto.
 *
 * No son ejemplos inventados: es exactamente lo que el reconocedor de voz
 * escribió en la calle, con sus muletillas, sus «a 9.80» sin decir «el kilo» y
 * sus «53.50 soles» sin decir «total». Cada uno que falla aquí es una entrega
 * que él tuvo que corregir a mano, así que este archivo es la medida de si el
 * dictado sirve o no sin depender de la API.
 */

/** `undefined` = no se comprueba ese campo. */
interface Caso {
  dicho: string;
  cliente?: string;
  pollos?: number;
  piernas?: number;
  kg?: number | null;
  precio?: number | null;
  total?: number | null;
}

const CASOS: Caso[] = [
  // ── Peso y precio, la forma más común ────────────────────────────────
  { dicho: "Ayde 2 pollos y 2 piernas peso total 8.200 a 9.70 el kilo", cliente: "Ayde", pollos: 2, piernas: 2, kg: 8.2, precio: 9.7 },
  { dicho: "Chela tres pollos 11 kg 880 A 9.50", cliente: "Chela", pollos: 3, kg: 11.88, precio: 9.5 },
  { dicho: "Cliente dorado tres pollos 9 kg 440 a 9.80", cliente: "dorado", pollos: 3, kg: 9.44, precio: 9.8 },
  { dicho: "Cliente Anita cuatro pollos 12 kg 400 a 970", cliente: "Anita", pollos: 4, kg: 12.4, precio: 9.7 },
  { dicho: "Anita dos pollos 6 kg 300 a 9.80", cliente: "Anita", pollos: 2, kg: 6.3, precio: 9.8 },
  { dicho: "El sol cuatro pollos 11 kg 800 a 9.80", pollos: 4, kg: 11.8, precio: 9.8 },
  { dicho: "Oxa 4 pollos 13.190 kg a 10 soles", cliente: "Oxa", pollos: 4, kg: 13.19, precio: 10 },
  { dicho: "Erika tres pollos 10 kg con 600 a 10 soles", cliente: "Erika", pollos: 3, kg: 10.6, precio: 10 },
  { dicho: "Vecina de Julia un pollo 2.75 kg a 9.50 soles", pollos: 1, kg: 2.75, precio: 9.5 },
  { dicho: "Vecina de chihuán tres pollos una pierna 11.230 kg a 10", pollos: 3, piernas: 1, kg: 11.23, precio: 10 },
  { dicho: "Lechera un pollo 2.970 kg a 10 soles por kilo", cliente: "Lechera", pollos: 1, kg: 2.97, precio: 10 },
  { dicho: "Restaurante 1 pollo 2.50 kg a 9.8 por kilo", pollos: 1, kg: 2.5, precio: 9.8 },
  { dicho: "Anita Aza 2 pollos, 6.300 kg a 9.8 el kilo", cliente: "Anita Aza", pollos: 2, kg: 6.3, precio: 9.8 },
  { dicho: "Alexa un pollo 3 kg 660", cliente: "Alexa", pollos: 1, kg: 3.66 },
  { dicho: "Sonia 10 pollos 27 kg", cliente: "Sonia", pollos: 10, kg: 27 },
  { dicho: "Julia cuatro pollos y dos piernas 12.28 kilos", cliente: "Julia", pollos: 4, piernas: 2, kg: 12.28 },

  // ── El reconocedor escribe el precio como una hora ───────────────────
  { dicho: "Adrián tres pollos 7 kilos 930 a 9:40", cliente: "Adrián", pollos: 3, kg: 7.93, precio: 9.4 },

  // ── Peso sin la palabra «kilo» ───────────────────────────────────────
  { dicho: "Hijo de Juanita un pollo 2.550 a 9.80", pollos: 1, kg: 2.55, precio: 9.8 },
  { dicho: "Raquel 5 pollos 13.700", cliente: "Raquel", pollos: 5, kg: 13.7 },

  // ── Dos pesajes ──────────────────────────────────────────────────────
  { dicho: "Cliente Lola ocho pollos primer pesaje 11 kg segundo pesaje 10 kg 560 a 9 soles con 30", cliente: "Lola", pollos: 8, kg: 21.56, precio: 9.3 },
  { dicho: "Juanita ocho pollos primer pesaje 13 kg 400 segundo pesaje 12 kg 990 a 9.80", cliente: "Juanita", pollos: 8, kg: 26.39, precio: 9.8 },

  // ── Total dicho de frente, con y sin la palabra «total» ──────────────
  { dicho: "Cliente Esperanza 2 pollos da un total de 36.40 soles", cliente: "Esperanza", pollos: 2, total: 36.4 },
  { dicho: "Marina 1 pollo total 33.2 soles", cliente: "Marina", pollos: 1, total: 33.2 },
  { dicho: "Lucy 1 pollo  total 30.40 soles", cliente: "Lucy", pollos: 1, total: 30.4 },
  { dicho: "Inés dos pollos total 62.50 soles", cliente: "Inés", pollos: 2, total: 62.5 },
  { dicho: "Doris dos pollos total 52 soles", cliente: "Doris", pollos: 2, total: 52 },
  { dicho: "Rebeca un pollo 27 soles en total", cliente: "Rebeca", pollos: 1, total: 27 },
  { dicho: "Polleria 1 pollo 26.80 soles en total", pollos: 1, total: 26.8 },
  { dicho: "Calacho 1 pollo 37.80 soles en total", cliente: "Calacho", pollos: 1, total: 37.8 },
  { dicho: "Mariela 1 pollo 18 soles en total", cliente: "Mariela", pollos: 1, total: 18 },
  { dicho: "Marina cochas 3 pollos 74.00 soles en total", cliente: "Marina cochas", pollos: 3, total: 74 },

  // Sin decir «total»: el «soles» al final basta para saber que es la cuenta.
  { dicho: "Soledad dos pollos 53.50 soles", cliente: "Soledad", pollos: 2, total: 53.5 },
  { dicho: "Irma un pollo 26.60 soles", cliente: "Irma", pollos: 1, total: 26.6 },
  { dicho: "Marina 3 pollos 74 soles", cliente: "Marina", pollos: 3, total: 74 },
  { dicho: "Laguna, 1 pollo 16 soles", cliente: "Laguna", pollos: 1, total: 16 },

  // ── «con» separando los céntimos del total ───────────────────────────
  { dicho: "Lili dos pollos un total de 71 con 80 soles", cliente: "Lili", pollos: 2, total: 71.8 },
  { dicho: "Puente dos pollos total 68 con 50 soles", cliente: "Puente", pollos: 2, total: 68.5 },

  // ── Solo cantidad, sin peso ni precio ────────────────────────────────
  { dicho: "Rochi un pollo", cliente: "Rochi", pollos: 1 },
  { dicho: "Adela dos pollos", cliente: "Adela", pollos: 2 },
];

describe("dictados reales de un día de reparto", () => {
  for (const c of CASOS) {
    it(`«${c.dicho}»`, () => {
      const i = interpretarLocal(c.dicho);
      if (c.cliente !== undefined) expect(i.cliente).toBe(c.cliente);
      if (c.pollos !== undefined) expect(i.pollos).toBe(c.pollos);
      if (c.piernas !== undefined) expect(i.piernas).toBe(c.piernas);
      if (c.kg !== undefined) expect(i.pesoTotalKg).toBe(c.kg);
      if (c.precio !== undefined) expect(i.precioPorKg).toBe(c.precio);
      if (c.total !== undefined) expect(i.totalDictado).toBe(c.total);
      expect(i.intencion).toBe("nueva_entrega");
    });
  }
});

describe("cobros y deudas dictados en la calle", () => {
  it("«Nancy 2 pollos total 57.70 soles mas la deuda de ayer 30 soles, ya cancelo todo»", () => {
    // Una entrega y un pago en la misma frase. Lo que no puede pasar es que se
    // pierdan los 2 pollos, que es lo que hacía antes.
    const i = interpretarLocal("Nancy 2 pollos total 57.70 soles mas la deuda de ayer 30 soles, ya cancelo todo");
    expect(i.cliente).toBe("Nancy");
    expect(i.pollos).toBe(2);
    expect(i.totalDictado).toBe(57.7);
  });

  it("«Julieta un pollo en total 17 soles más la deuda de ayer 60 con 50»", () => {
    const i = interpretarLocal("Julieta un pollo en total 17 soles más la deuda de ayer 60 con 50");
    expect(i.cliente).toBe("Julieta");
    expect(i.pollos).toBe(1);
    expect(i.totalDictado).toBe(17);
  });

  it("un cobro sin entrega se reconoce como pago", () => {
    const i = interpretarLocal(
      "Cliente Carmen pagó saldo de 60 soles de una deuda total de 64 con 30 quedaría pendiente 4 soles 30 no hizo quedar pollos hoy día",
    );
    expect(i.cliente).toBe("Carmen");
    expect(i.pollos).toBe(0);
    expect(i.intencion).toBe("abono_deuda");
  });
});
