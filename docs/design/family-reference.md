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

A página apresenta três blocos de gestão: Voting power, Delegation e Your locks, seguidos do diretório público de delegates. No resumo, o total domina a coluna esquerda; as três origens aparecem como linhas menores na coluna direita. A elegibilidade fica sob o breakdown, e o saldo disponível acompanha Lock FOLD. Delegation é o único local permanente para alterar o delegado atual; usa os mesmos eixos das duas colunas, com fundo claro próprio. Your locks mantém as faixas e ações por lock.

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

### Hierarquia do resumo — 23 de setembro

A grelha anterior atribuía o mesmo tamanho e peso ao total e às suas três origens.
Foi revista a partir das demonstrações de [Family Values](https://benji.org/family-values)
e das capturas guardadas de Convex e Stake DAO. Da Family interessa a prioridade
clara da tarefa e o contexto secundário; de Convex, a separação visual entre resumo
e gestão. Estes exemplos orientam a organização, não determinam os nossos valores
tipográficos nem a mecânica de governance.

O total passa a 56–80 px em desktop (peso 600) e o breakdown a 22 px, disposto
em três linhas com rótulos e valores alinhados. Em mobile, o total usa 48–64 px
e as linhas 20 px. Os textos de apoio ficam em 12–14 px, mantendo contraste.
O botão Lock FOLD e o saldo disponível formam um grupo junto do total.
Elegibilidade e mínimo deixam de atravessar a página inteira.

As duas colunas do resumo definem também os eixos da faixa Delegation;
um fundo claro (`--cream`) distingue-a do resumo mint e de Your locks, mais
escuro. São superfícies de secção de ponta a ponta, sem acrescentar cartões
aninhados. O breakdown continua visível de origem.

### Revisão por frames dos modais — 23 de setembro, à noite

A abertura e o fecho foram pausados em intervalos de 40 ms na página local,
incluindo um fecho interrompendo a abertura. A versão anterior mostrava uma
superfície cinzenta vazia e cortava o título: o conteúdo permanecia na posição
final enquanto a superfície ainda se deslocava. A animação nativa do diálogo
também alterava a posição usada para medir o destino.

O conteúdo passa a acompanhar a superfície através de `translate`, mantendo o
texto sem escala e suprimindo o movimento nativo concorrente. A mudança para
branco acontece no início; o texto entra depois e sai antes do encolhimento.
O fecho permanece oculto durante a desmontagem do diálogo, evitando o flash
do painel completo. Foram verificados Lock FOLD, o seletor e a revisão de
delegação, bem como o regresso do foco e a remoção das superfícies temporárias.
Os controlos de pausa usados nesta inspeção foram retirados do código final.

A revisão seguinte incluiu também as trocas entre formulário, revisão e seletor.
O recorte foi substituído por um ajuste de escala uniforme, para os controlos
permanecerem inteiros dentro da superfície em movimento. Os passos passam a
ocupar o mesmo espaço medido, com saída e entrada de texto consecutivas; a
altura fica congelada se o utilizador fechar a meio dessa troca. Nos frames de
interrupção da abertura, a posição e o tamanho da superfície mantiveram-se
iguais antes e depois de Escape. Esta revisão substitui a abordagem anterior
de manter o texto sem escala e recortá-lo nas margens.

### Continuidade entre configuração e revisão — 24 de setembro

Na criação de locks, os elementos comuns aos dois passos mantêm-se visíveis e
viajam da posição anterior para a seguinte: montante, proprietário, delegado,
cooldown e ação principal. O separador acompanha o bloco de informação para
não atravessar o texto durante a troca. Só o conteúdo novo entra com opacidade.
O movimento dura 360 ms; a entrada de informação nova usa 180 ms. Inverter a
direção a meio parte da posição visual corrente. A preferência por movimento
reduzido elimina esta deslocação.

A inspeção pausada incluiu 0, 90 e 180 ms, o fim da transição e uma inversão aos
90 ms. A primeira inspeção detetou o salto do separador, corrigido na versão
final; na inversão, as posições dos elementos comuns mantiveram-se iguais.
Os controlos temporários desta inspeção foram retirados.

O seletor identifica explicitamente o delegado em vigor com “Current delegate”,
independentemente de existir outra seleção ainda por confirmar. A revisão do
lock conserva o “Edit” compacto junto do delegado; a revisão de delegação usa
a mesma ação, regressando à escolha sem enviar uma transação.

As [orientações de movimento da Base](https://brand.base.org/motion) reforçam
movimento breve, intencional e consistente. O [fluxo de supply da Aave](https://aave.com/help/supplying/supply-tokens)
serviu de referência para distinguir configuração e confirmação na wallet.
São princípios adaptados à Interfold; não foi reproduzido nem verificado o
movimento do modal conectado da Aave.

### Segunda inspeção das transições — 24 de setembro

O feedback seguinte mostrou que a inspeção da revisão não cobria os outros
percursos. Foram pausadas também a abertura a partir de Lock FOLD e Select
delegate, o fecho durante a abertura e a passagem de Review para o seletor.
O inspetor temporário passou a pausar tanto as animações JavaScript como as
transições CSS de altura, para comparar o mesmo instante em todas as camadas.

Problemas corrigidos: Edit repunha o formulário de preenchimento antes de a
revisão desaparecer; a identidade selecionada era apagada durante a saída da
revisão de delegação; o deslocamento lateral cortava o início das linhas; a seta
de voltar fazia o título saltar. O montante conserva também a última medição
válida quando um painel oculto comunica largura zero.

Na transformação de botão para modal, o título percorre uma trajetória própria
e o formulário entra quando a superfície já cresceu. O texto e os ícones do
botão de origem são preservados no regresso. O fundo acompanha o fecho, e os
rótulos de origem e destino deixam de se sobrepor no fim. Uma alternativa que
recortava o formulário sem escala foi rejeitada na inspeção visual por cortar
controlos nas margens.

Foram inspecionados frames em intervalos de 40 ms. Ao inverter a abertura aos
120 ms, a superfície conservou exatamente os limites; o conteúdo variou menos
de 0,1 px e manteve a opacidade. A revisão manteve o montante e o delegado no
primeiro frame e aos 40 ms da saída para o seletor. O inspetor foi removido.

Os botões do seletor de delegates passam de 196 para 128 px, conservando 48 px
de altura e a mesma largura entre Select, Selected e Delegated. A lista pública
mantém a largura das suas ações.

### Diagnóstico a partir do vídeo do utilizador — 24 de setembro, 01:22

Foram extraídos e inspecionados os 510 frames do vídeo de 11,87 segundos,
preservando a sequência e os timestamps. As verificações anteriores não tinham
detetado corretamente o problema que continuava visível no uso normal:

- Frames 74–78 (1,533–1,608 s): o formulário aparece sobre a página sem a
  superfície branca. No frame 79, a superfície entra abruptamente.
- Frames 111–133 (2,775–3,183 s): depois de a superfície fechar, o conteúdo do
  formulário reaparece em tamanho completo sobre a página.
- O defeito repete-se na segunda abertura do lock e nas duas aberturas do
  seletor de delegado, não apenas num percurso isolado.

O `DialogRoot` do ODS mantinha uma animação Framer Motion e uma fase de saída
próprias, concorrentes com a transformação do botão. Além disso, esconder o
antepassado com `visibility: hidden` não escondia os painéis que definiam
`visibility: visible`. O `MorphDialog` usa agora diretamente o diálogo Radix
para foco e dismissão, com uma única animação para a superfície, conteúdo,
título e fundo. No fim do fecho aplica `display: none` antes de cancelar as
animações e desmontar, impedindo o regresso dos descendentes visíveis.

Na versão corrigida foram inspecionadas posições intermédias em intervalos de
40 ms e recolhidas medições a cada frame durante 900 ms. No fecho medido, a
opacidade do conteúdo chegou a zero aos 105 ms, o diálogo já não existia aos
313 ms e não reapareceu até ao fim da recolha. O foco regressou a Lock FOLD;
não ficaram superfícies, títulos ou marcadores de origem temporários. Ao
interromper a abertura aos 80 ms, os limites da superfície e a opacidade do
conteúdo mantiveram-se, com variação inferior a 0,1 px no conteúdo.

Foram também percorridos os seletores dentro e fora do lock, a revisão de voto
com máscara e a retirada aberta a partir do preview. Os dois seletores usam
`ActionTray`, 560 px de largura, o mesmo título e os mesmos botões de 128 × 48 px.
O preview permanece sob o fundo do modal e conserva o botão de origem para o
regresso. A revisão de voto partilha a transformação; as opções de máscara
entram com expansão de altura. A instrumentação temporária foi removida.


### Entrada e continuidade do título — vídeo de 24 de setembro, 02:02

Foram extraídos os 270 frames do novo vídeo (4,687 segundos), preservando os
seus timestamps, e inspecionadas as nove folhas de 30 frames consecutivos.
Os frames 109–116 mostram o conteúdo a avançar sobre a página enquanto a
superfície e o título ficam para trás; no 117 a superfície aparece já grande.
A saída (186–201) conserva passos intermédios visíveis.

A medição da versão anterior mostrou um intervalo de cerca de 190 ms entre
callbacks durante a montagem. A superfície animava `left/top/width/height` e o
título `left/top`, dependentes do trabalho de layout, enquanto o formulário
animava escala e opacidade. Essa diferença permitia ao conteúdo avançar sem
as outras camadas. Pausar a animação não reproduzia esse bloqueio da entrada.

A geometria da superfície e do título usa agora transformações, com a mudança
de cor da superfície numa camada de opacidade. A origem é pintada antes de
iniciar o movimento. Quando o rótulo e o título são iguais, como em Lock FOLD,
um único texto permanece visível durante todo o percurso; só a sua cor muda.
A abertura dura 400 ms com desaceleração menos abrupta, e o fecho 280 ms.
Os cantos compensam a escala para conservar a forma ao crescer.

Foram inspecionados pontos intermédios em passos de 40 ms e uma inversão aos
120 ms: superfície e título conservaram as posições (diferença inferior a
0,001 px); o conteúdo manteve a opacidade, com variação de largura inferior a
0,06 px. Uma abertura normal recolheu 82 amostras durante 800 ms; o título
permaneceu com opacidade 1 em todas as amostras da viagem. Esta medição não é
uma afirmação de FPS constante: os callbacks ainda incluem trabalho de
montagem, mas já não comandam a geometria da animação. O seletor de delegado
foi também percorrido. O fecho repõe o foco em Lock FOLD e elimina todas as
camadas temporárias. A instrumentação de inspeção foi removida.


### Revisão do vídeo de 24 de setembro, 02:34

Inspeção das sequências de abertura, fecho, troca de passo e hover do vídeo de 21,32 s (1.230 frames extraídos). Problemas observados: título da revisão a entrar no botão de origem no fecho; corpo a desaparecer cedo, deixando a superfície vazia; cabeçalho a mudar antes do corpo ao voltar ao seletor; recuo durante o carregamento da lista por volta de 10,65 s; popovers da wallet e dos locks sobrepostos.

A etiqueta de origem acompanha agora a superfície e troca com o título sem sobreposição das palavras. O corpo permanece durante a primeira metade do fecho. O cabeçalho usa o mesmo tempo de saída/entrada dos painéis. O seletor reserva a altura da lista antes de carregar os resultados. A cópia do botão transfere apenas os estilos necessários, evitando copiar centenas de propriedades por elemento no início da abertura. O título partilhado de Lock FOLD mantém opacidade total e troca de tinta sem ficar cinzento sobre cinzento.

Os popovers de wallet e locks partilham um único espaço de hover, com atraso breve de entrada e saída animada. Uma origem de modal dentro do preview mantém-se montada até ao regresso. Os estados mantêm a paleta original: verde (ativo), azul-claro (cooldown) e verde-petróleo (disponível); ações de levantamento usam os mesmos botões neutros/primários das restantes ações.

Validação na página local: registo de abertura do seletor com 52 amostras e fecho com 35, ambos sem inversões de largura; inspeção visual pausada a 40/120 ms na troca de passo, com opacidades de cabeçalho e corpo coincidentes; fecho a 160 ms sem o título comprido dentro do botão; Lock FOLD com título visível em todas as 18 amostras de uma abertura normal e sem inversões; abertura/fecho a partir de Start withdrawal no preview com a origem preservada. Instrumentação temporária removida.

### Navegação das propostas — vídeo de 29 de setembro, 15:59

Foram extraídos e inspecionados os 272 frames nativos do vídeo de 6,733 s,
preservando os timestamps. Na abertura, os frames 88–98 (1,533–1,717 s)
mostram apenas o título sobre o fundo; o detalhe reaparece a 1,733 s. No
regresso, o mesmo acontece nos frames 217–228 (4,800–4,983 s), antes de a
lista reaparecer a 5,000 s. A mudança também sobrepunha dois tamanhos do
título e deslocava a lista com a alteração do scroll.

A navegação transporta agora a superfície, título, resumo, autor, estado,
método e prazo. A restante página cruza as duas imagens do viewport sem
intervalo vazio nem deslocação da lista. Um único texto por facto evita a
duplicação; o ajuste proporcional conserva a forma das letras. O documento
e o boletim entram durante a segunda metade dos 400 ms. O destino só é
marcado como pronto quando o título carregou, para não capturar o cabeçalho
provisório antes do resumo. Elementos sem correspondência conservam a sua
saída, incluindo o regresso de uma ligação aberta diretamente.

A versão corrigida foi inspecionada em posições intermédias de abertura e
regresso, com as animações pausadas. Foram também percorridos a proposta pública, uma lista filtrada
com detalhes expandidos, navegação por teclado e o formato de 390 px.
O foco regressou ao título de origem e os nomes temporários desapareceram
no fim. Os controlos de pausa foram removidos do código final.

### Regresso à lista e estabilidade — 29 de setembro

O regresso tem agora uma sequência própria de 360 ms, com a curva de fecho
do `MorphDialog`. O documento e o boletim recolhem primeiro; a informação
partilhada conserva a aparência de origem até aos 240 ms, quando adota a
tipografia da lista sem sobrepor duas cópias. Os controlos da linha regressam
nos últimos 120 ms.

As medições são agrupadas antes de atribuir os nomes da transição. As imagens
capturadas mantêm dimensões fixas e viajam por transformações; o texto deixa
de mudar de escala em função da proporção da sua coluna. Os cantos acompanham
a superfície. Em filas empilhadas, o prazo sai antes de atravessar o texto e
regressa junto dos controlos. O resumo comprido é recolhido até à altura da
linha, para não passar por cima do autor.

Foram inspecionadas posições intermédias em desktop e a 390 px, incluindo a
proposta pública numa lista filtrada. A inspeção móvel detetou a colisão entre
resumo, autor e prazo; a correção foi verificada no mesmo ponto do percurso.
Num regresso normal, a preparação demorou cerca de 33 ms e o maior intervalo
entre callbacks durante o movimento foi cerca de 34 ms. A primeira abertura
teve cerca de 119 ms de preparação. Estas medições locais não garantem FPS
constante. O inspetor temporário foi removido.
