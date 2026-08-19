import { useEffect, useMemo, useRef, useState } from "react";

// ─── Editor geometry and interaction constants ────────────────────────────
const GRID = 10;
const WIDTH = 1320;
const HEIGHT = 840;
const PORT_DISTANCE = 50;
const METER_RADIUS = 18;
const METER_FONT_SIZE = 18;
const VOLTMETER_PORT_DISTANCE = METER_RADIUS + 8;
const AMMETER_PORT_DISTANCE = METER_RADIUS + 14;
const POTENTIAL_DIVIDER_TAP_LENGTH = 35;
const POTENTIOMETER_WIPER_OFFSET_DEFAULT = 30;
const POTENTIOMETER_WIPER_OFFSET_MIN = 25;
const POTENTIOMETER_WIPER_OFFSET_MAX = 80;
const POTENTIOMETER_WIPER_OFFSET_STEP = 5;
const DEFAULT_C_WIRE_OFFSET = 50;
const MIN_C_WIRE_OFFSET = 0;
const DEFAULT_ZOOM = 1.5;
const ZOOM_MIN = 0.65;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.15;
const WIRE_TOOL_SNAP_RADIUS = 20;
const BLACK_JUNCTION_SNAP_RADIUS = 22;
const WIRE_TOOL_HIT_WIDTH = GRID * 1.4;
const WIRE_TOOL_ARROW_SHORT_SEGMENT_MAX = GRID * 3;
const UNDO_LIMIT = 100;
const DEFAULT_WIRE_COMPONENT_LENGTH = 100;
const MIN_WIRE_COMPONENT_LENGTH = GRID;
const CELL_COUNT_MIN = 1;
const CELL_COUNT_MAX = 8;
const CELL_GROUP_SPACING = 20;
const CELL_PLATE_OFFSET = 5;

const TRANSFORMER_TERMINAL_Y = 27;
const TRANSFORMER_CORE_HALF_HEIGHT = 34;

const INDUCTOR_PATH_D = `M -50 0
  L -40 0

  C -34 -13 -30 -13 -26 -7
  C -20 -1 -20 13 -26 13
  C -32 13 -32 -1 -26 -7

  C -20 -13 -14 -13 -8 -7
  C -2 -1 -2 13 -8 13
  C -14 13 -14 -1 -8 -7

  C -2 -13 4 -13 10 -7
  C 16 -1 16 13 10 13
  C 4 13 4 -1 10 -7

  C 16 -13 22 -13 28 -7
  C 34 -1 34 13 28 13
  C 22 13 22 -1 28 -7

  C 34 -13 38 -13 40 0
  L 50 0`;

const TRANSFORMER_WINDING_PATH_D = `M -50 -27
  L -34 -27
  C -14 -27 -14 -20.5 -20 -13.5

  C -26 -20.5 -40 -20.5 -40 -13.5
  C -40 -6.5 -26 -6.5 -20 -13.5

  C -14 -9 -14 -4 -20 0

  C -26 -7 -40 -7 -40 0
  C -40 7 -26 7 -20 0

  C -14 4 -14 9 -20 13.5

  C -26 6.5 -40 6.5 -40 13.5
  C -40 20.5 -26 20.5 -20 13.5

  C -14 20.5 -14 27 -34 27
  L -50 27`;

// ─── Symbol catalogue and shared metadata ─────────────────────────────────
const BASIC_SYMBOLS = [
  { type: "lamp", label: "Lamp" },
  { type: "cell", label: "Cell" },
  { type: "battery", label: "Battery" },
  { type: "voltmeter", label: "Voltmeter" },
  { type: "ammeter", label: "Ammeter" },
  { type: "motor", label: "Motor" },
  { type: "buzzer", label: "Buzzer" },
  { type: "resistor", label: "Resistor" },
  { type: "fuse", label: "Fuse" },
  { type: "wire-segment", label: "Wire" },
  { type: "label", label: "Label" },
  { type: "switch-open", label: "Switch (open)" },
  { type: "switch-closed", label: "Switch (closed)" },
  { type: "diode", label: "Diode" },
  { type: "led", label: "LED" },
  { type: "variable-resistor", label: "Variable resistor" },
  { type: "thermistor", label: "Thermistor" },
  { type: "ldr", label: "LDR" },
];

const ADVANCED_SYMBOLS = [
  { type: "capacitor", label: "Capacitor" },
  { type: "switch-two-way", label: "Two-way switch" },
  { type: "potential-divider", label: "Potential divider" },
  { type: "potentiometer", label: "Potentiometer" },
  { type: "transformer", label: "Transformer" },
  { type: "microphone", label: "Microphone" },
  { type: "solenoid", label: "Inductor" },
  { type: "ground", label: "Earth / ground" },
];

const SYMBOLS = [
  ...BASIC_SYMBOLS,
  ...ADVANCED_SYMBOLS,
];

const SYMBOL_LABEL_BY_TYPE = new Map(
  SYMBOLS.map(({ type, label }) => [type, label])
);

const DEFAULT_COMPONENT_PORTS = Object.freeze(["left", "right"]);
const COMPONENT_PORTS_BY_TYPE = Object.freeze({
  label: Object.freeze([]),
  junction: Object.freeze(["node"]),
  "potential-divider": Object.freeze(["left", "right", "tap"]),
  "switch-two-way": Object.freeze(["common", "upper", "lower"]),
  microphone: Object.freeze(["upper", "lower"]),
  potentiometer: Object.freeze(["top", "bottom", "wiper"]),
  transformer: Object.freeze([
    "primaryTop",
    "primaryBottom",
    "secondaryTop",
    "secondaryBottom",
  ]),
  ground: Object.freeze(["top"]),
});

const BINARY_SWITCH_TYPES = new Set([
  "switch-open",
  "switch-closed",
]);
const POLARITY_COMPONENT_TYPES = new Set(["cell", "battery"]);
const CUSTOM_CONNECTOR_COMPONENT_TYPES = new Set([
  "transformer",
  "ground",
  "switch-two-way",
  "microphone",
]);
const GENERIC_LABEL_ROTATION_EXCLUSIONS = new Set([
  "label",
  "wire-segment",
  "potential-divider",
]);
const GROUP_LOCAL_ROTATION_EXCLUSIONS = new Set([
  "label",
  "junction",
]);
const GROUP_LABEL_ROTATION_EXCLUSIONS = new Set([
  "label",
  "junction",
  "wire-segment",
  "potential-divider",
]);

const LABEL_POSITIONS = [
  { value: "above", symbol: "↑", name: "Above" },
  { value: "below", symbol: "↓", name: "Below" },
  { value: "left", symbol: "←", name: "Left" },
  { value: "right", symbol: "→", name: "Right" },
];

function rotateLabelPositionClockwise(position) {
  if (position === "above") return "right";
  if (position === "right") return "below";
  if (position === "below") return "left";
  if (position === "left") return "above";
  return position;
}

function rotateLabelPositionBySteps(position, clockwiseSteps) {
  let next = position;
  const steps = ((clockwiseSteps % 4) + 4) % 4;

  for (let index = 0; index < steps; index += 1) {
    next = rotateLabelPositionClockwise(next);
  }

  return next;
}

// ─── Label and Unicode configuration ──────────────────────────────────────
const LABEL_FONT_STEP = 2;
const LABEL_FONT_MIN = 10;
const LABEL_FONT_MAX = 32;

const LABEL_CHARACTERS = [
  { character: "Ω", name: "ohm" },
  { character: "µ", name: "micro" },
  { character: "°", name: "degree" },
  { character: "±", name: "plus/minus" },
  { character: "×", name: "multiply" },
  { character: "Δ", name: "delta" },
  { character: "²", name: "squared" },
  { character: "³", name: "cubed" },
  { character: "₁", name: "subscript 1" },
  { character: "₂", name: "subscript 2" },
  { character: "₃", name: "subscript 3" },
  { character: "₄", name: "subscript 4" },
];

const UNICODE_CATEGORIES = [
  "Greek",
  "Maths & science",
  "Arrows",
  "Superscripts",
  "Subscripts",
  "Punctuation & marks",
  "Currency",
];

const UNICODE_CHARACTERS = [
  // Greek
  { character: "α", name: "Greek small alpha", category: "Greek" },
  { character: "β", name: "Greek small beta", category: "Greek" },
  { character: "γ", name: "Greek small gamma", category: "Greek" },
  { character: "δ", name: "Greek small delta", category: "Greek" },
  { character: "ε", name: "Greek small epsilon", category: "Greek" },
  { character: "ζ", name: "Greek small zeta", category: "Greek" },
  { character: "η", name: "Greek small eta", category: "Greek" },
  { character: "θ", name: "Greek small theta", category: "Greek" },
  { character: "ι", name: "Greek small iota", category: "Greek" },
  { character: "κ", name: "Greek small kappa", category: "Greek" },
  { character: "λ", name: "Greek small lambda", category: "Greek" },
  { character: "μ", name: "Greek small mu", category: "Greek" },
  { character: "ν", name: "Greek small nu", category: "Greek" },
  { character: "ξ", name: "Greek small xi", category: "Greek" },
  { character: "π", name: "Greek small pi", category: "Greek" },
  { character: "ρ", name: "Greek small rho", category: "Greek" },
  { character: "σ", name: "Greek small sigma", category: "Greek" },
  { character: "τ", name: "Greek small tau", category: "Greek" },
  { character: "φ", name: "Greek small phi", category: "Greek" },
  { character: "χ", name: "Greek small chi", category: "Greek" },
  { character: "ψ", name: "Greek small psi", category: "Greek" },
  { character: "ω", name: "Greek small omega", category: "Greek" },
  { character: "Γ", name: "Greek capital gamma", category: "Greek" },
  { character: "Δ", name: "Greek capital delta", category: "Greek" },
  { character: "Θ", name: "Greek capital theta", category: "Greek" },
  { character: "Λ", name: "Greek capital lambda", category: "Greek" },
  { character: "Ξ", name: "Greek capital xi", category: "Greek" },
  { character: "Π", name: "Greek capital pi", category: "Greek" },
  { character: "Σ", name: "Greek capital sigma", category: "Greek" },
  { character: "Φ", name: "Greek capital phi", category: "Greek" },
  { character: "Ψ", name: "Greek capital psi", category: "Greek" },
  { character: "Ω", name: "Greek capital omega / ohm", category: "Greek" },

  // Maths & science
  { character: "±", name: "plus-minus", category: "Maths & science" },
  { character: "∓", name: "minus-plus", category: "Maths & science" },
  { character: "×", name: "multiplication sign", category: "Maths & science" },
  { character: "÷", name: "division sign", category: "Maths & science" },
  { character: "·", name: "middle dot", category: "Maths & science" },
  { character: "≈", name: "approximately equal", category: "Maths & science" },
  { character: "≠", name: "not equal", category: "Maths & science" },
  { character: "≡", name: "identical to", category: "Maths & science" },
  { character: "≤", name: "less than or equal", category: "Maths & science" },
  { character: "≥", name: "greater than or equal", category: "Maths & science" },
  { character: "∞", name: "infinity", category: "Maths & science" },
  { character: "√", name: "square root", category: "Maths & science" },
  { character: "∝", name: "proportional to", category: "Maths & science" },
  { character: "∑", name: "summation", category: "Maths & science" },
  { character: "∏", name: "product", category: "Maths & science" },
  { character: "∫", name: "integral", category: "Maths & science" },
  { character: "∂", name: "partial differential", category: "Maths & science" },
  { character: "∇", name: "nabla / gradient", category: "Maths & science" },
  { character: "∠", name: "angle", category: "Maths & science" },
  { character: "°", name: "degree", category: "Maths & science" },
  { character: "µ", name: "micro sign", category: "Maths & science" },
  { character: "ℓ", name: "script small l", category: "Maths & science" },
  { character: "ℏ", name: "reduced Planck constant", category: "Maths & science" },
  { character: "Å", name: "angstrom letter A-ring", category: "Maths & science" },
  { character: "‰", name: "per mille", category: "Maths & science" },

  // Arrows
  { character: "←", name: "left arrow", category: "Arrows" },
  { character: "→", name: "right arrow", category: "Arrows" },
  { character: "↑", name: "up arrow", category: "Arrows" },
  { character: "↓", name: "down arrow", category: "Arrows" },
  { character: "↔", name: "left-right arrow", category: "Arrows" },
  { character: "↕", name: "up-down arrow", category: "Arrows" },
  { character: "⇐", name: "left double arrow", category: "Arrows" },
  { character: "⇒", name: "right double arrow", category: "Arrows" },
  { character: "⇔", name: "left-right double arrow", category: "Arrows" },

  // Superscripts
  { character: "⁰", name: "superscript zero", category: "Superscripts" },
  { character: "¹", name: "superscript one", category: "Superscripts" },
  { character: "²", name: "superscript two", category: "Superscripts" },
  { character: "³", name: "superscript three", category: "Superscripts" },
  { character: "⁴", name: "superscript four", category: "Superscripts" },
  { character: "⁵", name: "superscript five", category: "Superscripts" },
  { character: "⁶", name: "superscript six", category: "Superscripts" },
  { character: "⁷", name: "superscript seven", category: "Superscripts" },
  { character: "⁸", name: "superscript eight", category: "Superscripts" },
  { character: "⁹", name: "superscript nine", category: "Superscripts" },
  { character: "⁺", name: "superscript plus", category: "Superscripts" },
  { character: "⁻", name: "superscript minus", category: "Superscripts" },

  // Subscripts
  { character: "₀", name: "subscript zero", category: "Subscripts" },
  { character: "₁", name: "subscript one", category: "Subscripts" },
  { character: "₂", name: "subscript two", category: "Subscripts" },
  { character: "₃", name: "subscript three", category: "Subscripts" },
  { character: "₄", name: "subscript four", category: "Subscripts" },
  { character: "₅", name: "subscript five", category: "Subscripts" },
  { character: "₆", name: "subscript six", category: "Subscripts" },
  { character: "₇", name: "subscript seven", category: "Subscripts" },
  { character: "₈", name: "subscript eight", category: "Subscripts" },
  { character: "₉", name: "subscript nine", category: "Subscripts" },
  { character: "₊", name: "subscript plus", category: "Subscripts" },
  { character: "₋", name: "subscript minus", category: "Subscripts" },

  // Punctuation & marks
  { character: "–", name: "en dash", category: "Punctuation & marks" },
  { character: "—", name: "em dash", category: "Punctuation & marks" },
  { character: "′", name: "prime", category: "Punctuation & marks" },
  { character: "″", name: "double prime", category: "Punctuation & marks" },
  { character: "•", name: "bullet", category: "Punctuation & marks" },
  { character: "…", name: "ellipsis", category: "Punctuation & marks" },
  { character: "©", name: "copyright", category: "Punctuation & marks" },
  { character: "®", name: "registered trademark", category: "Punctuation & marks" },
  { character: "™", name: "trademark", category: "Punctuation & marks" },
  { character: "§", name: "section sign", category: "Punctuation & marks" },

  // Currency
  { character: "£", name: "pound sterling", category: "Currency" },
  { character: "€", name: "euro", category: "Currency" },
  { character: "$", name: "dollar", category: "Currency" },
  { character: "¥", name: "yen", category: "Currency" },
  { character: "¢", name: "cent", category: "Currency" },
];

function unicodeCodePointLabel(character) {
  const codePoint = character.codePointAt(0);
  return codePoint == null
    ? ""
    : `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`;
}

// ─── General geometry and data helpers ────────────────────────────────────
const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const snap = (value) => Math.round(value / GRID) * GRID;
const clamp = (value, min, max) =>
  Math.max(min, Math.min(max, value));

function snapWithOffset(value, offset) {
  return Math.round((value - offset) / GRID) * GRID + offset;
}

function alignComponentToGrid(component) {
  if (component.type !== "wire-segment") {
    return {
      ...component,
      x: snap(component.x),
      y: snap(component.y),
    };
  }

  const rotation =
    ((component.rotation ?? 0) % 360 + 360) % 360;
  const nearestQuarterTurn =
    Math.round(rotation / 90) * 90;
  const isAxisAligned =
    Math.abs(rotation - nearestQuarterTurn) < 0.001 ||
    Math.abs(rotation - nearestQuarterTurn + 360) < 0.001 ||
    Math.abs(rotation - nearestQuarterTurn - 360) < 0.001;

  if (!isAxisAligned) {
    const leftEndpoint = getPortPosition(component, "left");
    return {
      ...component,
      x: component.x + snap(leftEndpoint.x) - leftEndpoint.x,
      y: component.y + snap(leftEndpoint.y) - leftEndpoint.y,
    };
  }

  const length = Math.max(
    MIN_WIRE_COMPONENT_LENGTH,
    snap(component.length ?? DEFAULT_WIRE_COMPONENT_LENGTH)
  );
  const halfLength = length / 2;
  const halfGridOffset =
    ((halfLength % GRID) + GRID) % GRID;
  const normalizedQuarterTurn =
    ((nearestQuarterTurn % 360) + 360) % 360;
  const isHorizontal =
    normalizedQuarterTurn === 0 ||
    normalizedQuarterTurn === 180;

  return {
    ...component,
    rotation: normalizedQuarterTurn,
    length,
    x: isHorizontal
      ? snapWithOffset(component.x, halfGridOffset)
      : snap(component.x),
    y: isHorizontal
      ? snap(component.y)
      : snapWithOffset(component.y, halfGridOffset),
  };
}

// ─── Circuit symbol rendering ─────────────────────────────────────────────
function ArrowHead({ x, y, angle = 0, scale = 1 }) {
  return (
    <path
      d="M 0 0 L -8 -4 L -6 0 L -8 4 Z"
      transform={`translate(${x} ${y}) rotate(${angle}) scale(${scale})`}
      fill="currentColor"
      stroke="none"
    />
  );
}

function DiodeCore() {
  return (
    <>
      <polygon points="-13,-14 13,0 -13,14" fill="none" />
      <line x1="13" y1="-16" x2="13" y2="16" />
    </>
  );
}

function CircuitSymbol({
  type,
  length = DEFAULT_WIRE_COMPONENT_LENGTH,
  cellCount = 1,
  showPolarity = true,
  verticalFlip = false,
  wiperOffset = POTENTIOMETER_WIPER_OFFSET_DEFAULT,
  switchPosition = "upper",
  currentArrow = "none",
  currentArrowOffset = 0,
  componentRotation = 0,
  fancyText = false,
}) {
  const textFontFamily = fancyText
    ? 'Georgia, "Times New Roman", serif'
    : "Arial, sans-serif";
  const fancyTextStyle = fancyText
    ? {
        fontVariantNumeric: "lining-nums",
        fontFeatureSettings: '"lnum" 1',
      }
    : undefined;

  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2.4,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    vectorEffect: "non-scaling-stroke",
  };

  let body;

  switch (type) {
    case "wire-segment":
      body = (
        <>
          <line
            x1={-length / 2}
            y1="0"
            x2={length / 2}
            y2="0"
            strokeWidth="2.4"
            strokeLinecap="square"
          />
          {currentArrow === "right" && (
            <ArrowHead
              x={currentArrowOffset + 6}
              y={0}
              angle={0}
              scale={1.5}
            />
          )}
          {currentArrow === "left" && (
            <ArrowHead
              x={currentArrowOffset - 6}
              y={0}
              angle={180}
              scale={1.5}
            />
          )}
        </>
      );
      break;

    case "switch-open":
      body = (
        <>
          <line x1="-50" y1="0" x2="-24" y2="0" />
          <circle cx="-20" cy="0" r="4" fill="none" />
          <circle cx="20" cy="0" r="4" fill="none" />
          <line x1="24" y1="0" x2="50" y2="0" />
          <line x1="-16" y1="-3" x2="16" y2="-22" />
        </>
      );
      break;

    case "switch-closed":
      body = (
        <>
          <line x1="-50" y1="0" x2="-24" y2="0" />
          <circle cx="-20" cy="0" r="4" fill="none" />
          <circle cx="20" cy="0" r="4" fill="none" />
          <line x1="24" y1="0" x2="50" y2="0" />
          <line x1="-16" y1="0" x2="16" y2="0" />
        </>
      );
      break;

    case "switch-two-way": {
      const targetY =
        switchPosition === "lower" ? 20 : -20;

      body = (
        <>
          <line x1="-50" y1="0" x2="-24" y2="0" />
          <circle cx="-20" cy="0" r="4" fill="none" />

          <circle cx="20" cy="-20" r="4" fill="none" />
          <line x1="24" y1="-20" x2="50" y2="-20" />

          <circle cx="20" cy="20" r="4" fill="none" />
          <line x1="24" y1="20" x2="50" y2="20" />

          <line
            x1="-16"
            y1="0"
            x2="16"
            y2={targetY + (targetY < 0 ? 3 : -3)}
          />
        </>
      );
      break;
    }

    case "cell": {
      const count = Math.max(
        CELL_COUNT_MIN,
        Math.min(CELL_COUNT_MAX, cellCount)
      );
      const firstCenter = -((count - 1) * CELL_GROUP_SPACING) / 2;
      const firstLongX = firstCenter - CELL_PLATE_OFFSET;
      const lastCenter =
        firstCenter + (count - 1) * CELL_GROUP_SPACING;
      const lastShortX = lastCenter + CELL_PLATE_OFFSET;
      const portDistance =
        PORT_DISTANCE + ((count - 1) * CELL_GROUP_SPACING) / 2;

      body = (
        <>
          <line
            x1={-portDistance}
            y1="0"
            x2={firstLongX}
            y2="0"
            strokeLinecap="butt"
          />

          {Array.from({ length: count }, (_, index) => {
            const center =
              firstCenter + index * CELL_GROUP_SPACING;
            const longX = center - CELL_PLATE_OFFSET;
            const shortX = center + CELL_PLATE_OFFSET;
            return (
              <g key={index}>
                <line
                  x1={longX}
                  y1="-24"
                  x2={longX}
                  y2="24"
                  strokeLinecap="butt"
                />
                <line
                  x1={shortX}
                  y1="-10"
                  x2={shortX}
                  y2="10"
                  strokeWidth="4"
                  strokeLinecap="butt"
                />
              </g>
            );
          })}

          <line
            x1={lastShortX}
            y1="0"
            x2={portDistance}
            y2="0"
            strokeLinecap="butt"
          />

          {showPolarity && (
            <text
              x={firstLongX - 12}
              y="-22"
              fontSize="18"
              fill="currentColor"
              stroke="none"
              fontFamily="Arial, sans-serif"
            >
              +
            </text>
          )}
        </>
      );
      break;
    }

    case "battery":
      body = (
        <>
          <line
            x1="-50"
            y1="0"
            x2="-30"
            y2="0"
            strokeLinecap="butt"
          />
          <line
            x1="-30"
            y1="-25"
            x2="-30"
            y2="25"
            strokeLinecap="butt"
          />
          <line
            x1="-17"
            y1="-10"
            x2="-17"
            y2="10"
            strokeWidth="4"
            strokeLinecap="butt"
          />
          <line
            x1="-17"
            y1="0"
            x2="12"
            y2="0"
            strokeDasharray="5 5"
            strokeLinecap="butt"
          />
          <line
            x1="12"
            y1="-25"
            x2="12"
            y2="25"
            strokeLinecap="butt"
          />
          <line
            x1="25"
            y1="-10"
            x2="25"
            y2="10"
            strokeWidth="4"
            strokeLinecap="butt"
          />
          <line
            x1="25"
            y1="0"
            x2="50"
            y2="0"
            strokeLinecap="butt"
          />
          {showPolarity && (
            <text
              x="-45"
              y="-22"
              fontSize="18"
              fill="currentColor"
              stroke="none"
              fontFamily="Arial, sans-serif"
            >
              +
            </text>
          )}
        </>
      );
      break;

    case "capacitor":
      body = (
        <>
          <line
            x1="-50"
            y1="0"
            x2="-8"
            y2="0"
            strokeLinecap="butt"
          />
          <line
            x1="8"
            y1="0"
            x2="50"
            y2="0"
            strokeLinecap="butt"
          />
          <line
            x1="-8"
            y1="-24"
            x2="-8"
            y2="24"
            strokeLinecap="butt"
          />
          <line
            x1="8"
            y1="-24"
            x2="8"
            y2="24"
            strokeLinecap="butt"
          />
        </>
      );
      break;

    case "lamp":
      body = (
        <>
          <line x1="-50" y1="0" x2="-22" y2="0" />
          <line x1="22" y1="0" x2="50" y2="0" />
          <circle cx="0" cy="0" r="22" />
          <line x1="-15" y1="-15" x2="15" y2="15" />
          <line x1="-15" y1="15" x2="15" y2="-15" />
        </>
      );
      break;

    case "motor":
      body = (
        <>
          <line x1="-50" y1="0" x2="-22" y2="0" />
          <line x1="22" y1="0" x2="50" y2="0" />
          <circle cx="0" cy="0" r="22" fill="none" />
          <text
            x="0"
            y="6"
            textAnchor="middle"
            fontSize="18"
            fill="currentColor"
            stroke="none"
            fontFamily={textFontFamily}
            style={fancyTextStyle}
            transform={`rotate(${-componentRotation})`}
          >
            M
          </text>
        </>
      );
      break;

    case "buzzer":
      body = (
        <>
          <line x1="-26" y1="-42" x2="26" y2="-42" />
          <path
            d="M -26 -42
               C -26 -29 -22 -21 -12 -16
               C -5 -12 5 -12 12 -16
               C 22 -21 26 -29 26 -42"
            fill="none"
          />

          <line x1="-12" y1="-16" x2="-12" y2="0" />
          <line x1="12" y1="-16" x2="12" y2="0" />
          <line x1="-50" y1="0" x2="-12" y2="0" />
          <line x1="12" y1="0" x2="50" y2="0" />
        </>
      );
      break;

    case "microphone":
      body = (
        <>
          <circle cx="-5" cy="0" r="26" fill="none" />
          <line
            x1="-30"
            y1="-29"
            x2="-30"
            y2="29"
            strokeWidth="4"
            strokeLinecap="butt"
          />
          <line x1="18" y1="-12" x2="50" y2="-12" />
          <line x1="18" y1="12" x2="50" y2="12" />
        </>
      );
      break;

    case "solenoid":
      body = (
        <path
          d={INDUCTOR_PATH_D}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
      break;

    case "transformer":
      body = (
        <>
          <path
            d={TRANSFORMER_WINDING_PATH_D}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          <line
            x1="-5"
            y1={-TRANSFORMER_CORE_HALF_HEIGHT}
            x2="-5"
            y2={TRANSFORMER_CORE_HALF_HEIGHT}
          />
          <line
            x1="5"
            y1={-TRANSFORMER_CORE_HALF_HEIGHT}
            x2="5"
            y2={TRANSFORMER_CORE_HALF_HEIGHT}
          />

          <path
            d={TRANSFORMER_WINDING_PATH_D}
            transform="scale(-1 1)"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      );
      break;

    case "ground":
      body = (
        <>
          <line x1="0" y1="-50" x2="0" y2="8" />
          <line x1="-18" y1="8" x2="18" y2="8" />
          <line x1="-12" y1="16" x2="12" y2="16" />
          <line x1="-6" y1="24" x2="6" y2="24" />
        </>
      );
      break;

    case "fuse":
      body = (
        <>
          <line x1="-50" y1="0" x2="50" y2="0" />
          <rect x="-25" y="-10" width="50" height="20" fill="none" />
        </>
      );
      break;

    case "voltmeter":
      body = (
        <>
          <line
            x1={-VOLTMETER_PORT_DISTANCE}
            y1="0"
            x2={-METER_RADIUS}
            y2="0"
          />
          <line
            x1={METER_RADIUS}
            y1="0"
            x2={VOLTMETER_PORT_DISTANCE}
            y2="0"
          />
          <circle
            cx="0"
            cy="0"
            r={METER_RADIUS}
            fill="none"
          />
          <text
            x="0"
            y="6.5"
            textAnchor="middle"
            fontSize={METER_FONT_SIZE}
            fill="currentColor"
            stroke="none"
            fontFamily={textFontFamily}
            style={fancyTextStyle}
            transform={`rotate(${-componentRotation})`}
          >
            V
          </text>
        </>
      );
      break;

    case "ammeter":
      body = (
        <>
          <line
            x1={-AMMETER_PORT_DISTANCE}
            y1="0"
            x2={-METER_RADIUS}
            y2="0"
          />
          <line
            x1={METER_RADIUS}
            y1="0"
            x2={AMMETER_PORT_DISTANCE}
            y2="0"
          />
          <circle
            cx="0"
            cy="0"
            r={METER_RADIUS}
            fill="none"
          />
          <text
            x="0"
            y="5.75"
            textAnchor="middle"
            fontSize={METER_FONT_SIZE}
            fill="currentColor"
            stroke="none"
            fontFamily={textFontFamily}
            style={fancyTextStyle}
            transform={`rotate(${-componentRotation})`}
          >
            A
          </text>
        </>
      );
      break;

    case "diode":
      body = (
        <>
          <line x1="-50" y1="0" x2="50" y2="0" />
          <circle cx="0" cy="0" r="25" fill="none" />
          <DiodeCore />
        </>
      );
      break;

    case "resistor":
      body = (
        <>
          <line x1="-50" y1="0" x2="-25" y2="0" />
          <rect x="-25" y="-11" width="50" height="22" fill="none" />
          <line x1="25" y1="0" x2="50" y2="0" />
        </>
      );
      break;

    case "potential-divider":
      body = (
        <>
          <line x1="-50" y1="0" x2="-43" y2="0" />
          <rect x="-43" y="-11" width="32" height="22" fill="none" />
          <line x1="-11" y1="0" x2="11" y2="0" />
          <rect x="11" y="-11" width="32" height="22" fill="none" />
          <line x1="43" y1="0" x2="50" y2="0" />
          <line x1="0" y1="0" x2="0" y2={POTENTIAL_DIVIDER_TAP_LENGTH} />
          <circle
            cx="0"
            cy="0"
            r="3"
            fill="currentColor"
            stroke="none"
          />
        </>
      );
      break;

    case "variable-resistor":
      body = (
        <>
          <line x1="-50" y1="0" x2="-25" y2="0" />
          <rect x="-25" y="-11" width="50" height="22" fill="none" />
          <line x1="25" y1="0" x2="50" y2="0" />
          <line x1="-30" y1="30" x2="28.5" y2="-28.5" strokeLinecap="butt" />
          <ArrowHead x={32} y={-32} angle={-45} />
        </>
      );
      break;

    case "potentiometer": {
      const wiperEndY = verticalFlip ? -40 : 40;
      const wiperCornerX = clamp(
        wiperOffset,
        POTENTIOMETER_WIPER_OFFSET_MIN,
        POTENTIOMETER_WIPER_OFFSET_MAX
      );

      body = (
        <>
          <line x1="0" y1="-50" x2="0" y2="-28" />
          <rect
            x="-11"
            y="-28"
            width="22"
            height="56"
            fill="none"
          />
          <line x1="0" y1="28" x2="0" y2="50" />

          <polyline
            points={`${wiperCornerX},${wiperEndY} ${wiperCornerX},0 15.5,0`}
            fill="none"
            strokeLinecap="butt"
            strokeLinejoin="miter"
          />
          <ArrowHead x={11} y={0} angle={180} />
        </>
      );
      break;
    }

    case "thermistor":
      body = (
        <>
          <line x1="-50" y1="0" x2="-25" y2="0" />
          <rect x="-25" y="-11" width="50" height="22" fill="none" />
          <line x1="25" y1="0" x2="50" y2="0" />
          <polyline points="-28,22 -17,22 24,-22" />
        </>
      );
      break;

    case "ldr":
      body = (
        <>
          <line x1="-50" y1="0" x2="-16" y2="0" />
          <line x1="16" y1="0" x2="50" y2="0" />
          <circle cx="0" cy="0" r="27" fill="none" />
          <rect x="-16" y="-7" width="32" height="14" fill="none" />
          <line x1="-46" y1="-42" x2="-27.5" y2="-23.5" strokeLinecap="butt" />
          <ArrowHead x={-24} y={-20} angle={45} />
          <line x1="-33" y1="-50" x2="-14.5" y2="-31.5" strokeLinecap="butt" />
          <ArrowHead x={-11} y={-28} angle={45} />
        </>
      );
      break;

    case "led":
      body = (
        <>
          <line x1="-50" y1="0" x2="50" y2="0" />
          <circle cx="0" cy="0" r="25" fill="none" />
          <DiodeCore />
          <line x1="20" y1="-25" x2="38.5" y2="-43.5" strokeLinecap="butt" />
          <ArrowHead x={42} y={-47} angle={-45} />
          <line x1="10" y1="-34" x2="28.5" y2="-52.5" strokeLinecap="butt" />
          <ArrowHead x={32} y={-56} angle={-45} />
        </>
      );
      break;

    case "label":
      body = null;
      break;

    default:
      body = <line x1="-50" y1="0" x2="50" y2="0" />;
  }

  return <g {...common}>{body}</g>;
}

