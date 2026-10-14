# ARPA

Runner de automação de navegador guiado por **fluxos YAML**, com modo terminal.
Escolha entre usar um **usuário persistente** (Chrome já aberto, via `connectOverCDP`)
ou um **contexto isolado do Chromium** para a sessão.

## Estrutura

```
ARPA/
├── bin/
│   └── arpa.js          # CLI (terminal)
├── src/
│   ├── index.js         # Exportações do módulo (uso via import)
│   ├── session.js       # Abertura de sessão: modo cdp | context
│   ├── runner.js        # Loop de execução do fluxo
│   ├── actions.js       # Registry de ações dos passos
│   ├── flow.js          # Carregar, criar, validar e salvar YAML
│   └── camera.js        # Geração de vídeo de QR Code (ffmpeg)
├── flows/               # Seus fluxos YAML
├── screenshots/         # Saída de passos screenshot
└── .env                 # Variáveis usadas como ${VAR} nos fluxos
```

## Instalação

```bash
cd ARPA
npm install
npx playwright install chromium
```

## Uso no terminal

O CLI fica em `bin/arpa.js`. Instale globalmente com `npm link` (habilita o comando
`arpa`) ou chame direto com `node bin/arpa.js`.

```bash
arpa help                # ajuda geral
arpa new <nome>          # cria flows/<nome>.yaml a partir do esqueleto
arpa list                # lista fluxos e modo de cada um
arpa actions             # lista as ações suportadas nos passos
arpa validate <flow>     # valida a estrutura de um YAML
arpa run <flow>          # executa o fluxo
```

### Criando YAML pelo módulo

```bash
# esqueleto com goto + waitFor + screenshot
arpa new checkout --url https://loja.example.com --mode context

# copiar a estrutura de um fluxo existente
arpa new checkout2 --from checkout --force
```

Ou via código:

```js
import { buildFlow, saveFlow } from './src/index.js';

const flow = buildFlow({ name: 'meu_fluxo', url: 'https://example.com', mode: 'cdp' });
await saveFlow(flow, 'flows/meu_fluxo.yaml');
```

### Executando

```bash
# sessão isolada (Chromium novo, contexto limpo) — padrão
arpa run exemplo --mode context

# usuário persistente: conecte-se a um Chrome já aberto
# inicie o Chrome com: chrome.exe --remote-debugging-port=9222
arpa run del_gmail --mode cdp
arpa run del_gmail --mode cdp --cdp-url http://127.0.0.1:9333

# repetir: 10 execuções, ou infinito (0) com pausa definida no YAML (loopDelay)
npm start -- exemplo --loop 10
arpa run exemplo --loop 0 --mode context
```

Precedência das opções: **flag da CLI > campo no YAML (`browser:`) > variável de
ambiente (`ARPA_MODE`, `ARPA_CDP_URL`) > padrão (`context`)**.

## Formato do fluxo YAML

```yaml
name: Meu fluxo
loopDelay: 3000          # pausa (ms) entre ciclos de --loop

browser:
  mode: cdp              # cdp (usuário persistente) | context (sessão isolada)
  cdpUrl: "http://127.0.0.1:9222"   # somente no modo cdp
  headless: false        # somente no modo context

steps:
  - action: goto
    url: "https://mail.google.com/mail/u/1/#inbox"

  - action: click
    selector: "div[aria-label='Atualizar']"

  - action: fill
    role: textbox
    name: "E-mail"
    value: "${MY_EMAIL}"     # lido do ambiente ou do .env

  - action: assertText
    selector: "h1"
    text: "Bem-vindo"
    timeout: 15000
```

### Ações disponíveis

| Ação | Campos |
|---|---|
| `goto` | `url` |
| `click` | `selector` ou `role`+`name` (filtro opcional `text`) |
| `fill` | `selector`/`role`+`name`, `value` |
| `press` | `selector`/`role`+`name`, `key` |
| `waitFor` | `selector`/`role`+`name`, `state` (`visible` padrão, `hidden`, `attached`, `detached`) |
| `assertText` | `selector`/`role`+`name`, `text` |
| `screenshot` | `path`, `fullPage` (padrão `true`) |
| `delay` | `ms` (padrão `1000`) |
| `camera` | `source` (imagem) ou `content` (texto) — gera vídeo de QR Code via ffmpeg |

Campos comuns: `timeout` em ms (padrão `10000`) nas ações que interagem com elementos.

Comportamento do loop: nas execuções após a primeira, passos `goto` são pulados
para manter a página no estado em que ficou; `loopDelay` controla a pausa entre ciclos.

## Uso como módulo (import)

```js
import { loadFlow, runFlow, openSession, executeStep } from './src/index.js';

// fluxo completo
const flow = await loadFlow('flows/exemplo.yaml');
await runFlow(flow, { loop: 5, mode: 'context' });

// ou controle manual da sessão
const session = await openSession({ mode: 'cdp' });
await executeStep(session.page, { action: 'goto', url: 'https://example.com' });
await session.close();
```

## Variáveis de ambiente

| Variável | Uso |
|---|---|
| `ARPA_MODE` | `cdp` ou `context` (padrão: `context`) |
| `ARPA_CDP_URL` | endpoint CDP padrão do modo `cdp` |
| `nome arbitrary` | `${NOME}` dentro de `url`/`value` nos passos |

Carregadas do arquivo `.env` na raiz do projeto via `dotenv`.

## Notas

- **Modo cdp** não fecha o Chrome do usuário: apenas desconecta o Playwright ao final.
- **Modo context** usa um perfil limpo — logins não persistem entre execuções.
- A ação `camera` requer `ffmpeg` no PATH e um Chrome iniciado com as flags de
  mídia falsa para o site receber o vídeo como webcam.
