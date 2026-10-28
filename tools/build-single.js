// Empaqueta index.html + css + js en un único archivo: dist/conquista-mundial.html
// Con --fragment genera solo el contenido (sin <html>/<head>/<body>) para plataformas que añaden su propio esqueleto.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const fragment = process.argv.includes('--fragment');
let html = read('index.html');
const css = `<style>\n${read('css/style.css')}\n</style>`;
const scripts = src => `<script>\n${read(src).replace(/<\/script>/gi, '<\\/script>')}\n</script>`;
html = html.replace(/<link rel="stylesheet" href="css\/style.css">/, () => css);
html = html.replace(/<script src="(js\/[^"]+)"><\/script>/g, (m, src) => scripts(src));
if (fragment) {
  const title = (html.match(/<title>[\s\S]*?<\/title>/) || [''])[0];
  const style = (html.match(/<style>[\s\S]*?<\/style>/) || [''])[0];
  const body = html.match(/<body>([\s\S]*)<\/body>/)[1];
  html = `${title}\n${style}\n${body}\n`;
}
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist', fragment ? 'artifact-fragment.html' : 'conquista-mundial.html');
fs.writeFileSync(out, html);
console.log('OK', out, (html.length / 1024).toFixed(0) + ' KB');