function PaletteSymbolButton({
  symbol,
  onAdd,
  onDragStart,
}) {
  return (
    <button
      className="palette-item"
      draggable
      onDragStart={(event) =>
        onDragStart(event, symbol.type)
      }
      onClick={() => onAdd(symbol.type)}
      title={`Add ${symbol.label}`}
    >
      <PaletteIcon type={symbol.type} />
      <span>{symbol.label}</span>
    </button>
  );
}

function PaletteIcon({ type }) {
  return (
    <svg
      viewBox="-58 -58 116 116"
      className="palette-icon"
      aria-hidden="true"
    >
      {type === "label" ? (
        <text
          x="0"
          y="9"
          textAnchor="middle"
          fontSize="30"
          fontFamily="Arial, sans-serif"
          fill="currentColor"
        >
          Aa
        </text>
      ) : (
        <CircuitSymbol
          type={type}
          length={type === "wire-segment" ? 82 : undefined}
          cellCount={type === "cell" ? 1 : undefined}
        />
      )}
    </svg>
  );
}

// ─── Labels and component geometry ────────────────────────────────────────
function getPotentiometerWiperOffset(component) {
  return clamp(
    component?.wiperOffset ??
      POTENTIOMETER_WIPER_OFFSET_DEFAULT,
    POTENTIOMETER_WIPER_OFFSET_MIN,
    POTENTIOMETER_WIPER_OFFSET_MAX
  );
}

function getComponentLabelExtent(component, position) {
  if (position === "left" || position === "right") {
    if (component.type === "ground") {
      return 20;
    }

    // Side labels sit just beyond the electrical terminal. This also grows
    // automatically for long Wire components and multi-cell components.
    return getComponentPortDistance(component);
  }

  // Vertical extents are deliberately close to the actual drawn symbol.
  // Symbols with arrows need a little more room on the side containing them.
  switch (component.type) {
    case "switch-open":
      return position === "above" ? 24 : 8;
    case "switch-closed":
      return 8;
    case "switch-two-way":
      return 24;
    case "cell":
      return 24;
    case "battery":
      return 25;
    case "capacitor":
      return 24;
    case "lamp":
    case "motor":
      return 22;
    case "buzzer":
      return position === "above" ? 42 : 0;
    case "microphone":
      return 29;
    case "solenoid":
      return 10;
    case "transformer":
      return TRANSFORMER_CORE_HALF_HEIGHT;
    case "ground":
      return position === "above" ? 50 : 26;
    case "fuse":
      return 10;
    case "voltmeter":
    case "ammeter":
      return METER_RADIUS;
    case "diode":
      return 25;
    case "resistor":
      return 11;
    case "potential-divider":
      return position === "below" ? POTENTIAL_DIVIDER_TAP_LENGTH : 11;
    case "variable-resistor":
      return 31;
    case "thermistor":
      return 23;
    case "potentiometer":
      if (position === "right") {
        return getPotentiometerWiperOffset(component);
      }
      return position === "left" ? 11 : 50;
    case "ldr":
      return position === "above" ? 53 : 27;
    case "led":
      return position === "above" ? 56 : 25;
    case "wire-segment":
      return 2;
    default:
      return 24;
  }
}

const SUBSCRIPT_DIGITS = "₁₂₃₄₅";
const SUBSCRIPT_TO_NORMAL = {
  "₁": "1",
  "₂": "2",
  "₃": "3",
  "₄": "4",
  "₅": "5",
};

let labelMeasureCanvas = null;

function splitTrailingSubscript(label) {
  const characters = Array.from(label);
  let splitIndex = characters.length;

  while (
    splitIndex > 0 &&
    SUBSCRIPT_DIGITS.includes(characters[splitIndex - 1])
  ) {
    splitIndex -= 1;
  }

  if (
    splitIndex === characters.length ||
    splitIndex === 0
  ) {
    return null;
  }

  return {
    main: characters.slice(0, splitIndex).join(""),
    subscript: characters
      .slice(splitIndex)
      .map((character) => SUBSCRIPT_TO_NORMAL[character] ?? character)
      .join(""),
  };
}

function measureLabelTextWidth(
  value,
  fontSize,
  fontWeight,
  fontStyle,
  fontFamily
) {
  if (
    typeof document === "undefined" ||
    typeof document.createElement !== "function"
  ) {
    return value.length * fontSize * 0.6;
  }

  if (!labelMeasureCanvas) {
    labelMeasureCanvas = document.createElement("canvas");
  }

  const context = labelMeasureCanvas.getContext("2d");
  if (!context) {
    return value.length * fontSize * 0.6;
  }

  context.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
  return context.measureText(value).width;
}

function CircuitLabelText({
  label,
  x,
  y,
  textAnchor,
  fontSize,
  fontWeight,
  fontStyle,
  fontFamily = "Arial, sans-serif",
  onPointerDown,
}) {
  const trailingSubscript = splitTrailingSubscript(label);
  const useLiningNumerals =
    fontFamily.includes("Georgia");

  const commonStyle = {
    fontFamily,
    fontWeight,
    fontStyle,
    whiteSpace: "pre",
    ...(useLiningNumerals
      ? {
          fontVariantNumeric: "lining-nums",
          fontFeatureSettings: '"lnum" 1',
        }
      : {}),
  };

  if (!trailingSubscript) {
    return (
      <text
        x={x}
        y={y}
        textAnchor={textAnchor}
        dominantBaseline="middle"
        xmlSpace="preserve"
        className="component-label"
        style={{
          ...commonStyle,
          fontSize: `${fontSize}px`,
        }}
        onPointerDown={onPointerDown}
      >
        {label}
      </text>
    );
  }

  const mainWidth = measureLabelTextWidth(
    trailingSubscript.main,
    fontSize,
    fontWeight,
    fontStyle,
    fontFamily
  );
  const subscriptFontSize = fontSize * 0.62;
  const subscriptWidth = measureLabelTextWidth(
    trailingSubscript.subscript,
    subscriptFontSize,
    fontWeight,
    fontStyle,
    fontFamily
  );
  const subscriptGap = fontSize * 0.04;

  let mainX;
  let subscriptX;

  if (textAnchor === "middle") {
    // Centre the actual symbol/name itself. The subscript hangs off its
    // bottom-right instead of shifting the whole label left.
    mainX = x - mainWidth / 2;
    subscriptX = x + mainWidth / 2 + subscriptGap;
  } else if (textAnchor === "end") {
    const fullWidth =
      mainWidth + subscriptGap + subscriptWidth;
    mainX = x - fullWidth;
    subscriptX = mainX + mainWidth + subscriptGap;
  } else {
    mainX = x;
    subscriptX = x + mainWidth + subscriptGap;
  }

  return (
    <>
      <text
        x={mainX}
        y={y}
        textAnchor="start"
        dominantBaseline="middle"
        xmlSpace="preserve"
        className="component-label"
        style={{
          ...commonStyle,
          fontSize: `${fontSize}px`,
        }}
        onPointerDown={onPointerDown}
      >
        {trailingSubscript.main}
      </text>
      <text
        x={subscriptX}
        y={y + fontSize * 0.28}
        textAnchor="start"
        dominantBaseline="middle"
        xmlSpace="preserve"
        className="component-label"
        style={{
          ...commonStyle,
          fontSize: `${subscriptFontSize}px`,
        }}
        onPointerDown={onPointerDown}
      >
        {trailingSubscript.subscript}
      </text>
    </>
  );
}

function getPotentialDividerLabelLayout(component, index) {
  const local = {
    x: index === 1 ? -27 : 27,
    y: -24,
  };
  const angle = ((component.rotation ?? 0) * Math.PI) / 180;

  return {
    x: local.x * Math.cos(angle) - local.y * Math.sin(angle),
    y: local.x * Math.sin(angle) + local.y * Math.cos(angle),
    textAnchor: "middle",
  };
}

function getComponentLabelLayout(component) {
  if (component.type === "label") {
    return {
      x: 0,
      y: 0,
      textAnchor: "middle",
    };
  }

  // labelPosition is an absolute/page direction. For example, "above"
  // always means visually above the component, whatever its rotation.
  const position = component.labelPosition ?? "below";
  const fontSize =
    component.labelFontSize ?? (component.type === "label" ? 26 : 24);

  // getComponentLabelExtent describes the symbol in its own local
  // orientation. Convert the page direction back into that local orientation
  // so clearance still follows the actual rotated symbol geometry.
  const rotationSteps =
    Math.round((((component.rotation ?? 0) % 360) + 360) % 360 / 90) % 4;
  const localPosition = rotateLabelPositionBySteps(
    position,
    -rotationSteps
  );
  const extent = getComponentLabelExtent(
    component,
    localPosition
  );

  // Scale the breathing room with the label itself. Normal 24px labels keep
  // the established spacing, while smaller labels tuck progressively closer
  // to the component instead of looking detached.
  const gap = Math.max(
    5,
    11 + (fontSize - 24) * 0.45
  );
  const verticalTextAllowance =
    position === "above" || position === "below"
      ? fontSize / 2
      : 0;
  const distance = extent + gap + verticalTextAllowance;

  let x =
    position === "left"
      ? -distance
      : position === "right"
        ? distance
        : 0;
  let y =
    position === "above"
      ? -distance
      : position === "below"
        ? distance
        : 0;

  // The battery symbol is visually weighted slightly to the left of its
  // electrical centre. Apply a small optical-centre correction to labels that
  // sit above/below it, rotated with the symbol so it remains correct after R.
  if (
    component.type === "battery" &&
    (position === "above" || position === "below")
  ) {
    const opticalOffset = -5;
    const angle =
      (((component.rotation ?? 0) * Math.PI) / 180);
    x += opticalOffset * Math.cos(angle);
    y += opticalOffset * Math.sin(angle);
  }

  return {
    x,
    y,
    textAnchor: x > 18 ? "start" : x < -18 ? "end" : "middle",
  };
}

// ─── Electrical ports and lead geometry ───────────────────────────────────
function getComponentPortDistance(component) {
  if (component.type === "junction") {
    return 0;
  }

  if (component.type === "voltmeter") {
    return VOLTMETER_PORT_DISTANCE;
  }

  if (component.type === "ammeter") {
    return AMMETER_PORT_DISTANCE;
  }

  if (component.type === "wire-segment") {
    return (component.length ?? DEFAULT_WIRE_COMPONENT_LENGTH) / 2;
  }

  if (component.type === "cell") {
    const count = clamp(
      component.cellCount ?? 1,
      CELL_COUNT_MIN,
      CELL_COUNT_MAX
    );

    return (
      PORT_DISTANCE +
      ((count - 1) * CELL_GROUP_SPACING) / 2
    );
  }

  return PORT_DISTANCE;
}

function getComponentPorts(component) {
  return (
    COMPONENT_PORTS_BY_TYPE[component.type] ??
    DEFAULT_COMPONENT_PORTS
  );
}

function getPortLocalPosition(component, port) {
  const portDistance = getComponentPortDistance(component);

  if (component.type === "junction") {
    return { x: 0, y: 0 };
  }

  if (
    component.type === "potential-divider" &&
    port === "tap"
  ) {
    return { x: 0, y: POTENTIAL_DIVIDER_TAP_LENGTH };
  }

  if (component.type === "switch-two-way") {
    if (port === "common") {
      return { x: -PORT_DISTANCE, y: 0 };
    }

    return {
      x: PORT_DISTANCE,
      y: port === "lower" ? 20 : -20,
    };
  }

  if (component.type === "microphone") {
    return {
      x: PORT_DISTANCE,
      y: port === "lower" ? 12 : -12,
    };
  }

  if (component.type === "potentiometer") {
    if (port === "top") {
      return { x: 0, y: -PORT_DISTANCE };
    }

    if (port === "bottom") {
      return { x: 0, y: PORT_DISTANCE };
    }

    if (port === "wiper") {
      return {
        x: getPotentiometerWiperOffset(component),
        y: component.verticalFlip ? -40 : 40,
      };
    }
  }

  if (component.type === "transformer") {
    const isPrimary = port.startsWith("primary");
    const isTop = port.endsWith("Top");

    return {
      x: isPrimary ? -PORT_DISTANCE : PORT_DISTANCE,
      y: isTop ? -TRANSFORMER_TERMINAL_Y : TRANSFORMER_TERMINAL_Y,
    };
  }

  if (component.type === "ground") {
    return { x: 0, y: -PORT_DISTANCE };
  }

  return {
    x: port === "left" ? -portDistance : portDistance,
    y: 0,
  };
}

function getStraightLeadLength(component, port) {
  switch (component.type) {
    case "switch-open":
    case "switch-closed":
    case "switch-two-way":
      return 26;
    case "cell":
      return 45;
    case "battery":
      return port === "left" ? 20 : 25;
    case "capacitor":
      return 42;
    case "lamp":
    case "motor":
      return 28;
    case "buzzer":
      return 38;
    case "microphone":
      return 32;
    case "solenoid":
      return 13;
    case "transformer":
      return 16;
    case "ground":
      return 50;
    case "ammeter":
      return AMMETER_PORT_DISTANCE - METER_RADIUS;
    case "voltmeter":
      return VOLTMETER_PORT_DISTANCE - METER_RADIUS;
    case "fuse":
    case "diode":
    case "led":
      return 25;
    case "resistor":
    case "variable-resistor":
    case "thermistor":
      return 25;
    case "ldr":
      return 23;
    case "potential-divider":
      return port === "tap"
        ? POTENTIAL_DIVIDER_TAP_LENGTH
        : 7;
    case "potentiometer":
      return port === "wiper" ? 40 : 22;
    case "wire-segment":
      return component.length ?? DEFAULT_WIRE_COMPONENT_LENGTH;
    case "junction":
      return 0;
    default:
      return 0;
  }
}

function getPortPosition(component, port) {
  const local = getPortLocalPosition(component, port);
  const angle = (component.rotation * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  return {
    x: component.x + local.x * cos - local.y * sin,
    y: component.y + local.x * sin + local.y * cos,
  };
}

function getWireEndpointPosition(endpoint, component) {
  const terminal = getPortPosition(component, endpoint.port);
  const leadLength = getStraightLeadLength(
    component,
    endpoint.port
  );
  const inset = Math.max(
    0,
    Math.min(
      leadLength,
      Number(endpoint.leadInset) || 0
    )
  );

  if (inset <= 0) {
    return terminal;
  }

  const outward = getPortDirection(
    component,
    endpoint.port
  );

  return {
    x: terminal.x - outward.x * inset,
    y: terminal.y - outward.y * inset,
  };
}

function getComponentLeadSegment(component, port) {
  if (["label", "junction"].includes(component.type)) {
    return null;
  }

  if (
    component.type === "wire-segment" &&
    port !== "left"
  ) {
    return null;
  }

  const length = getStraightLeadLength(component, port);
  if (length <= 0) {
    return null;
  }

  const terminal = getPortPosition(component, port);
  const outward = getPortDirection(component, port);

  if (
    Math.abs(outward.x) < 0.01 &&
    Math.abs(outward.y) < 0.01
  ) {
    return null;
  }

  return {
    componentId: component.id,
    port,
    length,
    terminal,
    inner: {
      x: terminal.x - outward.x * length,
      y: terminal.y - outward.y * length,
    },
  };
}

function getWireCurrentArrowOffset(
  wireComponent,
  allComponents
) {
  if (wireComponent.type !== "wire-segment") {
    return 0;
  }

  function extensionAt(end) {
    const endpoint = getPortPosition(wireComponent, end);
    const wireOutward = getPortDirection(wireComponent, end);
    let extension = 0;

    for (const other of allComponents) {
      if (
        other.id === wireComponent.id ||
        other.type === "label" ||
        other.type === "wire-segment"
      ) {
        continue;
      }

      for (const otherPort of getComponentPorts(other)) {
        const otherEndpoint = getPortPosition(other, otherPort);

        if (
          Math.abs(endpoint.x - otherEndpoint.x) > 0.01 ||
          Math.abs(endpoint.y - otherEndpoint.y) > 0.01
        ) {
          continue;
        }

        const otherOutward = getPortDirection(other, otherPort);
        const dot =
          wireOutward.x * otherOutward.x +
          wireOutward.y * otherOutward.y;
        const cross =
          wireOutward.x * otherOutward.y -
          wireOutward.y * otherOutward.x;

        // The leads must be collinear, and the attached component must extend
        // away from the Wire component rather than folding back over it.
        if (Math.abs(cross) < 0.01 && dot < -0.99) {
          extension = Math.max(
            extension,
            getStraightLeadLength(other, otherPort)
          );
        }
      }
    }

    return extension;
  }

  const leftExtension = extensionAt("left");
  const rightExtension = extensionAt("right");

  // The straight visual run spans from the borrowed left lead through the
  // Wire component to the borrowed right lead. Its midpoint, expressed in the
  // Wire component's local x coordinates, is this simple half-difference.
  return (rightExtension - leftExtension) / 2;
}

function getDrawnWireLeadExtension(
  component,
  port,
  segmentDirection,
  endpointKind,
  leadInset = 0
) {
  if (!component || component.type === "wire-segment") {
    return 0;
  }

  const leadLength = getStraightLeadLength(component, port);
  if (leadLength <= 0) {
    return 0;
  }

  const outward = getPortDirection(component, port);
  const cross =
    segmentDirection.x * outward.y -
    segmentDirection.y * outward.x;
  const dot =
    segmentDirection.x * outward.x +
    segmentDirection.y * outward.y;

  // At the FROM end the drawn segment leaves the terminal in the same
  // direction as the component's outward terminal direction. At the TO end
  // it arrives opposite that outward direction. Anything perpendicular is
  // deliberately ignored.
  const parallelAndContinuous =
    Math.abs(cross) < 0.01 &&
    (endpointKind === "from" ? dot > 0.99 : dot < -0.99);

  return parallelAndContinuous
    ? Math.max(
        0,
        leadLength - (Number(leadInset) || 0)
      )
    : 0;
}

function getDrawnWireCurrentArrows(
  wire,
  geometry,
  fromComponent,
  toComponent
) {
  const mode = wire.currentArrow ?? "none";
  if (mode === "none") {
    return [];
  }

  const points = geometry.points;
  const lastSegmentIndex = points.length - 2;
  const segments = [];

  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);

    if (length < 0.01) {
      continue;
    }

    const unit = {
      x: dx / length,
      y: dy / length,
    };

    const startExtension =
      index === 0
        ? getDrawnWireLeadExtension(
            fromComponent,
            wire.from.port,
            unit,
            "from",
            wire.from.leadInset
          )
        : 0;
    const endExtension =
      index === lastSegmentIndex
        ? getDrawnWireLeadExtension(
            toComponent,
            wire.to.port,
            unit,
            "to",
            wire.to.leadInset
          )
        : 0;

    segments.push({
      index,
      from,
      to,
      dx,
      dy,
      length,
      unit,
      startExtension,
      endExtension,
      visualLength:
        length + startExtension + endExtension,
    });
  }

  // Short-segment suppression is only for ordinary L/C Wire-tool routes.
  // The threshold is based on the whole visible straight run, including any
  // collinear component lead/tail that visually continues the segment.
  // Straight wires keep their existing single-arrow behaviour, and fixed
  // intercepted pieces keep their own stored-route behaviour.
  const isLCShape =
    wire.route !== "fixed" &&
    segments.length >= 2;

  let arrowSegmentIndexes = new Set(
    segments.map((segment) => segment.index)
  );

  if (isLCShape) {
    arrowSegmentIndexes = new Set(
      segments
        .filter(
          (segment) =>
            segment.visualLength >
            WIRE_TOOL_ARROW_SHORT_SEGMENT_MAX
        )
        .map((segment) => segment.index)
    );

    // A normal L has two visible segments. A C whose arm has collapsed to
    // zero also has two visible segments and should behave the same way.
    // If BOTH visible runs are three grid squares or shorter, still show
    // exactly one current arrow: choose the longer visible run, or the first
    // one when tied.
    if (
      segments.length === 2 &&
      segments.every(
        (segment) =>
          segment.visualLength <=
          WIRE_TOOL_ARROW_SHORT_SEGMENT_MAX
      )
    ) {
      const preferredSegment =
        segments[1].visualLength >
        segments[0].visualLength
          ? segments[1]
          : segments[0];

      arrowSegmentIndexes = new Set([
        preferredSegment.index,
      ]);
    }
  }

  const arrows = [];

  for (const segment of segments) {
    if (!arrowSegmentIndexes.has(segment.index)) {
      continue;
    }

    const {
      index,
      from,
      to,
      unit,
      startExtension,
      endExtension,
    } = segment;

    const visualStart = {
      x: from.x - unit.x * startExtension,
      y: from.y - unit.y * startExtension,
    };
    const visualEnd = {
      x: to.x + unit.x * endExtension,
      y: to.y + unit.y * endExtension,
    };
    const centre = {
      x: (visualStart.x + visualEnd.x) / 2,
      y: (visualStart.y + visualEnd.y) / 2,
    };

    const arrowDirection =
      mode === "forward"
        ? unit
        : { x: -unit.x, y: -unit.y };

    // Current arrowheads are 1.5x the standard ArrowHead. Its visual centre
    // sits 6 units behind the tip, so shift the tip forward by 6 units.
    arrows.push({
      x: centre.x + arrowDirection.x * 6,
      y: centre.y + arrowDirection.y * 6,
      angle:
        (Math.atan2(arrowDirection.y, arrowDirection.x) * 180) /
        Math.PI,
    });
  }

  return arrows;
}

function getComponentConnectionDetails(
  component,
  allComponents,
  allWires
) {
  const connections = [];
  const ports = getComponentPorts(component);

  // Explicit Wire-tool connections are real connections regardless of where
  // the other endpoint happens to be visually.
  for (const wire of allWires) {
    if (wire.from.componentId === component.id) {
      connections.push({
        ownPort: wire.from.port,
        kind: "wire",
        wireId: wire.id,
        otherComponentId: wire.to.componentId,
        otherPort: wire.to.port,
      });
    }

    if (wire.to.componentId === component.id) {
      connections.push({
        ownPort: wire.to.port,
        kind: "wire",
        wireId: wire.id,
        otherComponentId: wire.from.componentId,
        otherPort: wire.from.port,
      });
    }
  }

  // Components snapped directly terminal-to-terminal also count as connected.
  for (const ownPort of ports) {
    const ownPosition = getPortPosition(component, ownPort);

    for (const other of allComponents) {
      if (other.id === component.id || other.type === "label") {
        continue;
      }

      for (const otherPort of getComponentPorts(other)) {
        const otherPosition = getPortPosition(other, otherPort);

        if (
          Math.abs(ownPosition.x - otherPosition.x) < 0.01 &&
          Math.abs(ownPosition.y - otherPosition.y) < 0.01
        ) {
          connections.push({
            ownPort,
            kind: "touch",
            otherComponentId: other.id,
            otherPort,
          });
        }
      }
    }
  }

  return connections;
}

function rotateComponentAroundPort(component, port) {
  const fixedPosition = getPortPosition(component, port);
  const rotatesGenericLabel =
    !GENERIC_LABEL_ROTATION_EXCLUSIONS.has(component.type);
  const rotated = {
    ...component,
    rotation: (component.rotation + 90) % 360,
    labelPosition: rotatesGenericLabel
      ? rotateLabelPositionClockwise(
          component.labelPosition ?? "below"
        )
      : component.labelPosition,
  };

  // Work out where that same port would sit relative to a zero-centred
  // rotated component, then move the component so the port remains fixed.
  const rotatedPortOffset = getPortPosition(
    {
      ...rotated,
      x: 0,
      y: 0,
    },
    port
  );

  return {
    ...rotated,
    x: fixedPosition.x - rotatedPortOffset.x,
    y: fixedPosition.y - rotatedPortOffset.y,
  };
}

function getPortDirection(component, port) {
  let localDirection;

  if (component.type === "junction") {
    localDirection = { x: 0, y: 0 };
  } else if (component.type === "potential-divider" && port === "tap") {
    localDirection = { x: 0, y: 1 };
  } else if (component.type === "switch-two-way") {
    localDirection = {
      x: port === "common" ? -1 : 1,
      y: 0,
    };
  } else if (component.type === "microphone") {
    localDirection = { x: 1, y: 0 };
  } else if (component.type === "potentiometer") {
    if (port === "top") {
      localDirection = { x: 0, y: -1 };
    } else if (port === "bottom") {
      localDirection = { x: 0, y: 1 };
    } else {
      localDirection = {
        x: 0,
        y: component.verticalFlip ? -1 : 1,
      };
    }
  } else if (component.type === "transformer") {
    localDirection = {
      x: port.startsWith("primary") ? -1 : 1,
      y: 0,
    };
  } else if (component.type === "ground") {
    localDirection = { x: 0, y: -1 };
  } else {
    localDirection = { x: port === "left" ? -1 : 1, y: 0 };
  }
  const angle = (component.rotation * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  const rotatedDirection = {
    x: localDirection.x * cos - localDirection.y * sin,
    y: localDirection.x * sin + localDirection.y * cos,
  };

  if (component.type === "wire-segment") {
    return {
      x:
        Math.abs(rotatedDirection.x) < 1e-10
          ? 0
          : rotatedDirection.x,
      y:
        Math.abs(rotatedDirection.y) < 1e-10
          ? 0
          : rotatedDirection.y,
    };
  }

  // Ordinary circuit symbols still rotate in 90° steps, so rounding keeps
  // their port directions perfectly cardinal.
  return {
    x: Math.round(rotatedDirection.x),
    y: Math.round(rotatedDirection.y),
  };
}

function getSharedPortDirection(fromComponent, fromPort, toComponent, toPort) {
  const fromDirection = getPortDirection(fromComponent, fromPort);
  const toDirection = getPortDirection(toComponent, toPort);

  if (
    fromDirection.x === toDirection.x &&
    fromDirection.y === toDirection.y
  ) {
    return fromDirection;
  }

  return null;
}

function portsFaceEachOther(
  fromComponent,
  fromPort,
  toComponent,
  toPort
) {
  const fromDirection = getPortDirection(fromComponent, fromPort);
  const toDirection = getPortDirection(toComponent, toPort);

  return (
    fromDirection.x === -toDirection.x &&
    fromDirection.y === -toDirection.y
  );
}

function snapComponentToNearbyTerminal(component, allComponents) {
  if (component.type === "label") {
    return component;
  }

  const ports = getComponentPorts(component);
  let bestSnap = null;

  for (const ownPort of ports) {
    const ownPosition = getPortPosition(component, ownPort);

    for (const other of allComponents) {
      if (other.id === component.id || other.type === "label") {
        continue;
      }

      for (const otherPort of getComponentPorts(other)) {
        const wireCanSnapAtAnyAngle =
          component.type === "wire-segment" ||
          other.type === "wire-segment";

        if (
          !wireCanSnapAtAnyAngle &&
          !portsFaceEachOther(
            component,
            ownPort,
            other,
            otherPort
          )
        ) {
          continue;
        }

        const otherPosition = getPortPosition(other, otherPort);
        const dx = otherPosition.x - ownPosition.x;
        const dy = otherPosition.y - ownPosition.y;

        // "One grid square away" is deliberately generous in both axes.
        // This includes a diagonally-adjacent grid point as well as a
        // horizontally or vertically adjacent one.
        if (Math.abs(dx) > GRID || Math.abs(dy) > GRID) {
          continue;
        }

        const distance = Math.hypot(dx, dy);

        if (!bestSnap || distance < bestSnap.distance) {
          bestSnap = {
            dx,
            dy,
            distance,
          };
        }
      }
    }
  }

  if (!bestSnap) {
    return component;
  }

  return {
    ...component,
    x: component.x + bestSnap.dx,
    y: component.y + bestSnap.dy,
  };
}

// ─── Wire routing and junction geometry ───────────────────────────────────
function directionToKey(direction) {
  if (!direction) return null;
  if (direction.x === 1) return "right";
  if (direction.x === -1) return "left";
  if (direction.y === 1) return "down";
  if (direction.y === -1) return "up";
  return null;
}

function keyToDirection(key) {
  if (key === "right") return { x: 1, y: 0 };
  if (key === "left") return { x: -1, y: 0 };
  if (key === "down") return { x: 0, y: 1 };
  if (key === "up") return { x: 0, y: -1 };
  return null;
}

function getWireGeometry(
  from,
  to,
  route = "horizontal-first",
  cDirectionKey = null,
  cOffset = DEFAULT_C_WIRE_OFFSET
) {
  // Aligned terminals always use one straight segment.
  if (from.y === to.y || from.x === to.x) {
    const points = [from, to];

    return {
      path: `M ${from.x} ${from.y} L ${to.x} ${to.y}`,
      points,
      handle: null,
    };
  }

  if (route === "c-shape") {
    const direction = keyToDirection(cDirectionKey);
    const offset = Math.max(
      MIN_C_WIRE_OFFSET,
      cOffset ?? DEFAULT_C_WIRE_OFFSET
    );

    if (direction?.x) {
      const outerX =
        direction.x > 0
          ? Math.max(from.x, to.x)
          : Math.min(from.x, to.x);
      const middleX = outerX + direction.x * offset;
      const points = [
        from,
        { x: middleX, y: from.y },
        { x: middleX, y: to.y },
        to,
      ];

      return {
        path: `M ${from.x} ${from.y} L ${middleX} ${from.y} L ${middleX} ${to.y} L ${to.x} ${to.y}`,
        points,
        handle: {
          x: middleX,
          y: (from.y + to.y) / 2,
          axis: "x",
          directionSign: direction.x,
        },
      };
    }

    if (direction?.y) {
      const outerY =
        direction.y > 0
          ? Math.max(from.y, to.y)
          : Math.min(from.y, to.y);
      const middleY = outerY + direction.y * offset;
      const points = [
        from,
        { x: from.x, y: middleY },
        { x: to.x, y: middleY },
        to,
      ];

      return {
        path: `M ${from.x} ${from.y} L ${from.x} ${middleY} L ${to.x} ${middleY} L ${to.x} ${to.y}`,
        points,
        handle: {
          x: (from.x + to.x) / 2,
          y: middleY,
          axis: "y",
          directionSign: direction.y,
        },
      };
    }
  }

  // Ordinary non-aligned wires have exactly one 90° corner. There are two
  // possible corners, and `route` chooses which one to use.
  if (route === "vertical-first") {
    const corner = { x: from.x, y: to.y };
    const points = [from, corner, to];

    return {
      path: `M ${from.x} ${from.y} L ${corner.x} ${corner.y} L ${to.x} ${to.y}`,
      points,
      handle: null,
    };
  }

  const corner = { x: to.x, y: from.y };
  const points = [from, corner, to];

  return {
    path: `M ${from.x} ${from.y} L ${corner.x} ${corner.y} L ${to.x} ${to.y}`,
    points,
    handle: null,
  };
}

function getOrthogonalSegmentAxis(from, to) {
  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);

  if (dy < 0.01) return "horizontal";
  if (dx < 0.01) return "vertical";

  // Backward-compatible fallback for fixed wires created before axis metadata
  // existed. The dominant direction is usually the original segment axis.
  return dx >= dy ? "horizontal" : "vertical";
}

