import { homedir } from 'os';
import { join } from 'path';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  unlinkSync,
  chmodSync,
  statSync,
} from 'fs';

const DIR = join(homedir(), '.deploy-cli');
const FILE = join(DIR, 'secrets.json');

export type Secrets = Record<string, string>;

const RESERVED_CHARS = /[\x00-\x1f\x7f]/;

function ensureDir() {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true, mode: 0o700 });
  try { chmodSync(DIR, 0o700); } catch {}
}

export function loadSecrets(): Secrets {
  if (!existsSync(FILE)) return {};
  try {
    const raw = readFileSync(FILE, 'utf-8');
    const data = JSON.parse(raw);
    return typeof data === 'object' && data ? data : {};
  } catch {
    return {};
  }
}

export function saveSecrets(s: Secrets) {
  ensureDir();
  writeFileSync(FILE, JSON.stringify(s, null, 2), { mode: 0o600 });
  try { chmodSync(FILE, 0o600); } catch {}
}

export function setSecret(key: string, value: string) {
  validateKey(key);
  const s = loadSecrets();
  s[key] = value;
  saveSecrets(s);
}

export function getSecret(key: string): string | undefined {
  return loadSecrets()[key];
}

export function deleteSecret(key: string): boolean {
  const s = loadSecrets();
  if (!(key in s)) return false;
  delete s[key];
  saveSecrets(s);
  return true;
}

export function clearSecrets() {
  if (existsSync(FILE)) unlinkSync(FILE);
}

export function secretsFilePath(): string {
  return FILE;
}

export function fileMode(): number | null {
  if (!existsSync(FILE)) return null;
  return statSync(FILE).mode & 0o777;
}

function validateKey(key: string) {
  if (!key || RESERVED_CHARS.test(key) || /[=\s]/.test(key)) {
    throw new Error(`Invalid secret key: ${JSON.stringify(key)}`);
  }
}

export function maskValue(v: string): string {
  if (!v) return '';
  if (v.length <= 8) return '*'.repeat(v.length);
  return `${v.slice(0, 2)}${'*'.repeat(Math.min(8, v.length - 4))}${v.slice(-2)}`;
}

// Parse KEY=VALUE lines supporting quoted multiline values (".env-style").
export function parseEnvContent(text: string): Secrets {
  const out: Secrets = {};
  let i = 0;
  while (i < text.length) {
    // skip whitespace / blank lines / comments
    while (i < text.length && /[ \t\r\n]/.test(text[i])) i++;
    if (i >= text.length) break;
    if (text[i] === '#') {
      while (i < text.length && text[i] !== '\n') i++;
      continue;
    }
    // read key
    const keyStart = i;
    while (i < text.length && text[i] !== '=' && text[i] !== '\n') i++;
    if (text[i] !== '=') {
      while (i < text.length && text[i] !== '\n') i++;
      continue;
    }
    const key = text.slice(keyStart, i).trim();
    i++; // skip =
    // read value — support ", ', or bare-to-eol
    let value: string;
    const first = text[i];
    if (first === '"' || first === "'") {
      const quote = first;
      i++;
      const vStart = i;
      while (i < text.length && text[i] !== quote) i++;
      value = text.slice(vStart, i);
      if (text[i] === quote) i++;
    } else {
      const vStart = i;
      while (i < text.length && text[i] !== '\n') i++;
      value = text.slice(vStart, i).trim();
    }
    if (key) out[key] = value;
  }
  return out;
}
