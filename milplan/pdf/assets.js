const fs = require('fs');
const path = require('path');

// Logos extraídos do próprio SS-Milplan-031.pdf (imagens embutidas no documento oficial).
const valeLogoBuffer = fs.readFileSync(path.join(__dirname, 'assets', 'vale-logo.png'));
const milplanLogoBuffer = fs.readFileSync(path.join(__dirname, 'assets', 'milplan-logo.png'));

module.exports = { valeLogoBuffer, milplanLogoBuffer };
