# Referências de organização para criar locks

Pesquisa de 22 de setembro de 2026, após o utilizador rejeitar a criação de um lock apresentada como um botão no cabeçalho da lista. A alteração de cor/tamanho não resolveu a localização e a relação da ação com o conteúdo.

## Exemplos inspecionados

- [Convex — Lock CVX](https://www.convexfinance.com/lock-cvx): interface pública atual, sem wallet. O formulário de criação está diretamente na coluna principal; a área dos locks existentes e a delegação ocupam outra coluna. `convex-overview.png` e `convex-lock-form.png`.
- [Stake DAO — SDT](https://app.stakedao.org/sdt): interface pública atual, sem wallet. Resumo no topo, área de operações com Stake / Request Unstake / Redeem. Foi aberto apenas o separador Request Unstake, sem submissão. `stakedao-stake.png` e `stakedao-request-unstake.png`.
- [Curve — guia de locking](https://docs.curve.finance/user/vecrv/how-to-lock): o guia mostra formulário dedicado com quantidade, prazo e aprovação/criação. A captura representa a versão ilustrada na documentação, não uma validação da interface ligada atual. `curve-lock-guide.png` é uma captura do exemplo oficial aberto no navegador; as margens pretas vêm do visualizador de imagens.

A interface atual da Curve e a da Velodrome exigiram ligação de wallet para ver os locks. Não ligámos nenhuma carteira e não inferimos os seus estados autenticados. Balancer/veBAL e Pendle/vePENDLE têm fluxos em descontinuação/migração segundo fontes oficiais atuais; não foram usados como recomendações atuais.

## Direções a discutir

1. Preferida: integrar a criação no bloco Voting power, associada ao saldo FOLD disponível. Campo de quantidade visível, contexto do cooldown e revisão local. A lista Your locks passa a conter exclusivamente a gestão dos locks existentes.
2. Alternativa: vista própria de criação, aberta a partir do saldo disponível, com regresso explícito ao resumo. Dá máxima separação à tarefa, mas implica mudança de vista.

São propostas de organização. Não copiar o excesso de texto/caixas dos exemplos nem as suas regras económicas: Interfold mantém a sua delegação e o seu cooldown, sem inventar prazo de lock, recompensas ou multiplicadores.

## Proposta em avaliação: lock + delegate

Comparação com a versão original, em 24 de setembro de 2026: a página pública de [Voting power](https://governance.theinterfold.com/plugins/lock/#/) exige ligação à wallet para mostrar as operações. No código original disponível em `main` (`d896294011430a4828ec8da07667208a826dd00c`, `app/plugins/velocker/pages/index.tsx`), **Lock FOLD** contém apenas o montante, saldo, Max e **Approve and lock**; **Delegate your locks to someone else** é um bloco separado, com endereço e **Delegate locks**. Foi consultada a página sem ligar uma wallet; o percurso ligado foi confirmado no código, não executado no site.

O utilizador aprovou uma experiência local para apresentar à equipa, sem tratar a organização como decisão definitiva. O formulário reúne montante, delegado e revisão. A escolha atual aparece no resumo da conta e pode ser alterada sem criar um lock; deixou de ocupar um terceiro bloco principal.

A escolha do delegado acontece na configuração do lock, com o delegado atual selecionado por defeito. A revisão apresenta a identidade e um botão discreto **Edit**. Editar regressa à configuração e exige uma nova passagem pela revisão. O montante mantém o mesmo elemento e os mesmos algarismos tabulares entre os passos; FOLD aproxima-se do valor quando o campo passa a ser apenas de leitura.

Escolher um delegado no formulário altera apenas o rascunho. Mantendo o delegado atual, novos locks seguem-no sem uma nova transação de delegação. Escolhendo outro, a revisão explica que a mudança afeta também os locks existentes e futuros. Bonded e vesting FOLD mantêm as suas regras.

A aplicação conduz a aprovação exata de FOLD, a criação do lock e, quando necessária, a delegação. Isto não transforma as chamadas numa transação atómica: podem existir várias confirmações na wallet. Se o lock for concluído e a delegação falhar, o utilizador pode repetir apenas a delegação ou terminá-la mais tarde no resumo da conta.

Validado em desktop e a 391 px, com rascunho e foco preservados. Testes de sequência verificam falha do lock, repetição de delegação sem novo lock, manutenção do delegado e interrupção após mudança de wallet. Os testes da wallet de demonstração continuam a impedir assinaturas e transações. Não foram executadas transações reais.

O formulário distingue **Lock owner** de **Voting delegate**. O proprietário pode ser a própria wallet ou outra conta. Para a própria wallet, mantém-se a escolha de delegado; para outra conta, o destinatário recebe a propriedade e gere a sua delegação. A revisão mostra o endereço completo e um aviso de transferência de propriedade junto dele. Não se altera a delegação de quem paga.

A 23 de setembro de 2026 foi consultado o [código publicado para o escrow configurado](https://etherscan.io/address/0x71360F335e4Ec9c010e29bA7171bc62c9B4c1F12#code): `createLockFor(uint256,address)` retira os FOLD ao chamador e emite o NFT para o destinatário. A app usa esta função para outra wallet e mantém `createLock(amount)` para o próprio. Os testes verificam destinatário/montante, rejeição de endereço inválido ou zero antes da aprovação, e ausência de delegação da conta pagadora neste percurso. Não foram enviadas transações.

### Nota para acompanhar a apresentação

Nesta versão experimentei juntar lock e delegação num único fluxo, para escolher o montante e quem vota com ele antes de confirmar. É uma proposta de UX para avaliarmos. Mantém-se a regra atual: mudar o delegado afeta também os locks existentes. A wallet continua a pedir as confirmações necessárias; o que muda é a organização do percurso.
