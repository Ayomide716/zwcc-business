#!/usr/bin/env node
/**
 * Generates the navy-branded app icon, splash mark and adaptive-icon layers.
 *
 * Why generate rather than ship binaries: the official ZWCC artwork was not
 * available when this was built, and a checked-in placeholder PNG tends to
 * survive into production unnoticed. Generating from the same geometry as the
 * in-app `LogoMark` keeps the brand consistent, and regenerating after dropping
 * in the real artwork is one command.
 *
 * TO USE THE OFFICIAL LOGO INSTEAD:
 *   Replace assets/icon.png, assets/splash-icon.png and
 *   assets/android-icon-foreground.png with the supplied artwork at the sizes
 *   noted below, and delete this script from `npm run assets:brand`.
 *
 *   icon.png                    1024x1024, no transparency, no rounded corners
 *   splash-icon.png              512x512,  transparent background
 *   android-icon-foreground.png  432x432,  transparent, art within centre 264px
 *   android-icon-monochrome.png  432x432,  transparent, single colour
 *
 * Usage: npm run assets:brand
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ASSETS = path.join(__dirname, '..', 'assets');

/* Brand colours, kept in step with src/theme/index.ts. */
const NAVY = [11, 37, 69];
const NAVY_DEEP = [6, 22, 48];
const WHITE = [255, 255, 255];
const GOLD = [194, 154, 46];

/* -------------------------------------------------------------------------- */
/* Minimal PNG encoder                                                         */
/* -------------------------------------------------------------------------- */

function crc32(buffer) {
  let crc = ~0;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);

  return Buffer.concat([length, typeAndData, crc]);
}

/** Encode RGBA pixel data as a PNG. */
function encodePng(width, height, pixels) {
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  // Each scanline is prefixed with a filter byte (0 = none).
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    pixels.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    header,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* -------------------------------------------------------------------------- */
/* Drawing                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A tiny software rasteriser. Everything is drawn by testing each pixel against
 * signed-distance functions, with 3x3 supersampling for smooth edges — enough
 * for the simple geometric mark, and it keeps the script dependency-free.
 */
function createCanvas(size) {
  return { size, pixels: Buffer.alloc(size * size * 4) };
}

function blend(canvas, x, y, colour, alpha) {
  if (alpha <= 0) return;
  const index = (y * canvas.size + x) * 4;
  const existing = canvas.pixels[index + 3] / 255;
  const out = alpha + existing * (1 - alpha);

  for (let channel = 0; channel < 3; channel += 1) {
    const src = colour[channel];
    const dst = canvas.pixels[index + channel];
    canvas.pixels[index + channel] = Math.round(
      (src * alpha + dst * existing * (1 - alpha)) / (out || 1),
    );
  }
  canvas.pixels[index + 3] = Math.round(out * 255);
}

/** Fill every pixel whose supersampled coverage of `test` is non-zero. */
function fill(canvas, colour, test) {
  const SAMPLES = 3;
  const step = 1 / (SAMPLES + 1);

  for (let y = 0; y < canvas.size; y += 1) {
    for (let x = 0; x < canvas.size; x += 1) {
      let hits = 0;

      for (let sy = 1; sy <= SAMPLES; sy += 1) {
        for (let sx = 1; sx <= SAMPLES; sx += 1) {
          if (test(x + sx * step, y + sy * step)) hits += 1;
        }
      }

      if (hits > 0) blend(canvas, x, y, colour, hits / (SAMPLES * SAMPLES));
    }
  }
}

const distance = (x, y, px, py) => Math.hypot(x - px, y - py);

/** Distance from a point to a line segment — used to draw strokes. */
function distanceToSegment(x, y, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;

  const t =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lengthSquared));

  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}

/**
 * Draws the ZWCC mark: an arch (stewardship) containing an upward chevron
 * (growth) with a gold stem and keystone. Same geometry as
 * src/components/brand/Logo.tsx, expressed in a 0..1 coordinate space.
 *
 * The art spans y 0.20..0.74 in unit space, so a +0.03 shift centres it.
 */
