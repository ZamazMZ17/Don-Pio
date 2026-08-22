# Don Pio

App de reparto de pollos para un repartidor que atiende 50+ tiendas y cobra en el retorno
de la misma ruta. **Se maneja por voz y funciona sin señal.**

## Empezar

```bash
npm install
npm run dev
```

Se prueba a 393×852 (tamaño de un teléfono). Para llevarla al teléfono:

```bash
npm run apk
```

Compila, firma e instala en el dispositivo conectado por USB. Si no hay ninguno, deja
`DonPio.apk` en la carpeta del proyecto para copiarlo a mano.

### Compilar el APK con GitHub Actions

Si `npm run apk` falla por restricciones de red (p. ej., proxy corporativo), usa el
**workflow de GitHub Actions**:

1. Hace push a cualquier rama (`main` o `claude/**`)
2. O dispara manualmente: abre la [pestaña de Actions](../../actions), elige **«Compilar APK»**
   y presiona **«Run workflow»**
3. Espera a que termine la compilación (2–3 minutos)
4. Abre la sección **Releases** y descarga `DonPio.apk` desde **«Don Pio — último build»**

El workflow compila automáticamente cada push a `main` o a ramas `claude/**`, y actualiza
el release con la última versión lista para instalar.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm test` | Los tests de la lógica (cálculo, correlación, dictado, cobros) |
| `npm run build` | Compila la web |
| `npm run apk` | Compila el APK y lo instala en el teléfono |
| `npm run iconos` | Regenera los iconos. Si pones tu logo en `marca/logo.png`, usa ese |

## La API key de Gemini

**No va en el repositorio ni dentro del APK.** Se pega desde la propia app, en
**Menú → Ajustes**, y se guarda solo en ese teléfono.

Sin key la app funciona igual: interpreta el dictado con un parser de reglas en vez de con
IA. Con key, Gemini entiende mucho mejor el habla suelta y repasa los dictados que se
hicieron sin cobertura.

## Cómo está montado

```
src/
├─ db/         Dexie: tiendas, jornadas, entregas, pagos, deudas, dictados
├─ dominio/    Los cálculos del negocio, funciones puras
├─ tiendas/    Identificar a qué tienda se refirió un dictado
├─ voz/        Reconocimiento, Gemini, parser local y la cola offline
├─ pantallas/  Las 10 pantallas
└─ ui/         Piezas compartidas
```

Lo que hay que leer antes de tocar nada está en [CLAUDE.md](CLAUDE.md): el principio
rector, las decisiones cerradas y las trampas que ya costaron un fallo.

En `referencia/` están el plan funcional del dueño y el prototipo de diseño del que salen
los colores, tamaños y microcopy.
