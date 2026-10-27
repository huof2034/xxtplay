import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const dist = path.join(root, 'dist');
const release = path.join(root, 'release');
const scriptNames = ['xxtplay.user.js', 'xxtplay.meta.js'];

for (const name of scriptNames) {
  if (!existsSync(path.join(dist, name))) {
    console.error(`缺少 dist/${name}，请先运行 npm run build`);
    process.exit(1);
  }
}

const user = await readFile(path.join(dist, 'xxtplay.user.js'), 'utf8');
const meta = await readFile(path.join(dist, 'xxtplay.meta.js'), 'utf8');
const versionPattern = new RegExp(`@version\\s+${pkg.version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w.])`);
if (!versionPattern.test(user) || !versionPattern.test(meta)) {
  console.error(`dist 产物版本与 package.json（${pkg.version}）不一致，请重新构建`);
  process.exit(1);
}
for (const marker of ['fixture-key', 'PRIVATE_VALUE', '.local/']) {
  if (user.includes(marker) || meta.includes(marker)) {
    console.error(`产物中出现不应发布的测试或私有标记：${marker}`);
    process.exit(1);
  }
}

await mkdir(release, { recursive: true });
const assets = [...scriptNames];
for (const name of ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'README.md']) {
  if (existsSync(path.join(root, name))) assets.push(name);
}

const sums = [];
for (const name of assets) {
  const source = scriptNames.includes(name) ? path.join(dist, name) : path.join(root, name);
  const target = path.join(release, name);
  await copyFile(source, target);
  const bytes = await readFile(target);
  sums.push(`${createHash('sha256').update(bytes).digest('hex').toUpperCase()}  ${name}`);
}
await writeFile(path.join(release, 'SHA256SUMS.txt'), `${sums.join('\n')}\n`, 'utf8');

console.log(`已生成 release/（${assets.length} 个文件 + SHA256SUMS.txt）`);
for (const line of sums) console.log(`  ${line}`);
console.log('\n发布命令（需要先 gh auth login，并确认账号与仓库）：');
console.log(`  gh release create v${pkg.version} release/* --title "xxtplay ${pkg.version}" --notes-file CHANGELOG.md`);
