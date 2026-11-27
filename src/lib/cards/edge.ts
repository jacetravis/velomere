export type EdgeFinish = "Matte" | "Shine" | "Metallic";

export type EdgeLook = {
  name: string;
  finish: EdgeFinish;
  color: string;
  background: string;
};

type Stop = {
  at: number;
  name: string;
  finish: EdgeFinish;
  color: string;
  highlight: string;
};

const STOPS: Stop[] = [
  { at: 0, name: "Ink", finish: "Matte", color: "#2c2926", highlight: "#3a3632" },
  { at: 18, name: "Stone", finish: "Matte", color: "#8d877e", highlight: "#a8a197" },
  { at: 36, name: "Cream", finish: "Matte", color: "#e6dfd2", highlight: "#f4efe6" },
  { at: 52, name: "Pearl", finish: "Shine", color: "#cfc9be", highlight: "#fbfaf7" },
  { at: 68, name: "Silver", finish: "Metallic", color: "#b7b3ac", highlight: "#f7f6f4" },
  { at: 84, name: "Gold", finish: "Metallic", color: "#c6b48a", highlight: "#f8f1dc" },
  { at: 100, name: "Pewter", finish: "Metallic", color: "#7e8684", highlight: "#e7eeec" },
];

const TRACK =
  "linear-gradient(90deg, #2c2926 0%, #8d877e 18%, #e6dfd2 36%, #cfc9be 52%, #b7b3ac 68%, #c6b48a 84%, #7e8684 100%)";

function channels(color: string) {
  if (color.startsWith("#")) {
    const value = color.replace("#", "");
    return [0, 2, 4].map((index) => Number.parseInt(value.slice(index, index + 2), 16));
  }
  return color.match(/\d+/g)!.slice(0, 3).map(Number);
}

function mix(from: string, to: string, amount: number) {
  const left = channels(from);
  const right = channels(to);
  const mixed = left.map((part, index) => Math.round(part + (right[index] - part) * amount));
  return `rgb(${mixed[0]} ${mixed[1]} ${mixed[2]})`;
}

function paint(finish: EdgeFinish, color: string, highlight: string) {
  if (finish === "Matte") return color;
  return mix(color, highlight, 0.16);
}

function hsl(color: string) {
  const [r, g, b] = channels(color).map((part) => part / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const light = (max + min) / 2;
  const delta = max - min;
  let hue = 0;
  let sat = 0;
  if (delta !== 0) {
    sat = delta / (1 - Math.abs(2 * light - 1));
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  return { hue, sat, light };
}

function fromHsl(hue: number, sat: number, light: number) {
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - c / 2;
  const sector = Math.floor(hue / 60) % 6;
  const rgb =
    sector === 0
      ? [c, x, 0]
      : sector === 1
        ? [x, c, 0]
        : sector === 2
          ? [0, c, x]
          : sector === 3
            ? [0, x, c]
            : sector === 4
              ? [x, 0, c]
              : [c, 0, x];
  return `rgb(${rgb.map((part) => Math.round((part + m) * 255)).join(" ")})`;
}

export function colorTrack() {
  return "linear-gradient(90deg, #c8c4bc 0%, #d85a5a 14%, #d89a4e 30%, #c9c45a 44%, #5aaa62 58%, #4eaaa8 72%, #5a78c4 86%, #a85ab8 100%)";
}

export function colorName(value: number) {
  if (value <= 0) return "Neutral";
  const names = ["Rose", "Amber", "Gold", "Olive", "Green", "Teal", "Blue", "Violet"];
  return names[Math.min(names.length - 1, Math.floor(((value - 1) / 99) * names.length))];
}

function tint(color: string, value: number) {
  if (value <= 0) return color;
  const { hue, sat, light } = hsl(color);
  const turn = ((value - 1) / 99) * 360;
  const nextSat = Math.max(sat, 0.34);
  return fromHsl((hue + turn) % 360, Math.min(0.62, nextSat), light);
}

function tune(color: string, saturation: number, luminous: number) {
  const { hue, sat, light } = hsl(color);
  const satTurn = (Math.min(100, Math.max(0, saturation)) - 50) / 50;
  const lightTurn = (Math.min(100, Math.max(0, luminous)) - 50) / 50;
  const nextSat = satTurn < 0 ? sat * (1 + satTurn) : sat + (1 - sat) * satTurn;
  const nextLight = lightTurn < 0 ? light * (1 + lightTurn) : light + (1 - light) * lightTurn;
  return fromHsl(hue, Math.min(1, Math.max(0, nextSat)), Math.min(1, Math.max(0, nextLight)));
}

export function edgeTrack() {
  return TRACK;
}

export function edgeLook(value: number, color = 0, saturation = 50, luminous = 50): EdgeLook {
  const at = Math.min(100, Math.max(0, value));
  let lower = STOPS[0];
  let upper = STOPS[STOPS.length - 1];
  for (let index = 0; index < STOPS.length - 1; index += 1) {
    if (at >= STOPS[index].at && at <= STOPS[index + 1].at) {
      lower = STOPS[index];
      upper = STOPS[index + 1];
      break;
    }
  }
  const span = Math.max(1, upper.at - lower.at);
  const amount = (at - lower.at) / span;
  const finish = amount < 0.5 ? lower.finish : upper.finish;
  const base = mix(lower.color, upper.color, amount);
  const gleam = mix(lower.highlight, upper.highlight, amount);
  const painted = tune(tint(base, color), saturation, luminous);
  const highlight = tune(tint(gleam, color), saturation, luminous);
  return {
    name: amount < 0.5 ? lower.name : upper.name,
    finish,
    color: painted,
    background: paint(finish, painted, highlight),
  };
}

/** A fraction of a degree, stable per sheet, so a squared deck is not a perfect block. */
export function sheetLean(index: number) {
  const tilt = Math.sin(index * 2.399963 + 0.37) * 0.42;
  const slip = Math.cos(index * 1.713 + 0.2) * 0.4;
  return { tilt, slip };
}

/** A whisper of lighter and darker stock so stacked paper is not one flat face. */
export function paperTone(color: string, index: number) {
  const lift = Math.sin(index * 2.17 + 0.4) * 0.05;
  return mix(color, lift >= 0 ? "#f6f0e4" : "#3c342c", Math.abs(lift));
}
