'use strict';

// index.html の <script src> を中身に置き換えて、1ファイルにまとめる
//   node tools/build.js <出力先> [--fragment]
// --fragment を付けると <html>・<head>・<body> を除いた本文だけを書き出す
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const [out, flag] = process.argv.slice(2);
if (!out) {
  console.error('使い方: node tools/build.js <出力先> [--fragment]');
  process.exit(1);
}

let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) => {
  const code = fs.readFileSync(path.join(root, src), 'utf8');
  return `<script>\n${code.replace(/<\/script/gi, '<\\/script')}</script>`;
});

if (flag === '--fragment') {
  const start = html.indexOf('<!-- fragment:start -->');
  const headEnd = html.indexOf('<!-- fragment:head-end -->');
  const bodyStart = html.indexOf('<body>') + '<body>'.length;
  const end = html.indexOf('<!-- fragment:end -->');
  html = html.slice(start, headEnd) + html.slice(bodyStart, end);
}

fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
fs.writeFileSync(out, html);
console.log(`${out} に書き出しました（${Math.round(html.length / 1024)} KB）`);
