# Auditoria — Voting power e Proposals

27 de setembro de 2026. Resultados e propostas de correção; esta passagem não altera a interface.

## Âmbito e evidência

Revisão do estado atual de `/plugins/lock/#/`, `/plugins/proposals/#/` e `/plugins/proposals/#/new`, incluindo componentes partilhados, estados de leitura, criação, delegação, levantamento, filtros e apresentação das propostas. As alternativas guardadas em `/design-*` não são a referência de produção.

O acesso ao preview pelo browser foi bloqueado pela política de acesso nesta sessão. Não houve inspeção visual nova nem medição de layouts. As conclusões funcionais abaixo vêm da leitura do código e, quando indicado, de reproduções isoladas das funções atuais com dependências simuladas. As observações de estilos dizem respeito às regras e aos componentes usados; responsive, alinhamento final, hover, foco e animações precisam de confirmação visual.

Validação realizada:

- Suite normal: **111 testes passaram**, 19 testes exclusivos do preview foram ignorados nesse modo.
- Suite do preview em desenvolvimento: **os restantes 19 passaram**, incluindo isolamento de transações, lock, delegação, levantamento e voto público simulados. Total: **130 testes distintos aprovados**.
- TypeScript sem erros. Lint dos componentes/páginas revistos sem erros; oito avisos de estilo existentes.
- Reproduções adicionais: recuperação da lista após erro RPC; links sem protocolo; rótulo da fase de veto; erro de upload nos dois métodos; elegibilidade com erro de leitura e com delegação já existente. Estas reproduções confirmaram os problemas descritos, apesar de a suite existente passar.
- Nenhuma transação ou publicação real efetuada.

## Problemas funcionais

### 1. Alta — uma falha ao carregar propostas pode esconder o histórico até recarregar a página

**Cenário:** o indexador está indisponível e a leitura alternativa de eventos falha. A lista converte o erro em `[]` e avança o bloco a partir do qual continuará a procurar. Na tentativa seguinte, consulta só os blocos novos; as propostas antigas ficam por carregar. Sem entradas, apresenta a mensagem de lista vazia; com entradas parciais, não avisa que faltam dados.

**Reprodução:** falha ao procurar desde o bloco 1 até ao 100; recuperação no bloco 101; uma proposta existente no bloco 50 continuou ausente. Pedidos feitos desde `1` e `101`; erro apresentado: nenhum.

**Origem:** `app/plugins/governance/pages/list.tsx:121–138`.

**Proposta:** guardar progresso apenas das fontes que foram lidas com sucesso, manter o intervalo falhado para nova tentativa e apresentar erro recuperável com “Try again”. Preservar as propostas que já estavam visíveis.

### 2. Média — o contador de cooldown termina, mas o estado e a ação podem não atualizar

**Cenário:** deixar a página aberta até um levantamento ficar disponível. `CooldownTime` atualiza a cada segundo e chega a “Ended”, mas `canExit` foi guardado na leitura inicial. `useVeLocks` só volta a ler quando mudam as suas dependências ou alguém chama `refetch`; o fim do contador não o faz. A linha pode continuar com “In cooldown” e “Cancel withdrawal”, sem oferecer “Withdraw FOLD”.

**Origem:** `app/plugins/velocker/hooks/useVeLocks.ts:97–137`, `app/plugins/velocker/components/cooldownTime.tsx:5–22`, `app/plugins/velocker/components/yourLocks.tsx:133–159`.

**Proposta:** atualizar a leitura de disponibilidade quando um prazo termina e manter os dados atualizados enquanto a página está aberta. Usar a resposta do contrato para disponibilizar o levantamento, sem assumir que o relógio local autoriza uma transação. Reutilizar os mesmos badges e `WithdrawalButton`.

### 3. Média — erro no upload de uma proposta não dá feedback ao utilizador

**Cenário:** os campos são válidos, mas o envio dos metadados falha antes do pedido à carteira. Nos dois métodos, o `catch` apenas regista o erro na consola e termina o loading. O utilizador vê o botão voltar ao normal sem explicação nem confirmação de que a proposta não foi criada.

**Reprodução:** upload simulado rejeitado nos dois hooks; loading passou de `true` para `false`; **zero alertas**.

**Origem:** `app/plugins/crispVoting/hooks/useCreateProposal.ts:97,127–130`; `app/plugins/tokenVoting/hooks/useCreateProposal.ts:79,102–105`; `app/utils/ipfs.ts:31–44`.

**Proposta:** mostrar uma mensagem recuperável perto de Submit, preservar o rascunho e permitir tentar novamente. Diferenciar falhas de preparação/upload das falhas de transação que já têm feedback, evitando mensagens duplicadas.

### 4. Média — propostas cuja criação falhou ficam com um spinner permanente e perdem-se nos filtros

**Cenário:** o SPP existe, mas a criação da subproposta falhou. As duas linhas passam `loading` com a mensagem “Sub-proposal creation failed”. O estado terminal é apresentado como trabalho ainda a decorrer, sem detalhes acessíveis pela linha. Como o componente interno não chega a montar, também não comunica estado nem texto pesquisável à lista.

