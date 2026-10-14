import { openSession } from './session.js';
import { executeStep } from './actions.js';

function normalizeLoops(loop) {
  const loops = Number(loop ?? 1);

  if (!Number.isSafeInteger(loops) || loops < 0) {
    throw new Error('O loop deve ser um inteiro maior ou igual a zero.');
  }

  return loops;
}

export async function runFlow(flow, options = {}) {
  const loops = normalizeLoops(options.loop);
  const infinite = loops === 0;
  const loopDelay = flow.loopDelay ?? 0;

  const session = await openSession({
    mode:
      options.mode ??
      flow.browser?.mode ??
      process.env.ARPA_MODE ??
      'context',
    cdpUrl: options.cdpUrl ?? flow.browser?.cdpUrl,
    headless:
      options.headless ?? flow.browser?.headless ?? false,
  });

  const { page } = session;
  const label = flow.name ?? 'Fluxo sem nome';

  console.log(`Fluxo: ${label}`);
  console.log(`Execuções: ${infinite ? 'infinitas' : loops}`);

  let iteration = 0;

  try {
    while (infinite || iteration < loops) {
      iteration++;

      console.log(
        `\n=== Execução ${iteration}${infinite ? '' : `/${loops}`} ===`
      );

      for (const [index, step] of flow.steps.entries()) {
        // Mantém a página entre ciclos: só navega na primeira execução.
        if (iteration > 1 && step.action === 'goto') {
          continue;
        }

        console.log(`[${index + 1}/${flow.steps.length}] ${step.action}`);

        await executeStep(page, step);
        console.log('  OK');
      }

      console.log(`Execução ${iteration} concluída.`);

      if (infinite || iteration < loops) {
        console.log(`Aguardando ${loopDelay} ms para o próximo ciclo...`);
        await new Promise((resolve) => setTimeout(resolve, loopDelay));
      }
    }

    console.log('Fluxo concluído com sucesso.');
  } finally {
    await session.close();
  }

  return { iterations: iteration };
}
