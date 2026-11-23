/* 生产构建：esbuild 打包 → dist/
 * 不用 vite/rollup，构建产物是纯静态文件，可直接部署到 Cloudflare Pages。 */
import { spawnSync } from 'node:child_process';
import { rmSync, mkdirSync, copyFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

function esbuild(args) {
  const bin = path.join(root, 'node_modules', 'esbuild', 'bin', 'esbuild');
  const r = spawnSync(process.execPath, [bin, ...args], { stdio: 'inherit', cwd: root });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(path.join(dist, 'assets'), { recursive: true });

esbuild([
  'src/main.tsx',
  '--bundle',
  '--minify',
  '--format=esm',
  '--target=es2020',
  '--jsx=automatic',
  '--outdir=dist/assets',
  '--entry-names=[name]',
  '--asset-names=[name]-[hash]',
  '--define:process.env.NODE_ENV="production"',
  '--legal-comments=none',
  '--log-level=info',
]);

// 图标与 Cloudflare 配置
for (const f of ['favicon.svg', '_headers', '_redirects']) {
  const src = path.join(root, 'public', f);
  if (existsSync(src)) copyFileSync(src, path.join(dist, f));
}

// 入口 HTML
const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
    <meta name="theme-color" content="#0b0f14" />
    <meta name="description" content="新手驾驶模拟器：从上车准备到起步、直线行驶、靠边停车，一步一步教你开手动挡汽车。" />
    <title>新手驾驶模拟器 · 从上车到起步</title>
    <link rel="icon" type="image/svg+xml" href="./favicon.svg" />
    <link rel="stylesheet" href="./assets/main.css" />
  </head>
  <body>
    <div id="root"></div>
    <noscript>这个驾驶模拟器需要启用 JavaScript 和 WebGL。</noscript>
    <script type="module" src="./assets/main.js"></script>
  </body>
</html>
`;
writeFileSync(path.join(dist, 'index.html'), html, 'utf8');

console.log('\n✔ 构建完成 → dist/');