**Impacto:** a proposta desaparece ao filtrar por estado; uma pesquisa sem correspondências pode continuar em “Checking proposals…” porque a lista espera informação que nunca chegará. Erros de leitura do SPP também não são diferenciados do carregamento nessas ramificações.

**Origem:** `app/plugins/governance/components/privateRow.tsx:29–42`, `app/plugins/governance/components/publicRow.tsx:30–49`, `app/plugins/governance/pages/list.tsx:170`.

**Proposta:** apresentar um estado terminal explícito na mesma `ProposalRow`, conservar ID/autor/metadados disponíveis e acesso ao detalhe, e comunicar a resolução à pesquisa e aos filtros. Erros temporários devem permitir nova tentativa, sem serem confundidos com esta falha terminal.

### 5. Média — Supporting links aceita endereços que depois abrem no sítio errado

**Cenário:** adicionar `forum.example.com/topic/1` sem protocolo. O validador aceita; os metadados são guardados sem normalização; `CardResources` usa o texto diretamente em `href`. O browser interpreta-o como um caminho relativo do governance.

**Reprodução:** validação sem erros; com base `https://governance.example/plugins/proposals/`, o destino resultante foi `https://governance.example/plugins/proposals/forum.example.com/topic/1`.

**Origem:** `app/plugins/governance/utils/proposalValidation.ts:20`, `app/utils/input-values.ts:5`, `app/components/proposal/cardResources.tsx:25`.

**Proposta:** normalizar URLs sem protocolo para HTTPS antes de guardar e usar a mesma regra ao apresentar recursos existentes. Manter feedback inline para valores inválidos. Não depender apenas de `type="url"`, porque a submissão atual não usa a validação nativa de um formulário.

### 6. Média — “veto” e “approval” ainda se contradizem em alguns textos

**Cenário A:** criar uma proposta num processo configurado para aprovação explícita. O composer diz sempre que se segue “the foundation veto window”, apesar de `isApprovalStage`/`nextStageName` já distinguirem os dois mecanismos.

**Cenário B:** uma proposta está efetivamente em “Veto period”. O texto de prazo devolve “Awaiting Foundation approval”, embora esse processo espere o fim da janela sem veto.

**Reprodução:** chamada de `rowTimingLabel` com `statusLabel: "Veto period"` devolveu “Awaiting Foundation approval”.

**Origem:** `app/plugins/governance/components/proposalComposer.tsx:388`, `app/plugins/governance/components/proposalRow.tsx:214–215`. Regra já existente: `app/plugins/spp/utils/status.ts`.

**Proposta:** reutilizar a configuração e os helpers existentes para o texto da criação, os estados, os filtros e os prazos. Manter “aprovação explícita” e “janela sem veto” distintos.

### 7. Média — falhar a leitura da elegibilidade pode ser apresentado como falta de voting power

**Cenário:** uma leitura de configuração ou poder de voto falha. Os hooks expõem loading e resultado, mas não propagam o erro; quando o pedido termina, `canCreate` fica falso. O editor mostra “You don't have enough voting power…” em vez de explicar que não conseguiu verificar.

**Reprodução:** leituras sem dados, com erro e loading terminado produziram `canCreate: false`, `isLoading: false` e nenhum estado de erro exposto.

**Origem:** `app/plugins/crispVoting/hooks/useCanCreateProposal.ts:92–124`, `app/plugins/tokenVoting/hooks/useCanCreateProposal.ts:76–99`, respetivos componentes de elegibilidade em `pages/new.tsx`.

**Proposta:** separar carregamento, indisponibilidade e insuficiência confirmada. Reutilizar a distinção que os boletins já fazem em `BallotEligibilityNotice`, sem presumir zero para leituras em falta.

### 8. Média — o convite para delegar a si próprio pode explicar incorretamente a situação da carteira

**Cenário:** a carteira já delegou a outra pessoa, mantém algum poder pessoal e está abaixo do mínimo para criar. `needsDelegation` pode ser verdadeiro mesmo com `isDelegated: true` e voting power não nulo. A mensagem afirma, contudo, que os tokens ainda não foram delegados e que o poder de voto é zero.

**Reprodução:** mínimo 150, voting power 100, saldo de voto 200 e um delegate existente resultaram em `needsDelegation: true` e `isDelegated: true`. O ramo da mensagem continua a dizer “aren't delegated yet” e “reads as zero”.

**Impacto:** “Delegate to myself” pode substituir uma escolha de delegação existente. Isso deve ser compreensível antes da ação, como já acontece no fluxo normal de Your delegation.

**Origem:** `app/plugins/crispVoting/hooks/useCanCreateProposal.ts:101–115`, `app/plugins/crispVoting/pages/new.tsx:68–73`; a explicação da lista em `app/plugins/governance/pages/list.tsx` também presume ausência de delegação.

