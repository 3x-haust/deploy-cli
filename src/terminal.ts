const ansiPattern =
  /[\u001b\u009b][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g;

function shouldDisableColor() {
  return (
    process.env.NO_COLOR !== undefined ||
    process.env.TERM === 'dumb' ||
    process.env.DEPLOY_NO_COLOR === '1'
  );
}

export function supportsAnsiOutput() {
  return Boolean(process.stdout.isTTY) && !shouldDisableColor();
}

export async function getChalk() {
  const { Chalk, default: chalk } = await import('chalk');
  return supportsAnsiOutput() ? chalk : new Chalk({ level: 0 });
}

export async function createTable(options: Record<string, any>) {
  const { default: Table } = await import('cli-table3');
  const style = options.style || {};

  return new Table({
    ...options,
    style: {
      ...style,
      head: supportsAnsiOutput() ? style.head ?? ['cyan'] : [],
      border: supportsAnsiOutput() ? style.border ?? ['grey'] : [],
    },
  });
}

export function normalizeAnsi(value: string) {
  return String(value)
    .replace(/\u241b/g, '\u001b')
    .replace(/\\u001b/g, '\u001b')
    .replace(/\\x1b/g, '\u001b');
}

export function stripAnsi(value: string) {
  return normalizeAnsi(value).replace(ansiPattern, '');
}

export function formatAnsiForOutput(value: string) {
  const normalized = normalizeAnsi(value);
  return supportsAnsiOutput() ? normalized : stripAnsi(normalized);
}
