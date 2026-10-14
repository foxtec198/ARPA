import { chromium } from 'playwright';

const DEFAULT_CDP_URL = 'http://127.0.0.1:9222';

export const MODES = ['cdp', 'context'];

export function validateMode(mode) {
  if (!MODES.includes(mode)) {
    throw new Error(`Modo inválido: ${mode}. Use um de: ${MODES.join(', ')}.`);
  }
  return mode;
}

export async function openSession({
  mode = 'context',
  cdpUrl,
  headless = false,
} = {}) {
  validateMode(mode);

  if (mode === 'cdp') {
    const url = cdpUrl ?? process.env.ARPA_CDP_URL ?? DEFAULT_CDP_URL;

    console.log(`[Sessão] connectOverCDP -> ${url} (usuário persistente)`);

    const browser = await chromium.connectOverCDP(url);
    const context = browser.contexts()[0] ?? await browser.newContext();
    const page = context.pages()[0] ?? await context.newPage();

    return {
      mode,
      browser,
      context,
      page,
      async close() {
        // Desconecta o Playwright sem fechar o Chrome do usuário.
        await browser.close();
      },
    };
  }

  console.log(`[Sessão] Chromium com contexto isolado (headless=${headless})`);

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext();
  const page = await context.newPage();

  return {
    mode,
    browser,
    context,
    page,
    async close() {
      await context.close();
      await browser.close();
    },
  };
}