**Proposta:** explicar os valores reais e o delegate atual. Quando necessário, encaminhar para o diálogo de delegação existente, com o âmbito da mudança, em vez de apresentar uma ativação inicial genérica.

## Incongruências da família de componentes

### 9. Feedback de erro ainda usa duas apresentações

- Novo composer: `FieldError`, `--ui-label-font` (12px/500), cores `critical-500/600` e fundo vermelho discreto.
- Lock: `.power-field-error` (13px/500), vermelho literal `#ac4936`, e linha do owner com `#a94332`.
- Lock valida vários valores durante a escrita; o composer revela erros após uma tentativa. A diferença de momento pode ser intencional, mas a apresentação equivalente deve ser partilhada.

**Origem:** `app/pages/globals.css:1944–1947,2148,2952,2975`; `app/plugins/velocker/components/lockForm.tsx:262–264`.

**Proposta concreta:** uma apresentação comum de erro inline, com os tokens existentes, ligação ao campo e anúncio acessível. Preservar a animação/disclosure do lock e as regras de obrigatoriedade de cada formulário. Afeta o composer, o montante de lock e o campo do owner; precisa da aprovação prevista para alterar componentes existentes.

### 10. “Connect wallet” e alguns estados vazios ainda escapam à família de ações

`MissingContentView` usa diretamente `Button` ODS `size="md"`, variante primária e um contentor centrado. Já `BallotEligibilityNotice` usa `PowerAction`, alias da família `ActionButton`. A mesma ação e estados de ajuda semelhantes não passam pela mesma definição de dimensão, tipografia e interação.

**Origem:** `app/components/MissingContentView.tsx:25–29`, `app/components/proposalVoting/ballotEligibility.tsx`.

**Proposta concreta:** reutilizar `ActionButton` em `MissingContentView` e definir o alinhamento pelo contexto. Inventariar os consumidores deste componente antes de alterar, porque o efeito ultrapassa as duas páginas. Não criar outra versão só para o lock ou para proposals.

### 11. Informação desconhecida e campos opcionais precisam de texto mais preciso

- Your delegation pode mostrar “Loading…” no destinatário e, logo abaixo, “Votes with your locked FOLD…”, antes de conhecer a delegação (`app/plugins/velocker/pages/index.tsx:188–190,323–330`).
- FOLD balance mostra “Balance breakdown unavailable” também durante o carregamento inicial (`app/plugins/velocker/components/foldBalanceBreakdown.tsx:43–47`).
- Description é opcional na validação, mas o seu rótulo não o indica. Supporting links e DAO actions já comunicam opcionalidade. Os campos obrigatórios só se distinguem visualmente após a primeira tentativa (`app/plugins/governance/components/proposalComposer.tsx:107–142`).

**Proposta:** copy específica para carregar / erro / vazio, sem afirmar factos ainda desconhecidos; identificar “Description (optional)” e manter as mensagens inline concisas.

## O que já está coerente no código

- Header/footer vêm da mesma implementação partilhada, com conteúdo do governance e fundo comum.
- Largura de conteúdo definida no token de 1052px; cabeçalhos externos usam `PanelHeader`.
- Create proposal e Vote usam o tamanho regular da mesma família; locks/delegates usam a opção compacta. Essa diferença foi escolhida pelo utilizador e tem um papel definido, não é uma inconsistência a eliminar.
- Pesquisas usam `SearchField`; estados usam `StatusBadge`; valores das listas usam `ListTokenAmount`; identidades usam `AddressText`/`EnsMember`.
- Locks e delegates partilham o hover neutro, divisórias e insets; propostas reutilizam a superfície neutra com ênfase verde no voto ativo.
- `#ID` de um lock é identidade estável; número de um delegate é posição da lista apresentada. O estilo base já é partilhado. Remover a numeração dos delegates continua a ser uma opção de simplificação, não um erro de cálculo nem uma mudança aplicada nesta auditoria.
- A validação recente da proposta não envia campos incompletos para upload/criação, limpa os erros ao corrigir e conserva description/actions/links como opcionais.

## Ordem proposta e verificação seguinte

1. Corrigir a recuperação da lista e o feedback de falhas de upload/leitura/criação. São os casos que mais parecem ausência de dados ou botões sem efeito.
2. Corrigir a atualização ao fim do cooldown, a normalização dos links e a copy baseada no modo da foundation/delegação.
3. Com aprovação, consolidar a apresentação de erros e `MissingContentView` nos componentes existentes.
4. Confirmar visualmente as duas páginas e os diálogos a 1440, 1052, 768 e 390px, com carteira desligada, reads lentos/falhados, lista vazia, endereços longos, teclado e movimento reduzido. Repetir o cenário de prazo terminado sem recarregar. Esta verificação visual permanece pendente.

Os testes aprovados dão cobertura à lógica existente, mas não substituem estes casos de falha e transição da interface. As reproduções desta auditoria devem tornar-se testes de regressão ao aplicar as correções.
