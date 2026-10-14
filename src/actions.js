import fs from 'node:fs/promises';
import path from 'node:path';

export function resolveValue(value) {
  if (typeof value !== 'string') return value;

  return value.replace(/\$\{([A-Z0-9_]+)\}/g, (_, key) => {
    if (process.env[key] === undefined) {
      throw new Error(`Variável não definida: ${key}`);
    }
    return process.env[key];
  });
}

function getLocator(page, step) {
  if (step.role && step.name) {
    return page.getByRole(step.role, { name: step.name, exact: true });
  }

  if (step.selector) {
    let locator = page.locator(step.selector);

    if (step.text) {
      locator = locator.filter({ hasText: step.text });
    }

    return locator;
  }

  throw new Error('Informe selector ou role + name.');
}

const timeoutOf = (step) => step.timeout ?? 10000;

export const actions = {
  async goto(page, step) {
    await page.goto(resolveValue(step.url), {
      waitUntil: 'domcontentloaded',
      timeout: timeoutOf(step),
    });
  },

  async click(page, step) {
    await getLocator(page, step).click({ timeout: timeoutOf(step) });
  },

  async fill(page, step) {
    await getLocator(page, step).fill(resolveValue(step.value), {
      timeout: timeoutOf(step),
    });
  },

  async press(page, step) {
    await getLocator(page, step).press(step.key, { timeout: timeoutOf(step) });
  },

  async waitFor(page, step) {
    await getLocator(page, step).waitFor({
      state: step.state ?? 'visible',
      timeout: timeoutOf(step),
    });
  },

  async assertText(page, step) {
    const locator = getLocator(page, step);
    await locator.waitFor({ state: 'visible', timeout: timeoutOf(step) });

    const actual = await locator.innerText();

    if (!actual.includes(step.text)) {
      throw new Error(`Texto esperado: "${step.text}". Encontrado: "${actual}".`);
    }
  },

  async screenshot(page, step) {
    const file = path.resolve(step.path);
    await fs.mkdir(path.dirname(file), { recursive: true });

    await page.screenshot({ path: file, fullPage: step.fullPage ?? true });
  },

  async delay(page, step) {
    const ms = step.ms ?? 1000;

    if (!Number.isSafeInteger(ms) || ms < 0) {
      throw new Error('O delay deve ser um inteiro não negativo.');
    }

    await new Promise((resolve) => setTimeout(resolve, ms));
  },

  async camera(page, step) {
    const { prepareCamera } = await import('./camera.js');

    const { videoPath } = await prepareCamera({
      source: step.source ? path.resolve(step.source) : undefined,
      content: step.content,
    });

    console.log(`[PRT] Vídeo de QR Code preparado: ${videoPath}`);
    console.warn(
      '[PRT] Para o site receber esse vídeo como câmera, o Chrome precisa ' +
      'ter sido iniciado com as flags de mídia falsa e o arquivo de vídeo configurado.'
    );
  },
};

export const actionNames = Object.keys(actions);

export async function executeStep(page, step) {
  if (!step || typeof step.action !== 'string') {
    throw new Error('Cada passo precisa conter o campo "action".');
  }

  const handler = actions[step.action];

  if (!handler) {
    throw new Error(`Ação desconhecida: ${step.action}`);
  }

  await handler(page, step);
}
