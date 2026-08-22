import {
  CalendarClock,
  ClipboardCheck,
  Package,
  GraduationCap,
  Settings,
  Store,
  Undo2,
  Wallet,
} from "lucide-react";
import { Cabecera, S } from "../ui/base";
import type { Pantalla } from "../lib/navegacion";

/** La cuadrícula detrás de la pestaña «Más». Ocho fichas grandes, nada más. */
export function Menu({ ir }: { ir: (p: Pantalla) => void }) {
  const fichas: { icono: typeof Undo2; label: string; sub: string; destino: Pantalla }[] = [
    { icono: Undo2, label: "Cobranza", sub: "Cobrar de retorno", destino: "cobranza" },
    { icono: ClipboardCheck, label: "Cierre del día", sub: "Cuadrar la caja", destino: "cierre" },
    { icono: Store, label: "Tiendas", sub: "Tu directorio", destino: "tiendas" },
    { icono: CalendarClock, label: "Historial", sub: "Días cerrados", destino: "historial" },
    { icono: Wallet, label: "Gastos", sub: "Almuerzo, gasolina…", destino: "gastos" },
    { icono: Package, label: "Cargar stock", sub: "Con cuánto sales", destino: "stock" },
    { icono: Settings, label: "Ajustes", sub: "API key y avisos", destino: "ajustes" },
    { icono: GraduationCap, label: "Cómo se usa", sub: "Un tour por la app", destino: "tutorial" },
  ];

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <Cabecera titulo="Menú" />

      <div
        className="scroll"
        style={{
          flex: 1,
          padding: "0 18px 200px",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          alignContent: "start",
        }}
      >
        {fichas.map(({ icono: Icono, label, sub, destino }) => (
          <button
            key={destino}
            data-tour={`menu-${destino}`}
            onClick={() => ir(destino)}
            className="pulsable"
            style={{
              ...S.tarjeta,
              borderRadius: "var(--radio-lg)",
              padding: "20px 16px",
              minHeight: 120,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              gap: 16,
            }}
          >
            <Icono
              size={26}
              color="var(--acento-claro)"
              strokeWidth={2}
              // En pantallas angostas, una ficha con subtítulo largo (Gastos)
              // envuelve a dos líneas y aprieta la altura disponible; sin
              // esto el ícono se dejaba encoger hasta quedar aplastado.
              style={{ flexShrink: 0 }}
            />
            <div>
              <div style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.2 }}>{label}</div>
              <div style={{ fontSize: 13, color: "var(--texto-3)", marginTop: 4 }}>{sub}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
