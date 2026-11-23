/* 测试：打包并运行端到端流程验证（不需要浏览器） */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bin = path.join(root, 'node_modules', 'esbuild', 'bin', 'esbuild');

const build = spawnSync(
  process.execPath,
  [bin, 'scripts/flowtest.ts', '--bundle', '--platform=node', '--format=esm', '--outfile=.tmp/flowtest.mjs', '--log-level=warning'],
  { stdio: 'inherit', cwd: root }
);
if (build.status !== 0) process.exit(build.status ?? 1);

const run = spawnSync(process.execPath, ['.tmp/flowtest.mjs'], { stdio: 'inherit', cwd: root });
process.exit(run.status ?? 1);
