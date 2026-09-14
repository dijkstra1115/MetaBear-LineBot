import fs from 'node:fs';
const data=fs.readFileSync('public/logo.webp').toString('base64');
// Mask only the near-white canvas outside the badge. The white bear is protected.
const svg=`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1254" height="1254" viewBox="0 0 1254 1254"><defs><filter id="white-key" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 -20 -20 -20 0 58"/></filter></defs><image width="1254" height="1254" xlink:href="data:image/webp;base64,${data}" filter="url(#white-key)"/><circle cx="625" cy="515" r="300" fill="white"/></svg>`;
fs.writeFileSync('public/brand-mask.svg',svg);
