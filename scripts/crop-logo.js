import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const publicDir = path.join(__dirname, '../public');
const logoPngPath = path.join(publicDir, 'DayTune_logo.png');
const outputWebpPath = path.join(publicDir, 'DayTune_logo.webp');

async function cropAndResizeLogo() {
  await sharp(logoPngPath)
    .trim() // Auto-crop transparent space
    .resize(1024, 1024, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toFormat('webp')
    .toFile(outputWebpPath);
  console.log('Cropped and resized logo saved as DayTune_logo.webp (1024x1024)');
}

cropAndResizeLogo().catch(console.error); 