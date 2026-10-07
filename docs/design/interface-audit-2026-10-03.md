# Interface audit — 3 October 2026

Implemented review of the Governance demo, established motion patterns and shared Interfold chrome. User authorization covers fixing audit findings. Governance and the future dashboard retain their grey product identity with less Gramercy in explanatory copy. No deployment was requested or performed.

## Baseline and review

Before: https://interfold-governance-review.vercel.app/ (release 2 October 2026, build ty0w_3OTKcc2Cq08Tc9j7). After: local Governance http://localhost:3100 and marketing http://127.0.0.1:3200. The published marketing site uses an older header/footer version than the local shared package. Shared source is Interfold-Website/packages/site-header/src; generated consumers were rebuilt together.

## Implemented differences

| Area | Before | After | Review |
| --- | --- | --- | --- |
| Identidade Governance | Copy explicativa em Gramercy. | Introduções e suporte do hero em Inter. Títulos editoriais, marca e base grey preservados. | Comparar a introdução em Proposals e Voting power. |
| Votação pública | Escolhas apresentadas por linhas e mensagem separada sobre máscaras. | Cartões comuns ao ballot privado, máscara indisponível explicada e Review vote antes da confirmação. Ação fixa no footer. | Escolher Yes. Tentar a máscara indisponível por clique e teclado. Abrir Review vote. |
| Dados de assinatura | Troca apenas por fade. Footer desmontado imediatamente. | Transição lateral coordenada. Footer sai/reentra pela mesma expansão. Scroll e foco regressam à revisão. | Yes, Review vote, Signature data, Back to review. |
| Montantes e percentagens | 99.50% e 100.00% alinhavam caracteres pelo índice, trocando a posição de ponto e unidade. | Algarismos alinhados por posição decimal. Pontuação e unidade estáveis, largura e reversão partem da posição visual atual. | Ligar e desligar Randomize voting power rapidamente. Rever 99.50% e 100.00%. |
| Privacy tools | Ícones em voo usavam coordenadas fixas sem reagir a scroll, resize ou reduced motion. | A mudança de geometria termina a viagem e limpa as cópias temporárias. | Abrir/recolher Privacy tools e fazer scroll imediatamente. |
| Rascunho de Lock FOLD | Fechar conservava montante, mas repunha destinatário e delegado. | Rascunho completo por wallet, incluindo progresso parcial de um lock. | Preparar lock para outra wallet, fechar e reabrir. Conferir proprietário e montante. |
| Regresso ao delegado | Voltar da revisão colocava sempre o foco na pesquisa. | Regresso à linha escolhida e ao scroll da lista. | Escolher delegado perto do fim por teclado. Voltar à seleção. |
| Levantamento e manter lock | A tarefa mudava no mesmo render e removia o controlo focado. | Montante conservado, troca de conteúdo coordenada com altura e foco. | Withdraw FOLD, Keep FOLD locked instead, voltar. |
| Rejeição e recuperação do voto | Ballot integrado saltava diretamente para sucesso. | Pedidos da Demo wallet, estados de envio, rejeição e erro. A máscara falhada pode ser repetida sem repetir o voto. | Yes com máscara. Confirmar voto, rejeitar máscara, repetir só máscara. |
| Voto preparado e outra wallet | Passos substituíam blocos e podiam desmontar a origem antes do fecho. | Formulário e origem montados até ao fecho. Passos dentro da mesma expansão. Foco passa ao passo seguinte. A troca de wallet regressa ao botão de envio; rejeição da máscara regressa a Retry mask. | Send from another wallet, Prepare vote, trocar wallet e enviar o voto preparado. |
| Ação depois de enviar máscara | A ação seguinte nem sempre retomava claramente o ballot. | Vote on this proposal ou View your vote conforme o contexto. Enviar outra máscara permanece secundário. | Enviar apenas uma máscara e regressar ao ballot. |
| Lista de votos públicos | Identidade repetida com Your wallet e (You). Peso descartado no adaptador. | Uma identidade e o peso utilizado. Linhas, estados, montantes e paginação partilhados. | Abrir Voting details e consultar Public votes. |
| Resultados e montantes por opção | Só Yes recebia destaque em propostas aprovadas. Tooltip nativo dependia de hover. | Maior parcela única destacada, independentemente da aprovação. Montantes acessíveis por hover, foco e toque. | Focar uma percentagem. No e Abstain como maiores parcelas são casos cobertos por testes, ausentes nos fixtures fechados. |
| Seleção de voters elegíveis | Modal e controlos ODS separados do resto do produto. | MorphDialog, SearchField e ActionButton comuns ao seletor de delegates. Variante larga comum de ActionTray e texto de verificação quebrável evitam cortar detalhes. | Voting details, Eligible voters. |
| Actions e Sort | Actions expandia instantaneamente. Sort aparecia e desaparecia sem o motion dos menus. | Actions usa Disclosure. Sort partilha entrada/saída de ChoiceMenu e conserva a largura compacta. Actions 0 deixa de repetir explicação. | Abrir/recolher Actions. Em Voting power, abrir e fechar Sort. |
| Atividade cifrada | Linhas de atividade e texto de apoio misturavam escalas de 13 e 14 px. | Metadados de 12 px no papel comum de atividade dentro de Voting details. | Abrir Voting details e consultar Encrypted ballot activity. |
| Menu mobile comum | Marketing e Governance tinham comportamentos de teclado diferentes. | Uma origem para scroll, foco, Tab, Escape e fecho ao passar para desktop. Entradas e hamburger respeitam reduced motion. | Abrir menu por teclado, percorrer Tab/Shift+Tab, fechar por Escape e verificar foco de retorno. |
| Marca e foco do header | Marketing podia trocar SVG por texto ao entrar. Governance tinha um contorno de foco próprio. A navegação ocupava a área do símbolo central. | Mesmo SVG em desktop/mobile e contorno de foco canónico nos dois sites. Espaçamento partilhado corrigido: a navegação deixa 20 px livres até ao símbolo. | Recarregar marketing desktop e percorrer wordmark e links com Tab. |
| Links por teclado | Vários CTAs revelavam a seta só com rato. | Foco revela a mesma seta e cores de interação. Reduced motion elimina deslocamento. | Percorrer os CTAs com Tab e comparar com hover. |
| Movimento reduzido | Algumas animações de altura e ícones já iniciadas continuavam quando a preferência mudava. | FluidHeight termina a animação ativa. Ícones temporários são limpos. Wrappers do marketing respeitam a preferência. | Rever os percursos com preferência de movimento reduzido. |

