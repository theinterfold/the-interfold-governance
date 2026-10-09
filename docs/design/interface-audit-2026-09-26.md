# Auditoria de consistência — Voting power e Proposals

26 de setembro de 2026. Auditoria inicial e consolidação aplicada no preview local. As diferenças abaixo documentam o estado anterior.

## Âmbito e método

Inspeção das duas páginas a 1440px e 390px, com medição dos estilos calculados no browser. Inclui Your account, Locks, o diretório de delegates, a lista de propostas, a proposta expandida e os diálogos de lock, identidade, delegação e confirmação de voto. Foram verificados hover e foco por teclado nas listas. Não foram submetidas transações nem repostos os dados do utilizador.

Não houve overflow horizontal nas páginas verificadas. Os estados de erro, carteiras desligadas, todos os tamanhos intermédios e todas as combinações possíveis de conteúdo não foram cobertos nesta auditoria.

## Diagnóstico

Já existe uma base comum útil: `ActionButton`/`ActionLink`, `AddressText`, `SearchField`, `NativeSelect`, `ActionTray`, `BallotPanel` e as cores dos estados. A divergência surge sobretudo depois: seletores de uma página alteram dimensões, fundos e tipografia definidos na base. Há também documentação de iterações anteriores que contradiz a interface atual.

A consolidação deve partilhar superfícies, dimensões, tipografia e estados de interação. O conteúdo, as colunas e as regras de cada domínio continuam próprios.

## Diferenças observadas e proposta de consolidação

| Prioridade | Elemento | Estado observado | Recomendação |
| --- | --- | --- | --- |
| Alta | Limites do hover | Dentro de cartões com 1052px, o hover dos locks ocupa 986px e começa depois do inset de 32px. Nos delegates ocupa 1050px, até à borda interior do cartão. Em mobile a diferença é 316px vs 356px. | Uma superfície de linha comum: fundo e hover até às bordas interiores; conteúdo mantém 32px no desktop e 20px no mobile. Os separadores podem ficar alinhados ao conteúdo. |
| Alta | Fundo e separadores das listas | Locks: branco com divisórias. Delegates: alternância de fundos, sem divisórias. Propostas: branco com divisórias. Hover dos locks/propostas `#f4f5f4`; delegates `#e8edeb`. | Branco + divisória fina + um único hover neutro. Remover a alternância dos delegates. Manter o estado específico do delegate atual através de uma variante explícita, sem confundi-lo com hover. |
| Alta | Botões das linhas | Start/Cancel withdrawal: 196×40px, branco. Select delegate: 196×52px, transparente. No mobile: 40px vs 46px de altura. O fundo transparente é imposto por `.power-delegate-data > button`, apesar de usar o componente comum. | Mesmo botão secundário para as ações das linhas de dados, com fundo branco. Sugestão: variante compacta explícita de 40px para locks e delegates; alvo tátil de pelo menos 44px no mobile. Preservar a variante normal de Vote/Create proposal (52px desktop, 46px mobile), já aprovada. O tamanho deve ser uma opção do componente, não um override de página. |
| Alta | Número da linha / ID | Lock: `#1`, 14px, peso 400, coluna de 40px. Delegate: `1`, 12px, peso 500, espaço de 24px. | Um estilo comum de identificador: 12px/500, cor secundária, números tabulares e mesma coluna base, capaz de acomodar IDs longos. Preservar `#` nos locks: é o ID real; a numeração dos delegates é a posição da lista filtrada/ordenada. Não substituir o ID pelo índice da linha nem apresentar a posição como um ID estável. |
| Alta | Valor principal em linhas de dados | Quantidade de um lock: 16px/600. Voting power de um delegate: 20px/600. A unidade FOLD usa 14px em ambos. | Partilhar a apresentação valor + unidade. Sugestão: 16px/600 para ambas as listas; conservar as escalas maiores no resumo da conta. A origem/cálculo dos valores permanece separada. |
| Média | Pesquisa | Delegates usam `SearchField`, com lupa e limpar. Proposals usa um input próprio. Ambos são 52px no desktop, mas têm cantos de 6px e 4px, respetivamente. | Reutilizar `SearchField` nas propostas, mantendo o placeholder e a lógica de filtragem. Unificar também altura, borda, foco e limpeza; em mobile foi medido 47px no campo dos delegates e 46px nas propostas. |
| Média | Badges de estado | Active nos locks: texto 14px, altura ~28px, ícone. Active nas propostas: texto 12px, altura 24px, sem ícone. Verde e contraste já coincidem. | Uma base `StatusBadge` com medidas, peso e padding comuns; ícone opcional. Os nomes e ícones pertencem ao contexto. O estado `Delegated` ocupa atualmente o lugar de uma ação: conservar essa apresentação como variante de estado na coluna de ações, sem o tornar um botão clicável. |
| Média | Cartões e cabeçalhos | Your account, Locks e Proposals já têm títulos de 20px/600, superfícies brancas, bordas finas e cantos de 8px, mas implementados em CSS separado. O espaçamento título/conteúdo também está repetido. | Extrair uma base de cartão e cabeçalho com título, descrição opcional, contagem e ação. Manter a disposição específica de cada conteúdo. Os títulos das propostas (24px) são títulos de documentos, não cabeçalhos de cartão. |
| Média | Informação de datas | O cooldown usa `PowerInfo`, data e hora UTC com segundos. O prazo de votação usa tooltip nativo via `title` e hora local. | Reutilizar o componente de informação e o mesmo formato de data exata/fuso. Manter a diferença entre os resumos visíveis: dias para cooldown; contagem detalhada para votação. |
| Média | Ações do boletim | Os botões da lista usam `ActionButton`; a submissão pública e secreta ainda usa `Button` ODS com classes adicionais. A confirmação regressa a `PowerAction`, alias de `ActionButton`. No mobile o botão de submissão observado mede 48px, enquanto Vote mede 46px. | Migrar as ações principais para a mesma família. Definir a cor de voto como variante explícita e partilhar disabled, loading, hover e foco. Verde continua reservado à ação de voto; Create proposal e Lock FOLD mantêm a decisão de cor já aprovada. |
| Média | Composição mobile | Cada lock ocupa ~201px; o ID fica numa linha isolada, seguido de valor, estado e ação. Delegates usam outra composição (~178px). | Uma regra comum para linhas de dados em mobile: identificador junto ao conteúdo principal, informação secundária abaixo, ação acessível no final. Não impor alturas fixas: endereços e estados têm comprimentos diferentes. Preservar os estados alinhados à direita e os dias à esquerda do badge, conforme decidido. |

