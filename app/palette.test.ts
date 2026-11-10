// The inbox's colours, checked as the accessibility convention asks: every badge's text is readable on its fill
// (WCAG AA, 4.5:1), the chart's bars stand out from the card (3:1), and the four state badges stay apart for
// readers with red-green or blue-yellow colour blindness. Read from globals.css itself, light and dark, so a changed
// colour is checked as it ships. Simulation: Machado, Oliveira and Fernandes (2009), full severity; distance: ΔE76 in
// CIELAB. Two badges count as apart when their fills or their text differ by at least 15.
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

type RGB = [number, number, number];

const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8");
const block = (start: number) => css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
const vars = (text: string) => Object.fromEntries([...text.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})/g)].map((m) => [m[1]!, m[2]!]));
const light = vars(block(css.indexOf(":root")));
const dark = { ...light, ...vars(block(css.indexOf(":root", css.indexOf("prefers-color-scheme: dark")))) };

const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as RGB;
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const unlin = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const luminance = (c: RGB) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const contrast = (a: RGB, b: RGB) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

const SIMULATIONS: Record<string, number[][] | null> = {
  "normal vision": null,
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
};
const simulate = (c: RGB, m: number[][] | null): RGB => {
  if (!m) return c;
  const l = c.map(lin);
  return m.map((row) => unlin(Math.min(1, Math.max(0, row[0]! * l[0]! + row[1]! * l[1]! + row[2]! * l[2]!)))) as RGB;
};
const lab = (c: RGB) => {
  const [r, g, b] = c.map(lin) as RGB;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
};
const deltaE = (a: RGB, b: RGB) => {
  const [p, q] = [lab(a), lab(b)];
  return Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);
};

// What each badge class in globals.css paints: [text, fill].
const badges = (v: Record<string, string>): Record<string, [string, string]> => ({
  "badge-open": [v.ink!, v.card!],
  "badge-review": [v.amber!, v["amber-soft"]!],
  "badge-done": [v.ok!, v["ok-soft"]!],
  "badge-off": [v.muted!, v.soft!],
});

for (const [mode, v] of Object.entries({ light, dark })) {
  test(`${mode}: every badge's text is readable on its fill, and the chart's bars on the card`, () => {
    for (const [name, [fg, bg]] of Object.entries(badges(v))) expect(contrast(hex(fg), hex(bg)), name).toBeGreaterThanOrEqual(4.5);
    expect(contrast(hex(v.accent!), hex(v.card!)), "chart bars").toBeGreaterThanOrEqual(3);
  });

  test(`${mode}: the state badges stay apart with each kind of colour blindness`, () => {
    const list = Object.entries(badges(v));
    for (const [vision, m] of Object.entries(SIMULATIONS))
      for (let i = 0; i < list.length; i++)
        for (let j = i + 1; j < list.length; j++) {
          const [[a, [afg, abg]], [b, [bfg, bbg]]] = [list[i]!, list[j]!];
          const apart = Math.max(deltaE(simulate(hex(abg), m), simulate(hex(bbg), m)), deltaE(simulate(hex(afg), m), simulate(hex(bfg), m)));
          expect(apart, `${a} and ${b}, ${vision}`).toBeGreaterThanOrEqual(15);
        }
  });
}
