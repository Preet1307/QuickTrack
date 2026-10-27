const fs = require('fs');
const path = require('path');

const frontendDirectory = path.join(__dirname, '..', 'frontend');
const publicDirectory = path.join(__dirname, '..', 'public');

fs.rmSync(publicDirectory, { recursive: true, force: true });
fs.mkdirSync(publicDirectory, { recursive: true });
fs.cpSync(frontendDirectory, publicDirectory, { recursive: true });

console.log('Copied frontend assets to public/.');
