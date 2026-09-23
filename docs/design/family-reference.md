# Family → Interfold governance

Estudo de 22 de setembro de 2026. Referências: demonstrações públicas da Family, documentação de utilização e o artigo do Benji. A app nativa não foi testada com uma wallet ligada.

## O que corrigimos já

O peso da Inter tinha sido aumentado, mas o espaçamento dos números continuava com os valores anteriores: −1,2 px no total e no campo de quantidade; −0,6 px no breakdown. O total e o breakdown também usavam algarismos tabulares, embora não fossem colunas de uma tabela.

Agora o total, o breakdown e o campo de quantidade usam espaçamento normal e algarismos proporcionais. A tabela de locks mantém algarismos tabulares para comparar linhas. A unidade FOLD passou a ter menos destaque do que o valor. Mantêm-se os pesos 500 no texto e 600 nos valores principais.

A documentação da [Inter](https://rsms.me/inter/#features) distingue os algarismos tabulares, destinados ao alinhamento de colunas, das formas normais. Não é necessário comprimir manualmente todos os números para obter uma aparência cuidada.

## O que observámos na Family

No [exemplo de swap](https://family.co/videos/swap.mp4), a quantidade ocupa o centro da tarefa; o ativo, saldo disponível, equivalente e ação seguinte têm papéis visuais distintos. O botão “Use Max” está associado ao saldo disponível. As listas apresentadas no [site da Family](https://family.co/) colocam nome e quantidade secundária à esquerda, e valor à direita.

Os exemplos SVG do site identificam a fonte como “LFE Sans”, enquanto o texto do site usa também Inter. Isto não permite afirmar qual é o ficheiro tipográfico usado pela app nativa. Os valores de tracking de uma fonte não devem ser transplantados diretamente para outra.

Em [Family Values](https://benji.org/family-values), Benji descreve painéis temporários que apresentam uma tarefa de cada vez, preservam o contexto e mudam de dimensão ao avançar. Elementos partilhados continuam visíveis entre etapas. A recomendação para Interfold é aplicar estas relações entre ações e conteúdo.

## Adaptação proposta para a nossa página

| Área | Decisão proposta |
| --- | --- |
| Voting power | Manter o total como ponto de entrada, o breakdown sempre visível e o ⓘ junto do título. Mostrar valor, unidade e informação de apoio com três níveis claros. |
| Your locks | Manter as faixas e os separadores pedidos. Agrupar a informação de cada lock: quantidade, delegado e estado; colocar a ação correspondente na mesma linha. |
| Lock & delegate | Lock FOLD abre um painel próprio: montante e proprietário primeiro; delegado e consequências na revisão. A escolha do delegado mantém-se dentro do mesmo painel. |
| Change delegate | Preservar o painel existente. Na passagem de seleção para revisão, conservar nome e endereço do delegado visíveis e animar apenas a alteração de conteúdo e altura. |
| Votar | Manter a proposta visível por trás da interação. Transportar a opção escolhida até à revisão para ser claro o que está prestes a ser confirmado. |

A página apresenta três blocos: Voting power, Delegation e Your locks. Total e três origens do poder de voto partilham uma grelha horizontal de quatro colunas (duas em mobile), com rótulos e valores alinhados. Elegibilidade e saldo disponível são informação secundária, numa faixa abaixo. Delegation é o único local da página para alterar o delegado atual; usa os mesmos eixos da grelha. Your locks mantém as faixas e ações por lock.

Lock FOLD é a ação global no cabeçalho, distinta da gestão de locks existentes. Abre um painel temporário: primeiro montante e proprietário, depois revisão com o delegado. O seletor dos 26 delegates substitui o conteúdo dentro desse painel, sem abrir outro modal por cima. Voltar mantém o montante, o proprietário e o delegate escolhido. A revisão identifica quando a escolha afeta locks existentes e futuros; para outro proprietário, mantém o aviso de transferência e não oferece alterar a delegação do pagador. Fechar preserva o rascunho, mas não envia nenhuma transação.

Os erros de quantidade aparecem sob o campo, junto do saldo e de “Use max”; a própria expansão do conteúdo movimenta o formulário e a ação, sem uma segunda animação de altura. As revisões de retirada continuam num painel específico, com montante exato e consequência antes da confirmação. As funções de transação e a proteção da wallet de demonstração foram preservadas.

Na delegação, o montante de FOLD ativo e o endereço escolhido têm o mesmo tamanho e peso. Foram retirados os indicadores “01 Choose / 02 Review”; “← Choose delegate” regressa à seleção dentro do mesmo painel, preservando a pesquisa.
## Como avaliar a próxima iteração

- Abrir e fechar sem deslocar a posição da página.
- Voltar de uma revisão com os dados preenchidos intactos.
- Manter visíveis quantidade e destinatário entre os passos que os usam.
- Usar “Continuar” para avançar e uma ação específica para confirmar.
- Testar rato, teclado, toque e preferência por movimento reduzido.

Mais referências: [ver tokens](https://family.co/support/view-your-tokens), [fluxo de envio](https://family.co/support/send-tokens), [revisão de uma troca](https://family.co/support/swap-tokens) e [gestão de wallets](https://family.co/support/mission-control).

### Aviso de propriedade — 23 de setembro

Ao criar um lock para outra wallet, a consequência aparece junto do endereço: fundo âmbar suave, ícone de aviso, título com peso 600 e explicação curta. Mantém-se visível na revisão. A [documentação de transações da Family](https://family.co/support/transactions) fundamenta mostrar consequências antes da confirmação; o tratamento visual âmbar é uma adaptação para esta interface, não uma reprodução verificada de um aviso da app nativa. Não se acrescentou um modal ou confirmação extra. O aviso e a validação partilham uma única animação de altura para o resto do formulário acompanhar a mudança.


### Diretório e distância ao footer — 23 de setembro

A lista pública de delegates reaparece depois de Your locks, com as mesmas 26
entradas usadas no seletor, nomes ENS, poder de voto e faixas alternadas. Selecionar
uma linha abre diretamente a revisão da delegação; fechar regressa ao botão de
origem sem deslocar a página para o resumo.

O intervalo entre o último conteúdo e o footer foi medido na
[homepage original](https://www.theinterfold.com/): a última secção usa
`pb-[64px] md:pb-[224px]` (breakpoint de 768 px). Voting power aplica os mesmos
64 px em mobile e 224 px em desktop através de `--page-outro-space`, sem somar o
padding habitual de 40 px da secção final.