## O que já está coerente

- Largura máxima de 1052px e alinhamento do header com os painéis.
- Fundo cinza, superfícies principais brancas e cantos de 8px.
- Create proposal e Vote com as mesmas dimensões: 260×52px no desktop medido e 316×46px a 390px.
- Estado Active com o mesmo verde `#205e3d` nas duas páginas.
- Identidade da carteira e badge Your wallet através de componentes comuns.
- Base dos diálogos, gestão de foco e animação partilhadas por `ActionTray`/`MorphDialog`.
- Voto público e secreto partilham `BallotPanel`, `BallotChoices` e `BallotReview`.

Estes componentes devem ser afinados e reutilizados; não precisam de uma segunda implementação.

## Diferenças que devem continuar explícitas

- **ID de lock e posição do delegate:** mesma aparência base, significados distintos.
- **Linha clicável e linha com ações:** a proposta abre detalhes; a linha de lock não inicia um levantamento ao clicar no fundo. Partilhar hover não implica partilhar o comportamento de clique. Manter cursor e foco adequados a cada interação.
- **Estado e ação:** Active/Delegated são estados; Vote/Select delegate são ações. Uma forma parecida não os deve tornar indistinguíveis.
- **Linha editorial e linha de dados:** propostas precisam de título, descrição e resultados. Partilhar a superfície não exige a mesma altura ou grelha das listas de locks/delegates.
- **Resumo e detalhe:** Your voting power continua a ter destaque superior aos valores das listas.
- **Tooltip informativo e popover interativo:** podem partilhar superfície, tipografia e seta, mas os controlos de carteira precisam de comportamento de foco próprio.

## Origem das divergências

