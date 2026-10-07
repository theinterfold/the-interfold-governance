import type { BallotChoicePresentation } from "@/components/proposalVoting/ballot";

export const voteChoiceVariants = [
  {
    id: "current",
    name: "Linhas simples",
    idea: "As três opções aparecem nas linhas discretas da versão anterior.",
    gain: "É compacta e já conhecida.",
    cost: "Privacy tools ainda parece ter mais peso do que a decisão.",
    recommended: false,
  },
  {
    id: "decision",
    name: "Secção de decisão",
    idea: "Um título próprio anuncia a escolha do voto; as linhas ganham mais espaço e escala.",
    gain: "A hierarquia vem do conteúdo e da tipografia, sem mais caixas.",
    cost: "O formulário fica um pouco mais alto.",
    recommended: true,
  },
  {
    id: "framed",
    name: "Três cartões",
    idea: "Cada opção tem contorno; a escolhida recebe contorno escuro e fundo branco.",
    gain: "Yes / No / Abstain passam a parecer controlos principais.",
    cost: "Adiciona mais linhas visuais perto da caixa de Privacy tools.",
    recommended: true,
  },
  {
    id: "ink",
    name: "Seleção em preto",
    idea: "Mantém as linhas, mas a opção escolhida vira uma superfície preta sólida.",
    gain: "A escolha atual salta à vista sem usar outro verde.",
    cost: "O estado selecionado pode competir com o botão de revisão.",
    recommended: true,
  },
  {
    id: "tiles",
    name: "Três colunas",
    idea: "As opções formam um grupo horizontal de igual peso, com a escolhida em destaque.",
    gain: "Separa claramente a decisão das ferramentas abaixo.",
    cost: "Em espaços estreitos, os três rótulos precisam de uma composição mais compacta.",
    recommended: false,
  },
  {
    id: "emphasis",
    name: "Escolha editorial",
    idea: "Números pequenos e nomes maiores criam uma lista de decisão com mais presença.",
    gain: "Destaca as opções sem acrescentar um painel ou preenchimento forte.",
    cost: "É a direção menos compacta e pode parecer mais expressiva do que o resto da UI.",
    recommended: false,
  },
] as const satisfies readonly {
  id: BallotChoicePresentation;
  name: string;
  idea: string;
  gain: string;
  cost: string;
  recommended: boolean;
}[];

export type VoteChoiceVariant = (typeof voteChoiceVariants)[number]["id"];
