import { homedir } from 'os';
import { join } from 'path';
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'fs';

const CONFIG_DIR = join(homedir(), '.deploy-cli');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

export interface CliConfig {
  apiUrl: string;
  jwt: string;
  refreshToken: string;
}

function ensureDir() {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function loadConfig(): CliConfig | null {
  if (!existsSync(CONFIG_FILE)) return null;
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

export function saveConfig(config: CliConfig) {
  ensureDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
}

export function clearConfig() {
  if (existsSync(CONFIG_FILE)) unlinkSync(CONFIG_FILE);
}

export function getApiUrl(): string {
  return loadConfig()?.apiUrl || process.env.DEPLOY_API_URL || 'https://api-deploy.3xhaust.dev';
}
