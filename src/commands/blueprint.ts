import { apiFetch } from '../api.js';
import { resolveProject } from './projects.js';
import { getChalk } from '../terminal.js';

export async function blueprintCommand(idOrName: string) {
  const chalk = await getChalk();

  const project = await resolveProject(idOrName);
  const blueprint = await apiFetch(`/projects/${project.id}/blueprint`);

  console.log(chalk.bold(`Blueprint for "${project.name}":`));
  console.log(`  Layout:   ${blueprint.layout}`);
  console.log(`  Engine:   ${blueprint.engineVersion}`);

  if (blueprint.units?.length > 0) {
    console.log(chalk.bold('\n  Units:'));
    for (const unit of blueprint.units) {
      console.log(`    - ${unit.role}: ${unit.framework} (${unit.language})`);
      if (unit.entryDir) console.log(`      dir: ${unit.entryDir}`);
    }
  }

  if (blueprint.datastores?.length > 0) {
    console.log(chalk.bold('\n  Datastores:'));
    for (const ds of blueprint.datastores) {
      console.log(`    - ${ds.kind} (${ds.role})`);
    }
  }

  if (blueprint.mobilePreview) {
    console.log(chalk.bold('\n  Mobile Preview:'));
    console.log(`    URL: ${blueprint.mobilePreview.url || '-'}`);
    console.log(`    APK: ${blueprint.mobilePreview.apkPath || '-'}`);
  }
}
