#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

import dotenv from 'dotenv';
import { parse } from 'yaml';

import {
  runFlow,
  loadFlow,
  saveFlow,
  listFlows,
  buildFlow,
  validateActionNames,
  ACTIONS_DOC,
  MODES,
  FLOWS_DIR,
} from '../src/index.js';

dotenv.config({ path: path.resolve(import.meta.dirname, '..', '.env'), quiet: true });

const HELP = `
ARPA - automação de navegador guiada por YAML

Uso:
  arpa run <flow> [opções]        Executa um fluxo YAML
  arpa new <nome> [opções]        Cria um fluxo YAML em flows/
  arpa list                       Lista os fluxos disponíveis
  arpa actions                    Lista as ações suportadas nos passos
  arpa validate <flow>            Valida a estrutura de um fluxo YAML

Opções de execução (run):
  --loop <n>        Repete o fluxo n vezes (0 = infinito). Padrão: 1
  --mode <m>        ${MODES.join(' | ')}
                      cdp     -> usuário persistente via connectOverCDP
                      context -> Chromium com contexto isolado da sessão
  --cdp-url <url>   Endpoint CDP do modo cdp. Padrão: http://127.0.0.1:9222
  --headless        Roda sem interface (apenas no modo context)
  --headed          Força janela visível

Opções de criação (new):
  --url <url>       URL inicial do passo goto. Padrão: https://example.com
  --mode <m>        Modo padrão salvo no YAML (padrão: context)
  --from <flow>     Copia a estrutura de um fluxo existente
  --force           Sobrescreve se o arquivo já existir

Exemplos:
  arpa new login_portal --url https://portal.empresa.com --mode context
  arpa run login_portal --mode cdp
  arpa run flows/del_gmail.yaml --loop 10
  node bin/arpa.js run flows/exemplo.yaml --loop 0 --mode context
`;

function parseFlags(args) {
  const flags = {};
  const positional = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }

    const key = arg.slice(2);

    if (['headless', 'headed', 'force'].includes(key)) {
      flags[key] = true;
      continue;
    }

    flags[key] = args[++i];

    if (flags[key] === undefined) {
      throw new Error(`A opção --${key} exige um valor.`);
    }
  }

  return { flags, positional };
}

async function resolveFlowPath(nameOrFile) {
  const candidates = [
    nameOrFile,
    `${nameOrFile}.yaml`,
    path.join(FLOWS_DIR, nameOrFile),
    path.join(FLOWS_DIR, `${nameOrFile}.yaml`),
  ];

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // tenta o próximo
    }
  }

  throw new Error(
    `Fluxo não encontrado: ${nameOrFile}. Use "arpa list" para ver os disponíveis.`
  );
}

async function commandRun(args) {
  const { flags, positional } = parseFlags(args);
  const flowName = positional[0];

  if (!flowName) throw new Error('Informe o fluxo. Ex.: arpa run exemplo.yaml');

  const file = await resolveFlowPath(flowName);
  const flow = await loadFlow(file);
  validateActionNames(flow.steps);

  await runFlow(flow, {
    loop: flags.loop ?? 1,
    mode: flags.mode,
    cdpUrl: flags['cdp-url'],
    headless: flags.headless ? true : flags.headed ? false : undefined,
  });
}

async function commandNew(args) {
  const { flags, positional } = parseFlags(args);
  const name = positional[0];

  if (!name) throw new Error('Informe o nome do fluxo. Ex.: arpa new meu_fluxo');

  const fileName = `${name.replace(/\.ya?ml$/i, '')}.yaml`;
  const target = path.join(FLOWS_DIR, fileName);

  if (!flags.force) {
    try {
      await fs.access(target);
      throw new Error(`${target} já existe. Use --force para sobrescrever.`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  let flow;

  if (flags.from) {
    const source = await loadFlow(await resolveFlowPath(flags.from));
    flow = {
      name,
      loopDelay: source.loopDelay ?? 0,
      browser: { ...(source.browser ?? {}), mode: flags.mode ?? source.browser?.mode },
      steps: source.steps,
    };

    if (flow.browser.mode === undefined) delete flow.browser.mode;
    if (Object.keys(flow.browser).length === 0) delete flow.browser;
  } else {
    flow = buildFlow({
      name,
      url: flags.url,
      mode: flags.mode ?? 'context',
      headless: flags.headless ?? false,
    });
  }

  validateActionNames(flow.steps);

  const saved = await saveFlow(flow, target);
  console.log(`Fluxo criado: ${saved}`);
  console.log('Edite os passos no YAML e execute com:');
  console.log(`  arpa run ${name} --mode cdp`);
  console.log(`  arpa run ${name} --mode context`);
}

async function commandList() {
  const flows = await listFlows();

  if (flows.length === 0) {
    console.log(`Nenhum fluxo em ${FLOWS_DIR}. Crie um com "arpa new <nome>".`);
    return;
  }

  console.log(`Fluxos em ${FLOWS_DIR}:`);

  for (const file of flows) {
    const flow = parse(
      await fs.readFile(path.join(FLOWS_DIR, file), 'utf8')
    );
    const mode = flow.browser?.mode ?? 'context';
    console.log(`  - ${file}  [${flow.name ?? 'sem nome'} | modo: ${mode}]`);
  }
}

async function commandActions() {
  console.log('Ações suportadas (campo "action" de cada passo):\n');

  for (const [action, fields] of Object.entries(ACTIONS_DOC)) {
    console.log(`  ${action.padEnd(12)} ${fields}`);
  }

  console.log('\nCampos comuns: timeout (ms, padrão 10000).');
  console.log('Variáveis: use ${VAR} em url/value para ler do ambiente ou .env.');
}

async function commandValidate(args) {
  const { positional } = parseFlags(args);

  if (!positional[0]) throw new Error('Informe o fluxo a validar.');

  const flow = await loadFlow(await resolveFlowPath(positional[0]));
  validateActionNames(flow.steps);

  console.log(`OK: "${flow.name ?? positional[0]}" com ${flow.steps.length} passos.`);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);

  switch (command) {
    case 'run': return commandRun(args);
    case 'new': return commandNew(args);
    case 'list': return commandList();
    case 'actions': return commandActions();
    case 'validate': return commandValidate(args);
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      console.log(HELP);
      return;
    default:
      console.log(HELP);
      throw new Error(`Comando desconhecido: ${command}`);
  }
}

main().catch((error) => {
  console.error(`Erro: ${error.message}`);
  process.exitCode = 1;
});
