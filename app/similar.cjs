const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const target = process.argv[2];
const searchDir = process.argv[3];
const topN = parseInt(process.argv[4] || '5', 10);

async function getThumb(p) {
  try {
    const buf = await sharp(p)
      .resize(16, 16, { fit: 'fill' })
      .grayscale()
      .raw()
      .toBuffer();
    return Array.from(buf);
  } catch (e) {
    return null;
  }
}

function dist(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return s / a.length;
}

function hamming(a, b) {
  let m = 0;
  const midA = a.reduce((x, y) => x + y, 0) / a.length;
  const midB = b.reduce((x, y) => x + y, 0) / b.length;
  for (let i = 0; i < a.length; i++) {
    if ((a[i] > midA) !== (b[i] > midB)) m++;
  }
  return m;
}

async function main() {
  const targetThumb = await getThumb(target);
  if (!targetThumb) {
    console.error('无法读取目标图片:', target);
    process.exit(1);
  }

  const files = fs.readdirSync(searchDir)
    .filter(f => /\.(jpg|jpeg|png|webp|bmp)$/i.test(f))
    .map(f => path.join(searchDir, f))
    .filter(p => path.resolve(p) !== path.resolve(target));

  const results = [];
  for (const p of files) {
    const thumb = await getThumb(p);
    if (!thumb) continue;
    results.push({
      path: p,
      mse: dist(targetThumb, thumb),
      hamming: hamming(targetThumb, thumb)
    });
  }

  results.sort((a, b) => a.mse - b.mse);
  const top = results.slice(0, topN);
  console.log(JSON.stringify(top, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