function drawMark(canvas, { stroke = WHITE, accent = GOLD, scale = 1 } = {}) {
  const s = canvas.size;
  const CENTRING_SHIFT = 0.03;

  // Map unit coordinates into the canvas, honouring `scale` about the centre.
  const u = (value) => (value * scale + (1 - scale) / 2) * s;
  const v = (value) => u(value + CENTRING_SHIFT);

  const weight = s * 0.045 * scale;
  const cx = u(0.5);
  const cy = v(0.5);
  const radius = s * 0.3 * scale;

  // Arch: a ring left open at the bottom so it reads as an arch, not a circle.
  // atan2 is y-down here, so the bottom of the shape is around +PI/2.
  fill(canvas, stroke, (x, y) => {
    if (Math.abs(distance(x, y, cx, cy) - radius) > weight / 2) return false;
    const angle = Math.atan2(y - cy, x - cx);
    const inBottomGap = angle > Math.PI * 0.3 && angle < Math.PI * 0.7;
    return !inBottomGap;
  });

  // Chevron: two arms meeting at an apex, pointing up.
  const apexX = u(0.5);
  const apexY = v(0.44);
  const armY = v(0.6);

  fill(canvas, stroke, (x, y) => {
    return (
      distanceToSegment(x, y, u(0.33), armY, apexX, apexY) < weight * 0.6 ||
      distanceToSegment(x, y, apexX, apexY, u(0.67), armY) < weight * 0.6
    );
  });

  // Gold stem, implying a cross with the chevron's crossbar.
  fill(canvas, accent, (x, y) => {
    return distanceToSegment(x, y, apexX, apexY, apexX, v(0.7)) < weight * 0.5;
  });

  // Gold keystone dot.
  fill(canvas, accent, (x, y) => distance(x, y, apexX, v(0.3)) < s * 0.032 * scale);
}

/* -------------------------------------------------------------------------- */
/* Outputs                                                                     */
/* -------------------------------------------------------------------------- */

function solid(canvas, colour) {
  fill(canvas, colour, () => true);
}

function write(name, buffer) {
  const target = path.join(ASSETS, name);
  fs.writeFileSync(target, buffer);
  console.log(`  ${name}  (${(buffer.length / 1024).toFixed(1)} KB)`);
}

function main() {
  if (!fs.existsSync(ASSETS)) fs.mkdirSync(ASSETS, { recursive: true });

  console.log('Generating ZWCC brand assets…');

  // App icon: navy field, white mark. No transparency, no rounded corners —
  // both platforms apply their own masking.
  const icon = createCanvas(1024);
  solid(icon, NAVY);
  drawMark(icon, { scale: 0.86 });
  write('icon.png', encodePng(1024, 1024, icon.pixels));

  // Splash mark: transparent, sits on the navy splash background from app.json.
  const splash = createCanvas(512);
  drawMark(splash, { scale: 0.92 });
  write('splash-icon.png', encodePng(512, 512, splash.pixels));

  // Android adaptive icon: art must stay inside the middle 66% safe zone.
  const foreground = createCanvas(432);
  drawMark(foreground, { scale: 0.62 });
  write('android-icon-foreground.png', encodePng(432, 432, foreground.pixels));

  const background = createCanvas(432);
  solid(background, NAVY);
  write('android-icon-background.png', encodePng(432, 432, background.pixels));

  // Monochrome layer for Android themed icons: single colour, no gold.
  const monochrome = createCanvas(432);
  drawMark(monochrome, { scale: 0.62, stroke: WHITE, accent: WHITE });
  write('android-icon-monochrome.png', encodePng(432, 432, monochrome.pixels));

  // Favicon, for `expo start --web`.
  const favicon = createCanvas(96);
  solid(favicon, NAVY_DEEP);
  drawMark(favicon, { scale: 0.86 });
  write('favicon.png', encodePng(96, 96, favicon.pixels));

  console.log('Done.');
}

main();
