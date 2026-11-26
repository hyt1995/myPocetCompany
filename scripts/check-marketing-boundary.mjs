// 마케팅사업부 모듈 경계 검사. `npm run build` 전에 자동으로 돈다 (package.json 의 prebuild).
// 규칙을 어기면 빌드가 실패해서 Vercel 에 배포되지 않는다.
//
// 규칙
// 1. marketing/ 안의 파일은 marketing/ 안의 파일만 가져온다. (npm 패키지는 괜찮다)
//    공용 코드(lib/, components/)는 marketing/core/ 의 연결선 파일로만 가져온다.
// 2. marketing/ 밖의 공용 코드는 마케팅 코드를 가져오지 않는다.
//    예외: lib/departments.js → marketing/department.js (조직도 등록 한 줄)
// 3. app/dept/marketing/, app/api/marketing/ 는 연결선 파일이다. marketing/ 안의 파일만 가져온다.
//
// 실행: node scripts/check-marketing-boundary.mjs

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', '.vercel', 'out', 'worker']);
const CODE_EXT = /\.(js|jsx|mjs|cjs|ts|tsx)$/;

const MODULE = 'marketing';
const BRIDGE = 'marketing/core';
const WIRE_DIRS = ['app/dept/marketing', 'app/api/marketing'];
const ALLOWED_SHARED_IMPORTS = [{ from: 'lib/departments.js', to: 'marketing/department.js' }];

const IMPORT_PATTERNS = [
  /\b(?:import|export)\s[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g, // import x from '...', export { x } from '...'
  /\bimport\s*['"]([^'"]+)['"]/g, // import '...'
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g, // import('...')
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g, // require('...')
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (CODE_EXT.test(name)) out.push(full);
  }
  return out;
}

const toPosix = (p) => p.split(sep).join('/');
const inside = (path, dir) => path === dir || path.startsWith(`${dir}/`);

function importsOf(source) {
  const specs = new Set();
  for (const pattern of IMPORT_PATTERNS) {
    for (const match of source.matchAll(pattern)) specs.add(match[1]);
  }
  return [...specs];
}

// 상대 경로만 실제 파일 위치로 바꾼다. 패키지('firebase/firestore', 'next/link')는 null.
function resolveSpec(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  return toPosix(relative(ROOT, resolve(dirname(fromFile), spec)));
}

// 확장자 없이 가져온 경로도 비교할 수 있게 정리 (marketing/department → marketing/department.js)
function sameFile(target, file) {
  return target === file || file.replace(CODE_EXT, '') === target;
}

const problems = [];

for (const abs of walk(ROOT)) {
  const file = toPosix(relative(ROOT, abs));
  if (file.startsWith('scripts/')) continue;
  const source = readFileSync(abs, 'utf8');

  for (const spec of importsOf(source)) {
    const target = resolveSpec(abs, spec);
    if (target === null) continue;

    const fileInModule = inside(file, MODULE);
    const targetInModule = inside(target, MODULE);
    const isWire = WIRE_DIRS.some((d) => inside(file, d));

    if (fileInModule && !inside(file, BRIDGE) && !targetInModule) {
      problems.push(`${file}: 공용 코드 '${spec}' 를 직접 가져옴 → marketing/core/ 연결선 파일을 거쳐 가져오세요.`);
    } else if (isWire && !targetInModule) {
      problems.push(`${file}: 연결선 파일은 marketing/ 안의 파일만 가져올 수 있어요 ('${spec}').`);
    } else if (!fileInModule && !isWire && targetInModule) {
      const allowed = ALLOWED_SHARED_IMPORTS.some((a) => a.from === file && sameFile(target, a.to));
      if (!allowed) {
        problems.push(`${file}: 공용 코드가 마케팅 코드 '${spec}' 를 가져옴 → 공용 코드는 마케팅 모듈에 기대면 안 돼요.`);
      }
    }
  }
}

if (problems.length) {
  console.error('마케팅사업부 모듈 경계 검사 실패:\n' + problems.map((p) => `  - ${p}`).join('\n'));
  process.exit(1);
}
console.log('마케팅사업부 모듈 경계 검사 통과');
