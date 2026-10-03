// scripts/generate-icons.js
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function buildIcons() {
  const svgPath = path.join(__dirname, '../public/app-icon.svg');
  const svgBuffer = fs.readFileSync(svgPath);

  const targets = [
    { file: '../public/icons/icon-512x512.png', size: 512 },
    { file: '../public/icons/icon-192x192.png', size: 192 },
    { file: '../public/icons/icon-96x96.png', size: 96 },
    { file: '../public/icons/apple-icon-180.png', size: 180 },
    { file: '../public/icons/apple-touch-icon.png', size: 180 },
    { file: '../public/icons/manifest-icon-512.maskable.png', size: 512 },
    { file: '../public/icons/manifest-icon-192.maskable.png', size: 192 },
    { file: '../public/logo.png', size: 512 },
    { file: '../public/favicon.ico', size: 64 }
  ];

  for (const t of targets) {
    const dest = path.join(__dirname, t.file);
    await sharp(svgBuffer)
      .resize(t.size, t.size)
      .png()
      .toFile(dest);
    console.log(`Generated: ${t.file} (${t.size}x${t.size})`);
  }

  console.log('All icons built successfully!');
}

buildIcons().catch(err => {
  console.error(err);
  process.exit(1);
});
