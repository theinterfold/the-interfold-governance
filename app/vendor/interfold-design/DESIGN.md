# Interfold — fonte de design partilhada

Este documento é a fonte comum de design do site principal e da Governance. As regras do produto estão em [Governance/DESIGN.md](../Governance/DESIGN.md). Não copiar e manter duas versões destas regras.

## Precedência e controlo

1. Pedidos explícitos atuais do utilizador.
2. Este documento: marca, fundamentos e valores partilhados.
3. [Guia da Governance](../Governance/DESIGN.md): regras específicas do produto.
4. Estudos e referências históricas: contexto, não substituem decisões atuais.

O bloco `interfold-tokens` abaixo é executável: a Governance lê-o ao iniciar e ao construir. Durante `bun dev`, alterações guardadas neste bloco regeneram o CSS e aparecem por hot reload. Também podes executar `bun run design:sync` em `Governance/app`.

**Alterar a prosa define regras para a próxima implementação; não reescreve componentes automaticamente.** O bloco controla cores, superfícies, fontes (as fontes precisam de estar disponíveis), raios, contornos, espaçamentos, alturas de ações e motion. Estrutura, copy e comportamento continuam em componentes.

O site de marketing mantém a sua implementação atual; este documento não transforma automaticamente todos os seus valores existentes em tokens. A ligação executável descrita aqui controla a Governance. Alterações ao header/footer continuam a usar o processo partilhado abaixo.

## Origem da paleta

O verde `#3a5e3c`, a menta `#d9fce8` e Interfold Black `#121718` vêm da implementação do site principal (`src/styles/index.css` e `packages/site-header/src/styles.css`). As superfícies neutras são papéis da Governance definidos nesta fonte comum. Não inventar uma segunda variante de verde para voto ou sucesso: ambos herdam `brand-green`.

## Linguagem visual

- O site principal mantém a expressão editorial da marca. Governance e o futuro dashboard usam mais cinzento e menos Gramercy: explicações e copy funcional usam Inter; os títulos editoriais e o wordmark podem conservar Gramercy. Símbolo, grelha do chrome, controlos equivalentes, foco, links e comportamento de motion mantêm uma origem comum. A diferença de identidade não justifica diferenças de comportamento nos mesmos papéis.
- Governance tem uma base mais preto-e-branco do que o site principal: Interfold Black no texto, contornos e ações genéricas; branco e cinzentos neutros nas superfícies. Verde da marca continua presente em apontamentos deliberados, incluindo ações de voto e estados ativos.
- Evitar fundos pastel verde-menta esbatidos em seleções, checkboxes, formulários, hover e grandes painéis de sucesso. O problema é o preenchimento lavado generalizado, não a cor verde. Seleção: fundo neutro subtil, contorno escuro e check explícito. Ações de voto podem usar verde de marca sólido, legível, com texto branco.
- Verde e menta são cores de marca para arte e acentos deliberados, não o fundo genérico da interface. Manter o verde em estados ativos, ações de voto e indicadores positivos; Yes/No/Abstain conservam verde/coral/cinzento. Não converter a aplicação toda em monocromático nem recolorir a identidade do site principal.
- Inter para UI, ABC Gramercy para títulos editoriais, Office Code Pro para etiquetas técnicas. Valores tabulares, sem tracking negativo artificial.
- Alinhar elementos relacionados pela mesma grelha e baseline tipográfica, não por offsets visuais arbitrários. Em linhas com número, ícone, título e descrição, número e título partilham a baseline; a descrição começa na coluna do título. Em cartões repetidos, cabeçalhos, conteúdo equivalente e ações devem seguir as mesmas linhas de alinhamento também entre variantes e breakpoints. Se fontes ou tamanhos diferem, usar alinhamento por baseline e colunas explícitas antes de ajustar padding.
- Superfícies retangulares com raio comum de 6px; divisórias finas, sem sombras decorativas pesadas. Pills apenas nos componentes explicitamente aprovados (Privacy tools e indicadores compactos).
- Hierarquia antes de decoração: a escolha e o montante precedem ferramentas opcionais. Gradientes e brilho só em acentos pedidos, subtis e pontuais.
- Reutilizar componentes e papéis semânticos; não criar exceções por página para resolver problemas globais.

## Header e footer

A fonte canónica é [packages/site-header/src](packages/site-header/src). Ver [contrato e sincronização](packages/site-header/README.md). Editar a fonte e executar `bun run sync:header` neste projeto; não editar cópias geradas. Estética comum nos dois sites; só o fundo pode variar. Rotas, wallet e conteúdo do footer são slots do consumidor.

## Movimento e interação

Aplicar os padrões Family já implementados: origem → modal, continuidade do contexto, uma animação dona da altura, conteúdo relacionado a expandir junto do controlo, foco restaurado ao fechar. Reutilizar os componentes de motion existentes e os tempos/easing abaixo. Hover, teclado e toque devem funcionar; respeitar `prefers-reduced-motion`. Não adicionar animação contínua a arte pausada. Ver [estudo e implementação Family](../Governance/docs/design/family-reference.md).

## Valores editáveis

Manter nomes e tipos. O sincronizador rejeita chaves desconhecidas e CSS arbitrário; builds falham se o bloco for inválido. O CSS e a cópia de distribuição na Governance são gerados, não editáveis. Uma checkout sem este projeto usa a cópia de distribuição versionada para continuar a construir.

```json interfold-tokens
{
  "schemaVersion": 1,
  "tokens": {
    "ink": "#121718",
    "paper": "#ffffff",
    "muted": "#596364",
    "muted-secondary": "#737d7e",
    "brand-mint": "#d9fce8",
    "brand-mint-pale": "#eafdf1",
    "brand-mint-line": "#a9e3bf",
    "brand-mint-shade": "#c1f0d4",
    "brand-green": "#3a5e3c",
    "surface-muted": "#f4f5f4",
    "surface-selected": "#f0f1f1",
    "surface-hover": "#e8eaea",
    "action-hover": "#303638",
    "negative": "#a84932",
    "abstain": "#7a7d77",
    "radius": "6px",
    "stroke-mix": "16%",
    "stroke-hover-mix": "32%",
    "page-ground-mix": "6%",
    "page-ground-shade-mix": "10%",
    "space-tight": "8px",
    "space-related": "12px",
    "space-controls": "16px",
    "space-section": "24px",
    "action-height": "46px",
    "action-compact-height": "40px",
    "action-padding": "12px 20px",
    "ui-duration": "320ms",
    "ui-ease": "cubic-bezier(0.22, 1, 0.36, 1)",
    "page-duration": "720ms",
    "page-ease": "cubic-bezier(0.55, 0, 0.1, 1)",
    "font-sans": "\"Inter\", system-ui, sans-serif",
    "font-serif": "\"ABC Gramercy\", Georgia, serif",
    "font-mono": "\"Office Code Pro\", ui-monospace, \"SF Mono\", Menlo, monospace"
  }
}
```
