# CI — Rua de Aço

O workflow `.github/workflows/ci.yml` verifica alterações sem publicar o jogo.

## Gatilhos e publicação

- Push em `master` e `codex/**`.
- Pull request para `master` ou `web-beta`.
- Execução manual e chamada reutilizável.
- O workflow existente `deploy-pages.yml` chama o CI no push em `web-beta`;
  seu build/deploy só segue depois das checagens.

Não foi configurada proteção obrigatória de branch: isso é uma política do
repositório, distinta da existência do workflow. O CI falhará no PR se algum
job falhar; não habilita merge automático.

## Checagens

| Job | Conteúdo |
| --- | --- |
| Cliente | `npm ci`, tipos, todos os unitários e build |
| Servidor | instalação pelo lockfile próprio, tipos e todos os testes |
| Navegador | Chromium headless, regressões de mobile/pausa/remapeamento/layout nos dois perfis |
| Online | Worker + Vite locais, dois clientes, papéis, inputs, hashes e erros |

Node 24 é usado nas quatro etapas. O CI instala o Chromium e dependências
do Playwright e seleciona o canal chromium (headless completo), equivalente
ao modo usado pelo Chrome local. As configurações escolhem `npm.cmd` no Windows e `npm`
nos demais sistemas; mantêm Chrome visível localmente, salvo
`PLAYWRIGHT_HEADLESS=1`. Não reutilizam servidores existentes no CI.

O gesto de três direções usa toques CDP e relógio controlado do Playwright,
com dois frames entre etapas. Isso verifica a janela do comando sem incluir
a demora da automação; não mede latência física de um touchscreen. Os demais
fluxos de navegação, defesa e orientação rodam em tempo real.

As suítes de browser têm uma repetição no CI, proíbem `test.only` e
guardam relatórios por sete dias. Screenshots/trace de falha ficam no job
offline. O job online mantém trace de rede desligado porque ele pode
registrar headers; usa um secret aleatório temporário e não conecta à produção.

A suíte rápida de navegador é explícita em `test:e2e:ci`. Outros E2E de
sprites, agarrões e casos específicos continuam disponíveis nos scripts
existentes; não é correto dizer que o CI executa todo teste Playwright do
repositório. Os unitários e testes de servidor são executados integralmente.

O Vitest do servidor usa console direto: a captura por RPC apresentou
EnvironmentTeardownError ao receber logs de fechamento do Worker. Os erros
não tratados continuam falhando o job; os 66 testes permanecem ativos.

Referências: [sintaxe do GitHub Actions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax),
[Playwright no CI](https://playwright.dev/docs/ci-intro),
[Chromium headless completo](https://playwright.dev/docs/browsers#chromium-new-headless-mode)
[relógio do Playwright](https://playwright.dev/docs/clock)
e [console do Vitest](https://vitest.dev/config/disableconsoleintercept).
