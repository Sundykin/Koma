const fs = require('fs');
const path = require('path');

const distDir = path.resolve(__dirname, '..', 'dist');
const runtimeDir = path.join(distDir, 'public', 'electron');
const cmdDir = path.join(distDir, 'cmd');
const cmdFile = path.join(cmdDir, 'bin.js');

if (!fs.existsSync(distDir)) {
  throw new Error(`[prepare-ee-core-runtime] dist directory not found: ${distDir}`);
}

fs.rmSync(runtimeDir, { recursive: true, force: true });
fs.mkdirSync(runtimeDir, { recursive: true });

for (const name of fs.readdirSync(distDir)) {
  if (name === 'public') {
    continue;
  }

  const source = path.join(distDir, name);
  const target = path.join(runtimeDir, name);
  fs.cpSync(source, target, { recursive: true });
}

const frontendPort = Number(process.env.KOMA_FRONTEND_PORT || 4173);
const cmdContent = `'use strict';\n\nmodule.exports = {\n  dev: {\n    frontend: {\n      protocol: 'http://',\n      hostname: '127.0.0.1',\n      port: ${frontendPort},\n      indexPath: 'index.html'\n    },\n    electron: {\n      loadingPage: '/public/html/loading.html'\n    }\n  }\n};\n`;

fs.mkdirSync(cmdDir, { recursive: true });
fs.writeFileSync(cmdFile, cmdContent, 'utf8');

console.log(`[prepare-ee-core-runtime] prepared runtime at ${runtimeDir}`);
console.log(`[prepare-ee-core-runtime] wrote cmd config at ${cmdFile}`);
