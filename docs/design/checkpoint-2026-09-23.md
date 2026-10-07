# Checkpoint do redesign — 23 de setembro de 2026

Versão local de trabalho do Interfold Governance, na branch
`design/align-with-main-site`. Guarda o redesign iniciado no Claude e continuado
neste projeto, incluindo código, fontes, imagens, referências e dados de demonstração.

## Estado do design

- Fundo verde-claro e texto Interfold Black. Inter para interfaces técnicas;
  Gramercy para títulos e momentos de marca; Office Code Pro para metadados.
- Navegação, espaçamentos e footer adaptados da homepage original.
- Proposals com expansão na própria lista, filtros reorganizados, faixas
  alternadas a começar pela escura, hover distinto de ponta a ponta e estados
  coloridos sem pontos decorativos.
- Criação de propostas com escrita e configurações separadas e secções
  secundárias recolhíveis. Transições de abertura, fecho e votação preservam
  continuidade e respeitam redução de movimento.
- Página Voting power organizada em resumo, Delegation, Your locks e Delegates.
  Breakdown visível de início; ajuda junto ao título.
- Lock FOLD abre um fluxo próprio com quantidade, proprietário e revisão.
  Escolher o delegado acontece dentro do mesmo modal, preservando o rascunho.
- Delegação distingue quem vota de quem possui o lock. Lock para outra carteira
  transfere a propriedade e apresenta um aviso explícito. Não altera a delegação
  de quem paga.
- Escolha de delegado com Myself em primeiro lugar, nomes ENS quando disponíveis,
  endereço completo como informação secundária e Remove delegate para voltar a si.
- Diretório na página com os 26 delegates capturados do site original. Selecionar
  abre diretamente a revisão, sem saltar para outra zona da página.
- Espaço entre o conteúdo final e o footer: 224 px em desktop e 64 px em mobile,
  retirado dos valores da homepage original.

## Retomar o preview

Na pasta `app`, instalar as dependências com `bun install` se necessário. Manter
`NEXT_PUBLIC_DESIGN_PREVIEW=true` no ficheiro local `.env.local` e iniciar:

```sh
bun run dev --port 3100
```

Página principal deste trabalho:
<http://127.0.0.1:3100/plugins/lock/#/>.
Propostas: <http://127.0.0.1:3100/plugins/proposals/#/>.

A carteira de demonstração, os saldos, locks e propostas são fictícios. Assinaturas,
transações e uploads estão bloqueados nesse modo. Os delegates vêm do snapshot
público de 23 de setembro, documentado em `app/dev/snapshots/README.md`; não são
uma lista atualizada continuamente. A resolução de nomes ENS pode fazer leituras
públicas à rede. O modo de demonstração é desativado em builds de produção.

Os ficheiros `.env` locais não fazem parte do checkpoint. Permanecem neste computador;
numa nova instalação usar os templates `.env*.example` e a configuração apropriada.

## Validação e limites

- Build de produção concluído numa cópia isolada, sem interromper o preview.
  Há avisos de lint e de ligação WalletConnect durante a geração estática;
  não impediram a compilação, que terminou com código 0.
- 18 testes, 50 verificações, a passar: isolamento da demonstração, propriedade
  do lock, sequência lock/delegação e valores das ações de propostas.
- Verificação visual do diretório e seleção de delegado em desktop e mobile;
  espaço antes do footer medido nos dois tamanhos, sem overflow horizontal.
- Não foram realizadas transações reais. A sequência lock e delegação pode
  implicar transações separadas; não é uma operação atómica. A proposta de UX
  combinada continua a precisar de validação da equipa antes de produção.
- Este checkpoint é local. Não foi publicado nem enviado para um repositório remoto.

Referências e decisões adicionais: `docs/design/family-reference.md` e
`docs/design/token-lock-references/README.md`.