## Live review follow-up

The current review is on the running pages: [Governance](http://localhost:3100/plugins/proposals/?review=changes#/) and [marketing](http://127.0.0.1:3200/?review=changes). Passive numbers attach to actual visible UI, including dialogs. Each note contains Before/Now/Test instructions. Notes can be collapsed and marks hidden independently. The deck and original manifest remain evidence of the first audit batch; the live catalogue includes the later fixes.

The wallet follow-up makes connection explicit before selecting a delegate, hides personal ballot controls and amounts while disconnected, gates result submission and execution, distinguishes fee credit from loading, and keeps the proposal editor mounted through wallet changes. Connection never submits an action automatically. Plugin navigation also invalidates the previously loaded page, preventing a transient false Not found screen.

The follow-up passes 219 tests with no failures, TypeScript and the isolated demo build. Browser QA covers delegate cancellation and resumption, public/private disconnected ballots, draft preservation on connection and disconnection, and the review layout at 390 × 844. Current fixtures do not contain an executable proposal; result/execute connection gates were checked in isolated component scenarios.

The shared newsletter embed also retains its script parent through Strict Mode and desktop/mobile remounts. Fresh browser QA confirms the form remains available after resizing, with no console errors. This is note 27 in both catalogues, with the actual mark on the marketing footer. Both final builds pass.

## Original batch validation

- 214 tests pass, no failures, with the local demo mode enabled. The default test environment passes 180 and explicitly skips 34 demo-only tests.
- TypeScript and design token synchronization pass. Focused lint checks pass; isolated demo build and marketing production build pass, with existing project warnings. Final isolated demo and marketing builds also passed after the last visual refinements.
- Browser QA confirms complete prepare/sign/switch/send flow, signer attribution, mask-only retry after rejection, explicit return focus, full lock draft restoration, delegate selection focus restoration, withdrawal focus/amount continuity, and keyboard activation of the unavailable public mask without changing the chosen vote.
- Desktop chrome has a measured 20.09 px gap between the symbol and navigation after removing the overlap. Mobile menu was checked at 390 × 844.
- Public results expose the raw option amount by keyboard focus/Space. Closed demo fixtures do not include No/Abstain leaders; those cases are covered by result tests.

## Evidence and limits

The review deck, manifest and unmodified browser captures are in [Review-2026-10-03](../../../Review-2026-10-03/) at the workspace root. Screenshots can have different viewports and capture fixture times; they establish component changes, not a pixel-level whole-page comparison. Slides crop relevant components and link to live local review steps.

- O desempenho dos passos de lock não foi medido em FPS. É uma hipótese de investigação, sem alteração especulativa.
- O dashboard futuro recebe orientação de identidade, sem implementação de ecrãs neste trabalho.
- A publicação do site principal e da demo fica por fazer quando solicitada.
- Movimento reduzido revisto no código; não houve emulação da preferência no browser. Capturas estáticas mostram estados, e os slides incluem percursos para rever as transições.

The motion principles are continuity of context, progressive disclosure and coordinated transitions. Existing timing/easing and motion primitives were reused. No measured frame-rate improvement is claimed.
