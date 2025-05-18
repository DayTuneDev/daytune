import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const publicDir = path.join(__dirname, '../public');
const srcPng = path.join(publicDir, 'DayTune_faviicon.png');

const sizes = [192, 512];

async function generateFavicons() {
  for (const size of sizes) {
    // WebP
    await sharp(srcPng)
      .resize(size, size)
      .toFormat('webp')
      .toFile(path.join(publicDir, `DayTune_faviicon-${size}.webp`));
    console.log(`Generated DayTune_faviicon-${size}.webp`);
    // PNG
    await sharp(srcPng)
      .resize(size, size)
      .toFormat('png')
      .toFile(path.join(publicDir, `DayTune_faviicon-${size}.png`));
    console.log(`Generated DayTune_faviicon-${size}.png`);
  }
}

generateFavicons().catch(console.error); 