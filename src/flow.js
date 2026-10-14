import fs from 'node:fs/promises';
import path from 'node:path';
import { parse, stringify } from 'yaml';

import { actionNames } from './actions.js';
import { validateMode } from './session.js';

export const FLOWS_DIR = path.resolve('flows');

export async function loadFlow(file) {
  const content = await fs.readFile(path.resolve(file), 'utf8');
  const flow = parse(content);

  if (!Array.isArray(flow?.steps) || flow.steps.length === 0) {
    throw new Error('O YAML precisa conter uma lista "steps" não vazia.');
  }

  if (flow.browser?.mode) {
    validateMode(flow.browser.mode);
  }

  return flow;
}

export async function saveFlow(flow, file) {
  const target = path.isAbsolute(file) ? file : path.join(FLOWS_DIR, file);

  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, stringify(flow), 'utf8');

  return target;
}

export async function listFlows(dir = FLOWS_DIR) {
  try {
    const entries = await fs.readdir(dir);
    return entries.filter((name) => /\.(ya?ml)$/i.test(name));
  } catch {
    return [];
  }
}

export function buildFlow({
  name,
  url = 'https://example.com',
  mode = 'context',
  headless = false,
  loopDelay = 0,
} = {}) {
  validateMode(mode);

  if (!name) {
    throw new Error('Informe o nome do fluxo.');
  }

  return {
    name,
    loopDelay,
    browser: { mode, headless },
    steps: [
      { action: 'goto', url },
      { action: 'waitFor', selector: 'body' },
      { action: 'screenshot', path: `screenshots/${name}.png` },
    ],
  };
}

export const ACTIONS_DOC = {
  goto: 'url',
  click: 'selector | role+name',
  fill: 'selector | role+name, value',
  press: 'selector | role+name, key',
  waitFor: 'selector | role+name, state (visible|hidden|attached|detached)',
  assertText: 'selector | role+name, text',
  screenshot: 'path, fullPage (opcional)',
  delay: 'ms',
  camera: 'source | content (gera vídeo de QR Code via ffmpeg)',
};

export function validateActionNames(steps) {
  const unknown = steps
    .filter((step) => !actionNames.includes(step?.action))
    .map((step) => step?.action);

  if (unknown.length > 0) {
    throw new Error(`Ações desconhecidas: ${[...new Set(unknown)].join(', ')}`);
  }

  return true;
}
