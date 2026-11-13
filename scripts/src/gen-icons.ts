/**
 * Генерация PNG-иконок PWA из web/public/logo.svg.
 * Запуск: npm run gen-icons
 */
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const SVG = path.join(ROOT, 'web', 'public', 'logo.svg');
const OUT = path.join(ROOT, 'web', 'public', 'icons');

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const svg = fs.readFileSync(SVG);

  for (const size of [192, 512]) {
    await sharp(svg, { density: 300 })
      .resize(size, size)
      .png()
      .toFile(path.join(OUT, `icon-${size}.png`));
    console.log(`icon-${size}.png готов`);
  }

  // maskable: логотип мельче, с запасом по краям (safe zone 80%)
  const inner = await sharp(svg, { density: 300 }).resize(410, 410).png().toBuffer();
  await sharp({
    create: { width: 512, height: 512, channels: 4, background: '#14231B' },
  })
    .composite([{ input: inner, left: 51, top: 51 }])
    .png()
    .toFile(path.join(OUT, 'icon-maskable-512.png'));
  console.log('icon-maskable-512.png готов');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
