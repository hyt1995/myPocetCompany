// 모듈 경계 검사. `npm run build` 전에 자동으로 돈다 (package.json 의 prebuild).
// 규칙을 어기면 빌드가 실패해서 Vercel 에 배포되지 않는다.
//
// 모듈: marketing/ (마케팅사업부), research/ (시장조사 프로그램), board/ (회사 게시판)
//
// 규칙
// 1. 모듈 안의 파일은 자기 모듈 안의 파일만 가져온다. (npm 패키지·node 내장은 괜찮다)
// 2. 모듈의 연결선 폴더(core/)만 바깥을 가져올 수 있다:
//    공용 코드(lib/, components/)와, 다른 모듈의 '공개 입구'(entries) 파일만.
// 3. 공용 코드는 모듈 코드를 가져오지 않는다. 예외는 ALLOWED_SHARED_IMPORTS 에 적힌 것만.
// 4. Next.js 위치의 연결선 파일(wires)은 자기 모듈 안의 파일만 가져온다.
//
// 실행: node scripts/check-module-boundaries.mjs

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', '.vercel', 'out', 'worker']);
const CODE_EXT = /\.(js|jsx|mjs|cjs|ts|tsx)$/;

const MODULES = [
  {
    dir: 'marketing',
    label: '마케팅사업부',
    wires: ['app/dept/marketing', 'app/api/marketing'],
    entries: [],
  },
  {
    dir: 'research',
    label: '시장조사 프로그램',
    wires: ['app/research', 'app/api/research'],
    entries: ['research/index.js', 'research/client.js'],
  },
  {
    dir: 'board',
    label: '회사 게시판',
    wires: ['app/board', 'app/api/board'],
    entries: ['board/index.js', 'board/client.js'],
  },
];
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
const moduleOf = (path) => MODULES.find((m) => inside(path, m.dir)) || null;
const wireOf = (path) => MODULES.find((m) => m.wires.some((w) => inside(path, w))) || null;
// 확장자 없이 가져온 경로도 같은 파일로 본다 (marketing/department → marketing/department.js)
const sameFile = (target, file) => target === file || target === file.replace(CODE_EXT, '');

function importsOf(source) {
  const specs = new Set();
  for (const pattern of IMPORT_PATTERNS) {
    for (const match of source.matchAll(pattern)) specs.add(match[1]);
  }
  return [...specs];
}

// 상대 경로만 실제 위치로 바꾼다. 패키지('firebase/firestore', 'node:crypto')는 null.
function resolveSpec(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  return toPosix(relative(ROOT, resolve(dirname(fromFile), spec)));
}

function checkImport(file, spec, target) {
  const own = moduleOf(file);
  const targetModule = moduleOf(target);
  const wire = wireOf(file);

  if (wire) {
    if (targetModule !== wire) return `연결선 파일은 ${wire.dir}/ 안의 파일만 가져올 수 있어요 ('${spec}').`;
    return null;
  }

  if (own) {
    if (targetModule === own) return null;
    if (!inside(file, `${own.dir}/core`)) {
      return `${own.label} 모듈 밖 '${spec}' 를 직접 가져옴 → ${own.dir}/core/ 연결선 파일을 거쳐 가져오세요.`;
    }
    if (targetModule && !targetModule.entries.some((e) => sameFile(target, e))) {
      return `다른 모듈(${targetModule.label})의 내부 파일 '${spec}' 를 가져옴 → 공개 입구(${targetModule.entries.join(', ') || '없음'})만 쓸 수 있어요.`;
    }
    return null;
  }

  if (targetModule) {
    const allowed = ALLOWED_SHARED_IMPORTS.some((a) => a.from === file && sameFile(target, a.to));
    if (!allowed) return `공용 코드가 ${targetModule.label} 모듈 '${spec}' 를 가져옴 → 공용 코드는 모듈에 기대면 안 돼요.`;
  }
  return null;
}

const problems = [];
for (const abs of walk(ROOT)) {
  const file = toPosix(relative(ROOT, abs));
  if (file.startsWith('scripts/')) continue;
  const source = readFileSync(abs, 'utf8');
  for (const spec of importsOf(source)) {
    const target = resolveSpec(abs, spec);
    if (target === null) continue;
    const problem = checkImport(file, spec, target);
    if (problem) problems.push(`${file}: ${problem}`);
  }
}

if (problems.length) {
  console.error('모듈 경계 검사 실패:\n' + problems.map((p) => `  - ${p}`).join('\n'));
  process.exit(1);
}
console.log(`모듈 경계 검사 통과 (${MODULES.map((m) => m.dir).join(', ')})`);
