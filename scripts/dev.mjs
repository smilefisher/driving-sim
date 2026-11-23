/* 本地开发：esbuild watch 持续打包 + 静态服务器 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(path.join(root, 'dist', 'assets'), { recursive: true });

const bin = path.join(root, 'node_modules', 'esbuild', 'bin', 'esbuild');
const child = spawn(
  process.execPath,
  [
    bin,
    'src/main.tsx',
    '--bundle',
    '--format=esm',
    '--target=es2020',
    '--jsx=automatic',
    '--sourcemap',
    '--outdir=dist/assets',
    '--entry-names=[name]',
    '--asset-names=[name]-[hash]',
    '--define:process.env.NODE_ENV="development"',
    '--watch',
    '--log-level=warning',
  ],
  { stdio: 'inherit', cwd: root }
);

console.log('esbuild watch 已启动（首次构建约 1 秒）');
process.on('SIGINT', () => {
  child.kill();
  process.exit(0);
});

// 静态服务：由于 watch 模式下 HTML 不会自动生成，这里手写一份
import { writeFileSync, copyFileSync, existsSync } from 'node:fs';
writeFileSync(
  path.join(root, 'dist', 'index.html'),
  `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover"/>
<title>新手驾驶模拟器</title><link rel="stylesheet" href="./assets/main.css"/></head>
<body><div id="root"></div><script type="module" src="./assets/main.js"></script></body></html>`,
  'utf8'
);
if (existsSync(path.join(root, 'public', 'favicon.svg'))) {
  copyFileSync(path.join(root, 'public', 'favicon.svg'), path.join(root, 'dist', 'favicon.svg'));
}

await import('./serve.mjs');
