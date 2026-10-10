// Draws the raster brand files from their sources: node scripts/brand.mjs
// app/icon.svg is the source of the mark; the others are written next to it and committed.
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import sharp from "sharp";

const app = new URL("../app/", import.meta.url);
const glyph = `<path d="M3 7.5 10 3l7 4.5V16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z"/><path d="M3 7.5h14M10 7.5V17"/>`;

// iOS rounds the corners itself, so the tile runs to the edge.
const apple = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180"><rect width="180" height="180" fill="#176b5c"/><g fill="none" stroke="#fff" stroke-width="2.2" stroke-linejoin="round" transform="translate(20 20) scale(7)">${glyph}</g></svg>`;
await sharp(Buffer.from(apple)).png().toFile(new URL("apple-icon.png", app).pathname);

// favicon.ico for the clients that never read the SVG: 16 and 32 px PNGs in one ICO.
const icon = readFileSync(new URL("icon.svg", app));
const sizes = [16, 32];
const pngs = await Promise.all(sizes.map((s) => sharp(icon, { density: 384 }).resize(s, s).png().toBuffer()));
const head = Buffer.alloc(6 + 16 * sizes.length);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(sizes.length, 4);
let offset = head.length;
sizes.forEach((s, i) => {
  const at = 6 + 16 * i;
  head[at] = s;
  head[at + 1] = s;
  head.writeUInt16LE(1, at + 4);
  head.writeUInt16LE(32, at + 6);
  head.writeUInt32LE(pngs[i].length, at + 8);
  head.writeUInt32LE(offset, at + 12);
  offset += pngs[i].length;
});
writeFileSync(new URL("favicon.ico", app), Buffer.concat([head, ...pngs]));

// The share image: the product's own table, in its own colors and type.
const font = (file, weight) => `@font-face{font-family:A;font-weight:${weight};src:url(data:font/woff2;base64,${readFileSync(new URL(`fonts/${file}`, app)).toString("base64")})}`;
const rows = [
  ["Broken link on the pricing page", "report", "open", "Open", "#fff", "#1b2229", "#1b2229"],
  ["Wrong date in the footer", "report", "review", "In review", "#f8ecd2", "#8a5a0b", "#8a5a0b66"],
  ["Spam in the comments", "report", "done", "Acted on", "#e2efeb", "#176b5c", "#176b5c66"],
];
const html = `<!doctype html><meta charset=utf-8><style>
${font("regular.woff2", 400)}${font("bold.woff2", 700)}
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;padding:64px 72px;background:#f6f7f5;color:#1b2229;font:400 26px/1.3 A;overflow:hidden}
.brand{display:flex;align-items:center;gap:16px;font-weight:700;font-size:34px;letter-spacing:-.01em}
h1{margin-top:44px;font-size:72px;line-height:1.08;letter-spacing:-.025em;font-weight:700}
.sheet{margin-top:44px;border:2px solid #dfe3e2;border-radius:10px;background:#fff}
.row{display:flex;align-items:center;gap:24px;height:68px;padding:0 28px;border-top:2px solid #dfe3e2}
.row:first-child{border-top:0}
.row b{flex:1;font-weight:700}
.row span{color:#5f6b74;width:120px}
.badge{border:2px solid;border-radius:99px;padding:2px 18px;font-weight:700;font-size:23px;width:160px;text-align:center}
</style>
<div class=brand><svg width=56 height=56 viewBox="0 0 32 32"><rect width=32 height=32 rx=7 fill="#176b5c"/><g fill=none stroke="#fff" stroke-width=2.4 stroke-linejoin=round transform="translate(3 3) scale(1.3)">${glyph}</g></svg>noticebox</div>
<h1>An inbox for the forms<br>on static pages.</h1>
<div class=sheet>${rows.map(([t, k, , s, bg, fg, bd]) => `<div class=row><b>${t}</b><span>${k}</span><div class=badge style="background:${bg};color:${fg};border-color:${bd}">${s}</div></div>`).join("")}</div>`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: new URL("opengraph-image.png", app).pathname });
await browser.close();