- [accountPanels.module.css](../../app/plugins/velocker/components/accountPanels.module.css): `.locksCard` anula as margens da lista, o padding das linhas, a escala dos valores/badges e as dimensões das ações.
- [globals.css](../../app/pages/globals.css): regras de `.power-card` fazem as listas chegar às bordas; regras separadas voltam a definir zebra, hover, padding, fontes e fundos de botões. `.power-delegate-data > button` sobrepõe o fundo branco do botão secundário devido à maior especificidade.
- [delegateList.tsx](../../app/plugins/members/components/delegateList.tsx) e [yourLocks.tsx](../../app/plugins/velocker/components/yourLocks.tsx): identificação e linhas são construídas separadamente.
- [list.tsx](../../app/plugins/governance/pages/list.tsx) e [delegateDirectory.tsx](../../app/plugins/members/components/delegateDirectory.tsx): duas implementações de pesquisa.
- [proposalList.module.css](../../app/plugins/governance/pages/proposalList.module.css) e `accountPanels.module.css`: cabeçalhos equivalentes definidos separadamente.
- [proposalCountdown.tsx](../../app/components/proposal/proposalCountdown.tsx) e [cooldownTime.tsx](../../app/plugins/velocker/components/cooldownTime.tsx): apresentação e interação de datas exatas diferentes.
- [interface-consistency.md](interface-consistency.md) e [interface-catalogue.md](interface-catalogue.md) ainda contêm decisões antigas: locks colapsados, nenhuma numeração nos delegates, Create proposal no hero e todos os botões de propostas secundários. Também descrevem composições antigas de saldos. Não devem orientar alterações à versão atual sem reconciliação.

## Ordem recomendada

1. Fixar as decisões atuais na documentação e marcar as alternativas de `/design-locks` e `/design-proposals` como estudos, não regras do produto.
2. Consolidar a superfície das listas: extensão do hover, cor, divisórias, inset e foco.
3. Consolidar identificadores, valor/unidade e dimensões das ações de locks/delegates; ajustar a composição mobile em conjunto.
4. Reutilizar SearchField, base dos badges, cabeçalhos e informação de datas.
5. Migrar os botões restantes e remover apenas os overrides comprovadamente substituídos. Preservar as alternativas guardadas e as regras específicas de cada domínio.

Critério de validação: comparar lado a lado hover, foco, ação disabled/loading, dados longos e lista vazia; medir 1440, 1052, 768 e 390px. Confirmar que o ID real dos locks permanece estável ao alterar a ordem e que selecionar/filtrar delegates mantém o comportamento atual. Não submeter transações para validar estilos.

## Implementação e validação

- Superfície, hover/foco, separadores e padding comuns às linhas de locks e delegates. Foram removidos os overrides locais que recortavam o hover e o fundo transparente das ações.
- `RowIdentifier`, `ListTokenAmount`, `StatusBadge`, `PanelHeader` e `DeadlineInfo` partilhados. `SearchField` reutilizado nas propostas. `ActionButton`/`ActionLink` têm tamanho compacto explícito; as ações de voto usam `intent="vote"`.
- A documentação e o catálogo local foram reconciliados. As alternativas de design guardadas permanecem disponíveis.
- Browser: 1440, 1052, 768 e 390px, sem overflow horizontal nem erros de página observados. A 1440px, ambas as listas têm linhas de 76px, superfícies de 1050px e ações de 196×40px. A 390px, ambas têm superfícies de 356px e ações de 316×44px. As linhas crescem com o conteúdo.
- As duas pesquisas medem 52px desktop / 46px mobile. Create proposal e Vote mantêm 260×52px no desktop e 316×46px a 390px. Os badges partilham altura de 24px e texto de 12px/600.
- Abertura dos boletins público/secreto e confirmações de voto verificadas em desktop/mobile, incluindo a cor verde. Nenhuma confirmação de transação foi acionada no browser.
- Hover/foco neutros, tooltips com UTC/segundos, abertura/fecho e recuperação de foco do modal de lock, revisão de delegate, pesquisa sem resultados/limpeza e estados disabled/loading verificados. Um ID de lock longo foi ensaiado apenas no DOM de uma sessão isolada, sem overflow. Os filtros empilham no mobile para mostrar o método completo.
- TypeScript sem erros, lint sem erros (avisos existentes), 125 testes aprovados e build de produção concluído numa cópia temporária, mantendo o preview disponível.

Esta passagem consolida os componentes destas duas páginas. Não representa uma migração de todos os controlos de administração ou de todos os estados possíveis da aplicação.
