import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { homedir } from 'os';
import {
  readdirSync,
  readFileSync,
  mkdirSync,
  existsSync,
  statSync,
  rmSync,
  cpSync,
} from 'fs';
import { getChalk } from '../terminal.js';

// dist/index.js -> dist/skills (skills are copied there by build.js)
function bundledSkillsDir(): string {
  const here = fileURLToPath(import.meta.url);
  return resolve(dirname(here), 'skills');
}

interface BundledSkill {
  name: string;
  path: string;
  description: string;
}

function readDescription(skillMd: string): string {
  if (!existsSync(skillMd)) return '';
  const head = readFileSync(skillMd, 'utf-8').split('\n').slice(0, 30);
  const line = head.find((l) => l.startsWith('description:'));
  if (!line) return '';
  return line.replace(/^description:\s*/, '').trim();
}

function listBundled(): BundledSkill[] {
  const dir = bundledSkillsDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => {
      const p = join(dir, name);
      return (
        statSync(p).isDirectory() && existsSync(join(p, 'SKILL.md'))
      );
    })
    .map((name) => ({
      name,
      path: join(dir, name),
      description: readDescription(join(dir, name, 'SKILL.md')),
    }));
}

function resolveTargetBase(options: { project?: string }): {
  base: string;
  scope: string;
} {
  if (options.project) {
    const base = resolve(options.project, '.claude', 'skills');
    return { base, scope: `project (${options.project})` };
  }
  return { base: join(homedir(), '.claude', 'skills'), scope: 'user (~/.claude/skills)' };
}

export async function skillsListCommand() {
  const chalk = await getChalk();
  const skills = listBundled();
  if (skills.length === 0) {
    console.log(chalk.yellow('No bundled skills found in this CLI install.'));
    console.log(chalk.gray(`Looked at: ${bundledSkillsDir()}`));
    return;
  }
  console.log(chalk.bold('Bundled Claude Code skills:'));
  for (const s of skills) {
    console.log(`  ${chalk.cyan(s.name)}`);
    if (s.description) {
      const wrapped = s.description.length > 100
        ? s.description.slice(0, 97) + '...'
        : s.description;
      console.log(`    ${chalk.gray(wrapped)}`);
    }
  }
  console.log(
    chalk.gray(
      '\nInstall with: deploy skills install [name]  (default: all, to ~/.claude/skills)',
    ),
  );
}

export async function skillsInstallCommand(
  name: string | undefined,
  options: { project?: string; force?: boolean },
) {
  const chalk = await getChalk();
  const bundled = listBundled();
  if (bundled.length === 0) {
    throw new Error(`No bundled skills found at ${bundledSkillsDir()}`);
  }

  let targets: BundledSkill[];
  if (name) {
    const hit = bundled.find((s) => s.name === name);
    if (!hit) {
      throw new Error(
        `Unknown skill "${name}". Available: ${bundled.map((s) => s.name).join(', ')}`,
      );
    }
    targets = [hit];
  } else {
    targets = bundled;
  }

  const { base, scope } = resolveTargetBase(options);
  mkdirSync(base, { recursive: true });
  console.log(chalk.gray(`Target: ${scope}`));

  for (const skill of targets) {
    const dst = join(base, skill.name);
    if (existsSync(dst) && !options.force) {
      const srcMd = readFileSync(join(skill.path, 'SKILL.md'), 'utf-8');
      const dstMdPath = join(dst, 'SKILL.md');
      const dstMd = existsSync(dstMdPath) ? readFileSync(dstMdPath, 'utf-8') : '';
      if (srcMd === dstMd) {
        console.log(chalk.gray(`= ${skill.name}  (already up to date)`));
        continue;
      }
      console.log(
        chalk.yellow(
          `! ${skill.name}  (differs from installed version — pass --force to overwrite)`,
        ),
      );
      continue;
    }
    if (existsSync(dst)) rmSync(dst, { recursive: true, force: true });
    cpSync(skill.path, dst, { recursive: true });
    console.log(chalk.green(`+ ${skill.name}  -> ${dst}`));
  }
}

export async function skillsUninstallCommand(
  name: string,
  options: { project?: string },
) {
  const chalk = await getChalk();
  const { base, scope } = resolveTargetBase(options);
  const dst = join(base, name);
  if (!existsSync(dst)) {
    console.log(chalk.yellow(`Not installed at ${scope}: ${name}`));
    return;
  }
  rmSync(dst, { recursive: true, force: true });
  console.log(chalk.green(`Removed: ${dst}`));
}
