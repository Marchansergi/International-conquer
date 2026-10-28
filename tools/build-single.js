// Empaqueta index.html + css + js en un único archivo: dist/conquista-mundial.html
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
let html = read('index.html');
html = html.replace(/<link rel="stylesheet" href="css\/style.css">/, () => `<style>\n${read('css/style.css')}\n</style>`);
html = html.replace(/<script src="(js\/[^"]+)"><\/script>/g, (m, src) => `<script>\n${read(src).replace(/<\/script>/gi, '<\\/script>')}\n</script>`);
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist', 'conquista-mundial.html');
fs.writeFileSync(out, html);
console.log('OK', out, (html.length / 1024).toFixed(0) + ' KB');
