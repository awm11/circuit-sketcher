# Circuit Sketcher

A small React/Vite circuit-diagram editor using clear, standard physics symbols.

## Included symbols

- Open switch
- Closed switch
- Cell
- Battery
- Lamp (circle with cross)
- Fuse
- Voltmeter
- Ammeter
- Diode
- Fixed resistor (rectangle/box)
- Variable resistor
- Thermistor
- LDR
- LED

## Features

- Drag symbols from the palette
- Click a symbol to add it
- Snap-to-grid movement
- Rotate components in 90 degree steps
- Add labels
- Duplicate/delete components
- Wire components together using blue terminals
- Wires stay attached when components move or rotate
- Copy or download a tightly cropped, high-resolution PNG without the editor grid or handles
- Open a clean SVG for vector workflows

## Run locally

```bash
npm install
npm run dev
```

Then open the local URL shown by Vite.

## Build

```bash
npm run build
```

## Notes

The symbols are drawn as React SVG primitives, so changing stroke widths,
dimensions, labels, or adding another component only requires extending
`CircuitSymbol()` and the `SYMBOLS` palette list in `src/App.jsx`.
