import sharp from 'sharp';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function optimizeImage(inputPath, outputPath, options = {}) {
  const { width, height, quality = 80 } = options;
  
  try {
    const image = sharp(inputPath);
    const metadata = await image.metadata();
    
    // Calculate new dimensions if width/height provided
    let newWidth = width;
    let newHeight = height;
    if (width && !height) {
      newHeight = Math.round((width / metadata.width) * metadata.height);
    } else if (!width && height) {
      newWidth = Math.round((height / metadata.height) * metadata.width);
    }
    
    // Resize if dimensions provided
    if (newWidth && newHeight) {
      image.resize(newWidth, newHeight, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      });
    }
    
    // Convert to WebP
    await image
      .webp({ quality })
      .toFile(outputPath);
      
    console.log(`Optimized ${inputPath} -> ${outputPath}`);
    
    // Get file sizes
    const originalSize = (await fs.stat(inputPath)).size;
    const optimizedSize = (await fs.stat(outputPath)).size;
    const savings = ((originalSize - optimizedSize) / originalSize * 100).toFixed(1);
    
    console.log(`Size: ${(originalSize / 1024).toFixed(1)}KB -> ${(optimizedSize / 1024).toFixed(1)}KB (${savings}% smaller)`);
  } catch (error) {
    console.error(`Error optimizing ${inputPath}:`, error);
  }
}

async function main() {
  const publicDir = path.join(__dirname, '../public');
  const buildDir = path.join(__dirname, '../build');
  
  // Optimize logo
  await optimizeImage(
    path.join(publicDir, 'DayTune_logo.png'),
    path.join(publicDir, 'DayTune_logo.webp'),
    { width: 144, quality: 85 } // 144px for 3x retina displays
  );
  
  // Optimize favicon
  await optimizeImage(
    path.join(publicDir, 'DayTune_faviicon.png'),
    path.join(publicDir, 'DayTune_faviicon.webp'),
    { width: 32, quality: 85 } // 32px for favicon
  );
  
  // Copy optimized images to build directory
  await fs.copyFile(
    path.join(publicDir, 'DayTune_logo.webp'),
    path.join(buildDir, 'DayTune_logo.webp')
  );
  await fs.copyFile(
    path.join(publicDir, 'DayTune_faviicon.webp'),
    path.join(buildDir, 'DayTune_faviicon.webp')
  );
}

main().catch(console.error); 