function getFixedWireGeometry(
  from,
  to,
  bends = [],
  fixedAxes = null,
  fixedFromPoint = null,
  fixedToPoint = null
) {
  let workingBends = bends.map((point) => ({
    x: point.x,
    y: point.y,
  }));

  // If both endpoints translated together, translate the stored bends too.
  // This keeps an intercepted wire rigid when its whole connected group moves.
  if (fixedFromPoint && fixedToPoint && workingBends.length) {
    const fromDelta = {
      x: from.x - fixedFromPoint.x,
      y: from.y - fixedFromPoint.y,
    };
    const toDelta = {
      x: to.x - fixedToPoint.x,
      y: to.y - fixedToPoint.y,
    };

    if (
      Math.abs(fromDelta.x - toDelta.x) < 0.01 &&
      Math.abs(fromDelta.y - toDelta.y) < 0.01
    ) {
      workingBends = workingBends.map((point) => ({
        x: point.x + fromDelta.x,
        y: point.y + fromDelta.y,
      }));
    }
  }

  const referencePoints = [
    fixedFromPoint ?? from,
    ...workingBends,
    fixedToPoint ?? to,
  ];
  const expectedSegmentCount = workingBends.length + 1;
  const axes =
    Array.isArray(fixedAxes) &&
    fixedAxes.length === expectedSegmentCount
      ? fixedAxes
      : referencePoints
          .slice(0, -1)
          .map((point, index) =>
            getOrthogonalSegmentAxis(
              point,
              referencePoints[index + 1]
            )
          );

  // A split straight wire has no stored bend. If its endpoints later become
  // non-aligned, introduce the one corner needed to preserve the original
  // horizontal/vertical direction rather than drawing a diagonal.
  if (!workingBends.length) {
    const axis = axes[0] ?? getOrthogonalSegmentAxis(from, to);
    const alreadyAligned =
      axis === "horizontal"
        ? Math.abs(from.y - to.y) < 0.01
        : Math.abs(from.x - to.x) < 0.01;

    const points = alreadyAligned
      ? [from, to]
      : axis === "horizontal"
        ? [from, { x: to.x, y: from.y }, to]
        : [from, { x: from.x, y: to.y }, to];

    return {
      path: points
        .map(
          (point, index) =>
            `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`
        )
        .join(" "),
      points,
      handle: null,
    };
  }

  const points = [from, ...workingBends, to];
  const lastIndex = points.length - 1;

  // Enforce every stored segment's original axis. Forward propagation makes
  // the first bend follow the moved "from" endpoint; backward propagation
  // makes the last bend follow the moved "to" endpoint. Repeating once is
  // enough for longer C/fixed routes to settle while retaining middle offsets.
  for (let pass = 0; pass < 2; pass += 1) {
    for (let index = 0; index < axes.length; index += 1) {
      const nextIndex = index + 1;
      if (nextIndex === lastIndex) continue;

      if (axes[index] === "horizontal") {
        points[nextIndex].y = points[index].y;
      } else {
        points[nextIndex].x = points[index].x;
      }
    }

    for (let index = axes.length - 1; index >= 0; index -= 1) {
      if (index === 0) continue;

      const nextIndex = index + 1;
      if (axes[index] === "horizontal") {
        points[index].y = points[nextIndex].y;
      } else {
        points[index].x = points[nextIndex].x;
      }
    }
  }

  const cleanPoints = points.filter(
    (point, index) =>
      index === 0 ||
      Math.hypot(
        point.x - points[index - 1].x,
        point.y - points[index - 1].y
      ) > 0.001
  );

  return {
    path: cleanPoints
      .map(
        (point, index) =>
          `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`
      )
      .join(" "),
    points: cleanPoints,
    handle: null,
  };
}

function getStoredWireGeometry(wire, componentLookup) {
  const fromComponent = componentLookup.get(
    wire.from.componentId
  );
  const toComponent = componentLookup.get(
    wire.to.componentId
  );

  if (!fromComponent || !toComponent) {
    return null;
  }

  const from = getWireEndpointPosition(
    wire.from,
    fromComponent
  );
  const to = getWireEndpointPosition(
    wire.to,
    toComponent
  );

  if (wire.route === "fixed") {
    return {
      fromComponent,
      toComponent,
      from,
      to,
      geometry: getFixedWireGeometry(
        from,
        to,
        wire.bends ?? [],
        wire.fixedAxes ?? null,
        wire.fixedFromPoint ?? null,
        wire.fixedToPoint ?? null
      ),
    };
  }

  const sharedDirection = getSharedPortDirection(
    fromComponent,
    wire.from.port,
    toComponent,
    wire.to.port
  );
  const liveCDirection =
    wire.route === "c-shape" && sharedDirection
      ? directionToKey(sharedDirection)
      : wire.cDirection;

  return {
    fromComponent,
    toComponent,
    from,
    to,
    geometry: getWireGeometry(
      from,
      to,
      wire.route,
      liveCDirection,
      wire.cOffset
    ),
  };
}

function closestPointOnSegment(point, from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared < 0.0001) {
    return { x: from.x, y: from.y, t: 0 };
  }

  const rawT =
    ((point.x - from.x) * dx +
      (point.y - from.y) * dy) /
    lengthSquared;
  const t = clamp(rawT, 0, 1);

  return {
    x: from.x + dx * t,
    y: from.y + dy * t,
    t,
  };
}


function getRoundedClosedPath(
  sourcePoints,
  cornerRadius = 7
) {
  const points = sourcePoints.filter(
    (point, index) =>
      index === 0 ||
      Math.hypot(
        point.x - sourcePoints[index - 1].x,
        point.y - sourcePoints[index - 1].y
      ) > 0.001
  );

  if (points.length < 3) {
    return null;
  }

  const corners = points.map((point, index) => {
    const previous =
      points[(index - 1 + points.length) % points.length];
    const next = points[(index + 1) % points.length];

    const previousDx = previous.x - point.x;
    const previousDy = previous.y - point.y;
    const nextDx = next.x - point.x;
    const nextDy = next.y - point.y;
    const previousLength = Math.hypot(
      previousDx,
      previousDy
    );
    const nextLength = Math.hypot(nextDx, nextDy);
    const radius = Math.min(
      cornerRadius,
      previousLength / 2,
      nextLength / 2
    );

    return {
      point,
      start: {
        x:
          point.x +
          (previousDx / previousLength) * radius,
        y:
          point.y +
          (previousDy / previousLength) * radius,
      },
      end: {
        x: point.x + (nextDx / nextLength) * radius,
        y: point.y + (nextDy / nextLength) * radius,
      },
    };
  });

  let path = `M ${corners[0].end.x} ${corners[0].end.y}`;

  for (let index = 1; index <= corners.length; index += 1) {
    const corner = corners[index % corners.length];
    path +=
      ` L ${corner.start.x} ${corner.start.y}` +
      ` Q ${corner.point.x} ${corner.point.y}` +
      ` ${corner.end.x} ${corner.end.y}`;
  }

  return `${path} Z`;
}


function getPolylineCorridorOutline(
  sourcePoints,
  radius = WIRE_TOOL_HIT_WIDTH / 2
) {
  const points = sourcePoints.filter(
    (point, index) =>
      index === 0 ||
      Math.hypot(
        point.x - sourcePoints[index - 1].x,
        point.y - sourcePoints[index - 1].y
      ) > 0.001
  );

  if (points.length < 2) {
    return null;
  }

  const segments = [];

  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);

    if (length < 0.001) continue;

    const unit = { x: dx / length, y: dy / length };
    segments.push({
      unit,
      normal: { x: -unit.y, y: unit.x },
    });
  }

  if (!segments.length) {
    return null;
  }

  function offsetJoin(point, previous, next, side) {
    const a = {
      x: point.x + previous.normal.x * radius * side,
      y: point.y + previous.normal.y * radius * side,
    };
    const b = {
      x: point.x + next.normal.x * radius * side,
      y: point.y + next.normal.y * radius * side,
    };

    const denominator =
      previous.unit.x * next.unit.y -
      previous.unit.y * next.unit.x;

    if (Math.abs(denominator) < 0.0001) {
      return {
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
      };
    }

    const deltaX = b.x - a.x;
    const deltaY = b.y - a.y;
    const t =
      (deltaX * next.unit.y -
        deltaY * next.unit.x) /
      denominator;

    return {
      x: a.x + previous.unit.x * t,
      y: a.y + previous.unit.y * t,
    };
  }

  function sidePoints(side) {
    const first = segments[0];
    const last = segments[segments.length - 1];
    const result = [
      {
        x:
          points[0].x +
          first.normal.x * radius * side -
          first.unit.x * radius,
        y:
          points[0].y +
          first.normal.y * radius * side -
          first.unit.y * radius,
      },
    ];

    for (let index = 1; index < points.length - 1; index += 1) {
      result.push(
        offsetJoin(
          points[index],
          segments[index - 1],
          segments[index],
          side
        )
      );
    }

    result.push({
      x:
        points.at(-1).x +
        last.normal.x * radius * side +
        last.unit.x * radius,
      y:
        points.at(-1).y +
        last.normal.y * radius * side +
        last.unit.y * radius,
    });

    return result;
  }

  const left = sidePoints(1);
  const right = sidePoints(-1);
  const outlinePoints = [
    ...left,
    ...right.slice().reverse(),
  ];

  return {
    outlinePath: getRoundedClosedPath(
      outlinePoints,
      7
    ),
  };
}


function findNearestComponentLeadPoint(
  point,
  allComponents,
  maxDistance,
  onlyComponentId = null,
  onlyPort = null
) {
  let best = null;

  for (const component of allComponents) {
    if (
      onlyComponentId &&
      component.id !== onlyComponentId
    ) {
      continue;
    }

    for (const port of getComponentPorts(component)) {
      if (onlyPort && port !== onlyPort) {
        continue;
      }

      const segment = getComponentLeadSegment(
        component,
        port
      );
      if (!segment) continue;

      const closest = closestPointOnSegment(
        point,
        segment.terminal,
        segment.inner
      );
      const snappedPosition = snapPointAlongWireSegment(
        closest,
        segment.terminal,
        segment.inner
      );
      const distance = Math.hypot(
        point.x - snappedPosition.x,
        point.y - snappedPosition.y
      );

      if (
        distance > maxDistance ||
        (best && distance >= best.distance)
      ) {
        continue;
      }

      const leadInset = Math.hypot(
        snappedPosition.x - segment.terminal.x,
        snappedPosition.y - segment.terminal.y
      );

      best = {
        kind: "lead",
        componentId: component.id,
        port,
        leadInset,
        position: snappedPosition,
        distance,
      };
    }
  }

  return best;
}

function snapPointAlongWireSegment(point, from, to) {
  const horizontal = Math.abs(to.y - from.y) < 0.01;
  const vertical = Math.abs(to.x - from.x) < 0.01;

  if (horizontal) {
    const minX = Math.min(from.x, to.x);
    const maxX = Math.max(from.x, to.x);

    return {
      x: Math.max(minX, Math.min(maxX, snap(point.x))),
      y: from.y,
    };
  }

  if (vertical) {
    const minY = Math.min(from.y, to.y);
    const maxY = Math.max(from.y, to.y);

    return {
      x: from.x,
      y: Math.max(minY, Math.min(maxY, snap(point.y))),
    };
  }

  return { x: point.x, y: point.y };
}

function getBlackJunctionTargets(
  allComponents,
  allWires,
  componentLookup
) {
  const targets = [];
  const connectionCounts = new Map();

  for (const wire of allWires) {
    for (const endpoint of [wire.from, wire.to]) {
      const component = componentLookup.get(
        endpoint.componentId
      );

      if (component?.type === "junction") {
        connectionCounts.set(
          component.id,
          (connectionCounts.get(component.id) ?? 0) + 1
        );
      }
    }
  }

  for (const component of allComponents) {
    if (
      component.type !== "junction" ||
      (connectionCounts.get(component.id) ?? 0) < 3
    ) {
      continue;
    }

    targets.push({
      kind: "junction",
      endpoint: {
        componentId: component.id,
        port: "node",
      },
      position: { x: component.x, y: component.y },
    });
  }

  for (const wire of allWires) {
    for (const endpoint of [wire.from, wire.to]) {
      if ((Number(endpoint.leadInset) || 0) <= 0.01) {
        continue;
      }

      const component = componentLookup.get(
        endpoint.componentId
      );
      if (!component) continue;

      const position = getWireEndpointPosition(
        endpoint,
        component
      );

      const alreadyIncluded = targets.some(
        (target) =>
          Math.hypot(
            target.position.x - position.x,
            target.position.y - position.y
          ) < 0.01
      );

      if (alreadyIncluded) {
        continue;
      }

      targets.push({
        kind: "lead-junction",
        endpoint: { ...endpoint },
        position,
      });
    }
  }

  return targets;
}

function findNearestBlackJunctionPoint(
  point,
  allComponents,
  allWires,
  componentLookup,
  maxDistance
) {
  let best = null;

  for (const target of getBlackJunctionTargets(
    allComponents,
    allWires,
    componentLookup
  )) {
    const distance = Math.hypot(
      point.x - target.position.x,
      point.y - target.position.y
    );

    if (
      distance <= maxDistance &&
      (!best || distance < best.distance)
    ) {
      best = {
        ...target,
        distance,
      };
    }
  }

  return best;
}

function findNearestWirePoint(
  point,
  allWires,
  componentLookup,
  maxDistance,
  onlyWireId = null
) {
  let best = null;

  for (const wire of allWires) {
    if (onlyWireId && wire.id !== onlyWireId) {
      continue;
    }

    const resolved = getStoredWireGeometry(
      wire,
      componentLookup
    );
    if (!resolved) continue;

    const points = resolved.geometry.points;

    for (let index = 0; index < points.length - 1; index += 1) {
      const segmentFrom = points[index];
      const segmentTo = points[index + 1];
      const closest = closestPointOnSegment(
        point,
        segmentFrom,
        segmentTo
      );
      const distance = Math.hypot(
        point.x - closest.x,
        point.y - closest.y
      );

      if (
        distance <= maxDistance &&
        (!best || distance < best.distance)
      ) {
        best = {
          wireId: wire.id,
          segmentIndex: index,
          position: snapPointAlongWireSegment(
            closest,
            segmentFrom,
            segmentTo
          ),
          distance,
          geometry: resolved.geometry,
        };
      }
    }
  }

  return best;
}

function makeFixedWirePiece(
  fromEndpoint,
  toEndpoint,
  points,
  currentArrow = "none"
) {
  return {
    id: uid(),
    from: { ...fromEndpoint },
    to: { ...toEndpoint },
    route: "fixed",
    bends: points
      .slice(1, -1)
      .map((point) => ({ x: point.x, y: point.y })),
    fixedAxes: points
      .slice(0, -1)
      .map((point, index) =>
        getOrthogonalSegmentAxis(
          point,
          points[index + 1]
        )
      ),
    fixedFromPoint: {
      x: points[0].x,
      y: points[0].y,
    },
    fixedToPoint: {
      x: points.at(-1).x,
      y: points.at(-1).y,
    },
    currentArrow,
  };
}

function getGroupTransformComponentIds(
  baseIds,
  allComponents,
  allWires
) {
  const selectedIds = new Set(baseIds);
  const transformIds = new Set(baseIds);
  const junctionIds = new Set(
    allComponents
      .filter((component) => component.type === "junction")
      .map((component) => component.id)
  );

  // Hidden junctions are not directly selectable. Treat each connected
  // junction cluster as part of the selected group only when every visible
  // component attached to that cluster is selected. This lets a complete
  // intercepted network move/rotate rigidly, while a junction that is still
  // anchored to an unselected component stays put.
  const junctionNeighbours = new Map(
    [...junctionIds].map((id) => [id, new Set()])
  );

  for (const wire of allWires) {
    const fromId = wire.from.componentId;
    const toId = wire.to.componentId;

    if (
      junctionIds.has(fromId) &&
      junctionIds.has(toId)
    ) {
      junctionNeighbours.get(fromId)?.add(toId);
      junctionNeighbours.get(toId)?.add(fromId);
    }
  }

  const visited = new Set();

  for (const startId of junctionIds) {
    if (visited.has(startId)) continue;

    const cluster = new Set();
    const queue = [startId];
    visited.add(startId);

    while (queue.length) {
      const junctionId = queue.shift();
      cluster.add(junctionId);

      for (
        const neighbour of
        junctionNeighbours.get(junctionId) ?? []
      ) {
        if (visited.has(neighbour)) continue;
        visited.add(neighbour);
        queue.push(neighbour);
      }
    }

    const boundaryIds = new Set();
    const fixedBackboneBoundaryIds = new Set();

    for (const wire of allWires) {
      const fromId = wire.from.componentId;
      const toId = wire.to.componentId;
      const fromInCluster = cluster.has(fromId);
      const toInCluster = cluster.has(toId);
      let outsideId = null;

      if (fromInCluster && !toInCluster) {
        outsideId = toId;
      } else if (toInCluster && !fromInCluster) {
        outsideId = fromId;
      }

      if (!outsideId) {
        continue;
      }

      boundaryIds.add(outsideId);

      // When a Wire-tool wire is intercepted, its two original sides become
      // fixed pieces and the new branch is normally a non-fixed wire. The
      // hidden nexus belongs to that fixed backbone. Therefore selecting both
      // backbone sides should carry the nexus with them even when the branch
      // component itself is not selected; the branch can then stretch to the
      // moving nexus.
      if (wire.route === "fixed") {
        fixedBackboneBoundaryIds.add(outsideId);
      }
    }

    const completeFixedBackboneSelected =
      fixedBackboneBoundaryIds.size >= 2 &&
      [...fixedBackboneBoundaryIds].every((id) =>
        selectedIds.has(id)
      );
    const completeJunctionBoundarySelected =
      boundaryIds.size > 0 &&
      [...boundaryIds].every((id) =>
        selectedIds.has(id)
      );

    if (
      completeFixedBackboneSelected ||
      completeJunctionBoundarySelected
    ) {
      for (const junctionId of cluster) {
        transformIds.add(junctionId);
      }
    }
  }

  return transformIds;
}

function rebuildFixedWireFromPoints(wire, sourcePoints) {
  const points = sourcePoints
    .filter(
      (point, index) =>
        index === 0 ||
        Math.hypot(
          point.x - sourcePoints[index - 1].x,
          point.y - sourcePoints[index - 1].y
        ) > 0.001
    )
    .map((point) => ({ x: point.x, y: point.y }));

  if (points.length < 2) {
    return wire;
  }

  return {
    ...wire,
    route: "fixed",
    bends: points
      .slice(1, -1)
      .map((point) => ({ x: point.x, y: point.y })),
    fixedAxes: points
      .slice(0, -1)
      .map((point, index) =>
        getOrthogonalSegmentAxis(
          point,
          points[index + 1]
        )
      ),
    fixedFromPoint: {
      x: points[0].x,
      y: points[0].y,
    },
    fixedToPoint: {
      x: points.at(-1).x,
      y: points.at(-1).y,
    },
  };
}

function rebaseRigidFixedWires(
  sourceWires,
  componentLookup,
  transformIds
) {
  return sourceWires.map((wire) => {
    const bothEndsTransform =
      transformIds.has(wire.from.componentId) &&
      transformIds.has(wire.to.componentId);

    if (
      wire.route !== "fixed" ||
      !bothEndsTransform
    ) {
      return wire;
    }

    const resolved = getStoredWireGeometry(
      wire,
      componentLookup
    );

    return resolved
      ? rebuildFixedWireFromPoints(
          wire,
          resolved.geometry.points
        )
      : wire;
  });
}

function translateRigidFixedWires(
  sourceWires,
  transformIds,
  deltaX,
  deltaY
) {
  return sourceWires.map((wire) => {
    const bothEndsTransform =
      transformIds.has(wire.from.componentId) &&
      transformIds.has(wire.to.componentId);

    if (
      wire.route !== "fixed" ||
      !bothEndsTransform
    ) {
      return wire;
    }

    const fromPoint = wire.fixedFromPoint;
    const toPoint = wire.fixedToPoint;

    if (!fromPoint || !toPoint) {
      return wire;
    }

    return {
      ...wire,
      bends: (wire.bends ?? []).map((point) => ({
        x: point.x + deltaX,
        y: point.y + deltaY,
      })),
      fixedFromPoint: {
        x: fromPoint.x + deltaX,
        y: fromPoint.y + deltaY,
      },
      fixedToPoint: {
        x: toPoint.x + deltaX,
        y: toPoint.y + deltaY,
      },
    };
  });
}

function rotatePointClockwiseAround(
  point,
  centreX,
  centreY
) {
  const dx = point.x - centreX;
  const dy = point.y - centreY;

  return {
    x: centreX - dy,
    y: centreY + dx,
  };
}


function wirePath(from, to, route = "horizontal-first") {
  return getWireGeometry(from, to, route).path;
}

function makeWireComponentFromSegment(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const horizontal = Math.abs(dy) < 0.01;
  const vertical = Math.abs(dx) < 0.01;

  if (!horizontal && !vertical) {
    return null;
  }

  const length = horizontal ? Math.abs(dx) : Math.abs(dy);

  // Ignore a zero-length leg. This can occur if a route happens to collapse
  // onto one axis after components have been moved.
  if (length < 0.01) {
    return null;
  }

  return {
    id: uid(),
    type: "wire-segment",
    x: (from.x + to.x) / 2,
    y: (from.y + to.y) / 2,
    rotation: horizontal ? 0 : 90,
    label: "",
    labelPosition: "below",
    labelFontSize: 24,
    length,
    currentArrow: "none",
  };
}

function convertWireToolWireToComponents(
  wire,
  componentLookup
) {
  const resolved = getStoredWireGeometry(
    wire,
    componentLookup
  );

  if (!resolved) {
    return [];
  }

  const converted = [];

  for (
    let index = 0;
    index < resolved.geometry.points.length - 1;
    index += 1
  ) {
    const component = makeWireComponentFromSegment(
      resolved.geometry.points[index],
      resolved.geometry.points[index + 1]
    );

    if (component) {
      converted.push(component);
    }
  }

  return converted;
}


function findNearestTerminal(point, allComponents, maxDistance) {
  let best = null;

  for (const component of allComponents) {
    if (
      component.type === "label" ||
      component.type === "junction"
    ) {
      continue;
    }

    for (const port of getComponentPorts(component)) {
      const position = getPortPosition(component, port);
      const distance = Math.hypot(
        point.x - position.x,
        point.y - position.y
      );

      if (
        distance <= maxDistance &&
        (!best || distance < best.distance)
      ) {
        best = {
          componentId: component.id,
          port,
          position,
          distance,
        };
      }
    }
  }

  return best;
}

function oppositeWireRoute(route) {
  return route === "vertical-first" ? "horizontal-first" : "vertical-first";
}

function rotateDirectionKeyClockwise(key) {
  if (key === "right") return "down";
  if (key === "down") return "left";
  if (key === "left") return "up";
  if (key === "up") return "right";
  return key;
}

// ─── Selection geometry and snapshot helpers ──────────────────────────────
function getComponentMarqueeBounds(component) {
  const portDistance = getComponentPortDistance(component);
  const isWireSegment = component.type === "wire-segment";

  if (isWireSegment) {
    const left = getPortPosition(component, "left");
    const right = getPortPosition(component, "right");
    const margin = 7;

    return {
      left: Math.min(left.x, right.x) - margin,
      right: Math.max(left.x, right.x) + margin,
      top: Math.min(left.y, right.y) - margin,
      bottom: Math.max(left.y, right.y) + margin,
    };
  }

  const bodyHalfWidth =
    component.type === "label" ? 80 : portDistance;
  const visualHalfHeight =
    component.type === "label"
      ? 16
      : Math.max(
          getComponentLabelExtent(component, "above"),
          getComponentLabelExtent(component, "below")
        );

  // Marquee selection should follow the visible symbol much more closely than
  // the normal click/grab hit area. A small margin keeps thin parts selectable
  // without allowing a box that merely passes nearby to scoop them up.
  let halfWidth =
    component.type === "label"
      ? 82
      : bodyHalfWidth + 3;
  let halfHeight =
    component.type === "label"
      ? 18
      : visualHalfHeight + 3;

  const rotation =
    ((component.rotation ?? 0) % 360 + 360) % 360;

  if (rotation === 90 || rotation === 270) {
    [halfWidth, halfHeight] = [halfHeight, halfWidth];
  }

  return {
    left: component.x - halfWidth,
    right: component.x + halfWidth,
    top: component.y - halfHeight,
    bottom: component.y + halfHeight,
  };
}

function normalizeMarquee(startX, startY, currentX, currentY) {
  return {
    left: Math.min(startX, currentX),
    right: Math.max(startX, currentX),
    top: Math.min(startY, currentY),
    bottom: Math.max(startY, currentY),
  };
}

function componentTouchesMarquee(component, marquee) {
  if (component.type === "junction") {
    return false;
  }

  const bounds = getComponentMarqueeBounds(component);

  return !(
    bounds.right < marquee.left ||
    bounds.left > marquee.right ||
    bounds.bottom < marquee.top ||
    bounds.top > marquee.bottom
  );
}

function cloneComponent(component) {
  return { ...component };
}

function cloneWire(wire) {
  return {
    ...wire,
    from: { ...wire.from },
    to: { ...wire.to },
  };
}

function cloneCircuitSnapshot(sourceComponents, sourceWires) {
  return {
    components: sourceComponents.map(cloneComponent),
    wires: sourceWires.map(cloneWire),
  };
}

