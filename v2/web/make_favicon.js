const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, 'public', 'simpulx_logo.png');
const img = fs.readFileSync(p);
const b64 = img.toString('base64');
const svg = `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <clipPath id="squircle">
      <rect width="512" height="512" rx="113" ry="113" />
    </clipPath>
  </defs>
  <image href="data:image/png;base64,${b64}" width="512" height="512" clip-path="url(#squircle)" preserveAspectRatio="xMidYMid slice" />
</svg>`;
fs.writeFileSync(path.join(__dirname, 'public', 'favicon_squircle.svg'), svg);
console.log('SVG created!');
