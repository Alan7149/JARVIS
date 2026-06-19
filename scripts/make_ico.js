/**
 * Generate JARVIS ICO from SVG using sharp + png-to-ico
 * Usage: node scripts/make_ico.js
 */
const path = require('path');
const fs = require('fs');

const ASSETS = path.join(__dirname, '..', 'electron', 'assets');
const SVG_PATH = path.join(__dirname, '..', 'frontend', 'public', 'jarvis-icon.svg');

async function main() {
  const electronModules = path.join(__dirname, '..', 'electron', 'node_modules');
  const sharp = require(path.join(electronModules, 'sharp'));
  const pngToIco = require(path.join(electronModules, 'png-to-ico'));

  const svgData = fs.readFileSync(SVG_PATH);
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const pngBuffers = [];

  for (const size of sizes) {
    const buf = await sharp(svgData).resize(size, size).png().toBuffer();
    pngBuffers.push(buf);
    console.log(`  ${size}x${size} PNG generated`);
  }

  // Save main PNGs
  fs.writeFileSync(path.join(ASSETS, 'icon.png'), pngBuffers[6]); // 256px
  fs.writeFileSync(path.join(ASSETS, 'tray-icon.png'), pngBuffers[2]); // 32px
  fs.writeFileSync(path.join(__dirname, '..', 'frontend', 'public', 'favicon.png'), pngBuffers[2]);
  console.log('  Saved icon.png, tray-icon.png, favicon.png');

  // Build ICO
  const icoFn = pngToIco.default || pngToIco.imagesToIco || pngToIco;
  const icoBuffer = await icoFn(pngBuffers);
  fs.writeFileSync(path.join(ASSETS, 'icon.ico'), icoBuffer);
  console.log(`  Saved icon.ico (${icoBuffer.length} bytes)`);
  console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