// ─── Editor application ───────────────────────────────────────────────────
function App() {
  useEffect(() => {
    document.title = "Circuit Drawer";
  }, []);

  // Refs hold transient gesture state that should not trigger renders.
  const svgRef = useRef(null);
  const canvasViewportRef = useRef(null);
  const zoomRef = useRef(DEFAULT_ZOOM);
  const pinchWheelRef = useRef({
    deltaY: 0,
    clientX: 0,
    clientY: 0,
    frame: null,
  });
  const nativeGestureActiveRef = useRef(false);
  const nativeGestureStartZoomRef = useRef(DEFAULT_ZOOM);
  const dragRef = useRef(null);
  const wireHandleDragRef = useRef(null);
  const wireSegmentResizeRef = useRef(null);
  const rotationPivotRef = useRef(null);
  const marqueeSelectionRef = useRef(null);
  const labelInputRef = useRef(null);
  const dividerLabel1InputRef = useRef(null);
  const dividerLabel2InputRef = useRef(null);
  const activeLabelFieldRef = useRef("label");
  const labelSelectionRef = useRef({
    field: "label",
    start: 0,
    end: 0,
  });

  // Persistent circuit state and editor UI state.
  const [components, setComponents] = useState([]);
  const [wires, setWires] = useState([]);
  const [undoHistory, setUndoHistory] = useState([]);
  const [selected, setSelected] = useState(null);
  const [selectedComponentIds, setSelectedComponentIds] = useState([]);
  const [marqueeSelection, setMarqueeSelection] = useState(null);
  const [mode, setMode] = useState("select");
  const [wireStart, setWireStart] = useState(null);
  const [wirePreview, setWirePreview] = useState(null);
  const [wireSnapTarget, setWireSnapTarget] = useState(null);
  const [wireRoute, setWireRoute] = useState("horizontal-first");
  const [showGrid, setShowGrid] = useState(true);
  const [snapObjects, setSnapObjects] = useState(true);
  const [showBlueConnectors, setShowBlueConnectors] =
    useState(true);
  const [fancyText, setFancyText] = useState(false);
  const [copyImageStatus, setCopyImageStatus] =
    useState("idle");
  const [transparentBackground, setTransparentBackground] =
    useState(false);
  const [unicodePickerOpen, setUnicodePickerOpen] =
    useState(false);
  const [unicodeSearch, setUnicodeSearch] = useState("");
  const [unicodeCodePoint, setUnicodeCodePoint] =
    useState("");
  const [unicodeCodePointStatus, setUnicodeCodePointStatus] =
    useState("");
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);

  const circuitTextFontFamily = fancyText
    ? 'Georgia, "Times New Roman", serif'
    : "Arial, sans-serif";

  // Derived state.
  const componentMap = useMemo(
    () => new Map(components.map((component) => [component.id, component])),
    [components]
  );

  const blackJunctionTargets = useMemo(
    () =>
      getBlackJunctionTargets(
        components,
        wires,
        componentMap
      ),
    [components, wires, componentMap]
  );

  const selectedComponents = useMemo(
    () =>
      selectedComponentIds
        .map((id) => componentMap.get(id))
        .filter(Boolean),
    [selectedComponentIds, componentMap]
  );

  const selectedComponent =
    selected?.kind === "component" && selectedComponentIds.length === 1
      ? componentMap.get(selected.id) ?? null
      : null;

  const selectedWire =
    selected?.kind === "wire"
      ? wires.find((wire) => wire.id === selected.id) ?? null
      : null;

  const filteredUnicodeCharacters = useMemo(() => {
    const query = unicodeSearch.trim().toLowerCase();

    if (!query) {
      return UNICODE_CHARACTERS;
    }

    return UNICODE_CHARACTERS.filter((entry) => {
      const codePoint =
        unicodeCodePointLabel(entry.character).toLowerCase();

      return (
        entry.character.includes(unicodeSearch.trim()) ||
        entry.name.toLowerCase().includes(query) ||
        entry.category.toLowerCase().includes(query) ||
        codePoint.includes(query.replace(/^u\+/, ""))
      );
    });
  }, [unicodeSearch]);

  const selectedWireCanFlip = (() => {
    if (
      !selectedWire ||
      selectedWire.route === "c-shape" ||
      selectedWire.route === "fixed"
    ) {
      return false;
    }

    const fromComponent = componentMap.get(
      selectedWire.from.componentId
    );
    const toComponent = componentMap.get(
      selectedWire.to.componentId
    );

    if (!fromComponent || !toComponent) {
      return false;
    }

    const from = getWireEndpointPosition(
      selectedWire.from,
      fromComponent
    );
    const to = getWireEndpointPosition(
      selectedWire.to,
      toComponent
    );

    return from.x !== to.x && from.y !== to.y;
  })();

  // ── Undo snapshots ──────────────────────────────────────────────────────
  function makeUndoSnapshot(
    sourceComponents = components,
    sourceWires = wires
  ) {
    return cloneCircuitSnapshot(
      sourceComponents,
      sourceWires
    );
  }

  function rememberUndo(snapshot = makeUndoSnapshot()) {
    setUndoHistory((current) => [
      ...current.slice(-(UNDO_LIMIT - 1)),
      snapshot,
    ]);
  }

  function undoLastAction() {
    if (!undoHistory.length) return;

    const snapshot = undoHistory[undoHistory.length - 1];

    setComponents(snapshot.components.map(cloneComponent));
    setWires(snapshot.wires.map(cloneWire));
    setUndoHistory((current) => current.slice(0, -1));

    // Selection and in-progress gestures are transient editor state. Clearing
    // them prevents an undo from leaving a handle or half-drawn wire pointing
    // at something that no longer exists in the restored diagram.
    setSelected(null);
    setSelectedComponentIds([]);
    setWireStart(null);
    setWirePreview(null);
    setWireSnapTarget(null);
    setWireRoute("horizontal-first");
    dragRef.current = null;
    wireHandleDragRef.current = null;
    wireSegmentResizeRef.current = null;
    rotationPivotRef.current = null;
    marqueeSelectionRef.current = null;
    setMarqueeSelection(null);
  }

  function focusStandaloneLabelInput() {
    activeLabelFieldRef.current = "label";

    // Selection changes may need one render before the Inspector input exists.
    // Two animation frames keeps this reliable even when the Label was part of
    // a previous multi-selection.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const input = labelInputRef.current;
        if (!input) return;

        input.focus();
        input.select();

        labelSelectionRef.current = {
          field: "label",
          start: 0,
          end: input.value.length,
        };
      });
    });
  }

  // ── Canvas coordinates and component creation ──────────────────────────
  function clientPointToSvg(clientX, clientY) {
    const svg = svgRef.current;
    if (!svg) return null;

    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;

    const matrix = svg.getScreenCTM();
    if (!matrix) return null;

    return point.matrixTransform(matrix.inverse());
  }

  function svgPoint(event) {
    return (
      clientPointToSvg(event.clientX, event.clientY) ?? {
        x: 0,
        y: 0,
      }
    );
  }

  function getVisibleCanvasSpawnPoint(index = 0) {
    const svg = svgRef.current;
    const viewport = canvasViewportRef.current;

    if (!svg || !viewport) {
      return {
        x: WIDTH / 2,
        y: HEIGHT / 2,
      };
    }

    const svgRect = svg.getBoundingClientRect();
    const viewportRect = viewport.getBoundingClientRect();

    const visibleLeft = Math.max(
      svgRect.left,
      viewportRect.left
    );
    const visibleTop = Math.max(
      svgRect.top,
      viewportRect.top
    );
    const visibleRight = Math.min(
      svgRect.right,
      viewportRect.right
    );
    const visibleBottom = Math.min(
      svgRect.bottom,
      viewportRect.bottom
    );

    if (
      visibleRight <= visibleLeft ||
      visibleBottom <= visibleTop
    ) {
      return {
        x: WIDTH / 2,
        y: HEIGHT / 2,
      };
    }

    const topLeft = clientPointToSvg(
      visibleLeft,
      visibleTop
    );
    const bottomRight = clientPointToSvg(
      visibleRight,
      visibleBottom
    );

    if (!topLeft || !bottomRight) {
      return {
        x: WIDTH / 2,
        y: HEIGHT / 2,
      };
    }

    const left = Math.max(
      0,
      Math.min(topLeft.x, bottomRight.x)
    );
    const right = Math.min(
      WIDTH,
      Math.max(topLeft.x, bottomRight.x)
    );
    const top = Math.max(
      0,
      Math.min(topLeft.y, bottomRight.y)
    );
    const bottom = Math.min(
      HEIGHT,
      Math.max(topLeft.y, bottomRight.y)
    );

    const visibleWidth = Math.max(0, right - left);
    const visibleHeight = Math.max(0, bottom - top);

    // Keep enough room for a normal symbol around the spawn point, while
    // gracefully reducing that margin if the visible area is very small.
    const margin = Math.min(
      70,
      visibleWidth * 0.24,
      visibleHeight * 0.24
    );
    const minX = left + margin;
    const maxX = right - margin;
    const minY = top + margin;
    const maxY = bottom - margin;

    const centreX = (left + right) / 2;
    const centreY = (top + bottom) / 2;
    const stagger = [
      { x: 0, y: 0 },
      { x: 30, y: 30 },
      { x: -30, y: 30 },
      { x: 30, y: -30 },
      { x: -30, y: -30 },
      { x: 60, y: 0 },
      { x: 0, y: 60 },
      { x: -60, y: 0 },
    ][index % 8];

    return {
      x: Math.max(
        Math.min(minX, maxX),
        Math.min(
          Math.max(minX, maxX),
          centreX + stagger.x
        )
      ),
      y: Math.max(
        Math.min(minY, maxY),
        Math.min(
          Math.max(minY, maxY),
          centreY + stagger.y
        )
      ),
    };
  }

  function addComponent(type, x = null, y = null) {
    rotationPivotRef.current = null;
    const index =
      components.filter(
        (component) => component.type !== "junction"
      ).length % 8;
    const hasExplicitPosition =
      Number.isFinite(x) && Number.isFinite(y);
    const spawnPoint = hasExplicitPosition
      ? { x, y }
      : getVisibleCanvasSpawnPoint(index);
    const component = {
      id: uid(),
      type,
      x: snapObjects
        ? snap(spawnPoint.x)
        : spawnPoint.x,
      y: snapObjects
        ? snap(spawnPoint.y)
        : spawnPoint.y,
      rotation: 0,
      label: type === "label" ? "Label" : "",
      labelPosition: type === "label" ? "center" : "below",
      labelFontSize: type === "label" ? 26 : 24,
      labelBold: false,
      labelItalic: false,
      ...(type === "potential-divider"
        ? { dividerLabel1: "", dividerLabel2: "" }
        : {}),
      ...(type === "potentiometer"
        ? {
            verticalFlip: false,
            wiperOffset:
              POTENTIOMETER_WIPER_OFFSET_DEFAULT,
          }
        : {}),
      ...(type === "switch-two-way"
        ? { switchPosition: "upper" }
        : {}),
      ...(type === "wire-segment"
        ? {
            length: DEFAULT_WIRE_COMPONENT_LENGTH,
            currentArrow: "none",
          }
        : {}),
      ...(type === "cell" ? { cellCount: 1 } : {}),
      ...(["cell", "battery"].includes(type)
        ? { showPolarity: true }
        : {}),
    };

    rememberUndo();
    setComponents((current) => [...current, component]);
    setSelected({ kind: "component", id: component.id });
    setSelectedComponentIds([component.id]);
    setMode("select");
    setWireStart(null);
    setWirePreview(null);
  }

  function handlePaletteDragStart(event, type) {
    event.dataTransfer.setData("application/x-circuit-symbol", type);
    event.dataTransfer.effectAllowed = "copy";
  }

  function handleDrop(event) {
    event.preventDefault();
    const type = event.dataTransfer.getData("application/x-circuit-symbol");
    if (!type) return;

    const point = svgPoint(event);
    addComponent(type, point.x, point.y);
  }

  // ── Pointer gestures and selection ─────────────────────────────────────
  function startComponentDrag(event, component) {
    event.stopPropagation();

    if (!event.isPrimary || event.button !== 0) {
      return;
    }

    // In Wire mode, an already-rendered snap target is authoritative over
    // whichever SVG hit area happens to receive the pointer-down.
    if (
      mode === "wire" &&
      wireStart &&
      finishWireAtVisibleSnapTarget(event)
    ) {
      return;
    }

    // Visible component leads — including the full standalone Wire component
    // line — are valid electrical connection targets.
    if (mode === "wire") {
      const leadTarget = findNearestComponentLeadPoint(
        svgPoint(event),
        components,
        WIRE_TOOL_SNAP_RADIUS / zoom,
        component.id
      );

      if (leadTarget) {
        handleComponentLeadClick(
          event,
          component.id,
          leadTarget.port,
          leadTarget
        );
        return;
      }

      event.preventDefault();
      setMode("select");
      setWireStart(null);
      setWirePreview(null);
      setWireSnapTarget(null);
      setWireRoute("horizontal-first");
      setSelected({ kind: "component", id: component.id });
      setSelectedComponentIds([component.id]);

      if (component.type === "label") {
        focusStandaloneLabelInput();
      }
      return;
    }

    if (mode !== "select") {
      return;
    }

    event.preventDefault();

    // Shift-click toggles a component in the current component selection.
    // It deliberately does not begin a drag; release Shift and drag any
    // selected component to move the whole group.
    if (event.shiftKey) {
      const alreadySelected = selectedComponentIds.includes(component.id);
      const nextIds = alreadySelected
        ? selectedComponentIds.filter((id) => id !== component.id)
        : [...selectedComponentIds, component.id];

      setSelectedComponentIds(nextIds);

      if (!nextIds.length) {
        setSelected(null);
      } else if (alreadySelected && selected?.id === component.id) {
        setSelected({
          kind: "component",
          id: nextIds[nextIds.length - 1],
        });
      } else if (!alreadySelected) {
        setSelected({ kind: "component", id: component.id });
      }

      return;
    }

    const componentAlreadyInSelection =
      selectedComponentIds.includes(component.id);
    const visibleDragIds =
      componentAlreadyInSelection && selectedComponentIds.length > 1
        ? selectedComponentIds
        : [component.id];

    if (!componentAlreadyInSelection || selectedComponentIds.length <= 1) {
      setSelectedComponentIds([component.id]);
    }
    setSelected({ kind: "component", id: component.id });

    const point = svgPoint(event);

    // Hidden interception junctions should travel with a complete selected
    // network, but remain anchored if any visible component attached to their
    // cluster is outside the selection.
    const transformIds =
      visibleDragIds.length > 1
        ? getGroupTransformComponentIds(
            visibleDragIds,
            components,
            wires
          )
        : new Set(visibleDragIds);
    const dragIds = [...transformIds];
    const dragComponentLookup = new Map(
      components.map((item) => [item.id, item])
    );
    const transformWires = rebaseRigidFixedWires(
      wires,
      dragComponentLookup,
      transformIds
    );

    // Capture the pointer on the SVG so the whole group keeps following the
    // pointer even if the cursor/finger moves away from the symbols or canvas.
    svgRef.current?.setPointerCapture?.(event.pointerId);

    const origins = {};
    for (const item of components) {
      if (transformIds.has(item.id)) {
        origins[item.id] = { x: item.x, y: item.y };
      }
    }

    dragRef.current = {
      id: component.id,
      ids: dragIds,
      visibleIds: [...visibleDragIds],
      transformIds,
      transformWires,
      hasRigidFixedWires: transformWires.some(
        (wire) =>
          wire.route === "fixed" &&
          transformIds.has(wire.from.componentId) &&
          transformIds.has(wire.to.componentId)
      ),
      origins,
      undoSnapshot: makeUndoSnapshot(),
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      startClientX: event.clientX,
      startClientY: event.clientY,
      appliedDeltaX: 0,
      appliedDeltaY: 0,
      started: false,
    };
  }


  function startWireSegmentResize(event, component, end) {
    event.stopPropagation();

    if (
      mode !== "select" ||
      component.type !== "wire-segment" ||
      !event.isPrimary ||
      event.button !== 0
    ) {
      return;
    }

    event.preventDefault();
    rotationPivotRef.current = null;

    const length = component.length ?? DEFAULT_WIRE_COMPONENT_LENGTH;
    const oppositeEnd = end === "left" ? "right" : "left";
    const fixed = getPortPosition(component, oppositeEnd);
    const draggedDirection = getPortDirection(component, end);

    svgRef.current?.setPointerCapture?.(event.pointerId);

    const bodyAttachments = [];

    for (const wire of wires) {
      for (const endpointKey of ["from", "to"]) {
        const endpoint = wire[endpointKey];
        const leadInset = Number(endpoint.leadInset) || 0;

        if (
          endpoint.componentId === component.id &&
          endpoint.port === "left" &&
          leadInset > 0.001
        ) {
          bodyAttachments.push({
            wireId: wire.id,
            endpointKey,
            originLeadInset: leadInset,
          });
        }
      }
    }

    wireSegmentResizeRef.current = {
      componentId: component.id,
      pointerId: event.pointerId,
      end,
      endSign: end === "left" ? -1 : 1,
      fixedX: fixed.x,
      fixedY: fixed.y,
      fallbackDirectionX: draggedDirection.x,
      fallbackDirectionY: draggedDirection.y,
      originX: component.x,
      originY: component.y,
      originLength: length,
      originRotation: component.rotation,
      originComponent: { ...component },
      bodyAttachments,
      undoSnapshot: makeUndoSnapshot(),
      changed: false,
    };

    setSelected({ kind: "component", id: component.id });
    setSelectedComponentIds([component.id]);
  }

  function startWireHandleDrag(event, wire, handle) {
    event.stopPropagation();

    if (
      (mode !== "select" && mode !== "wire") ||
      !event.isPrimary ||
      event.button !== 0
    ) {
      return;
    }

    event.preventDefault();

    const point = svgPoint(event);
    svgRef.current?.setPointerCapture?.(event.pointerId);

    wireHandleDragRef.current = {
      wireId: wire.id,
      pointerId: event.pointerId,
      axis: handle.axis,
      directionSign: handle.directionSign,
      startX: point.x,
      startY: point.y,
      originOffset: wire.cOffset ?? DEFAULT_C_WIRE_OFFSET,
      undoSnapshot: makeUndoSnapshot(),
      changed: false,
    };

    setSelected({ kind: "wire", id: wire.id });
  }

  function startMarqueeSelection(event) {
    if (
      mode !== "select" ||
      !event.shiftKey ||
      !event.isPrimary ||
      event.button !== 0
    ) {
      return false;
    }

    event.preventDefault();
    rotationPivotRef.current = null;

    const point = svgPoint(event);
    const baseIds = [...selectedComponentIds];

    marqueeSelectionRef.current = {
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      currentX: point.x,
      currentY: point.y,
      startClientX: event.clientX,
      startClientY: event.clientY,
      baseIds,
      baseSelected: selected,
      started: false,
    };

    setMarqueeSelection({
      startX: point.x,
      startY: point.y,
      currentX: point.x,
      currentY: point.y,
      started: false,
    });

    svgRef.current?.setPointerCapture?.(event.pointerId);
    return true;
  }

  function handlePointerMove(event) {
    const point = svgPoint(event);

    const wireHandleDrag = wireHandleDragRef.current;
    if (
      wireHandleDrag &&
      event.pointerId === wireHandleDrag.pointerId
    ) {
      const delta =
        wireHandleDrag.axis === "x"
          ? point.x - wireHandleDrag.startX
          : point.y - wireHandleDrag.startY;
      const nextOffset = Math.max(
        MIN_C_WIRE_OFFSET,
        wireHandleDrag.originOffset + wireHandleDrag.directionSign * delta
      );

      wireHandleDrag.changed =
        Math.abs(nextOffset - wireHandleDrag.originOffset) > 0.001;

      setWires((current) =>
        current.map((wire) =>
          wire.id === wireHandleDrag.wireId
            ? { ...wire, cOffset: nextOffset }
            : wire
        )
      );
      return;
    }

    const wireSegmentResize = wireSegmentResizeRef.current;
    if (
      wireSegmentResize &&
      event.pointerId === wireSegmentResize.pointerId
    ) {
      let targetPoint = point;

      if (snapObjects) {
        const terminalTarget = findNearestTerminal(
          point,
          components.filter(
            (component) =>
              component.id !== wireSegmentResize.componentId
          ),
          WIRE_TOOL_SNAP_RADIUS / zoom
        );

        targetPoint = terminalTarget
          ? terminalTarget.position
          : {
              x: snap(point.x),
              y: snap(point.y),
            };
      }

      let dx = targetPoint.x - wireSegmentResize.fixedX;
      let dy = targetPoint.y - wireSegmentResize.fixedY;
      let rawLength = Math.hypot(dx, dy);

      let unitX;
      let unitY;

      if (rawLength < 0.001) {
        unitX =
          wireSegmentResize.fallbackDirectionX || 1;
        unitY =
          wireSegmentResize.fallbackDirectionY || 0;
        rawLength = 0;
      } else {
        unitX = dx / rawLength;
        unitY = dy / rawLength;
      }

      const nextLength = Math.max(
        MIN_WIRE_COMPONENT_LENGTH,
        rawLength
      );
      const draggedX =
        wireSegmentResize.fixedX + unitX * nextLength;
      const draggedY =
        wireSegmentResize.fixedY + unitY * nextLength;

      // Local +x always points from the Wire component's left endpoint toward
      // its right endpoint. endSign converts the fixed-to-dragged direction
      // into that local-axis direction for either resize handle.
      const axisX = unitX * wireSegmentResize.endSign;
      const axisY = unitY * wireSegmentResize.endSign;
      const nextRotation =
        ((Math.atan2(axisY, axisX) * 180) / Math.PI + 360) %
        360;

      const originComponent =
        wireSegmentResize.originComponent;
      const candidate = {
        ...originComponent,
        rotation: nextRotation,
        length: nextLength,
        x: (wireSegmentResize.fixedX + draggedX) / 2,
        y: (wireSegmentResize.fixedY + draggedY) / 2,
      };
      wireSegmentResize.changed =
        wireSegmentResize.changed ||
        Math.abs(candidate.x - originComponent.x) > 0.001 ||
        Math.abs(candidate.y - originComponent.y) > 0.001 ||
        Math.abs(
          (candidate.length ?? 0) -
            (originComponent.length ?? 0)
        ) > 0.001 ||
        Math.abs(
          (candidate.rotation ?? 0) -
            (originComponent.rotation ?? 0)
        ) > 0.001;

      setComponents((current) =>
        current.map((component) =>
          component.id === candidate.id
            ? candidate
            : component
        )
      );

      if (wireSegmentResize.bodyAttachments.length) {
        const attachments =
          wireSegmentResize.bodyAttachments;
        const attachmentFor = (wireId, endpointKey) =>
          attachments.find(
            (attachment) =>
              attachment.wireId === wireId &&
              attachment.endpointKey === endpointKey
          );

        setWires((current) =>
          current.map((wire) => {
            let nextWire = wire;

            for (const endpointKey of ["from", "to"]) {
              const attachment = attachmentFor(
                wire.id,
                endpointKey
              );
              if (!attachment) continue;

              // leadInset is measured from the standalone Wire's left end.
              // If the left end is the one being dragged, compensate by the
              // length change so the junction keeps the same distance from
              // the fixed right end. If the right end is dragged, the left
              // end is fixed and the original inset already does exactly
              // what we want.
              const desiredInset =
                wireSegmentResize.end === "left"
                  ? attachment.originLeadInset +
                    (nextLength -
                      wireSegmentResize.originLength)
                  : attachment.originLeadInset;
              const nextLeadInset = Math.max(
                0,
                Math.min(nextLength, desiredInset)
              );

              nextWire = {
                ...nextWire,
                [endpointKey]: {
                  ...nextWire[endpointKey],
                  leadInset: nextLeadInset,
                },
              };
            }

            return nextWire;
          })
        );
      }

      return;
    }

    const marquee = marqueeSelectionRef.current;
    if (
      marquee &&
      event.pointerId === marquee.pointerId
    ) {
      const clientDistance = Math.hypot(
        event.clientX - marquee.startClientX,
        event.clientY - marquee.startClientY
      );

      marquee.currentX = point.x;
      marquee.currentY = point.y;

      if (!marquee.started && clientDistance >= 4) {
        marquee.started = true;
      }

      setMarqueeSelection({
        startX: marquee.startX,
        startY: marquee.startY,
        currentX: point.x,
        currentY: point.y,
        started: marquee.started,
      });

      if (marquee.started) {
        const rectangle = normalizeMarquee(
          marquee.startX,
          marquee.startY,
          point.x,
          point.y
        );
        const marqueeIds = components
          .filter((component) =>
            componentTouchesMarquee(component, rectangle)
          )
          .map((component) => component.id);
        const nextIds = [
          ...marquee.baseIds,
          ...marqueeIds.filter(
            (id) => !marquee.baseIds.includes(id)
          ),
        ];

        setSelectedComponentIds(nextIds);
        setSelected(
          nextIds.length
            ? {
                kind: "component",
                id: nextIds[nextIds.length - 1],
              }
            : null
        );
      }

      return;
    }

    if (wireStart) {
      const maxSnapDistance =
        WIRE_TOOL_SNAP_RADIUS / zoom;
      const blackSnapDistance =
        BLACK_JUNCTION_SNAP_RADIUS / zoom;

      const terminalTarget = findNearestTerminal(
        point,
        components,
        maxSnapDistance
      );
      const validTerminalTarget =
        terminalTarget &&
        !(
          terminalTarget.componentId ===
            wireStart.componentId &&
          terminalTarget.port === wireStart.port &&
          !wireStart.leadInset
        )
          ? terminalTarget
          : null;

      const leadTarget = findNearestComponentLeadPoint(
        point,
        components,
        maxSnapDistance
      );
      const wireTarget = findNearestWirePoint(
        point,
        wires,
        componentMap,
        maxSnapDistance
      );
      const blackJunctionTarget =
        findNearestBlackJunctionPoint(
          point,
          components,
          wires,
          componentMap,
          blackSnapDistance
        );

      const liveStartComponent = componentMap.get(
        wireStart.componentId
      );
      const liveStartPoint = liveStartComponent
        ? getWireEndpointPosition(
            wireStart,
            liveStartComponent
          )
        : null;
      const isDifferentFromStart = (target) =>
        target &&
        (!liveStartPoint ||
          Math.hypot(
            target.position.x - liveStartPoint.x,
            target.position.y - liveStartPoint.y
          ) > 0.01);

      const validBlackJunctionTarget =
        isDifferentFromStart(blackJunctionTarget)
          ? blackJunctionTarget
          : null;
      const validLeadTarget =
        isDifferentFromStart(leadTarget)
          ? leadTarget
          : null;
      const validWireTarget =
        isDifferentFromStart(wireTarget)
          ? wireTarget
          : null;

      if (validBlackJunctionTarget) {
        // A visible black junction is electrically explicit, so it always
        // wins while its snap radius is active. Blue terminals never override
        // it, even when their hit/snap areas overlap.
        setWirePreview(
          validBlackJunctionTarget.position
        );
        setWireSnapTarget({
          kind: "black-junction",
          junctionKind:
            validBlackJunctionTarget.kind,
          endpoint: {
            ...validBlackJunctionTarget.endpoint,
          },
          position:
            validBlackJunctionTarget.position,
        });
      } else {
        // With no black junction nearby, component terminals remain slightly
        // stronger than ordinary lead/wire snapping.
        const candidates = [
          validTerminalTarget
            ? {
                ...validTerminalTarget,
                kind: "terminal",
                score:
                  validTerminalTarget.distance -
                  4 / zoom,
              }
            : null,
          validLeadTarget
            ? {
                ...validLeadTarget,
                kind: "lead",
                score: validLeadTarget.distance,
              }
            : null,
          validWireTarget
            ? {
                ...validWireTarget,
                kind: "wire",
                score: validWireTarget.distance,
              }
            : null,
        ]
          .filter(Boolean)
          .sort((a, b) => a.score - b.score);

        const target = candidates[0] ?? null;

        if (target?.kind === "terminal") {
          setWirePreview(target.position);
          setWireSnapTarget({
            kind: "terminal",
            componentId: target.componentId,
            port: target.port,
            position: target.position,
          });
        } else if (target?.kind === "lead") {
          setWirePreview(target.position);
          setWireSnapTarget({
            kind: "lead",
            componentId: target.componentId,
            port: target.port,
            leadInset: target.leadInset,
            position: target.position,
          });
        } else if (target?.kind === "wire") {
          setWirePreview(target.position);
          setWireSnapTarget({
            kind: "wire",
            wireId: target.wireId,
            segmentIndex: target.segmentIndex,
            position: target.position,
          });
        } else {
          setWirePreview(point);
          setWireSnapTarget(null);
        }
      }
    }

    const drag = dragRef.current;
    if (
      !drag ||
      mode !== "select" ||
      event.pointerId !== drag.pointerId
    ) {
      return;
    }

    const clientDistance = Math.hypot(
      event.clientX - drag.startClientX,
      event.clientY - drag.startClientY
    );

    // Prevent tiny hand movements from turning an ordinary click into a drag.
    if (!drag.started && clientDistance < 4) {
      return;
    }

    rotationPivotRef.current = null;
    drag.started = true;

    // Move smoothly while dragging. Every selected component receives the
    // same delta so their spacing stays exactly the same.
    const rawDeltaX = point.x - drag.startX;
    const rawDeltaY = point.y - drag.startY;
    const originValues = Object.values(drag.origins);
    const minOriginX = Math.min(...originValues.map((origin) => origin.x));
    const maxOriginX = Math.max(...originValues.map((origin) => origin.x));
    const minOriginY = Math.min(...originValues.map((origin) => origin.y));
    const maxOriginY = Math.max(...originValues.map((origin) => origin.y));

    const deltaX = Math.max(
      60 - minOriginX,
      Math.min(WIDTH - 60 - maxOriginX, rawDeltaX)
    );
    const deltaY = Math.max(
      60 - minOriginY,
      Math.min(HEIGHT - 60 - maxOriginY, rawDeltaY)
    );

    drag.deltaX = deltaX;
    drag.deltaY = deltaY;

    const movingIds = drag.transformIds;
    const candidateComponents =
      drag.undoSnapshot.components.map(
        (component) => {
          const origin = drag.origins[component.id];
          return origin
            ? {
                ...component,
                x: origin.x + deltaX,
                y: origin.y + deltaY,
              }
            : component;
        }
      );

    drag.appliedDeltaX = deltaX;
    drag.appliedDeltaY = deltaY;
    setComponents(candidateComponents);

    if (drag.hasRigidFixedWires) {
      setWires(
        translateRigidFixedWires(
          drag.transformWires,
          movingIds,
          deltaX,
          deltaY
        )
      );
    }
  }

  function endPointerAction(event) {
    const marquee = marqueeSelectionRef.current;
    if (
      marquee &&
      event.pointerId === marquee.pointerId
    ) {
      if (!marquee.started) {
        // Shift-clicking empty space without actually dragging should leave the
        // existing selection alone.
        setSelectedComponentIds(marquee.baseIds);
        setSelected(marquee.baseSelected);
      }

      if (svgRef.current?.hasPointerCapture?.(event.pointerId)) {
        svgRef.current.releasePointerCapture(event.pointerId);
      }

      marqueeSelectionRef.current = null;
      setMarqueeSelection(null);
      return;
    }

    const wireHandleDrag = wireHandleDragRef.current;
    if (
      wireHandleDrag &&
      event.pointerId === wireHandleDrag.pointerId
    ) {
      if (wireHandleDrag.changed) {
        rememberUndo(wireHandleDrag.undoSnapshot);
      }

      setWires((current) =>
        current.map((wire) =>
          wire.id === wireHandleDrag.wireId
            ? {
                ...wire,
                cOffset: Math.max(
                  MIN_C_WIRE_OFFSET,
                  snap(wire.cOffset ?? DEFAULT_C_WIRE_OFFSET)
                ),
              }
            : wire
        )
      );

      if (svgRef.current?.hasPointerCapture?.(event.pointerId)) {
        svgRef.current.releasePointerCapture(event.pointerId);
      }

      wireHandleDragRef.current = null;
      return;
    }

    const wireSegmentResize = wireSegmentResizeRef.current;
    if (
      wireSegmentResize &&
      event.pointerId === wireSegmentResize.pointerId
    ) {
      if (wireSegmentResize.changed) {
        rememberUndo(wireSegmentResize.undoSnapshot);
      }

      if (svgRef.current?.hasPointerCapture?.(event.pointerId)) {
        svgRef.current.releasePointerCapture(event.pointerId);
      }

      wireSegmentResizeRef.current = null;
      return;
    }

    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }

    const clickedComponent = components.find(
      (component) => component.id === drag.id
    );
    const clickedStandaloneLabel =
      !drag.started && clickedComponent?.type === "label";

    if (clickedStandaloneLabel) {
      setSelected({
        kind: "component",
        id: clickedComponent.id,
      });
      setSelectedComponentIds([clickedComponent.id]);
      focusStandaloneLabelInput();
    }

    if (drag.started) {
      rememberUndo(drag.undoSnapshot);

      const groupIds = drag.transformIds;
      const originComponents =
        drag.undoSnapshot.components;
      const baseDeltaX = drag.appliedDeltaX ?? 0;
      const baseDeltaY = drag.appliedDeltaY ?? 0;
      let finalComponents = originComponents.map(
        (component) => {
          const origin = drag.origins[component.id];
          return origin
            ? {
                ...component,
                x: origin.x + baseDeltaX,
                y: origin.y + baseDeltaY,
              }
            : component;
        }
      );

      // With object snapping enabled, quantise the group using one shared
      // correction, then allow the nearest selected terminal to magnetically
      // snap to an unselected component. Hidden junctions receive the same
      // correction but are never themselves treated as magnetic candidates.
      if (snapObjects) {
        const anchor = finalComponents.find(
          (component) => component.id === drag.id
        );

        if (anchor) {
          const alignedAnchor =
            alignComponentToGrid(anchor);
          const gridCorrectionX =
            alignedAnchor.x - anchor.x;
          const gridCorrectionY =
            alignedAnchor.y - anchor.y;

          let working = finalComponents.map(
            (component) =>
              groupIds.has(component.id)
                ? {
                    ...component,
                    x:
                      component.x +
                      gridCorrectionX,
                    y:
                      component.y +
                      gridCorrectionY,
                  }
                : component
          );

          const outsideComponents = working.filter(
            (component) =>
              !groupIds.has(component.id)
          );
          let bestTerminalSnap = null;

          for (const component of working) {
            if (
              !groupIds.has(component.id) ||
              component.type === "label" ||
              component.type === "junction"
            ) {
              continue;
            }

            const snapped =
              snapComponentToNearbyTerminal(
                component,
                [
                  component,
                  ...outsideComponents,
                ]
              );
            const dx = snapped.x - component.x;
            const dy = snapped.y - component.y;
            const distance = Math.hypot(dx, dy);

            if (
              distance > 0.001 &&
              (!bestTerminalSnap ||
                distance <
                  bestTerminalSnap.distance)
            ) {
              bestTerminalSnap = {
                dx,
                dy,
                distance,
              };
            }
          }

          if (bestTerminalSnap) {
            working = working.map((component) =>
              groupIds.has(component.id)
                ? {
                    ...component,
                    x:
                      component.x +
                      bestTerminalSnap.dx,
                    y:
                      component.y +
                      bestTerminalSnap.dy,
                  }
                : component
            );
          }

          finalComponents = working;
        }
      }

      setComponents(finalComponents);

      if (drag.hasRigidFixedWires) {
        const finalAnchor =
          finalComponents.find(
            (component) =>
              component.id === drag.id
          );
        const originAnchor =
          drag.origins[drag.id];

        if (finalAnchor && originAnchor) {
          setWires(
            translateRigidFixedWires(
              drag.transformWires,
              groupIds,
              finalAnchor.x - originAnchor.x,
              finalAnchor.y - originAnchor.y
            )
          );
        }
      }
    }

    if (svgRef.current?.hasPointerCapture?.(event.pointerId)) {
      svgRef.current.releasePointerCapture(event.pointerId);
    }

    dragRef.current = null;
  }

  function cancelPointerAction(event) {
    const marquee = marqueeSelectionRef.current;
    if (
      marquee &&
      event.pointerId === marquee.pointerId
    ) {
      setSelectedComponentIds(marquee.baseIds);
      setSelected(marquee.baseSelected);
      marqueeSelectionRef.current = null;
      setMarqueeSelection(null);
      return;
    }

    const wireHandleDrag = wireHandleDragRef.current;
    if (
      wireHandleDrag &&
      event.pointerId === wireHandleDrag.pointerId
    ) {
      setWires((current) =>
        current.map((wire) =>
          wire.id === wireHandleDrag.wireId
            ? { ...wire, cOffset: wireHandleDrag.originOffset }
            : wire
        )
      );
      wireHandleDragRef.current = null;
      return;
    }

    const wireSegmentResize = wireSegmentResizeRef.current;
    if (
      wireSegmentResize &&
      event.pointerId === wireSegmentResize.pointerId
    ) {
      setComponents((current) =>
        current.map((component) =>
          component.id === wireSegmentResize.componentId
            ? {
                ...component,
                x: wireSegmentResize.originX,
                y: wireSegmentResize.originY,
                length: wireSegmentResize.originLength,
                rotation: wireSegmentResize.originRotation,
              }
            : component
        )
      );

      if (wireSegmentResize.bodyAttachments.length) {
        setWires(
          wireSegmentResize.undoSnapshot.wires.map(cloneWire)
        );
      }

      wireSegmentResizeRef.current = null;
      return;
    }

    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }

    // If the browser cancels the gesture, restore the complete pre-drag
    // snapshot. Group dragging can now move hidden interception junctions and
    // fixed-wire metadata as well as the visible selected components.
    if (drag.started) {
      setComponents(
        drag.undoSnapshot.components.map(cloneComponent)
      );
      setWires(drag.undoSnapshot.wires.map(cloneWire));
    }

    dragRef.current = null;
  }

  // ── Wire-tool construction and branching ───────────────────────────────
  function buildWireToEndpoint(
    endpoint,
    { allowCShape = true } = {}
  ) {
    if (!wireStart) return null;

    const fromComponent = componentMap.get(
      wireStart.componentId
    );
    const toComponent = componentMap.get(
      endpoint.componentId
    );
    const fromPoint = fromComponent
      ? getWireEndpointPosition(
          wireStart,
          fromComponent
        )
      : null;
    const toPoint = toComponent
      ? getWireEndpointPosition(
          endpoint,
          toComponent
        )
      : null;
    const sharedDirection =
      fromComponent && toComponent
        ? getSharedPortDirection(
            fromComponent,
            wireStart.port,
            toComponent,
            endpoint.port
          )
        : null;
    const terminalsAreAligned =
      fromPoint && toPoint
        ? fromPoint.x === toPoint.x ||
          fromPoint.y === toPoint.y
        : false;
    const cShapeAllowed =
      allowCShape &&
      !wireStart.leadInset &&
      !endpoint.leadInset &&
      !["voltmeter", "junction"].includes(
        fromComponent?.type
      ) &&
      !["voltmeter", "junction"].includes(
        toComponent?.type
      );
    const useCShape = Boolean(
      cShapeAllowed &&
        sharedDirection &&
        !terminalsAreAligned
    );

    return {
      id: uid(),
      from: { ...wireStart },
      to: { ...endpoint },
      route: useCShape ? "c-shape" : wireRoute,
      currentArrow: "none",
      ...(useCShape
        ? {
            cDirection: directionToKey(sharedDirection),
            cOffset: DEFAULT_C_WIRE_OFFSET,
          }
        : {}),
    };
  }

  function finishWireToEndpoint(
    endpoint,
    options = undefined
  ) {
    const wire = buildWireToEndpoint(
      endpoint,
      options
    );
    if (!wire) return;

    rememberUndo();
    setWires((current) => [...current, wire]);
    setSelected(
      wire.route === "c-shape"
        ? { kind: "wire", id: wire.id }
        : null
    );
    setWireStart(null);
    setWirePreview(null);
    setWireSnapTarget(null);
    setWireRoute("horizontal-first");
  }

  function finishWireAtExistingWire(target) {
    if (!wireStart) return;

    const targetWire = wires.find(
      (wire) => wire.id === target.wireId
    );
    if (!targetWire) return;

    const resolved = getStoredWireGeometry(
      targetWire,
      componentMap
    );
    if (!resolved) return;

    const points = resolved.geometry.points;
    const segmentIndex = Math.max(
      0,
      Math.min(
        points.length - 2,
        target.segmentIndex ?? 0
      )
    );
    const junctionPoint =
      target.position ??
      snapPointAlongWireSegment(
        closestPointOnSegment(
          wirePreview ?? points[segmentIndex],
          points[segmentIndex],
          points[segmentIndex + 1]
        ),
        points[segmentIndex],
        points[segmentIndex + 1]
      );

    const firstPoint = points[0];
    const lastPoint = points[points.length - 1];

    if (
      Math.hypot(
        junctionPoint.x - firstPoint.x,
        junctionPoint.y - firstPoint.y
      ) < 0.01
    ) {
      finishWireToEndpoint(
        targetWire.from,
        { allowCShape: false }
      );
      return;
    }

    if (
      Math.hypot(
        junctionPoint.x - lastPoint.x,
        junctionPoint.y - lastPoint.y
      ) < 0.01
    ) {
      finishWireToEndpoint(
        targetWire.to,
        { allowCShape: false }
      );
      return;
    }

    const junctionId = uid();
    const junctionEndpoint = {
      componentId: junctionId,
      port: "node",
    };
    const junctionComponent = {
      id: junctionId,
      type: "junction",
      x: junctionPoint.x,
      y: junctionPoint.y,
      rotation: 0,
      label: "",
      labelPosition: "center",
      labelFontSize: 24,
      labelBold: false,
      labelItalic: false,
    };

    const beforePoints = [
      ...points.slice(0, segmentIndex + 1),
      junctionPoint,
    ];
    const afterPoints = [
      junctionPoint,
      ...points.slice(segmentIndex + 1),
    ];

    const firstPiece = makeFixedWirePiece(
      targetWire.from,
      junctionEndpoint,
      beforePoints,
      targetWire.currentArrow ?? "none"
    );
    const secondPiece = makeFixedWirePiece(
      junctionEndpoint,
      targetWire.to,
      afterPoints,
      targetWire.currentArrow ?? "none"
    );
    const branchWire = {
      id: uid(),
      from: { ...wireStart },
      to: { ...junctionEndpoint },
      route: wireRoute,
      currentArrow: "none",
    };

    rememberUndo();
    setComponents((current) => [
      ...current,
      junctionComponent,
    ]);
    setWires((current) => [
      ...current.filter(
        (wire) => wire.id !== targetWire.id
      ),
      firstPiece,
      secondPiece,
      branchWire,
    ]);

    setSelected(null);
    setSelectedComponentIds([]);
    setWireStart(null);
    setWirePreview(null);
    setWireSnapTarget(null);
    setWireRoute("horizontal-first");
  }

  function finishWireAtVisibleSnapTarget(event) {
    if (
      mode !== "wire" ||
      !wireStart ||
      !wireSnapTarget
    ) {
      return false;
    }

    event.preventDefault();
    event.stopPropagation();

    // WYSIWYG rule: once the preview is visibly snapped, pointer-down commits
    // to that exact rendered target. Do not run a second nearest-target search
    // here, because that can make a nearby blue terminal steal the click.
    if (wireSnapTarget.kind === "wire") {
      finishWireAtExistingWire({
        wireId: wireSnapTarget.wireId,
        segmentIndex: wireSnapTarget.segmentIndex,
        position: wireSnapTarget.position,
      });
      return true;
    }

    if (
      wireSnapTarget.kind === "terminal" ||
      wireSnapTarget.kind === "lead"
    ) {
      finishWireToEndpoint({
        componentId: wireSnapTarget.componentId,
        port: wireSnapTarget.port,
        ...(wireSnapTarget.kind === "lead"
          ? { leadInset: wireSnapTarget.leadInset }
          : {}),
      });
      return true;
    }

    if (wireSnapTarget.kind === "black-junction") {
      finishWireToEndpoint({
        ...wireSnapTarget.endpoint,
      });
      return true;
    }

    return false;
  }

  function handleBlackJunctionClick(event, target) {
    event.preventDefault();
    event.stopPropagation();

    if (
      mode === "wire" &&
      wireStart &&
      finishWireAtVisibleSnapTarget(event)
    ) {
      return;
    }

    if (mode === "wire" && wireStart) {
      finishWireToEndpoint({
        ...target.endpoint,
      });
      return;
    }

    if (target.kind === "junction") {
      handlePortClick(
        event,
        target.endpoint.componentId,
        target.endpoint.port
      );
      return;
    }

    const endpoint = target.endpoint;
    handleComponentLeadClick(
      event,
      endpoint.componentId,
      endpoint.port,
      {
        kind: "lead",
        componentId: endpoint.componentId,
        port: endpoint.port,
        leadInset: endpoint.leadInset,
        position: target.position,
        distance: 0,
      }
    );
  }

  function handleComponentLeadClick(
    event,
    componentId,
    port,
    target = null
  ) {
    event.stopPropagation();
    event.preventDefault();

    if (mode !== "wire") {
      return;
    }

    if (
      wireStart &&
      finishWireAtVisibleSnapTarget(event)
    ) {
      return;
    }

    const leadTarget =
      target ??
      findNearestComponentLeadPoint(
        svgPoint(event),
        components,
        WIRE_TOOL_SNAP_RADIUS / zoom,
        componentId,
        port
      );

    if (!leadTarget) {
      return;
    }

    const endpoint = {
      componentId,
      port,
      leadInset: leadTarget.leadInset,
    };

    if (!wireStart) {
      setSelected(null);
      setSelectedComponentIds([]);
      setWireStart(endpoint);
      setWirePreview(leadTarget.position);
      setWireSnapTarget(null);
      setWireRoute("horizontal-first");
      return;
    }

    const startComponent = componentMap.get(
      wireStart.componentId
    );
    const startPosition = startComponent
      ? getWireEndpointPosition(
          wireStart,
          startComponent
        )
      : null;

    if (
      startPosition &&
      Math.hypot(
        leadTarget.position.x - startPosition.x,
        leadTarget.position.y - startPosition.y
      ) < 0.01
    ) {
      setWireStart(null);
      setWirePreview(null);
      setWireSnapTarget(null);
      setWireRoute("horizontal-first");
      return;
    }

    finishWireToEndpoint(endpoint);
  }

  function handlePortClick(event, componentId, port) {
    event.stopPropagation();

    if (mode !== "wire") {
      if (componentMap.get(componentId)?.type === "junction") {
        return;
      }

      setSelected({ kind: "component", id: componentId });
      setSelectedComponentIds([componentId]);
      return;
    }

    if (
      wireStart &&
      finishWireAtVisibleSnapTarget(event)
    ) {
      return;
    }

    const endpoint = { componentId, port };

    if (!wireStart) {
      setSelected(null);
      setSelectedComponentIds([]);
      setWireStart(endpoint);
      setWireSnapTarget(null);
      setWireRoute("horizontal-first");
      const component = componentMap.get(componentId);
      if (component) {
        setWirePreview(getPortPosition(component, port));
      }
      return;
    }

    if (
      wireStart.componentId === endpoint.componentId &&
      wireStart.port === endpoint.port
    ) {
      setWireStart(null);
      setWirePreview(null);
      setWireSnapTarget(null);
      setWireRoute("horizontal-first");
      return;
    }

    finishWireToEndpoint(endpoint);
  }

  // ── Selection actions and component editing ────────────────────────────
  function setSelectedDrawnWireCurrentArrow(currentArrow) {
    if (!selectedWire) return;

    const currentValue = selectedWire.currentArrow ?? "none";
    if (currentValue === currentArrow) return;

    rememberUndo();
    setWires((current) =>
      current.map((wire) =>
        wire.id === selectedWire.id
          ? { ...wire, currentArrow }
          : wire
      )
    );
  }

  function flipWireCorner() {
    if (wireStart) {
      setWireRoute((current) => oppositeWireRoute(current));
      return;
    }

    if (selected?.kind === "wire") {
      const wire = wires.find((item) => item.id === selected.id);
      if (
        !wire ||
        wire.route === "c-shape" ||
        wire.route === "fixed"
      ) {
        return;
      }

      rememberUndo();
      setWires((current) =>
        current.map((wire) =>
          wire.id === selected.id && wire.route !== "c-shape"
            ? {
                ...wire,
                route: oppositeWireRoute(wire.route ?? "horizontal-first"),
              }
            : wire
        )
      );
    }
  }

  function selectWire(event, id) {
    event.stopPropagation();

    if (
      mode === "wire" &&
      wireStart &&
      finishWireAtVisibleSnapTarget(event)
    ) {
      return;
    }

    if (mode === "wire" && wireStart) {
      const point = svgPoint(event);
      const target = findNearestWirePoint(
        point,
        wires,
        componentMap,
        WIRE_TOOL_SNAP_RADIUS / zoom,
        id
      );

      if (target) {
        finishWireAtExistingWire(target);
      }
      return;
    }

    // Clicking an existing wire without an in-progress branch is clear
    // selection intent, so leave Wire mode and select the wire.
    if (mode === "wire") {
      setMode("select");
      setWireStart(null);
      setWirePreview(null);
      setWireSnapTarget(null);
      setWireRoute("horizontal-first");
    }

    setSelectedComponentIds([]);
    setSelected({ kind: "wire", id });
  }

  function clearSelectionOrWire() {
    marqueeSelectionRef.current = null;
    setMarqueeSelection(null);

    // A clear click on empty canvas exits Wire mode altogether. This also
    // cancels any half-drawn wire so the next interaction behaves normally.
    if (mode === "wire") {
      setMode("select");
      setWireStart(null);
      setWirePreview(null);
      setWireSnapTarget(null);
      setWireRoute("horizontal-first");
      setSelected(null);
      setSelectedComponentIds([]);
      return;
    }

    setSelected(null);
    setSelectedComponentIds([]);
  }

  function removeSelected() {
    if (!selected && !selectedComponentIds.length) return;

    rotationPivotRef.current = null;

    if (selected?.kind === "wire") {
      rememberUndo();
      setWires((current) =>
        current.filter((wire) => wire.id !== selected.id)
      );
      setSelected(null);
      setSelectedComponentIds([]);
      return;
    }

    const ids = new Set(
      selectedComponentIds.length
        ? selectedComponentIds
        : selected?.kind === "component"
          ? [selected.id]
          : []
    );

    const componentLookup = new Map(
      components.map((component) => [
        component.id,
        component,
      ])
    );
    const attachedWires = wires.filter(
      (wire) =>
        ids.has(wire.from.componentId) ||
        ids.has(wire.to.componentId)
    );

    rememberUndo();
    const preservedWireComponents = attachedWires.flatMap(
      (wire) =>
        convertWireToolWireToComponents(
          wire,
          componentLookup
        )
    );

    setComponents((current) => [
      ...current.filter(
        (component) => !ids.has(component.id)
      ),
      ...preservedWireComponents,
    ]);

    setWires((current) =>
      current.filter(
        (wire) =>
          !ids.has(wire.from.componentId) &&
          !ids.has(wire.to.componentId)
      )
    );

    setSelected(null);
    setSelectedComponentIds([]);
  }

  function rotateSelected() {
    if (selectedComponentIds.length > 1) {
      const selectedItems = components.filter((component) =>
        selectedComponentIds.includes(component.id)
      );

      if (!selectedItems.length) return;

      const minX = Math.min(...selectedItems.map((item) => item.x));
      const maxX = Math.max(...selectedItems.map((item) => item.x));
      const minY = Math.min(...selectedItems.map((item) => item.y));
      const maxY = Math.max(...selectedItems.map((item) => item.y));
      const centreX = (minX + maxX) / 2;
      const centreY = (minY + maxY) / 2;
      const selectedIds = new Set(
        selectedComponentIds
      );
      const transformIds =
        getGroupTransformComponentIds(
          selectedComponentIds,
          components,
          wires
        );

      rotationPivotRef.current = null;
      rememberUndo();

      setComponents((current) =>
        current.map((component) => {
          if (!transformIds.has(component.id)) {
            return component;
          }

          const rotatedPoint =
            rotatePointClockwiseAround(
              component,
              centreX,
              centreY
            );

          return {
            ...component,
            x: rotatedPoint.x,
            y: rotatedPoint.y,
            // Standalone text annotations and hidden junction nodes do not
            // need their own local orientation changed, but both still move
            // around the group centre.
            rotation:
              GROUP_LOCAL_ROTATION_EXCLUSIONS.has(
                component.type
              )
                ? component.rotation
                : (component.rotation + 90) % 360,
            labelPosition:
              !GROUP_LABEL_ROTATION_EXCLUSIONS.has(component.type)
                ? rotateLabelPositionClockwise(
                    component.labelPosition ?? "below"
                  )
                : component.labelPosition,
          };
        })
      );

      // Wires with both endpoints in the transformed group rotate rigidly too.
      // Fixed/intercepted pieces are rebuilt from the geometry currently on
      // screen, so their bends and axis metadata turn with the group instead
      // of snapping back to an old stored position.
      setWires((current) =>
        current.map((wire) => {
          const bothEndsTransform =
            transformIds.has(
              wire.from.componentId
            ) &&
            transformIds.has(
              wire.to.componentId
            );

          if (!bothEndsTransform) {
            return wire;
          }

          if (wire.route === "fixed") {
            const resolved =
              getStoredWireGeometry(
                wire,
                componentMap
              );

            if (!resolved) {
              return wire;
            }

            const rotatedPoints =
              resolved.geometry.points.map(
                (point) =>
                  rotatePointClockwiseAround(
                    point,
                    centreX,
                    centreY
                  )
              );

            return rebuildFixedWireFromPoints(
              wire,
              rotatedPoints
            );
          }

          if (wire.route === "c-shape") {
            return {
              ...wire,
              cDirection:
                rotateDirectionKeyClockwise(
                  wire.cDirection
                ),
            };
          }

          return {
            ...wire,
            route: oppositeWireRoute(
              wire.route ??
                "horizontal-first"
            ),
          };
        })
      );

      return;
    }

    if (!selectedComponent || selectedComponent.type === "label") return;

    const component = selectedComponent;
    const connectionDetails = getComponentConnectionDetails(
      component,
      components,
      wires
    );
    const connectedPorts = [
      ...new Set(connectionDetails.map((item) => item.ownPort)),
    ];

    let pivotPort = null;
    let nextRememberedPivot = null;
    const rememberedPivot = rotationPivotRef.current;

    if (
      rememberedPivot?.componentId === component.id &&
      connectedPorts.includes(rememberedPivot.port)
    ) {
      const pivotConnections = connectionDetails.filter(
        (item) => item.ownPort === rememberedPivot.port
      );

      const rememberedConnectionStillExists =
        rememberedPivot.kind === "touch"
          ? pivotConnections.some(
              (item) =>
                item.kind === "touch" &&
                item.otherComponentId ===
                  rememberedPivot.otherComponentId &&
                item.otherPort === rememberedPivot.otherPort
            )
          : pivotConnections.some(
              (item) =>
                item.kind === "wire" &&
                item.wireId === rememberedPivot.wireId
            );

      if (rememberedConnectionStillExists) {
        const nonPivotConnections = connectionDetails.filter(
          (item) => item.ownPort !== rememberedPivot.port
        );

        // The niche equal-length case: after turning, another terminal can
        // land exactly on a different terminal of the SAME neighbour. That
        // geometric coincidence is not a new user-made connection, so keep
        // rotating around the original pivot. This also works for components
        // with more than two terminals, such as the potential divider.
        const otherPortsOnlyTouchSameNeighbour =
          rememberedPivot.kind === "touch" &&
          nonPivotConnections.length > 0 &&
          nonPivotConnections.every(
            (item) =>
              item.kind === "touch" &&
              item.otherComponentId ===
                rememberedPivot.otherComponentId
          );

        const otherPortsAreUnconnected =
          nonPivotConnections.length === 0;

        if (
          otherPortsAreUnconnected ||
          otherPortsOnlyTouchSameNeighbour
        ) {
          pivotPort = rememberedPivot.port;
          nextRememberedPivot = rememberedPivot;
        }
      }
    }

    // Starting a fresh pivot: exactly one connected end determines the hinge.
    if (!pivotPort && connectedPorts.length === 1) {
      pivotPort = connectedPorts[0];

      const pivotConnections = connectionDetails.filter(
        (item) => item.ownPort === pivotPort
      );
      const directConnection = pivotConnections.find(
        (item) => item.kind === "touch"
      );
      const explicitWireConnection = pivotConnections.find(
        (item) => item.kind === "wire"
      );
      const anchorConnection =
        directConnection ?? explicitWireConnection ?? null;

      if (anchorConnection) {
        nextRememberedPivot = {
          componentId: component.id,
          port: pivotPort,
          kind: anchorConnection.kind,
          otherComponentId: anchorConnection.otherComponentId,
          otherPort: anchorConnection.otherPort,
          wireId: anchorConnection.wireId,
        };
      }
    }

    rememberUndo();

    if (pivotPort) {
      rotationPivotRef.current = nextRememberedPivot;
      const rotated = rotateComponentAroundPort(component, pivotPort);

      setComponents((current) =>
        current.map((item) =>
          item.id === component.id ? rotated : item
        )
      );
      return;
    }

    // With neither end connected, or with two genuinely independent
    // connections, use the original centre-based rotation behavior.
    rotationPivotRef.current = null;
    const rotatedCandidate = {
      ...component,
      rotation: (component.rotation + 90) % 360,
      labelPosition:
        !GENERIC_LABEL_ROTATION_EXCLUSIONS.has(component.type)
        ? rotateLabelPositionClockwise(
            component.labelPosition ?? "below"
          )
        : component.labelPosition,
    };
    const rotated = snapObjects
      ? alignComponentToGrid(rotatedCandidate)
      : rotatedCandidate;

    setComponents((current) =>
      current.map((item) =>
        item.id === component.id ? rotated : item
      )
    );
  }

  function duplicateSelected() {
    rotationPivotRef.current = null;
    if (!selectedComponent) return;

    const copyCandidate = {
      ...selectedComponent,
      id: uid(),
      x: Math.min(WIDTH - 60, selectedComponent.x + 30),
      y: Math.min(HEIGHT - 60, selectedComponent.y + 30),
    };
    const copy = snapObjects
      ? alignComponentToGrid(copyCandidate)
      : copyCandidate;

    rememberUndo();
    setComponents((current) => [...current, copy]);
    setSelected({ kind: "component", id: copy.id });
    setSelectedComponentIds([copy.id]);
  }

  function setSelectedSwitchState(state) {
    if (
      !selectedComponent ||
      !BINARY_SWITCH_TYPES.has(selectedComponent.type)
    ) {
      return;
    }

    const nextType =
      state === "closed" ? "switch-closed" : "switch-open";

    if (selectedComponent.type === nextType) return;

    rememberUndo();
    setComponents((current) =>
      current.map((component) =>
        component.id === selectedComponent.id
          ? { ...component, type: nextType }
          : component
      )
    );
  }

  function setSelectedTwoWaySwitchPosition(
    switchPosition
  ) {
    if (
      !selectedComponent ||
      selectedComponent.type !== "switch-two-way"
    ) {
      return;
    }

    const nextPosition =
      switchPosition === "lower" ? "lower" : "upper";

    if (
      (selectedComponent.switchPosition ?? "upper") ===
      nextPosition
    ) {
      return;
    }

    rememberUndo();
    setComponents((current) =>
      current.map((component) =>
        component.id === selectedComponent.id
          ? {
              ...component,
              switchPosition: nextPosition,
            }
          : component
      )
    );
  }

  function setSelectedWireCurrentArrow(currentArrow) {
    if (
      !selectedComponent ||
      selectedComponent.type !== "wire-segment"
    ) {
      return;
    }

    const currentValue =
      selectedComponent.currentArrow ?? "none";
    if (currentValue === currentArrow) return;

    rememberUndo();
    setComponents((current) =>
      current.map((component) =>
        component.id === selectedComponent.id
          ? { ...component, currentArrow }
          : component
      )
    );
  }

  function flipSelectedPotentiometerVertically() {
    if (
      !selectedComponent ||
      selectedComponent.type !== "potentiometer"
    ) {
      return;
    }

    rotationPivotRef.current = null;
    rememberUndo();
    setComponents((current) =>
      current.map((component) =>
        component.id === selectedComponent.id
          ? {
              ...component,
              verticalFlip: !component.verticalFlip,
            }
          : component
      )
    );
  }

  function adjustSelectedPotentiometerWiperOffset(direction) {
    if (
      !selectedComponent ||
      selectedComponent.type !== "potentiometer"
    ) {
      return;
    }

    const currentOffset =
      getPotentiometerWiperOffset(selectedComponent);
    const nextOffset = clamp(
      currentOffset +
        direction * POTENTIOMETER_WIPER_OFFSET_STEP,
      POTENTIOMETER_WIPER_OFFSET_MIN,
      POTENTIOMETER_WIPER_OFFSET_MAX
    );

    if (nextOffset === currentOffset) return;

    rememberUndo();
    setComponents((current) =>
      current.map((component) =>
        component.id === selectedComponent.id
          ? { ...component, wiperOffset: nextOffset }
          : component
      )
    );
  }

  function setSelectedPolarityMark(showPolarity) {
    if (
      !selectedComponent ||
      !POLARITY_COMPONENT_TYPES.has(selectedComponent.type)
    ) {
      return;
    }

    const currentValue = selectedComponent.showPolarity ?? true;
    if (currentValue === showPolarity) return;

    rememberUndo();
    setComponents((current) =>
      current.map((component) =>
        component.id === selectedComponent.id
          ? { ...component, showPolarity }
          : component
      )
    );
  }

  function adjustSelectedCellCount(direction) {
    if (!selectedComponent || selectedComponent.type !== "cell") {
      return;
    }

    const currentCount = selectedComponent.cellCount ?? 1;
    const requestedCount = Math.max(
      CELL_COUNT_MIN,
      Math.min(CELL_COUNT_MAX, currentCount + direction)
    );
    if (requestedCount === currentCount) return;

    rememberUndo();
    setComponents((current) =>
      current.map((component) => {
        if (
          component.id !== selectedComponent.id ||
          component.type !== "cell"
        ) {
          return component;
        }

        const currentCount = component.cellCount ?? 1;
        const nextCount = Math.max(
          CELL_COUNT_MIN,
          Math.min(
            CELL_COUNT_MAX,
            currentCount + direction
          )
        );

        return {
          ...component,
          cellCount: nextCount,
        };
      })
    );
  }

  function updateSelectedLabelField(field, value) {
    if (!selectedComponent) return;
    if ((selectedComponent[field] ?? "") === value) return;

    rememberUndo();
    setComponents((current) =>
      current.map((component) =>
        component.id === selectedComponent.id
          ? { ...component, [field]: value }
          : component
      )
    );
  }

  function updateSelectedLabel(label) {
    updateSelectedLabelField("label", label);
  }

  function updateSelectedLabelPosition(labelPosition) {
    if (!selectedComponent || selectedComponent.type === "label") return;
    if (selectedComponent.labelPosition === labelPosition) return;

    rememberUndo();
    setComponents((current) =>
      current.map((component) =>
        component.id === selectedComponent.id
          ? { ...component, labelPosition }
          : component
      )
    );
  }

  function toggleSelectedLabelStyle(style) {
    if (
      !selectedComponent ||
      selectedComponent.type === "wire-segment"
    ) {
      return;
    }

    const field =
      style === "bold" ? "labelBold" : "labelItalic";
    const currentValue = Boolean(selectedComponent[field]);

    rememberUndo();
    setComponents((current) =>
      current.map((component) =>
        component.id === selectedComponent.id
          ? { ...component, [field]: !currentValue }
          : component
      )
    );
  }

  function adjustSelectedLabelFontSize(direction) {
    if (!selectedComponent) return;

    const currentSize =
      selectedComponent.labelFontSize ??
      (selectedComponent.type === "label" ? 18 : 16);
    const requestedSize = Math.max(
      LABEL_FONT_MIN,
      Math.min(
        LABEL_FONT_MAX,
        currentSize + direction * LABEL_FONT_STEP
      )
    );
    if (requestedSize === currentSize) return;

    rememberUndo();
    setComponents((current) =>
      current.map((component) => {
        if (component.id !== selectedComponent.id) {
          return component;
        }

        const currentSize =
          component.labelFontSize ?? (component.type === "label" ? 18 : 16);
        const nextSize = Math.max(
          LABEL_FONT_MIN,
          Math.min(
            LABEL_FONT_MAX,
            currentSize + direction * LABEL_FONT_STEP
          )
        );

        return {
          ...component,
          labelFontSize: nextSize,
        };
      })
    );
  }

  function getLabelInputRef(field) {
    if (field === "dividerLabel1") {
      return dividerLabel1InputRef;
    }

    if (field === "dividerLabel2") {
      return dividerLabel2InputRef;
    }

    return labelInputRef;
  }

  function rememberLabelSelection(event, field = "label") {
    activeLabelFieldRef.current = field;
    labelSelectionRef.current = {
      field,
      start: event.currentTarget.selectionStart ?? 0,
      end: event.currentTarget.selectionEnd ?? 0,
    };
  }

  function insertLabelCharacter(
    character,
    { refocus = true } = {}
  ) {
    if (!selectedComponent) return;

    const requestedField = activeLabelFieldRef.current;
    const field =
      selectedComponent.type === "potential-divider" &&
      ["dividerLabel1", "dividerLabel2"].includes(requestedField)
        ? requestedField
        : "label";

    const label = selectedComponent[field] ?? "";
    const inputRef = getLabelInputRef(field);
    const input = inputRef.current;

    const remembered =
      labelSelectionRef.current.field === field
        ? labelSelectionRef.current
        : { start: label.length, end: label.length };
    const start =
      input === document.activeElement
        ? input.selectionStart ?? label.length
        : remembered.start;
    const end =
      input === document.activeElement
        ? input.selectionEnd ?? start
        : remembered.end;

    const safeStart = clamp(start, 0, label.length);
    const safeEnd = clamp(end, safeStart, label.length);
    const nextLabel =
      label.slice(0, safeStart) + character + label.slice(safeEnd);
    const nextCursor = safeStart + character.length;

    updateSelectedLabelField(field, nextLabel);
    labelSelectionRef.current = {
      field,
      start: nextCursor,
      end: nextCursor,
    };

    if (refocus) {
      requestAnimationFrame(() => {
        const currentInput = inputRef.current;
        if (!currentInput) return;

        currentInput.focus();
        currentInput.setSelectionRange(
          nextCursor,
          nextCursor
        );
      });
    }
  }

  function closeUnicodePicker() {
    setUnicodePickerOpen(false);
    setUnicodeCodePointStatus("");

    requestAnimationFrame(() => {
      const field = activeLabelFieldRef.current;
      const inputRef = getLabelInputRef(field);
      const input = inputRef.current;
      if (!input) return;

      const remembered = labelSelectionRef.current;
      const cursor =
        remembered.field === field
          ? remembered.start
          : input.value.length;

      input.focus();
      input.setSelectionRange(cursor, cursor);
    });
  }

  function insertUnicodePickerCharacter(character) {
    insertLabelCharacter(character, {
      refocus: false,
    });
    setUnicodeCodePointStatus(
      `Inserted ${character} (${unicodeCodePointLabel(character)})`
    );
  }

  function insertUnicodeCodePoint() {
    const normalized = unicodeCodePoint
      .trim()
      .replace(/^U\+/i, "")
      .replace(/^0x/i, "");

    if (!/^[0-9a-f]+$/i.test(normalized)) {
      setUnicodeCodePointStatus(
        "Enter a hexadecimal code point, for example U+03C0."
      );
      return;
    }

    const codePoint = Number.parseInt(normalized, 16);
    const validScalar =
      Number.isInteger(codePoint) &&
      codePoint >= 0 &&
      codePoint <= 0x10ffff &&
      !(codePoint >= 0xd800 && codePoint <= 0xdfff);

    if (!validScalar) {
      setUnicodeCodePointStatus(
        "That is not a valid Unicode character code point."
      );
      return;
    }

    const character = String.fromCodePoint(codePoint);
    insertUnicodePickerCharacter(character);
    setUnicodeCodePoint("");
  }

  // ── View, export and output helpers ─────────────────────────────────────
  function clearCanvas() {
    if (!components.length && !wires.length) return;

    rotationPivotRef.current = null;
    rememberUndo();
    setComponents([]);
    setWires([]);
    setSelected(null);
    setSelectedComponentIds([]);
    setWireStart(null);
    setWirePreview(null);
    setWireRoute("horizontal-first");
    wireHandleDragRef.current = null;
    wireSegmentResizeRef.current = null;
  }

  function changeZoom(
    nextZoom,
    anchorClientX = null,
    anchorClientY = null
  ) {
    const oldZoom = zoomRef.current;
    const clampedZoom = Math.max(
      ZOOM_MIN,
      Math.min(ZOOM_MAX, nextZoom)
    );

    if (Math.abs(clampedZoom - oldZoom) < 0.0001) {
      return;
    }

    const viewport = canvasViewportRef.current;
    let anchorOffsetX = 0;
    let anchorOffsetY = 0;
    let contentAnchorX = 0;
    let contentAnchorY = 0;

    if (viewport) {
      const rect = viewport.getBoundingClientRect();
      const hasPointerAnchor =
        Number.isFinite(anchorClientX) &&
        Number.isFinite(anchorClientY);

      anchorOffsetX = hasPointerAnchor
        ? anchorClientX - rect.left
        : viewport.clientWidth / 2;
      anchorOffsetY = hasPointerAnchor
        ? anchorClientY - rect.top
        : viewport.clientHeight / 2;

      contentAnchorX = viewport.scrollLeft + anchorOffsetX;
      contentAnchorY = viewport.scrollTop + anchorOffsetY;
    }

    zoomRef.current = clampedZoom;
    setZoom(clampedZoom);

    if (viewport) {
      requestAnimationFrame(() => {
        const ratio = clampedZoom / oldZoom;

        viewport.scrollLeft =
          contentAnchorX * ratio - anchorOffsetX;
        viewport.scrollTop =
          contentAnchorY * ratio - anchorOffsetY;
      });
    }
  }

  function zoomIn() {
    changeZoom(zoomRef.current + ZOOM_STEP);
  }

  function zoomOut() {
    changeZoom(zoomRef.current - ZOOM_STEP);
  }

  function resetZoom() {
    changeZoom(DEFAULT_ZOOM);
  }

  function createCroppedSvgBlob() {
    const source = svgRef.current;
    if (!source) return null;

    const clone = source.cloneNode(true);

    clone.querySelectorAll('[data-editor-only="true"]').forEach((node) => {
      node.remove();
    });

    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");

    // Measure only the real circuit content after editor-only items such as
    // the grid, blue connectors and selection handles have been removed.
    // The clone needs to be in the document briefly for reliable SVG/text
    // getBBox measurements across browsers.
    clone.style.position = "absolute";
    clone.style.left = "-100000px";
    clone.style.top = "-100000px";
    clone.style.width = `${WIDTH}px`;
    clone.style.height = `${HEIGHT}px`;
    clone.style.visibility = "hidden";
    clone.style.pointerEvents = "none";

    document.body.appendChild(clone);

    let contentBounds = null;

    for (const selector of [".wire-layer", ".component-layer"]) {
      const layer = clone.querySelector(selector);
      const hasVisibleGraphics = layer?.querySelector(
        "path, line, rect, circle, ellipse, polygon, polyline, text"
      );

      if (!layer || !hasVisibleGraphics) {
        continue;
      }

      try {
        const box = layer.getBBox();

        if (!contentBounds) {
          contentBounds = {
            left: box.x,
            top: box.y,
            right: box.x + box.width,
            bottom: box.y + box.height,
          };
        } else {
          contentBounds.left = Math.min(contentBounds.left, box.x);
          contentBounds.top = Math.min(contentBounds.top, box.y);
          contentBounds.right = Math.max(
            contentBounds.right,
            box.x + box.width
          );
          contentBounds.bottom = Math.max(
            contentBounds.bottom,
            box.y + box.height
          );
        }
      } catch {
        // If a browser cannot measure a layer, the full workspace below is
        // used as a safe fallback rather than preventing SVG output.
      }
    }

    clone.remove();

    const SVG_OUTPUT_BUFFER = 30;
    const crop = contentBounds
      ? {
          x: Math.floor(contentBounds.left - SVG_OUTPUT_BUFFER),
          y: Math.floor(contentBounds.top - SVG_OUTPUT_BUFFER),
          width: Math.max(
            1,
            Math.ceil(
              contentBounds.right -
                contentBounds.left +
                SVG_OUTPUT_BUFFER * 2
            )
          ),
          height: Math.max(
            1,
            Math.ceil(
              contentBounds.bottom -
                contentBounds.top +
                SVG_OUTPUT_BUFFER * 2
            )
          ),
        }
      : {
          x: 0,
          y: 0,
          width: WIDTH,
          height: HEIGHT,
        };

    // Remove the temporary measuring styles before serialising the clean SVG.
    clone.removeAttribute("style");
    clone.setAttribute("width", String(crop.width));
    clone.setAttribute("height", String(crop.height));
    clone.setAttribute(
      "viewBox",
      `${crop.x} ${crop.y} ${crop.width} ${crop.height}`
    );

    if (!transparentBackground) {
      const background = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "rect"
      );
      background.setAttribute("x", String(crop.x));
      background.setAttribute("y", String(crop.y));
      background.setAttribute("width", String(crop.width));
      background.setAttribute("height", String(crop.height));
      background.setAttribute("fill", "white");
      clone.insertBefore(background, clone.firstChild);
    }

    const data =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      new XMLSerializer().serializeToString(clone);

    return new Blob([data], {
      type: "image/svg+xml;charset=utf-8",
    });
  }

  function openSvg() {
    const blob = createCroppedSvgBlob();
    if (!blob) return;

    const url = URL.createObjectURL(blob);

    // Open a lightweight page containing the SVG as a real image. That keeps
    // the "Open SVG" behaviour while restoring the browser's normal
    // right-click -> Save image as... option.
    const opened = window.open("", "_blank");

    if (!opened) {
      URL.revokeObjectURL(url);
      return;
    }

    opened.opener = null;
    opened.document.open();
    opened.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Circuit Diagram</title>
    <style>
      html,
      body {
        margin: 0;
        min-height: 100%;
        background: ${
          transparentBackground
            ? "#f8fafc"
            : "white"
        };
      }

      body {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        box-sizing: border-box;
        min-height: 100vh;
        overflow: hidden;
        ${
          transparentBackground
            ? `background-image:
                linear-gradient(45deg, #e5e7eb 25%, transparent 25%),
                linear-gradient(-45deg, #e5e7eb 25%, transparent 25%),
                linear-gradient(45deg, transparent 75%, #e5e7eb 75%),
                linear-gradient(-45deg, transparent 75%, #e5e7eb 75%);
              background-size: 24px 24px;
              background-position:
                0 0,
                0 12px,
                12px -12px,
                -12px 0;`
            : ""
        }
      }

      img {
        display: block;
        width: calc(100vw - 40px);
        height: calc(100vh - 40px);
        object-fit: contain;
      }
    </style>
  </head>
  <body>
    <img
      src="${url}"
      alt="Circuit diagram"
      draggable="false"
    />
  </body>
</html>`);
    opened.document.close();

    // Keep the Blob URL valid for as long as the preview tab is open so
    // right-click saving continues to work even much later.
    opened.addEventListener(
      "beforeunload",
      () => {
        URL.revokeObjectURL(url);
      },
      { once: true }
    );
  }

  function createPngBlobFromSvg(
    svgBlob,
    useTransparentBackground = false
  ) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(svgBlob);
      const image = new Image();

      image.onload = () => {
        try {
          const sourceWidth = Math.max(
            1,
            image.naturalWidth || image.width || 1
          );
          const sourceHeight = Math.max(
            1,
            image.naturalHeight || image.height || 1
          );
          const desiredScale = 4;
          const maxCanvasDimension = 8192;
          const scale = Math.min(
            desiredScale,
            maxCanvasDimension / sourceWidth,
            maxCanvasDimension / sourceHeight
          );
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(
            1,
            Math.round(sourceWidth * scale)
          );
          canvas.height = Math.max(
            1,
            Math.round(sourceHeight * scale)
          );

          const context = canvas.getContext("2d");
          if (!context) {
            throw new Error("Canvas is unavailable.");
          }

          context.setTransform(scale, 0, 0, scale, 0, 0);

          if (!useTransparentBackground) {
            context.fillStyle = "white";
            context.fillRect(
              0,
              0,
              sourceWidth,
              sourceHeight
            );
          }

          context.drawImage(
            image,
            0,
            0,
            sourceWidth,
            sourceHeight
          );

          canvas.toBlob(
            (pngBlob) => {
              URL.revokeObjectURL(url);

              if (!pngBlob) {
                reject(
                  new Error("Could not create the PNG image.")
                );
                return;
              }

              resolve(pngBlob);
            },
            "image/png"
          );
        } catch (error) {
          URL.revokeObjectURL(url);
          reject(error);
        }
      };

      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Could not render the SVG image."));
      };

      image.src = url;
    });
  }

  async function copyImageToClipboard() {
    const svgBlob = createCroppedSvgBlob();
    if (!svgBlob) return;

    if (
      !navigator.clipboard?.write ||
      typeof ClipboardItem === "undefined"
    ) {
      setCopyImageStatus("unavailable");
      return;
    }

    setCopyImageStatus("copying");

    try {
      const pngPromise = createPngBlobFromSvg(
        svgBlob,
        transparentBackground
      );

      await navigator.clipboard.write([
        new ClipboardItem({
          "image/png": pngPromise,
        }),
      ]);

      setCopyImageStatus("copied");
      window.setTimeout(() => {
        setCopyImageStatus("idle");
      }, 1600);
    } catch (error) {
      console.error("Could not copy circuit image:", error);
      setCopyImageStatus("failed");
      window.setTimeout(() => {
        setCopyImageStatus("idle");
      }, 2200);
    }
  }

  function downloadSvg() {
    const blob = createCroppedSvgBlob();
    if (!blob) return;

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "circuit-diagram.svg";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    // The click has already handed the Blob to the browser's download system.
    requestAnimationFrame(() => {
      URL.revokeObjectURL(url);
    });
  }

  // ── Browser input effects ───────────────────────────────────────────────
  useEffect(() => {
    const viewport = canvasViewportRef.current;
    if (!viewport) return;

    function onPinchWheel(event) {
      if (!event.ctrlKey) return;

      // Ctrl+wheel is the browser event produced by a two-finger trackpad
      // pinch in Chromium/Firefox. Keep that gesture inside Circuit Drawer.
      event.preventDefault();

      if (nativeGestureActiveRef.current) {
        return;
      }

      const pinch = pinchWheelRef.current;
      pinch.deltaY += event.deltaY;
      pinch.clientX = event.clientX;
      pinch.clientY = event.clientY;

      if (pinch.frame !== null) {
        return;
      }

      pinch.frame = requestAnimationFrame(() => {
        const current = pinchWheelRef.current;
        const deltaY = current.deltaY;
        const clientX = current.clientX;
        const clientY = current.clientY;

        current.deltaY = 0;
        current.frame = null;

        // Positive deltaY = fingers pinch together = zoom out.
        // Negative deltaY = fingers spread apart = zoom in.
        const scaleFactor = Math.exp(-deltaY * 0.0045);

        changeZoom(
          zoomRef.current * scaleFactor,
          clientX,
          clientY
        );
      });
    }

    function onNativeGestureStart(event) {
      event.preventDefault();
      nativeGestureActiveRef.current = true;
      nativeGestureStartZoomRef.current = zoomRef.current;
    }

    function onNativeGestureChange(event) {
      event.preventDefault();

      const scale = Number(event.scale);
      if (!Number.isFinite(scale) || scale <= 0) return;

      const rect = viewport.getBoundingClientRect();
      const clientX = Number.isFinite(event.clientX)
        ? event.clientX
        : rect.left + viewport.clientWidth / 2;
      const clientY = Number.isFinite(event.clientY)
        ? event.clientY
        : rect.top + viewport.clientHeight / 2;

      changeZoom(
        nativeGestureStartZoomRef.current * scale,
        clientX,
        clientY
      );
    }

    function onNativeGestureEnd(event) {
      event.preventDefault();
      nativeGestureActiveRef.current = false;
    }

    viewport.addEventListener("wheel", onPinchWheel, {
      passive: false,
    });
    viewport.addEventListener(
      "gesturestart",
      onNativeGestureStart,
      { passive: false }
    );
    viewport.addEventListener(
      "gesturechange",
      onNativeGestureChange,
      { passive: false }
    );
    viewport.addEventListener(
      "gestureend",
      onNativeGestureEnd,
      { passive: false }
    );

    return () => {
      viewport.removeEventListener("wheel", onPinchWheel);
      viewport.removeEventListener(
        "gesturestart",
        onNativeGestureStart
      );
      viewport.removeEventListener(
        "gesturechange",
        onNativeGestureChange
      );
      viewport.removeEventListener(
        "gestureend",
        onNativeGestureEnd
      );

      if (pinchWheelRef.current.frame !== null) {
        cancelAnimationFrame(pinchWheelRef.current.frame);
        pinchWheelRef.current.frame = null;
      }
    };
  }, []);

  useEffect(() => {
    const viewport = canvasViewportRef.current;
    if (!viewport) return;

    // Start in the middle of the zoomed drawing surface. The empty-state
    // message is already positioned at the centre of the SVG, so this makes
    // it appear in the centre of the workspace the user actually sees.
    const frame = requestAnimationFrame(() => {
      viewport.scrollLeft = Math.max(
        0,
        (viewport.scrollWidth - viewport.clientWidth) / 2
      );
      viewport.scrollTop = Math.max(
        0,
        (viewport.scrollHeight - viewport.clientHeight) / 2
      );
    });

    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    function onKeyDown(event) {
      const tag = event.target?.tagName?.toLowerCase();

      if (event.ctrlKey || event.metaKey) {
        if (event.key.toLowerCase() === "z" && !event.shiftKey) {
          event.preventDefault();
          undoLastAction();
          return;
        }

        if (event.key === "+" || event.key === "=") {
          event.preventDefault();
          zoomIn();
          return;
        }

        if (event.key === "-" || event.key === "_") {
          event.preventDefault();
          zoomOut();
          return;
        }

        if (event.key === "0") {
          event.preventDefault();
          resetZoom();
          return;
        }
      }

      if (tag === "input" || tag === "textarea") return;

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        removeSelected();
      }

      if (event.key.toLowerCase() === "r" && selectedComponent) {
        event.preventDefault();
        rotateSelected();
      }

      if (event.code === "Space") {
        if (mode === "wire" && wireStart) {
          event.preventDefault();
          flipWireCorner();
          return;
        }

        if (
          selectedWire &&
          selectedWire.route !== "c-shape" &&
          selectedWire.route !== "fixed"
        ) {
          event.preventDefault();
          flipWireCorner();
          return;
        }
      }

      if (event.key === "Escape") {
        marqueeSelectionRef.current = null;
        setMarqueeSelection(null);
        setWireStart(null);
        setWirePreview(null);
        setWireRoute("horizontal-first");
        wireHandleDragRef.current = null;
        setSelected(null);
        setSelectedComponentIds([]);
        setMode("select");
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  // ── Render-only derived values ──────────────────────────────────────────
  const connectorsVisible =
    showBlueConnectors || mode === "wire";
  // Keep editor connector dots the same apparent size on screen at every
  // zoom level. The default-zoom appearance is the visual baseline.
  const connectorVisualScale =
    DEFAULT_ZOOM / zoom;

  const liveWireStart =
    wireStart && componentMap.get(wireStart.componentId)
      ? getWireEndpointPosition(
          wireStart,
          componentMap.get(wireStart.componentId)
        )
      : null;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <h1>Circuit Drawer</h1>
          <p>
            Drag components onto the page, then connect the blue terminals.
          </p>
        </div>

        <div
          className="topbar-actions"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: "8px",
            flexWrap: "wrap",
          }}
        >
          <div
            aria-label="View options"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "4px",
              border: "1px solid #dce5ef",
              borderRadius: "9px",
              background: "#f4f7fb",
            }}
          >
            <button
              onClick={() => setShowGrid((value) => !value)}
            >
              {showGrid ? "Hide grid" : "Show grid"}
            </button>
            <label
              title="Snap moved, resized, duplicated and newly added objects to the grid and nearby component terminals. Wire-tool connection snapping is unchanged."
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "4px 6px",
                whiteSpace: "nowrap",
                fontWeight: 400,
                fontSize: "13px",
                cursor: "pointer",
                userSelect: "none",
              }}
            >
              <input
                type="checkbox"
                checked={snapObjects}
                onChange={(event) =>
                  setSnapObjects(event.target.checked)
                }
                aria-label="Snap objects"
                style={{
                  margin: 0,
                  width: "15px",
                  height: "15px",
                  cursor: "pointer",
                }}
              />
              Snap objects
            </label>

            <button
              onClick={() =>
                setShowBlueConnectors((value) => !value)
              }
              disabled={mode === "wire"}
              title={
                mode === "wire"
                  ? "Blue connectors stay visible while using the Wire tool"
                  : showBlueConnectors
                    ? "Hide blue connection terminals"
                    : "Show blue connection terminals"
              }
            >
              {showBlueConnectors
                ? "Hide blue connectors"
                : "Show blue connectors"}
            </button>

            <label
              title="Use a traditional serif style for labels and meter letters"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "4px 6px",
                whiteSpace: "nowrap",
                fontWeight: 400,
                fontSize: "13px",
                cursor: "pointer",
                userSelect: "none",
              }}
            >
              <input
                type="checkbox"
                checked={fancyText}
                onChange={(event) =>
                  setFancyText(event.target.checked)
                }
                aria-label="Fancy text"
                style={{
                  margin: 0,
                  width: "15px",
                  height: "15px",
                  cursor: "pointer",
                }}
              />
              Fancy text
            </label>
          </div>

          <div
            aria-label="Image and SVG options"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "4px",
              border: "1px solid #d8e8dd",
              borderRadius: "9px",
              background: "#f3f8f5",
            }}
          >
            <label
              title="Use a transparent background for copied and SVG output"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "4px 6px",
                fontWeight: 400,
                fontSize: "13px",
                cursor: "pointer",
                userSelect: "none",
              }}
            >
              <input
                type="checkbox"
                checked={transparentBackground}
                onChange={(event) =>
                  setTransparentBackground(event.target.checked)
                }
                aria-label="Transparent background"
                style={{
                  margin: 0,
                  width: "15px",
                  height: "15px",
                  cursor: "pointer",
                }}
              />
              <span
                style={{
                  display: "inline-block",
                  lineHeight: 1.08,
                  textAlign: "left",
                }}
              >
                Transparent
                <br />
                background
              </span>
            </label>

            <button
              onClick={copyImageToClipboard}
              disabled={copyImageStatus === "copying"}
              title={
                copyImageStatus === "unavailable"
                  ? "Image copying is not available in this browser"
                  : copyImageStatus === "failed"
                    ? "Could not copy the image"
                    : "Copy a high-resolution PNG image to the clipboard"
              }
            >
              {copyImageStatus === "copying"
                ? "Copying…"
                : copyImageStatus === "copied"
                  ? "Copied ✓"
                  : copyImageStatus === "failed"
                    ? "Copy failed"
                    : copyImageStatus === "unavailable"
                      ? "Copy unavailable"
                      : "Copy image"}
            </button>
            <button onClick={openSvg}>Open SVG</button>
            <button onClick={downloadSvg}>Download SVG</button>
          </div>
        </div>
      </header>

      <main className="workspace">
        <aside
          className="palette"
          style={{
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              minHeight: 0,
              flex: "1 1 auto",
              overflowY: "auto",
              overflowX: "hidden",
              overscrollBehavior: "contain",
              paddingRight: "2px",
            }}
          >
            <div className="palette-heading">
              <h2>Circuit symbols</h2>
              <span>Drag or click to add</span>
            </div>

            <div className="palette-grid">
              {BASIC_SYMBOLS.map((symbol) => (
                <PaletteSymbolButton
                  key={symbol.type}
                  symbol={symbol}
                  onAdd={addComponent}
                  onDragStart={handlePaletteDragStart}
                />
              ))}
            </div>

            <div
              style={{
                marginTop: "14px",
                paddingTop: "12px",
                borderTop: "1px solid #d7e4f1",
              }}
            >
              <h3
                style={{
                  margin: "0 4px 9px",
                  fontSize: "13px",
                  color: "#334155",
                  fontWeight: 700,
                  letterSpacing: "0.01em",
                }}
              >
                Advanced symbols
              </h3>

              <div className="palette-grid">
                {ADVANCED_SYMBOLS.map((symbol) => (
                  <PaletteSymbolButton
                    key={symbol.type}
                    symbol={symbol}
                    onAdd={addComponent}
                    onDragStart={handlePaletteDragStart}
                  />
                ))}
              </div>
            </div>
          </div>
        </aside>

        <section
          className="canvas-panel"
          style={{ position: "relative" }}
        >
          <div
            className="canvas-toolbar"
            style={{
              display: "grid",
              gridTemplateColumns: "auto minmax(0, 1fr) auto",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <div
              aria-label="Editor mode"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                padding: "4px",
                border: "1px solid #d7e4f1",
                borderRadius: "9px",
                background: "#f2f7fc",
                justifySelf: "start",
              }}
            >
              <button
                type="button"
                className={mode === "select" ? "active" : ""}
                aria-pressed={mode === "select"}
                onClick={() => {
                  setMode("select");
                  setWireStart(null);
                  setWirePreview(null);
                  setWireSnapTarget(null);
                  setWireRoute("horizontal-first");
                }}
                style={
                  mode === "select"
                    ? {
                        fontWeight: 750,
                        borderWidth: "2px",
                        boxShadow:
                          "0 0 0 2px rgba(37, 99, 235, 0.16)",
                      }
                    : {
                        fontWeight: 600,
                      }
                }
              >
                Select
              </button>

              <button
                type="button"
                className={mode === "wire" ? "active" : ""}
                aria-pressed={mode === "wire"}
                onClick={() => {
                  setMode("wire");
                  setSelected(null);
                  setSelectedComponentIds([]);
                }}
                style={
                  mode === "wire"
                    ? {
                        fontWeight: 750,
                        borderWidth: "2px",
                        boxShadow:
                          "0 0 0 2px rgba(37, 99, 235, 0.16)",
                        whiteSpace: "nowrap",
                      }
                    : {
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                      }
                }
              >
                Wire tool
              </button>
            </div>

            <div
              className="tool-help"
              style={{
                minWidth: 0,
                textAlign: "center",
                justifySelf: "stretch",
                fontSize: "16px",
                fontWeight: mode === "wire" ? 600 : 400,
              }}
            >
              {mode === "wire"
                ? wireStart
                  ? "Choose another terminal, component lead/Wire, or an existing wire."
                  : "Start at a blue terminal, component lead or Wire. Finish on a terminal, lead/Wire, or existing wire."
                : "Shift-click or Shift-drag the grid to select multiple components. R to rotate."}
            </div>

            <div
              className="selection-actions"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: "8px",
                flexWrap: "nowrap",
                justifySelf: "end",
              }}
            >
              <div
                aria-label="Workspace zoom controls"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "4px",
                  border: "1px solid #e1deed",
                  borderRadius: "9px",
                  background: "#f6f5fa",
                }}
              >
                <button
                  type="button"
                  onClick={zoomOut}
                  disabled={zoom <= ZOOM_MIN}
                  title="Zoom out"
                  aria-label="Zoom out"
                  style={{
                    minWidth: "34px",
                    paddingLeft: "8px",
                    paddingRight: "8px",
                    fontSize: "18px",
                    lineHeight: 1,
                  }}
                >
                  −
                </button>
                <button
                  type="button"
                  onClick={zoomIn}
                  disabled={zoom >= ZOOM_MAX}
                  title="Zoom in"
                  aria-label="Zoom in"
                  style={{
                    minWidth: "34px",
                    paddingLeft: "8px",
                    paddingRight: "8px",
                    fontSize: "18px",
                    lineHeight: 1,
                  }}
                >
                  +
                </button>
              </div>

              <div
                aria-label="Edit actions"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "4px",
                  border: "1px solid #eadfce",
                  borderRadius: "9px",
                  background: "#fbf7f1",
                }}
              >
                <button
                  onClick={undoLastAction}
                  disabled={!undoHistory.length}
                  title="Undo (Ctrl/Cmd+Z)"
                >
                  Undo
                </button>
                <button
                  onClick={rotateSelected}
                  disabled={
                    selectedComponentIds.length > 1
                      ? false
                      : !selectedComponent ||
                        selectedComponent.type === "label"
                  }
                  title={
                    selectedComponentIds.length > 1
                      ? "Rotate selected components 90° around their centre"
                      : "Rotate 90°"
                  }
                >
                  Rotate ↻
                </button>
                <button
                  onClick={duplicateSelected}
                  disabled={!selectedComponent}
                >
                  Duplicate
                </button>
                <button
                  onClick={removeSelected}
                  disabled={!selected}
                >
                  Delete
                </button>
                <button
                  onClick={clearCanvas}
                  disabled={!components.length}
                >
                  Clear
                </button>
              </div>
            </div>
          </div>

          {mode === "wire" && wireStart && (
            <div
              aria-live="polite"
              style={{
                position: "absolute",
                top: "64px",
                left: "50%",
                zIndex: 8,
                pointerEvents: "none",
                transform: "translateX(-50%)",
                background: "#2563eb",
                color: "white",
                border: "3px solid white",
                borderRadius: "14px",
                padding: "12px 20px 11px",
                minWidth: "300px",
                maxWidth: "calc(100% - 40px)",
                textAlign: "center",
                fontWeight: 850,
                fontSize: "20px",
                lineHeight: 1.15,
                letterSpacing: "0.02em",
              }}
            >
              Press{" "}
              <span
                style={{
                  display: "inline-block",
                  margin: "0 3px",
                  padding: "3px 9px",
                  borderRadius: "7px",
                  background: "white",
                  color: "#1747a6",
                  fontSize: "0.9em",
                  letterSpacing: "0.06em",
                  boxShadow: "inset 0 -2px 0 rgba(23, 71, 166, 0.18)",
                }}
              >
                SPACE
              </span>{" "}
              to flip the corner
            </div>
          )}

          <div
            ref={canvasViewportRef}
            className="svg-wrap"
            style={{
              overflow: "auto",
              display: "flex",
              alignItems: zoom < 1 ? "center" : "flex-start",
              justifyContent: zoom < 1 ? "center" : "flex-start",
            }}
          >
            <div
              style={{
                width: `${zoom * 100}%`,
                height: `${zoom * 100}%`,
                minWidth: `${zoom * 100}%`,
                minHeight: `${460 * zoom}px`,
                flex: "0 0 auto",
              }}
            >
              <svg
                ref={svgRef}
                className={`drawing-canvas mode-${mode}`}
                viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                style={{ minHeight: 0 }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
              onPointerMove={handlePointerMove}
              onPointerUp={endPointerAction}
              onPointerCancel={cancelPointerAction}
              onPointerDown={(event) => {
                if (event.target === event.currentTarget) {
                  if (
                    mode === "wire" &&
                    wireStart &&
                    finishWireAtVisibleSnapTarget(event)
                  ) {
                    return;
                  }

                  if (!startMarqueeSelection(event)) {
                    clearSelectionOrWire();
                  }
                }
              }}
              role="img"
              aria-label="circuit diagram drawing canvas"
            >
              <defs data-editor-only="true">
                <pattern
                  id="smallGrid"
                  width={GRID}
                  height={GRID}
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d={`M ${GRID} 0 L 0 0 0 ${GRID}`}
                    fill="none"
                    stroke="#dce6f2"
                    strokeWidth="0.6"
                  />
                </pattern>
                <pattern
                  id="grid"
                  width={GRID * 5}
                  height={GRID * 5}
                  patternUnits="userSpaceOnUse"
                >
                  <rect
                    width={GRID * 5}
                    height={GRID * 5}
                    fill="url(#smallGrid)"
                  />
                  <path
                    d={`M ${GRID * 5} 0 L 0 0 0 ${GRID * 5}`}
                    fill="none"
                    stroke="#c8d7e8"
                    strokeWidth="1"
                  />
                </pattern>
              </defs>

              {showGrid && (
                <rect
                  data-editor-only="true"
                  width="100%"
                  height="100%"
                  fill="url(#grid)"
                  pointerEvents="none"
                />
              )}

              <g className="wire-layer">
                {wires.map((wire) => {
                  const resolved = getStoredWireGeometry(
                    wire,
                    componentMap
                  );

                  if (!resolved) return null;

                  const {
                    fromComponent,
                    toComponent,
                    geometry,
                  } = resolved;
                  const path = geometry.path;
                  const currentArrows = getDrawnWireCurrentArrows(
                    wire,
                    geometry,
                    fromComponent,
                    toComponent
                  );
                  const isSelected =
                    selected?.kind === "wire" && selected.id === wire.id;
                  const wireSelectionOutline = isSelected
                    ? getPolylineCorridorOutline(
                        geometry.points
                      )
                    : null;

                  return (
                    <g key={wire.id}>
                      <path
                        d={path}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="butt"
                        strokeLinejoin="miter"
                      />


                      {currentArrows.map((arrow, index) => (
                        <ArrowHead
                          key={`${wire.id}-current-${index}`}
                          x={arrow.x}
                          y={arrow.y}
                          angle={arrow.angle}
                          scale={1.5}
                        />
                      ))}

                      {/* The fine rounded purple boundary mirrors the
                          component selection style while still tracing the
                          Wire-tool wire's actual selectable corridor. */}
                      {isSelected && (
                        <>
                          <path
                            data-editor-only="true"
                            d={path}
                            fill="none"
                            stroke="#7c3aed"
                            strokeWidth="11"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            opacity="0.20"
                            vectorEffect="non-scaling-stroke"
                            pointerEvents="none"
                          />
                          <path
                            data-editor-only="true"
                            d={path}
                            fill="none"
                            stroke="#7c3aed"
                            strokeWidth={WIRE_TOOL_HIT_WIDTH}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            opacity="0.045"
                            pointerEvents="none"
                          />
                          {wireSelectionOutline?.outlinePath && (
                            <path
                              data-editor-only="true"
                              d={wireSelectionOutline.outlinePath}
                              fill="none"
                              stroke="#7c3aed"
                              strokeWidth="1.4"
                              strokeDasharray="2 3.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              vectorEffect="non-scaling-stroke"
                              pointerEvents="none"
                            />
                          )}
                          {[geometry.points[0], geometry.points.at(-1)].map(
                            (endpoint, endpointIndex) => (
                              <circle
                                key={`${wire.id}-selected-end-${endpointIndex}`}
                                data-editor-only="true"
                                cx={endpoint.x}
                                cy={endpoint.y}
                                r="5.5"
                                fill="white"
                                stroke="#7c3aed"
                                strokeWidth="2"
                                vectorEffect="non-scaling-stroke"
                                pointerEvents="none"
                              />
                            )
                          )}
                        </>
                      )}

                      <path
                        data-editor-only="true"
                        d={path}
                        fill="none"
                        stroke="#7c3aed"
                        strokeWidth={WIRE_TOOL_HIT_WIDTH}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity="0.001"
                        pointerEvents="stroke"
                        className="wire-hit"
                        style={{ cursor: "pointer" }}
                        onPointerDown={(event) =>
                          selectWire(event, wire.id)
                        }
                      />

                      {isSelected && geometry.handle && (
                        <g data-editor-only="true">
                          <rect
                            x={geometry.handle.x - 14}
                            y={geometry.handle.y - 14}
                            width="28"
                            height="28"
                            fill="transparent"
                            pointerEvents="all"
                            style={{
                              cursor:
                                geometry.handle.axis === "x"
                                  ? "ew-resize"
                                  : "ns-resize",
                            }}
                            onPointerDown={(event) =>
                              startWireHandleDrag(
                                event,
                                wire,
                                geometry.handle
                              )
                            }
                          />
                          <rect
                            x={geometry.handle.x - 7}
                            y={geometry.handle.y - 7}
                            width="14"
                            height="14"
                            rx="3"
                            fill="white"
                            stroke="#7c3aed"
                            strokeWidth="2"
                            vectorEffect="non-scaling-stroke"
                            pointerEvents="none"
                          />
                          <line
                            x1={
                              geometry.handle.axis === "x"
                                ? geometry.handle.x - 3
                                : geometry.handle.x
                            }
                            y1={
                              geometry.handle.axis === "x"
                                ? geometry.handle.y
                                : geometry.handle.y - 3
                            }
                            x2={
                              geometry.handle.axis === "x"
                                ? geometry.handle.x + 3
                                : geometry.handle.x
                            }
                            y2={
                              geometry.handle.axis === "x"
                                ? geometry.handle.y
                                : geometry.handle.y + 3
                            }
                            stroke="#7c3aed"
                            strokeWidth="2"
                            strokeLinecap="round"
                            vectorEffect="non-scaling-stroke"
                            pointerEvents="none"
                          />
                        </g>
                      )}
                    </g>
                  );
                })}

                {/* Junction dots are editor-only cues: they appear while
                    a target is visibly snapped, then disappear after commit. */}
                {[
                  "wire",
                  "lead",
                  "black-junction",
                ].includes(wireSnapTarget?.kind) &&
                  wireSnapTarget?.position && (
                    <g data-editor-only="true" pointerEvents="none">
                      <circle
                        cx={wireSnapTarget.position.x}
                        cy={wireSnapTarget.position.y}
                        r={7 * connectorVisualScale}
                        fill="white"
                        stroke="#2563eb"
                        strokeWidth="2"
                        vectorEffect="non-scaling-stroke"
                      />
                      <circle
                        cx={wireSnapTarget.position.x}
                        cy={wireSnapTarget.position.y}
                        r={2.5 * connectorVisualScale}
                        fill="currentColor"
                        stroke="none"
                      />
                    </g>
                  )}

                {liveWireStart && wirePreview && (
                  <path
                    data-editor-only="true"
                    d={wirePath(liveWireStart, wirePreview, wireRoute)}
                    fill="none"
                    stroke="#2563eb"
                    strokeWidth="2.4"
                    strokeLinecap="butt"
                    strokeLinejoin="miter"
                    strokeDasharray="7 5"
                    pointerEvents="none"
                  />
                )}
              </g>

              <g className="component-layer">
                {components.map((component) => {
                  const isSelected =
                    selectedComponentIds.includes(component.id);

                  if (component.type === "junction") {
                    return (
                      <g
                        key={component.id}
                        transform={`translate(${component.x} ${component.y})`}
                      >
                        {mode === "wire" && (
                          <circle
                            data-editor-only="true"
                            cx="0"
                            cy="0"
                            r={WIRE_TOOL_SNAP_RADIUS / zoom}
                            fill="transparent"
                            stroke="none"
                            pointerEvents="all"
                            onPointerDown={(event) =>
                              handlePortClick(
                                event,
                                component.id,
                                "node"
                              )
                            }
                          />
                        )}
                      </g>
                    );
                  }
                  const leftPortActive =
                    wireStart?.componentId === component.id &&
                    wireStart?.port === "left";
                  const rightPortActive =
                    wireStart?.componentId === component.id &&
                    wireStart?.port === "right";
                  const leftPortSnapTarget =
                    mode === "wire" &&
                    wireStart &&
                    wireSnapTarget?.kind === "terminal" &&
                    wireSnapTarget?.componentId === component.id &&
                    wireSnapTarget?.port === "left";
                  const rightPortSnapTarget =
                    mode === "wire" &&
                    wireStart &&
                    wireSnapTarget?.kind === "terminal" &&
                    wireSnapTarget?.componentId === component.id &&
                    wireSnapTarget?.port === "right";
                  const tapPortActive =
                    wireStart?.componentId === component.id &&
                    wireStart?.port === "tap";
                  const tapPortSnapTarget =
                    mode === "wire" &&
                    wireStart &&
                    wireSnapTarget?.kind === "terminal" &&
                    wireSnapTarget?.componentId === component.id &&
                    wireSnapTarget?.port === "tap";
                  const topPortActive =
                    wireStart?.componentId === component.id &&
                    wireStart?.port === "top";
                  const bottomPortActive =
                    wireStart?.componentId === component.id &&
                    wireStart?.port === "bottom";
                  const wiperPortActive =
                    wireStart?.componentId === component.id &&
                    wireStart?.port === "wiper";
                  const topPortSnapTarget =
                    mode === "wire" &&
                    wireStart &&
                    wireSnapTarget?.kind === "terminal" &&
                    wireSnapTarget?.componentId === component.id &&
                    wireSnapTarget?.port === "top";
                  const bottomPortSnapTarget =
                    mode === "wire" &&
                    wireStart &&
                    wireSnapTarget?.kind === "terminal" &&
                    wireSnapTarget?.componentId === component.id &&
                    wireSnapTarget?.port === "bottom";
                  const wiperPortSnapTarget =
                    mode === "wire" &&
                    wireStart &&
                    wireSnapTarget?.kind === "terminal" &&
                    wireSnapTarget?.componentId === component.id &&
                    wireSnapTarget?.port === "wiper";
                  const portDistance = getComponentPortDistance(component);
                  const isWireSegment = component.type === "wire-segment";
                  const currentArrowOffset = isWireSegment
                    ? getWireCurrentArrowOffset(component, components)
                    : 0;
                  const bodyHalfWidth =
                    component.type === "label"
                      ? 80
                      : portDistance;
                  const visualHalfHeight =
                    component.type === "label"
                      ? 16
                      : Math.max(
                          getComponentLabelExtent(
                            component,
                            "above"
                          ),
                          getComponentLabelExtent(
                            component,
                            "below"
                          )
                        );
                  const hitHalfWidth =
                    component.type === "label"
                      ? 84
                      : bodyHalfWidth + 8;
                  const hitHalfHeight = isWireSegment
                    ? GRID
                    : component.type === "label"
                      ? 22
                      : Math.max(
                          18,
                          visualHalfHeight + 7
                        );
                  const selectionHalfHeight = isWireSegment
                    ? GRID
                    : component.type === "label"
                      ? 22
                      : visualHalfHeight + 5;

                  // A few symbols are strongly asymmetric. Their old centred
                  // rectangles created large invisible areas on the empty side
                  // of the drawing. Keep custom local-space bounds close to
                  // what is actually visible.
                  const specialBounds = (() => {
                    switch (component.type) {
                      case "ldr":
                        return {
                          hit: {
                            left: 55,
                            right: 55,
                            top: 58,
                            bottom: 33,
                          },
                          selection: {
                            left: 54,
                            right: 54,
                            top: 56,
                            bottom: 31,
                          },
                        };
                      case "led":
                        return {
                          hit: {
                            left: 55,
                            right: 55,
                            top: 61,
                            bottom: 31,
                          },
                          selection: {
                            left: 54,
                            right: 54,
                            top: 59,
                            bottom: 29,
                          },
                        };
                      case "motor":
                        return {
                          hit: {
                            left: 55,
                            right: 55,
                            top: 29,
                            bottom: 29,
                          },
                          selection: {
                            left: 53,
                            right: 53,
                            top: 27,
                            bottom: 27,
                          },
                        };
                      case "buzzer":
                        return {
                          hit: {
                            left: 55,
                            right: 55,
                            top: 47,
                            bottom: 7,
                          },
                          selection: {
                            left: 53,
                            right: 53,
                            top: 45,
                            bottom: 5,
                          },
                        };
                      case "microphone":
                        return {
                          hit: {
                            left: 36,
                            right: 55,
                            top: 34,
                            bottom: 34,
                          },
                          selection: {
                            left: 34,
                            right: 53,
                            top: 32,
                            bottom: 32,
                          },
                        };
                      case "solenoid":
                        return {
                          hit: {
                            left: 55,
                            right: 55,
                            top: 18,
                            bottom: 18,
                          },
                          selection: {
                            left: 53,
                            right: 53,
                            top: 16,
                            bottom: 16,
                          },
                        };
                      case "transformer":
                        return {
                          hit: {
                            left: 55,
                            right: 55,
                            top: 41,
                            bottom: 41,
                          },
                          selection: {
                            left: 53,
                            right: 53,
                            top: 39,
                            bottom: 39,
                          },
                        };
                      case "ground":
                        return {
                          hit: {
                            left: 25,
                            right: 25,
                            top: 55,
                            bottom: 31,
                          },
                          selection: {
                            left: 23,
                            right: 23,
                            top: 53,
                            bottom: 29,
                          },
                        };
                      case "switch-two-way":
                        return {
                          hit: {
                            left: 55,
                            right: 55,
                            top: 31,
                            bottom: 31,
                          },
                          selection: {
                            left: 53,
                            right: 53,
                            top: 29,
                            bottom: 29,
                          },
                        };
                      case "potential-divider":
                        return {
                          hit: {
                            left: 55,
                            right: 55,
                            top: 18,
                            bottom: 42,
                          },
                          selection: {
                            left: 54,
                            right: 54,
                            top: 16,
                            bottom: 40,
                          },
                        };
                      case "potentiometer": {
                        const wiperOffset =
                          getPotentiometerWiperOffset(component);
                        return {
                          hit: {
                            left: 23,
                            right: wiperOffset + 6,
                            top: 55,
                            bottom: 55,
                          },
                          selection: {
                            left: 21,
                            right: wiperOffset + 4,
                            top: 53,
                            bottom: 53,
                          },
                        };
                      }
                      default:
                        return null;
                    }
                  })();

                  const hitBounds = specialBounds?.hit ?? {
                    left: hitHalfWidth,
                    right: hitHalfWidth,
                    top: hitHalfHeight,
                    bottom: hitHalfHeight,
                  };
                  const selectionBounds =
                    specialBounds?.selection ?? {
                      left:
                        component.type === "label"
                          ? 84
                          : bodyHalfWidth + 6,
                      right:
                        component.type === "label"
                          ? 84
                          : bodyHalfWidth + 6,
                      top: selectionHalfHeight,
                      bottom: selectionHalfHeight,
                    };

                  return (
                    <g
                      key={component.id}
                      transform={`translate(${component.x} ${component.y})`}
                    >
                      <g
                        transform={`rotate(${component.rotation})`}
                        className="component"
                        onPointerDown={(event) =>
                          startComponentDrag(event, component)
                        }
                      >
                        {/* Keep a modest invisible grab margin around the
                            actual symbol without letting horizontal parts
                            capture clicks far above or below themselves. */}
                        <rect
                          data-editor-only="true"
                          x={-hitBounds.left}
                          y={-hitBounds.top}
                          width={
                            hitBounds.left + hitBounds.right
                          }
                          height={
                            hitBounds.top + hitBounds.bottom
                          }
                          rx="10"
                          fill="transparent"
                          pointerEvents="all"
                        />

                        {component.type !== "label" && (
                          <CircuitSymbol
                            type={component.type}
                            length={component.length}
                            cellCount={component.cellCount}
                            showPolarity={component.showPolarity ?? true}
                            verticalFlip={component.verticalFlip ?? false}
                            wiperOffset={getPotentiometerWiperOffset(component)}
                            switchPosition={
                              component.switchPosition ?? "upper"
                            }
                            currentArrow={component.currentArrow ?? "none"}
                            currentArrowOffset={currentArrowOffset}
                            componentRotation={component.rotation ?? 0}
                            fancyText={fancyText}
                          />
                        )}

                        <rect
                          data-editor-only="true"
                          x={-selectionBounds.left}
                          y={-selectionBounds.top}
                          width={
                            selectionBounds.left +
                            selectionBounds.right
                          }
                          height={
                            selectionBounds.top +
                            selectionBounds.bottom
                          }
                          rx="8"
                          className="selection-box"
                          opacity={isSelected ? 1 : 0}
                          pointerEvents="none"
                        />

                        {component.type !== "label" &&
                          component.type !== "potentiometer" &&
                          !CUSTOM_CONNECTOR_COMPONENT_TYPES.has(
                            component.type
                          ) && (
                          <>
                            {mode === "wire" && (
                              <>
                                <circle
                                  data-editor-only="true"
                                  cx={-portDistance}
                                  cy="0"
                                  r={WIRE_TOOL_SNAP_RADIUS / zoom}
                                  fill="transparent"
                                  stroke="none"
                                  pointerEvents="all"
                                  onPointerDown={(event) =>
                                    handlePortClick(
                                      event,
                                      component.id,
                                      "left"
                                    )
                                  }
                                />
                                <circle
                                  data-editor-only="true"
                                  cx={portDistance}
                                  cy="0"
                                  r={WIRE_TOOL_SNAP_RADIUS / zoom}
                                  fill="transparent"
                                  stroke="none"
                                  pointerEvents="all"
                                  onPointerDown={(event) =>
                                    handlePortClick(
                                      event,
                                      component.id,
                                      "right"
                                    )
                                  }
                                />
                                {component.type === "potential-divider" && (
                                  <circle
                                    data-editor-only="true"
                                    cx="0"
                                    cy={POTENTIAL_DIVIDER_TAP_LENGTH}
                                    r={WIRE_TOOL_SNAP_RADIUS / zoom}
                                    fill="transparent"
                                    stroke="none"
                                    pointerEvents="all"
                                    onPointerDown={(event) =>
                                      handlePortClick(
                                        event,
                                        component.id,
                                        "tap"
                                      )
                                    }
                                  />
                                )}
                              </>
                            )}

                            <circle
                              data-editor-only="true"
                              cx={-portDistance}
                              cy="0"
                              r={
                                (leftPortSnapTarget
                                  ? 8
                                  : isWireSegment &&
                                      isSelected &&
                                      mode === "select"
                                    ? 5.5
                                    : leftPortActive
                                      ? 7
                                      : 5) *
                                connectorVisualScale
                              }
                              className={`terminal ${
                                leftPortActive ? "terminal-active" : ""
                              }`}
                              style={{
                                opacity: connectorsVisible ? 1 : 0,
                                pointerEvents: connectorsVisible
                                  ? "auto"
                                  : "none",
                              }}
                              onPointerDown={(event) =>
                                isWireSegment && mode === "select"
                                  ? startWireSegmentResize(
                                      event,
                                      component,
                                      "left"
                                    )
                                  : handlePortClick(
                                      event,
                                      component.id,
                                      "left"
                                    )
                              }
                            />
                            <circle
                              data-editor-only="true"
                              cx={portDistance}
                              cy="0"
                              r={
                                (rightPortSnapTarget
                                  ? 8
                                  : isWireSegment &&
                                      isSelected &&
                                      mode === "select"
                                    ? 5.5
                                    : rightPortActive
                                      ? 7
                                      : 5) *
                                connectorVisualScale
                              }
                              className={`terminal ${
                                rightPortActive ? "terminal-active" : ""
                              }`}
                              style={{
                                opacity: connectorsVisible ? 1 : 0,
                                pointerEvents: connectorsVisible
                                  ? "auto"
                                  : "none",
                              }}
                              onPointerDown={(event) =>
                                isWireSegment && mode === "select"
                                  ? startWireSegmentResize(
                                      event,
                                      component,
                                      "right"
                                    )
                                  : handlePortClick(
                                      event,
                                      component.id,
                                      "right"
                                    )
                              }
                            />

                            {component.type === "potential-divider" && (
                              <circle
                                data-editor-only="true"
                                cx="0"
                                cy={POTENTIAL_DIVIDER_TAP_LENGTH}
                                r={
                                  (tapPortSnapTarget
                                    ? 8
                                    : tapPortActive
                                      ? 7
                                      : 5) *
                                  connectorVisualScale
                                }
                                className={`terminal ${
                                  tapPortActive ? "terminal-active" : ""
                                }`}
                              style={{
                                opacity: connectorsVisible ? 1 : 0,
                                pointerEvents: connectorsVisible
                                  ? "auto"
                                  : "none",
                              }}
                              onPointerDown={(event) =>
                                  handlePortClick(
                                    event,
                                    component.id,
                                    "tap"
                                  )
                                }
                              />
                            )}
                          </>
                        )}

                        {CUSTOM_CONNECTOR_COMPONENT_TYPES.has(
                          component.type
                        ) && (
                          <>
                            {mode === "wire" &&
                              getComponentPorts(component).map(
                                (port) => {
                                  const local =
                                    getPortLocalPosition(
                                      component,
                                      port
                                    );

                                  return (
                                    <circle
                                      key={`${port}-wire-hit`}
                                      data-editor-only="true"
                                      cx={local.x}
                                      cy={local.y}
                                      r={
                                        WIRE_TOOL_SNAP_RADIUS /
                                        zoom
                                      }
                                      fill="transparent"
                                      stroke="none"
                                      pointerEvents="all"
                                      onPointerDown={(event) =>
                                        handlePortClick(
                                          event,
                                          component.id,
                                          port
                                        )
                                      }
                                    />
                                  );
                                }
                              )}

                            {getComponentPorts(component).map(
                              (port) => {
                                const local =
                                  getPortLocalPosition(
                                    component,
                                    port
                                  );
                                const portActive =
                                  wireStart?.componentId ===
                                    component.id &&
                                  wireStart?.port === port;
                                const portSnapTarget =
                                  mode === "wire" &&
                                  wireStart &&
                                  wireSnapTarget?.kind ===
                                    "terminal" &&
                                  wireSnapTarget?.componentId ===
                                    component.id &&
                                  wireSnapTarget?.port === port;

                                return (
                                  <circle
                                    key={`${port}-terminal`}
                                    data-editor-only="true"
                                    cx={local.x}
                                    cy={local.y}
                                    r={
                                      (portSnapTarget
                                        ? 8
                                        : portActive
                                          ? 7
                                          : 5) *
                                      connectorVisualScale
                                    }
                                    className={`terminal ${
                                      portActive
                                        ? "terminal-active"
                                        : ""
                                    }`}
                                    style={{
                                      opacity:
                                        connectorsVisible
                                          ? 1
                                          : 0,
                                      pointerEvents:
                                        connectorsVisible
                                          ? "auto"
                                          : "none",
                                    }}
                                    onPointerDown={(event) =>
                                      handlePortClick(
                                        event,
                                        component.id,
                                        port
                                      )
                                    }
                                  />
                                );
                              }
                            )}
                          </>
                        )}

                        {component.type === "potentiometer" && (
                          <>
                            {mode === "wire" && (
                              <>
                                <circle
                                  data-editor-only="true"
                                  cx="0"
                                  cy={-PORT_DISTANCE}
                                  r={WIRE_TOOL_SNAP_RADIUS / zoom}
                                  fill="transparent"
                                  stroke="none"
                                  pointerEvents="all"
                                  onPointerDown={(event) =>
                                    handlePortClick(
                                      event,
                                      component.id,
                                      "top"
                                    )
                                  }
                                />
                                <circle
                                  data-editor-only="true"
                                  cx="0"
                                  cy={PORT_DISTANCE}
                                  r={WIRE_TOOL_SNAP_RADIUS / zoom}
                                  fill="transparent"
                                  stroke="none"
                                  pointerEvents="all"
                                  onPointerDown={(event) =>
                                    handlePortClick(
                                      event,
                                      component.id,
                                      "bottom"
                                    )
                                  }
                                />
                                <circle
                                  data-editor-only="true"
                                  cx={getPotentiometerWiperOffset(
                                    component
                                  )}
                                  cy={component.verticalFlip ? -40 : 40}
                                  r={WIRE_TOOL_SNAP_RADIUS / zoom}
                                  fill="transparent"
                                  stroke="none"
                                  pointerEvents="all"
                                  onPointerDown={(event) =>
                                    handlePortClick(
                                      event,
                                      component.id,
                                      "wiper"
                                    )
                                  }
                                />
                              </>
                            )}

                            <circle
                              data-editor-only="true"
                              cx="0"
                              cy={-PORT_DISTANCE}
                              r={
                                (topPortSnapTarget
                                  ? 8
                                  : topPortActive
                                    ? 7
                                    : 5) *
                                connectorVisualScale
                              }
                              className={`terminal ${
                                topPortActive ? "terminal-active" : ""
                              }`}
                              style={{
                                opacity: connectorsVisible ? 1 : 0,
                                pointerEvents: connectorsVisible
                                  ? "auto"
                                  : "none",
                              }}
                              onPointerDown={(event) =>
                                handlePortClick(
                                  event,
                                  component.id,
                                  "top"
                                )
                              }
                            />
                            <circle
                              data-editor-only="true"
                              cx="0"
                              cy={PORT_DISTANCE}
                              r={
                                (bottomPortSnapTarget
                                  ? 8
                                  : bottomPortActive
                                    ? 7
                                    : 5) *
                                connectorVisualScale
                              }
                              className={`terminal ${
                                bottomPortActive ? "terminal-active" : ""
                              }`}
                              style={{
                                opacity: connectorsVisible ? 1 : 0,
                                pointerEvents: connectorsVisible
                                  ? "auto"
                                  : "none",
                              }}
                              onPointerDown={(event) =>
                                handlePortClick(
                                  event,
                                  component.id,
                                  "bottom"
                                )
                              }
                            />
                            <circle
                              data-editor-only="true"
                              cx={getPotentiometerWiperOffset(
                                component
                              )}
                              cy={component.verticalFlip ? -40 : 40}
                              r={
                                (wiperPortSnapTarget
                                  ? 8
                                  : wiperPortActive
                                    ? 7
                                    : 5) *
                                connectorVisualScale
                              }
                              className={`terminal ${
                                wiperPortActive ? "terminal-active" : ""
                              }`}
                              style={{
                                opacity: connectorsVisible ? 1 : 0,
                                pointerEvents: connectorsVisible
                                  ? "auto"
                                  : "none",
                              }}
                              onPointerDown={(event) =>
                                handlePortClick(
                                  event,
                                  component.id,
                                  "wiper"
                                )
                              }
                            />
                          </>
                        )}
                      </g>

                      {component.type === "potential-divider" &&
                        [1, 2].map((index) => {
                          const field =
                            index === 1
                              ? "dividerLabel1"
                              : "dividerLabel2";
                          const value = component[field];
                          if (!value) return null;

                          const labelLayout =
                            getPotentialDividerLabelLayout(
                              component,
                              index
                            );

                          return (
                            <CircuitLabelText
                              key={field}
                              label={value}
                              x={labelLayout.x}
                              y={labelLayout.y}
                              textAnchor={labelLayout.textAnchor}
                              fontSize={
                                component.labelFontSize ?? 24
                              }
                              fontWeight={
                                component.labelBold ? 700 : 400
                              }
                              fontStyle={
                                component.labelItalic
                                  ? "italic"
                                  : "normal"
                              }
                              fontFamily={circuitTextFontFamily}
                              onPointerDown={(event) =>
                                startComponentDrag(event, component)
                              }
                            />
                          );
                        })}

                      {component.type !== "potential-divider" &&
                        component.type !== "wire-segment" &&
                        component.label &&
                        (() => {
                          const labelLayout =
                            getComponentLabelLayout(component);

                          return (
                            <CircuitLabelText
                              label={component.label}
                              x={labelLayout.x}
                              y={labelLayout.y}
                              textAnchor={labelLayout.textAnchor}
                              fontSize={
                                component.labelFontSize ??
                                (component.type === "label" ? 26 : 24)
                              }
                              fontWeight={
                                component.labelBold ? 700 : 400
                              }
                              fontStyle={
                                component.labelItalic
                                  ? "italic"
                                  : "normal"
                              }
                              fontFamily={circuitTextFontFamily}
                              onPointerDown={(event) =>
                                startComponentDrag(event, component)
                              }
                            />
                          );
                        })()}
                    </g>
                  );
                })}

                {mode === "select" &&
                  selectedComponents
                    .filter(
                      (component) =>
                        component.type === "wire-segment"
                    )
                    .map((component) => {
                      const portDistance =
                        getComponentPortDistance(component);

                      return (
                        <g
                          key={`${component.id}-priority-wire-handles`}
                          data-editor-only="true"
                          transform={`translate(${component.x} ${component.y}) rotate(${component.rotation})`}
                        >
                          {["left", "right"].map((end) => {
                            const x =
                              end === "left"
                                ? -portDistance
                                : portDistance;

                            return (
                              <g key={end}>
                                <circle
                                  cx={x}
                                  cy="0"
                                  r={16 * connectorVisualScale}
                                  fill="transparent"
                                  stroke="none"
                                  pointerEvents="all"
                                  style={{ cursor: "pointer" }}
                                  onPointerDown={(event) =>
                                    startWireSegmentResize(
                                      event,
                                      component,
                                      end
                                    )
                                  }
                                />
                                {connectorsVisible && (
                                  <circle
                                    cx={x}
                                    cy="0"
                                    r={5.5 * connectorVisualScale}
                                    className="terminal"
                                    fill="#3b82f6"
                                    pointerEvents="none"
                                  />
                                )}
                              </g>
                            );
                          })}
                        </g>
                      );
                    })}
              </g>

              {mode === "wire" &&
                blackJunctionTargets.map((target, index) => (
                  <circle
                    key={`black-junction-hit-${index}`}
                    data-editor-only="true"
                    cx={target.position.x}
                    cy={target.position.y}
                    r={BLACK_JUNCTION_SNAP_RADIUS / zoom}
                    fill="transparent"
                    stroke="none"
                    pointerEvents="all"
                    style={{ cursor: "crosshair" }}
                    onPointerDown={(event) =>
                      handleBlackJunctionClick(
                        event,
                        target
                      )
                    }
                  />
                ))}

              {marqueeSelection?.started && (
                <rect
                  data-editor-only="true"
                  x={Math.min(
                    marqueeSelection.startX,
                    marqueeSelection.currentX
                  )}
                  y={Math.min(
                    marqueeSelection.startY,
                    marqueeSelection.currentY
                  )}
                  width={Math.abs(
                    marqueeSelection.currentX -
                      marqueeSelection.startX
                  )}
                  height={Math.abs(
                    marqueeSelection.currentY -
                      marqueeSelection.startY
                  )}
                  rx="4"
                  fill="rgba(37, 99, 235, 0.10)"
                  stroke="#2563eb"
                  strokeWidth="1.5"
                  strokeDasharray="7 5"
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="none"
                />
              )}

              {!components.length && (
                <g
                  data-editor-only="true"
                  className="empty-state"
                  pointerEvents="none"
                >
                  <text x={WIDTH / 2} y={HEIGHT / 2 - 14}>
                    Drag a circuit symbol, wire or label here
                  </text>
                  <text x={WIDTH / 2} y={HEIGHT / 2 + 20}>
                    or click one in the palette
                  </text>
                </g>
              )}
              </svg>
            </div>
          </div>
        </section>

        <aside className="inspector">
          <h2>Inspector</h2>

          {selectedComponentIds.length > 1 ? (
            <>
              <p className="selected-name">
                {selectedComponentIds.length} components selected
              </p>
              <p className="hint">
                Drag any selected component to move the whole group. Use Rotate
                to turn the selection around its centre. Shift-click another
                component to add or remove it.
              </p>
            </>
          ) : selectedComponent ? (
            <>
              <div className="inspector-symbol">
                <PaletteIcon type={selectedComponent.type} />
              </div>
              {selectedComponent.type === "wire-segment" ? (
                <div
                  style={{
                    marginBottom: "12px",
                    padding: "9px 10px",
                    border: "1px solid #bfdbfe",
                    borderLeft: "4px solid #2563eb",
                    borderRadius: "9px",
                    background: "#eff6ff",
                  }}
                >
                  <p
                    className="selected-name"
                    style={{
                      margin: 0,
                      color: "#1d4ed8",
                    }}
                  >
                    Wire component created from pallate
                  </p>
                </div>
              ) : (
                <p className="selected-name">
                  {SYMBOL_LABEL_BY_TYPE.get(
                    selectedComponent.type
                  )}
                </p>
              )}

              {BINARY_SWITCH_TYPES.has(
                selectedComponent.type
              ) && (
                <div style={{ marginBottom: "18px" }}>
                  <div
                    style={{
                      marginBottom: "6px",
                      fontSize: "12px",
                      color: "#5d6e84",
                    }}
                  >
                    Switch state
                  </div>

                  <div
                    aria-label="Switch state"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                      gap: "6px",
                    }}
                  >
                    <button
                      type="button"
                      className={
                        selectedComponent.type === "switch-open"
                          ? "active"
                          : ""
                      }
                      onClick={() =>
                        setSelectedSwitchState("open")
                      }
                    >
                      Open
                    </button>

                    <button
                      type="button"
                      className={
                        selectedComponent.type === "switch-closed"
                          ? "active"
                          : ""
                      }
                      onClick={() =>
                        setSelectedSwitchState("closed")
                      }
                    >
                      Closed
                    </button>
                  </div>
                </div>
              )}

              {selectedComponent.type ===
                "switch-two-way" && (
                <div style={{ marginBottom: "18px" }}>
                  <div
                    style={{
                      marginBottom: "6px",
                      fontSize: "12px",
                      color: "#5d6e84",
                    }}
                  >
                    Switch position
                  </div>

                  <div
                    aria-label="Two-way switch position"
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(2, minmax(0, 1fr))",
                      gap: "6px",
                    }}
                  >
                    <button
                      type="button"
                      className={
                        (selectedComponent.switchPosition ??
                          "upper") === "upper"
                          ? "active"
                          : ""
                      }
                      onClick={() =>
                        setSelectedTwoWaySwitchPosition(
                          "upper"
                        )
                      }
                    >
                      Upper
                    </button>

                    <button
                      type="button"
                      className={
                        selectedComponent.switchPosition ===
                        "lower"
                          ? "active"
                          : ""
                      }
                      onClick={() =>
                        setSelectedTwoWaySwitchPosition(
                          "lower"
                        )
                      }
                    >
                      Lower
                    </button>
                  </div>
                </div>
              )}

              {selectedComponent.type === "wire-segment" && (
                <div
                  style={{
                    marginBottom: "12px",
                    padding: "7px 9px",
                    border: "1px solid #dfe6ef",
                    borderRadius: "9px",
                    background: "#f8fafc",
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    alignItems: "center",
                    gap: "10px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "12px",
                      fontWeight: 650,
                      color: "#526275",
                    }}
                  >
                    Current arrow
                  </span>

                  <div
                    aria-label="Current arrow direction"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, 34px)",
                      border: "1px solid #d5deea",
                      borderRadius: "7px",
                      overflow: "hidden",
                      background: "white",
                    }}
                  >
                    {[
                      { value: "none", label: "–", title: "No current arrow" },
                      { value: "left", label: "←", title: "Current arrow left" },
                      { value: "right", label: "→", title: "Current arrow right" },
                    ].map((option, index) => (
                      <button
                        key={option.value}
                        type="button"
                        className={
                          (selectedComponent.currentArrow ?? "none") ===
                          option.value
                            ? "active"
                            : ""
                        }
                        onClick={() =>
                          setSelectedWireCurrentArrow(option.value)
                        }
                        title={option.title}
                        aria-label={option.title}
                        style={{
                          minWidth: 0,
                          height: "28px",
                          padding: 0,
                          border: 0,
                          borderLeft:
                            index === 0
                              ? 0
                              : "1px solid #e2e8f0",
                          borderRadius: 0,
                          fontSize:
                            option.value === "none"
                              ? "16px"
                              : "19px",
                          lineHeight: 1,
                        }}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {selectedComponent.type === "potentiometer" && (
                <div
                  style={{
                    marginBottom: "12px",
                    padding: "7px 9px",
                    border: "1px solid #dfe6ef",
                    borderRadius: "9px",
                    background: "#f8fafc",
                    display: "grid",
                    gap: "7px",
                  }}
                >
                  <div
                    style={{
                      minHeight: "28px",
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      alignItems: "center",
                      gap: "10px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "12px",
                        fontWeight: 650,
                        color: "#526275",
                      }}
                    >
                      Wiper lead
                    </span>
                    <button
                      type="button"
                      onClick={flipSelectedPotentiometerVertically}
                      title="Flip the wiper lead"
                      aria-label="Flip wiper lead"
                      style={{
                        padding: "6px 10px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Flip
                    </button>
                  </div>

                  <div
                    style={{
                      minHeight: "28px",
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      alignItems: "center",
                      gap: "10px",
                    }}
                  >
                    <span
                      title="Distance from the resistor body to the wiper corner"
                      style={{
                        fontSize: "12px",
                        fontWeight: 650,
                        color: "#526275",
                      }}
                    >
                      Wiper offset
                    </span>

                    <div
                      aria-label="Wiper offset"
                      title="Distance from the resistor body to the wiper corner"
                      style={{
                        display: "grid",
                        gridTemplateColumns: "28px 34px 28px",
                        alignItems: "center",
                        border: "1px solid #d5deea",
                        borderRadius: "7px",
                        overflow: "hidden",
                        background: "white",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          adjustSelectedPotentiometerWiperOffset(-1)
                        }
                        disabled={
                          getPotentiometerWiperOffset(
                            selectedComponent
                          ) <= POTENTIOMETER_WIPER_OFFSET_MIN
                        }
                        title="Move the wiper corner closer"
                        aria-label="Decrease wiper offset"
                        style={{
                          minWidth: 0,
                          height: "26px",
                          padding: 0,
                          border: 0,
                          borderRight: "1px solid #e2e8f0",
                          borderRadius: 0,
                          fontSize: "17px",
                          lineHeight: 1,
                          background: "transparent",
                        }}
                      >
                        −
                      </button>

                      <div
                        aria-live="polite"
                        style={{
                          textAlign: "center",
                          fontSize: "13px",
                          fontWeight: 700,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {getPotentiometerWiperOffset(
                          selectedComponent
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          adjustSelectedPotentiometerWiperOffset(1)
                        }
                        disabled={
                          getPotentiometerWiperOffset(
                            selectedComponent
                          ) >= POTENTIOMETER_WIPER_OFFSET_MAX
                        }
                        title="Move the wiper corner farther away"
                        aria-label="Increase wiper offset"
                        style={{
                          minWidth: 0,
                          height: "26px",
                          padding: 0,
                          border: 0,
                          borderLeft: "1px solid #e2e8f0",
                          borderRadius: 0,
                          fontSize: "17px",
                          lineHeight: 1,
                          background: "transparent",
                        }}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {["cell", "battery"].includes(
                selectedComponent.type
              ) && (
                <div
                  style={{
                    marginBottom: "12px",
                    padding: "7px 9px",
                    border: "1px solid #dfe6ef",
                    borderRadius: "9px",
                    background: "#f8fafc",
                    display: "grid",
                    gap: "6px",
                  }}
                >
                  {selectedComponent.type === "cell" && (
                    <div
                      style={{
                        minHeight: "28px",
                        display: "grid",
                        gridTemplateColumns: "1fr auto",
                        alignItems: "center",
                        gap: "10px",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "12px",
                          fontWeight: 650,
                          color: "#526275",
                        }}
                      >
                        Cells
                      </span>

                      <div
                        aria-label="Number of cells"
                        title="Number of cells"
                        style={{
                          display: "grid",
                          gridTemplateColumns: "28px 30px 28px",
                          alignItems: "center",
                          border: "1px solid #d5deea",
                          borderRadius: "7px",
                          overflow: "hidden",
                          background: "white",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => adjustSelectedCellCount(-1)}
                          disabled={
                            (selectedComponent.cellCount ?? 1) <=
                            CELL_COUNT_MIN
                          }
                          title="Remove one cell"
                          aria-label="Remove one cell"
                          style={{
                            minWidth: 0,
                            height: "26px",
                            padding: 0,
                            border: 0,
                            borderRight: "1px solid #e2e8f0",
                            borderRadius: 0,
                            fontSize: "17px",
                            lineHeight: 1,
                            background: "transparent",
                          }}
                        >
                          −
                        </button>

                        <div
                          aria-live="polite"
                          style={{
                            textAlign: "center",
                            fontSize: "13px",
                            fontWeight: 700,
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {selectedComponent.cellCount ?? 1}
                        </div>

                        <button
                          type="button"
                          onClick={() => adjustSelectedCellCount(1)}
                          disabled={
                            (selectedComponent.cellCount ?? 1) >=
                            CELL_COUNT_MAX
                          }
                          title="Add one cell"
                          aria-label="Add one cell"
                          style={{
                            minWidth: 0,
                            height: "26px",
                            padding: 0,
                            border: 0,
                            borderLeft: "1px solid #e2e8f0",
                            borderRadius: 0,
                            fontSize: "17px",
                            lineHeight: 1,
                            background: "transparent",
                          }}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  )}

                  <label
                    style={{
                      minHeight: "28px",
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      alignItems: "center",
                      gap: "10px",
                      cursor: "pointer",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "12px",
                        fontWeight: 650,
                        color: "#526275",
                      }}
                    >
                      Show +
                    </span>

                    <input
                      type="checkbox"
                      checked={selectedComponent.showPolarity ?? true}
                      onChange={(event) =>
                        setSelectedPolarityMark(event.target.checked)
                      }
                      aria-label="Show positive polarity mark"
                      style={{
                        width: "16px",
                        height: "16px",
                        margin: 0,
                        accentColor: "#2563eb",
                        cursor: "pointer",
                      }}
                    />
                  </label>
                </div>
              )}

              {selectedComponent.type !== "wire-segment" &&
                (selectedComponent.type === "potential-divider" ? (
                <div
                  style={{
                    display: "grid",
                    gap: "10px",
                  }}
                >
                  <label>
                    Resistor 1
                    <input
                      ref={dividerLabel1InputRef}
                      value={selectedComponent.dividerLabel1 ?? ""}
                      onFocus={(event) =>
                        rememberLabelSelection(
                          event,
                          "dividerLabel1"
                        )
                      }
                      onChange={(event) => {
                        updateSelectedLabelField(
                          "dividerLabel1",
                          event.target.value
                        );
                        rememberLabelSelection(
                          event,
                          "dividerLabel1"
                        );
                      }}
                      onSelect={(event) =>
                        rememberLabelSelection(
                          event,
                          "dividerLabel1"
                        )
                      }
                      onClick={(event) =>
                        rememberLabelSelection(
                          event,
                          "dividerLabel1"
                        )
                      }
                      onKeyUp={(event) =>
                        rememberLabelSelection(
                          event,
                          "dividerLabel1"
                        )
                      }
                      placeholder="e.g. R₁ or 1 kΩ"
                      style={{
                        fontSize: "18px",
                        padding: "10px 12px",
                        minHeight: "44px",
                        fontWeight: selectedComponent.labelBold
                          ? 700
                          : 400,
                        fontStyle: selectedComponent.labelItalic
                          ? "italic"
                          : "normal",
                      }}
                    />
                  </label>

                  <label>
                    Resistor 2
                    <input
                      ref={dividerLabel2InputRef}
                      value={selectedComponent.dividerLabel2 ?? ""}
                      onFocus={(event) =>
                        rememberLabelSelection(
                          event,
                          "dividerLabel2"
                        )
                      }
                      onChange={(event) => {
                        updateSelectedLabelField(
                          "dividerLabel2",
                          event.target.value
                        );
                        rememberLabelSelection(
                          event,
                          "dividerLabel2"
                        );
                      }}
                      onSelect={(event) =>
                        rememberLabelSelection(
                          event,
                          "dividerLabel2"
                        )
                      }
                      onClick={(event) =>
                        rememberLabelSelection(
                          event,
                          "dividerLabel2"
                        )
                      }
                      onKeyUp={(event) =>
                        rememberLabelSelection(
                          event,
                          "dividerLabel2"
                        )
                      }
                      placeholder="e.g. R₂ or 2 kΩ"
                      style={{
                        fontSize: "18px",
                        padding: "10px 12px",
                        minHeight: "44px",
                        fontWeight: selectedComponent.labelBold
                          ? 700
                          : 400,
                        fontStyle: selectedComponent.labelItalic
                          ? "italic"
                          : "normal",
                      }}
                    />
                  </label>
                </div>
              ) : (
                <label>
                  Label
                  <input
                    ref={labelInputRef}
                    value={selectedComponent.label}
                    onFocus={(event) =>
                      rememberLabelSelection(event, "label")
                    }
                    onChange={(event) => {
                      updateSelectedLabel(event.target.value);
                      rememberLabelSelection(event, "label");
                    }}
                    onSelect={(event) =>
                      rememberLabelSelection(event, "label")
                    }
                    onClick={(event) =>
                      rememberLabelSelection(event, "label")
                    }
                    onKeyUp={(event) =>
                      rememberLabelSelection(event, "label")
                    }
                    placeholder="e.g. 220 Ω, 10 µF, 25 °C"
                    style={{
                      fontSize: "18px",
                      padding: "12px 14px",
                      minHeight: "48px",
                      fontWeight: selectedComponent.labelBold
                        ? 700
                        : 400,
                      fontStyle: selectedComponent.labelItalic
                        ? "italic"
                        : "normal",
                    }}
                  />
                </label>
              ))}

              {selectedComponent.type !== "wire-segment" && (
                <>
              <div
                aria-label="Insert common physics characters"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                  gap: "6px",
                  marginTop: "10px",
                }}
              >
                {LABEL_CHARACTERS.map(({ character, name }) => (
                  <button
                    key={character}
                    type="button"
                    title={`Insert ${name} (${character})`}
                    aria-label={`Insert ${name}`}
                    onMouseDown={(event) => {
                      // Keep the label input's cursor/selection in place.
                      event.preventDefault();
                    }}
                    onClick={() => insertLabelCharacter(character)}
                    style={{
                      padding: "7px 4px",
                      fontSize: "₁₂₃₄₅".includes(character)
                        ? "18px"
                        : "16px",
                      lineHeight: 1,
                    }}
                  >
                    {character}
                  </button>
                ))}
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  marginTop: "7px",
                }}
              >
                <button
                  type="button"
                  onMouseDown={(event) => {
                    // Preserve the current label cursor/selection.
                    event.preventDefault();
                  }}
                  onClick={() => {
                    setUnicodeSearch("");
                    setUnicodeCodePoint("");
                    setUnicodeCodePointStatus("");
                    setUnicodePickerOpen(true);
                  }}
                  title="Open the Unicode character picker"
                  aria-label="Open Unicode character picker"
                  style={{
                    padding: "5px 8px",
                    fontSize: "12px",
                    whiteSpace: "nowrap",
                  }}
                >
                  Unicode…
                </button>
              </div>
                </>
              )}

              {!["label", "potential-divider", "wire-segment"].includes(
                selectedComponent.type
              ) && (
                <>
                  <div
                    style={{
                      marginTop: "16px",
                      marginBottom: "6px",
                      fontSize: "12px",
                      color: "#5d6e84",
                    }}
                  >
                    Label position
                  </div>

                  <div
                    aria-label="Label position"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                      gap: "6px",
                    }}
                  >
                    {LABEL_POSITIONS.map(({ value, symbol, name }) => (
                      <button
                        key={value}
                        type="button"
                        className={
                          (selectedComponent.labelPosition ?? "below") ===
                          value
                            ? "active"
                            : ""
                        }
                        title={`Put label ${name.toLowerCase()}`}
                        aria-label={`Put label ${name.toLowerCase()}`}
                        onClick={() =>
                          updateSelectedLabelPosition(value)
                        }
                        style={{
                          padding: "7px 4px",
                          fontSize: "18px",
                          lineHeight: 1,
                        }}
                      >
                        {symbol}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {selectedComponent.type !== "wire-segment" && (
                <>
              <div
                style={{
                  marginTop: "16px",
                  marginBottom: "6px",
                  fontSize: "12px",
                  color: "#5d6e84",
                }}
              >
                Font size
              </div>

              <div
                aria-label="Label font size"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: "6px",
                }}
              >
                <button
                  type="button"
                  title="Decrease font size"
                  aria-label="Decrease font size"
                  onClick={() => adjustSelectedLabelFontSize(-1)}
                  style={{
                    padding: "7px 4px",
                    fontSize: "20px",
                    lineHeight: 1,
                  }}
                >
                  A−
                </button>
                <button
                  type="button"
                  title="Increase font size"
                  aria-label="Increase font size"
                  onClick={() => adjustSelectedLabelFontSize(1)}
                  style={{
                    padding: "7px 4px",
                    fontSize: "20px",
                    lineHeight: 1,
                  }}
                >
                  A+
                </button>
              </div>

              <div
                aria-label="Label text style"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: "6px",
                  marginTop: "6px",
                }}
              >
                <button
                  type="button"
                  className={selectedComponent.labelBold ? "active" : ""}
                  title="Bold label"
                  aria-label="Bold label"
                  aria-pressed={Boolean(selectedComponent.labelBold)}
                  onClick={() => toggleSelectedLabelStyle("bold")}
                  style={{
                    padding: "7px 4px",
                    fontSize: "18px",
                    fontWeight: 800,
                    lineHeight: 1,
                  }}
                >
                  B
                </button>
                <button
                  type="button"
                  className={selectedComponent.labelItalic ? "active" : ""}
                  title="Italic label"
                  aria-label="Italic label"
                  aria-pressed={Boolean(selectedComponent.labelItalic)}
                  onClick={() => toggleSelectedLabelStyle("italic")}
                  style={{
                    padding: "7px 4px",
                    fontSize: "18px",
                    fontStyle: "italic",
                    lineHeight: 1,
                  }}
                >
                  I
                </button>
              </div>
                </>
              )}

              <dl className="properties">
                <div>
                  <dt>Rotation</dt>
                  <dd>{selectedComponent.rotation}°</dd>
                </div>
                <div>
                  <dt>Position</dt>
                  <dd>
                    {Math.round(selectedComponent.x)},{" "}
                    {Math.round(selectedComponent.y)}
                  </dd>
                </div>
              </dl>

              <p className="hint">
                {selectedComponent.type === "label"
                  ? "Drag this annotation anywhere on the page."
                  : selectedComponent.type === "wire-segment"
                    ? "Drag either blue end to change this wire's length. In Wire mode, those ends can also be used as connection terminals."
                    : "Blue dots are connection terminals. Switch to Wire mode, then click two terminals."}
              </p>
            </>
          ) : selected?.kind === "wire" ? (
            <>
              <div
                style={{
                  marginBottom: "12px",
                  padding: "9px 10px",
                  border: "1px solid #c4b5fd",
                  borderLeft: "4px solid #7c3aed",
                  borderRadius: "9px",
                  background: "#f5f3ff",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "7px",
                    marginBottom: "3px",
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "999px",
                      background: "#7c3aed",
                      flex: "0 0 auto",
                    }}
                  />
                  <p
                    className="selected-name"
                    style={{
                      margin: 0,
                      color: "#5b21b6",
                    }}
                  >
                    Wire-tool wire
                  </p>
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: "12px",
                    lineHeight: 1.35,
                    color: "#6d5a8e",
                  }}
                >
                  Drawn with the Wire tool
                </p>
              </div>

              <div
                style={{
                  marginBottom: "12px",
                  padding: "7px 9px",
                  border: "1px solid #ddd6fe",
                  borderRadius: "9px",
                  background: "#faf8ff",
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  alignItems: "center",
                  gap: "10px",
                }}
              >
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: 650,
                    color: "#6d28d9",
                  }}
                >
                  Current arrows
                </span>

                <div
                  aria-label="Current arrow direction"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 34px)",
                    border: "1px solid #c4b5fd",
                    borderRadius: "7px",
                    overflow: "hidden",
                    background: "white",
                  }}
                >
                  {[
                    {
                      value: "none",
                      label: "–",
                      title: "No current arrows",
                    },
                    {
                      value: "reverse",
                      label: "←",
                      title: "Reverse current direction",
                    },
                    {
                      value: "forward",
                      label: "→",
                      title: "Forward current direction",
                    },
                  ].map((option, index) => (
                    <button
                      key={option.value}
                      type="button"
                      className={
                        (selectedWire?.currentArrow ?? "none") ===
                        option.value
                          ? "active"
                          : ""
                      }
                      onClick={() =>
                        setSelectedDrawnWireCurrentArrow(
                          option.value
                        )
                      }
                      title={option.title}
                      aria-label={option.title}
                      style={{
                        minWidth: 0,
                        height: "28px",
                        padding: 0,
                        border: 0,
                        borderLeft:
                          index === 0
                            ? 0
                            : "1px solid #ede9fe",
                        borderRadius: 0,
                        color:
                          (selectedWire?.currentArrow ?? "none") ===
                          option.value
                            ? "#5b21b6"
                            : "#5f6670",
                        background:
                          (selectedWire?.currentArrow ?? "none") ===
                          option.value
                            ? "#ede9fe"
                            : "white",
                        fontSize:
                          option.value === "none"
                            ? "16px"
                            : "19px",
                        lineHeight: 1,
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {selectedWireCanFlip && (
                <div
                  style={{
                    marginBottom: "12px",
                    padding: "7px 9px",
                    border: "1px solid #ddd6fe",
                    borderRadius: "9px",
                    background: "#faf8ff",
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    alignItems: "center",
                    gap: "10px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "12px",
                      fontWeight: 650,
                      color: "#6d28d9",
                    }}
                  >
                    Corner route
                  </span>
                  <button
                    type="button"
                    onClick={flipWireCorner}
                    title="Flip the wire corner (Space)"
                    aria-label="Flip wire corner"
                    style={{
                      minWidth: "72px",
                      padding: "6px 10px",
                      borderColor: "#c4b5fd",
                      color: "#5b21b6",
                      background: "#f5f3ff",
                    }}
                  >
                    Flip
                  </button>
                </div>
              )}

              <p className="hint">
                {selectedWire?.route === "c-shape"
                  ? "Drag the purple handle on the middle segment to move the C-shaped wire in or out."
                  : selectedWireCanFlip
                    ? "Use Flip above or press Space to switch to the other corner. Press Delete to remove the wire."
                    : "Press Delete to remove the wire."}
              </p>
            </>
          ) : (
            <p className="hint">
              Select a component to edit it. Shift-click components to select
              several and drag them together.
            </p>
          )}
        </aside>
      </main>

      {unicodePickerOpen && (
        <div
          role="presentation"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) {
              closeUnicodePicker();
            }
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            display: "grid",
            placeItems: "center",
            padding: "24px",
            background: "rgba(15, 23, 42, 0.32)",
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="unicode-picker-title"
            style={{
              width: "min(700px, calc(100vw - 36px))",
              maxHeight: "min(760px, calc(100vh - 48px))",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              border: "1px solid #cbd5e1",
              borderRadius: "14px",
              background: "white",
              boxShadow:
                "0 24px 70px rgba(15, 23, 42, 0.28)",
            }}
            onPointerDown={(event) =>
              event.stopPropagation()
            }
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
                padding: "14px 16px",
                borderBottom: "1px solid #e2e8f0",
              }}
            >
              <div>
                <h3
                  id="unicode-picker-title"
                  style={{
                    margin: 0,
                    fontSize: "18px",
                    color: "#1e293b",
                  }}
                >
                  Unicode characters
                </h3>
                <p
                  style={{
                    margin: "3px 0 0",
                    color: "#64748b",
                    fontSize: "12px",
                  }}
                >
                  Click a character to insert it at the current label cursor.
                </p>
              </div>

              <button
                type="button"
                onClick={closeUnicodePicker}
                aria-label="Close Unicode character picker"
                title="Close"
                style={{
                  width: "32px",
                  height: "32px",
                  padding: 0,
                  fontSize: "19px",
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "minmax(0, 1fr) minmax(220px, 0.55fr)",
                gap: "10px",
                padding: "12px 16px",
                borderBottom: "1px solid #e2e8f0",
                background: "#f8fafc",
              }}
            >
              <label
                style={{
                  display: "grid",
                  gap: "5px",
                  fontSize: "12px",
                  color: "#475569",
                }}
              >
                Search characters
                <input
                  autoFocus
                  value={unicodeSearch}
                  onChange={(event) =>
                    setUnicodeSearch(event.target.value)
                  }
                  placeholder="e.g. theta, arrow, U+03A9"
                  style={{
                    minWidth: 0,
                    padding: "8px 10px",
                  }}
                />
              </label>

              <label
                style={{
                  display: "grid",
                  gap: "5px",
                  fontSize: "12px",
                  color: "#475569",
                }}
              >
                Insert any code point
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: "6px",
                  }}
                >
                  <input
                    value={unicodeCodePoint}
                    onChange={(event) => {
                      setUnicodeCodePoint(
                        event.target.value
                      );
                      setUnicodeCodePointStatus("");
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        insertUnicodeCodePoint();
                      }
                    }}
                    placeholder="U+03C0"
                    aria-label="Unicode code point"
                    style={{
                      minWidth: 0,
                      padding: "8px 10px",
                      fontFamily:
                        'ui-monospace, SFMono-Regular, Menlo, monospace',
                    }}
                  />
                  <button
                    type="button"
                    onClick={insertUnicodeCodePoint}
                    style={{
                      padding: "7px 10px",
                    }}
                  >
                    Insert
                  </button>
                </div>
              </label>
            </div>

            {unicodeCodePointStatus && (
              <div
                role="status"
                style={{
                  padding: "7px 16px 0",
                  color: "#475569",
                  fontSize: "12px",
                }}
              >
                {unicodeCodePointStatus}
              </div>
            )}

            <div
              style={{
                flex: "1 1 auto",
                overflowY: "auto",
                padding: "10px 16px 16px",
              }}
            >
              {UNICODE_CATEGORIES.map((category) => {
                const entries =
                  filteredUnicodeCharacters.filter(
                    (entry) =>
                      entry.category === category
                  );

                if (!entries.length) {
                  return null;
                }

                return (
                  <section
                    key={category}
                    style={{
                      marginTop: "10px",
                    }}
                  >
                    <h4
                      style={{
                        margin: "0 0 7px",
                        color: "#475569",
                        fontSize: "12px",
                        fontWeight: 700,
                      }}
                    >
                      {category}
                    </h4>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(auto-fill, minmax(48px, 1fr))",
                        gap: "6px",
                      }}
                    >
                      {entries.map((entry) => {
                        const codePoint =
                          unicodeCodePointLabel(
                            entry.character
                          );

                        return (
                          <button
                            key={`${category}-${entry.character}`}
                            type="button"
                            onClick={() =>
                              insertUnicodePickerCharacter(
                                entry.character
                              )
                            }
                            title={`${entry.name} — ${codePoint}`}
                            aria-label={`Insert ${entry.name}, ${codePoint}`}
                            style={{
                              minWidth: 0,
                              height: "44px",
                              padding: "3px",
                              fontSize: "21px",
                              lineHeight: 1,
                              background: "white",
                            }}
                          >
                            {entry.character}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })}

              {!filteredUnicodeCharacters.length && (
                <div
                  style={{
                    padding: "28px 8px",
                    textAlign: "center",
                    color: "#64748b",
                    fontSize: "13px",
                  }}
                >
                  No listed characters match that search. You can still insert
                  any Unicode character by its U+ code point above.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
