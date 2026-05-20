import * as esbuild from 'esbuild';
import { builtinModules } from 'module';
import { readFileSync, cpSync, existsSync, rmSync } from 'fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));

const external = [
  ...builtinModules,
  ...builtinModules.map(m => `node:${m}`),
];

await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'esm',
  outfile: 'dist/index.js',
  banner: {
    js: [
      '#!/usr/bin/env node',
      'import { createRequire } from "module";',
      'const require = createRequire(import.meta.url);',
    ].join('\n'),
  },
  define: {
    __PKG_VERSION__: JSON.stringify(pkg.version),
  },
  external,
});

// Copy bundled Claude Code skills into dist/ so they ship with the npm package.
const skillsSrc = '.claude/skills';
const skillsDst = 'dist/skills';
if (existsSync(skillsDst)) rmSync(skillsDst, { recursive: true, force: true });
if (existsSync(skillsSrc)) {
  cpSync(skillsSrc, skillsDst, { recursive: true });
  console.log(`Copied skills: ${skillsSrc} -> ${skillsDst}`);
}

console.log('Build complete: dist/index.js');
