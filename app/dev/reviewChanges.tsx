import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/router";
import { ActionButton } from "@/components/input/actionButton";
import { Disclosure } from "@/components/motion/Disclosure";
import { DESIGN_PREVIEW } from "./previewMode";
import styles from "./reviewChanges.module.css";

type Change = {
  id: string;
  title: string;
  before: string;
  after: string;
  test: string;
  href: string;
  selectors: string[];
};

const proposals = "/plugins/proposals/?review=changes#/";
const privateVote = `${proposals}proposals/private/1`;
const publicVote = `${proposals}proposals/public/1`;
const publicResult = `${proposals}proposals/public/2`;
const power = "/plugins/lock/?review=changes#/";
const storageKey = "interfold.design-review.changes";

// The findings from Review-2026-10-03/manifest.json, attached to live UI rather than captures.
export const reviewChanges: Change[] = [
  {
    id: "identity",
    title: "Mais Inter na Governance",
    before: "A introdução e a copy de apoio usavam Gramercy.",
    after: "A copy funcional usa Inter. A base continua grey; títulos editoriais e marca conservam Gramercy.",
    test: "Comparar a introdução de Proposals e Voting power.",
    href: proposals,
    selectors: [".governance-page-intro-copy"],
  },
  {
    id: "public_ballot",
    title: "Votação pública",
    before: "As escolhas eram linhas e a explicação das máscaras ficava separada.",
    after:
      "As escolhas usam os cartões comuns ao ballot privado. A máscara indisponível explica o motivo. Review vote abre a revisão, com a confirmação no footer do modal.",
    test: "Abrir a proposta pública. Escolher Yes, focar a máscara com Tab e usar Space. Depois abrir Review vote.",
    href: publicVote,
    selectors: [".vote-choices:has(.vote-choice-mask[aria-disabled='true'])"],
  },
  {
    id: "signature",
    title: "Signature data e regresso",
    before: "A troca usava fade e retirava imediatamente o footer.",
    after:
      "O conteúdo desliza lateralmente. O footer recolhe e expande com a altura. Voltar recupera o scroll e o foco na entrada Signature data.",
    test: "Yes → Review vote → Signature data. Fazer scroll nos dados e usar Back to review. Repetir a troca rapidamente.",
    href: privateVote,
    selectors: [
      ".ballot-review-body button[data-presentation='closed-dash']",
      ".ballot-review-body [aria-label='Signature data']",
    ],
  },
  {
    id: "numeric",
    title: "Montantes e percentagens",
    before: "A passagem de 99.50% para 100.00% alinhava caracteres pelo índice e deslocava ponto e unidade.",
    after:
      "Os algarismos alinham pela posição decimal. Pontuação e unidade ficam estáveis; a largura e a reversão partem da posição visual atual.",
    test: "Abrir Privacy tools e ligar/desligar Randomize voting power rapidamente. Observar o montante e a percentagem.",
    href: privateVote,
    selectors: [".ballot-review-body [class*='reviewPowerValues']", ".ballot-voting-power strong"],
  },
  {
    id: "privacy",
    title: "Voo dos ícones de Privacy tools",
    before: "Os ícones em voo não reagiam ao scroll nem ao resize.",
    after: "Se a geometria mudar, a viagem termina e as cópias temporárias são limpas.",
    test: "Abrir e recolher Privacy tools. Fazer scroll ou redimensionar a janela a meio do movimento.",
    href: privateVote,
    selectors: ["[aria-label='Show privacy tools']", "[aria-label='Hide privacy tools']"],
  },
  {
    id: "lock_draft",
    title: "Rascunho de Lock FOLD",
    before: "Fechar conservava o montante, mas repunha o proprietário e o delegado.",
    after: "O rascunho completo fica associado à wallet, incluindo o progresso parcial de um lock.",
    test: "Lock FOLD → escolher outra wallet e um montante. Fechar e reabrir. Conferir ambos os valores.",
    href: power,
    selectors: [".power-lock-editor", ".power-lock-tray"],
  },
  {
    id: "delegate",
    title: "Voltar ao delegado escolhido",
    before: "Voltar da revisão colocava sempre o foco na pesquisa.",
    after: "A seleção regressa à linha escolhida e à mesma posição de scroll.",
    test: "Escolher um delegado perto do fim da lista por teclado. Rever e voltar à seleção.",
    href: power,
    selectors: [".delegate-picker-scroll", ".delegate-choose"],
  },
  {
    id: "withdraw",
    title: "Withdraw / Keep locked",
    before: "A troca de tarefa removia o controlo que tinha foco.",
    after: "O montante mantém-se. Conteúdo e altura mudam em coordenação, e o foco acompanha a tarefa ativa.",
    test: "Num lock pronto para levantamento: Withdraw FOLD → Keep FOLD locked instead → Back to withdrawal.",
    href: power,
    selectors: [".power-tray-amount"],
  },
  {
    id: "demo_states",
    title: "Rejeitar e repetir um envio",
    before: "O ballot integrado saltava diretamente para sucesso.",
    after:
      "A Demo wallet mostra pedidos, rejeição, envio e erro. Uma máscara falhada pode ser repetida sem reenviar o voto.",
    test: "Yes com Add a mask → confirmar o voto → rejeitar a máscara → Retry mask. Os pedidos são simulados localmente.",
    href: privateVote,
    selectors: [".demo-wallet-request-title", ".ballot-preview-host [role='alert']", ".ballot-review-footer"],
  },
  {
    id: "prepared",
    title: "Voto preparado / outra wallet",
    before: "A troca de passos podia desmontar a origem antes de o modal fechar.",
    after:
      "Formulário e origem ficam montados até ao fecho. Os passos partilham a expansão; trocar wallet devolve o foco a Send signed ballot. Rejeitar a máscara devolve-o a Retry mask.",
    test: "Privacy tools → Send from another wallet → Prepare vote. Trocar para a sending wallet e enviar o voto preparado.",
    href: privateVote,
    selectors: ["[aria-label='Prepared vote']", ".ballot-preview-host .vp-cta"],
  },
  {
    id: "mask_success",
    title: "Ação depois da máscara",
    before: "A ação seguinte nem sempre retomava claramente o ballot.",
    after:
      "A ação principal é Vote on this proposal ou View your vote, conforme o contexto. Enviar outra máscara é secundário.",
    test: "Escolher Mask, enviar só uma máscara e regressar ao ballot pela ação principal.",
    href: privateVote,
    selectors: [".ballot-preview-host .vp-submitted"],
  },
  {
    id: "public_votes",
    title: "Lista de votos públicos",
    before: "Your wallet e (You) repetiam a identidade. O adaptador descartava o peso utilizado.",
    after: "Cada linha mostra uma identidade e o peso do voto, com controlos e paginação comuns.",
    test: "Na proposta pública fechada: Voting details → Public votes. Rever a linha da tua wallet e o peso.",
    href: publicResult,
    selectors: ["[aria-label='Public votes']"],
  },
  {
    id: "results",
    title: "Resultados por opção",
    before: "Só Yes recebia destaque numa proposta aprovada; os montantes dependiam de hover.",
    after:
      "O destaque segue a maior parcela única, independentemente da aprovação. Hover, foco e toque mostram os montantes.",
    test: "Focar ou tocar numa percentagem. No e Abstain como maiores parcelas estão cobertos por testes, mas não nos exemplos fechados desta demo.",
    href: publicResult,
    selectors: [".tally-rows"],
  },
  {
    id: "eligible",
    title: "Votantes elegíveis",
    before: "O modal e os controlos seguiam um padrão separado do seletor de delegates.",
    after: "Usa os controlos comuns, um modal largo e texto de verificação que quebra sem cortar os detalhes.",
    test: "Voting details → Eligible voters. Pesquisar um endereço e voltar. A verificação completa não está incluída neste snapshot da demo.",
    href: privateVote,
    selectors: [".power-tray:has(h2[aria-label='Eligible voters']) .power-tray-content"],
  },
  {
    id: "disclosures",
    title: "Actions e Sort",
    before: "Actions expandia de imediato e Sort não acompanhava o movimento dos outros menus.",
    after: "Ambos animam entrada e saída. Sort conserva a largura compacta; Actions 0 evita repetir a explicação.",
    test: "Abrir e recolher Actions. Em Voting power, abrir e fechar Sort e inverter a ação rapidamente.",
    href: privateVote,
    selectors: [".proposal-action-disclosure", ".delegate-sort"],
  },
  {
    id: "metadata",
    title: "Atividade cifrada",
    before: "A atividade e o texto de apoio misturavam escalas de 13 e 14 px.",
    after: "Os metadados da atividade dentro de Voting details usam a escala comum de 12 px.",
    test: "Voting details → Encrypted ballot activity. Comparar o rótulo, as linhas e os restantes metadados.",
    href: privateVote,
    selectors: [".proposal-activity-body:not(:has([aria-label='Public votes']))"],
  },
  {
    id: "mobile_menu",
    title: "Menu mobile comum",
    before: "Marketing e Governance tratavam o teclado de forma diferente.",
    after:
      "Partilham scroll, foco, Tab, Escape e fecho ao passar para desktop. As entradas e o hamburger respeitam movimento reduzido.",
    test: "Numa janela estreita, abrir o menu por teclado. Percorrer Tab/Shift+Tab, fechar com Escape e confirmar o foco no burger.",
    href: proposals,
    selectors: [".interfold-mobile-menu-overlay .site-header-menu-primary", ".interfold-mobile-menu-trigger"],
  },
  {
    id: "chrome",
    title: "Marca e foco do header",
    before:
      "O marketing podia trocar SVG por texto. A Governance tinha um contorno de foco próprio e a navegação invadia o símbolo central.",
    after:
      "A origem partilhada usa um SVG único e o mesmo foco. A navegação deixa espaço até ao símbolo. Aqui revês a instância Governance; a marca do marketing também foi corrigida localmente.",
    test: "Percorrer a marca e a navegação com Tab, e comparar com o marketing local.",
    href: proposals,
    selectors: [".site-header-brand"],
  },
  {
    id: "cta_focus",
    title: "Links por teclado",
    before: "Vários CTAs do marketing revelavam a seta apenas com rato.",
    after:
      "Os CTAs do marketing revelam a mesma seta e cores ao receber foco. Na Governance, o header e footer seguem as cores e o contorno de foco comuns.",
    test: "Rever o foco dos links aqui. Para as setas dos CTAs, abrir o marketing local e percorrer os CTAs com Tab.",
    href: proposals,
    selectors: [".site-header-links a", ".site-footer a"],
  },
  {
    id: "reduced",
    title: "Movimento reduzido",
    before: "Algumas animações de altura e ícones continuavam depois de a preferência mudar.",
    after:
      "A animação de altura ativa termina e as cópias dos ícones são limpas. Os wrappers do marketing também seguem a preferência.",
    test: "Ativar movimento reduzido no sistema. Rever Privacy tools, Signature data, Lock FOLD e o menu. A preferência foi revista no código; este review permite testá-la ao vivo.",
    href: privateVote,
    selectors: [".ballot-preview-host .fluid-height", ".power-lock-layout", ".ballot-review-body .fluid-height"],
  },
  {
    id: "wallet_disconnected",
    title: "Selecionar delegado sem wallet",
    before: "Tocar em Select delegate ligava imediatamente a wallet da demo.",
    after:
      "A linha diz Connect to select e abre Connect wallet com escolha e Cancel explícitos. Depois de ligar e fechar o modal, continua a revisão do delegado escolhido. Só ligar não delega. Cancelar mantém a wallet desligada e devolve o foco.",
    test: "Desligar a Demo wallet. No diretório, usar Connect to select e cancelar. Repetir, escolher a voting wallet e confirmar que abre a revisão do mesmo delegado sem o delegar automaticamente.",
    href: power,
    selectors: [".delegate-directory .power-delegate-row .ui-action", ".demo-wallet-panel"],
  },
  {
    id: "ballot_disconnected",
    title: "Voto privado sem wallet",
    before:
      "O ballot escondia o motivo do bloqueio numa mensagem sobre a sending wallet. O percurso só de máscara conseguia avançar sem ligação.",
    after:
      "Sem wallet, surge Connect wallet e ficam ocultas as opções, o separador Mask e o montante. Um voto preparado conserva o contexto ao desligar; Send mask pede ligação. A sending wallet pode enviar máscaras, mas não vê escolhas de voto nem um poder de voto fictício.",
    test: "Desligar a Demo wallet e abrir o ballot privado. Conferir Connect wallet sem opções nem montante. Cancelar mantém a wallet desligada. Voltar a ligar e testar a máscara; repetir desligando depois de Prepare vote.",
    href: privateVote,
    selectors: [".ballot-preview-host .ballot-eligibility", ".ballot-preview-host [aria-label='Prepared vote']"],
  },
  {
    id: "result_disconnected",
    title: "Resultado e execução sem wallet",
    before: "Submit result e Execute proposal podiam tentar enviar sem uma wallet ligada.",
    after:
      "As ações mostram Connect to submit result ou Connect to execute proposal quando falta a wallet. Ligar é uma escolha explícita e não envia a ação: depois é preciso voltar a confirmá-la.",
    test: "Este snapshot não inclui uma proposta com estas ações disponíveis. A marca surge apenas se a ação real existir. A proteção é verificada num cenário controlado; não há um envio executável para demonstrar aqui.",
    href: proposals,
    selectors: [".proposal-result-action", ".proposal-execute-action"],
  },
  {
    id: "fee_disconnected",
    title: "Fee credit sem wallet",
    before: "Sem wallet, o fee credit privado ficava em Loading your fee credit… indefinidamente.",
    after:
      "O estado sem ligação apresenta Connect wallet e distingue-se do carregamento. Crédito e saldo pessoais aparecem como —; depositar e levantar exigem ligação.",
    test: "Desligar a Demo wallet. Abrir New proposal com Secret ballot e Manage fee credit. Conferir a mensagem, os valores e a ação Connect wallet. Cancelar e voltar a ligar explicitamente.",
    href: `${proposals}new`,
    selectors: [".composer-credit-connect", ".composer-fee"],
  },
  {
    id: "composer_context",
    title: "Contexto do editor e das actions",
    before: "Desligar ou trocar wallet podia desmontar o editor e o modal de uma action, que voltava vazio.",
    after:
      "O editor permanece montado, com um aviso de elegibilidade separado. O rascunho e os campos da action conservam o contexto. Submit proposal continua indisponível sem elegibilidade.",
    test: "New proposal → DAO actions → Raw calldata. Preencher Contract address e Calldata. Desligar pela Wallet e voltar a ligar. Confirmar que o modal e os campos conservam o conteúdo, sem qualquer envio.",
    href: `${proposals}new`,
    selectors: [
      ".interfold-dialog input[placeholder='0x1234...']",
      ".composer-editor-context",
      ".composer-eligibility-notice",
    ],
  },
  {
    id: "navigation_loading",
    title: "Mudar de página sem falso erro",
    before: "Passar de Voting power para uma proposta podia mostrar Not found durante a mudança de página.",
    after:
      "A navegação mostra o estado normal de carregamento até a página de destino estar pronta, sem apresentar a página anterior como um erro.",
    test: "Abrir Voting power e depois usar o link de review para o ballot privado ou Proposals. Confirmar que a mudança não passa por Not found.",
    href: privateVote,
    selectors: [".proposal-breadcrumb", ".site-header-links"],
  },
  {
    id: "newsletter_layout",
    title: "Newsletter ao mudar de ecrã",
    before: "O formulário podia falhar ao montar ou alternar entre desktop e mobile.",
    after: "O formulário reaproveita o mesmo embed ao mudar de layout.",
    test: "Abrir Marketing local, ver UPDATES no footer e mudar a largura entre desktop e mobile; o formulário continua disponível.",
    href: "http://localhost:3200/?review=changes",
    selectors: [],
  },
];

type Mark = { id: string; number: number; x: number; y: number; targetX: number; targetY: number };
type Scene = { marks: Mark[]; dialog: HTMLElement | null; notePosition: { left: number; top: number } | null };
const emptyScene: Scene = { marks: [], dialog: null, notePosition: null };

function visibleRect(element: HTMLElement) {
  if (element.closest("[inert], [aria-hidden='true'], [hidden], [data-morph-hidden]")) return null;
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  if (!rect.width || !rect.height || style.visibility === "hidden" || Number(style.opacity) === 0) return null;
  let top = Math.max(0, rect.top),
    bottom = Math.min(window.innerHeight, rect.bottom);
  let left = Math.max(0, rect.left),
    right = Math.min(window.innerWidth, rect.right);
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const parentStyle = getComputedStyle(parent);
    if (parentStyle.visibility === "hidden" || Number(parentStyle.opacity) === 0) return null;
    if (/(auto|scroll|hidden|clip)/.test(parentStyle.overflow + parentStyle.overflowY + parentStyle.overflowX)) {
      const bounds = parent.getBoundingClientRect();
      top = Math.max(top, bounds.top);
      bottom = Math.min(bottom, bounds.bottom);
      left = Math.max(left, bounds.left);
      right = Math.min(right, bounds.right);
    }
  }
  return bottom - top >= 8 && right - left >= 8 ? { top, bottom, left, right } : null;
}

function useReviewScene(enabled: boolean, showMarks: boolean) {
  const [scene, setScene] = useState<Scene>(emptyScene);
  useEffect(() => {
    if (!enabled || !showMarks) {
      setScene(emptyScene);
      return;
    }
    let frame = 0;
    let motionDeadline = 0;
    let stopped = false;
    let lastGeometry = "";
    let lastDialog: HTMLElement | null = null;
    const resize = new ResizeObserver(() => schedule());
    const observed = new Set<Element>();
    // This surface stays in document flow: its disclosure moves real targets without resizing them.
    const reviewControls = document.querySelector("[data-review-changes='controls']");
    if (reviewControls) resize.observe(reviewControls);
    const measure = () => {
      frame = 0;
      if (stopped) return;
      const dialogs = [
        ...document.querySelectorAll<HTMLElement>("[role='dialog'][aria-modal='true'], .morph-dialog"),
      ].filter((element) => visibleRect(element) && !element.querySelector(".morph-dialog-content[inert]"));
      const dialog = dialogs.at(-1) ?? null;
      const targets = new Set<Element>();
      const marks: Mark[] = [];
      for (const [index, change] of reviewChanges.entries()) {
        let anchor: HTMLElement | undefined;
        for (const selector of change.selectors) {
          anchor = [...document.querySelectorAll<HTMLElement>(selector)].find(
            (element) =>
              !element.closest("[data-review-changes]") && (!dialog || dialog.contains(element)) && visibleRect(element)
          );
          if (anchor) break;
        }
        if (!anchor) continue;
        const rect = visibleRect(anchor)!;
        targets.add(anchor);
        const onLeft = rect.left >= 32;
        const outside = onLeft || rect.right <= window.innerWidth - 32;
        const x = onLeft ? rect.left - 16 : outside ? rect.right + 16 : rect.left + 16;
        const targetY = rect.top + Math.min(18, (rect.bottom - rect.top) / 2);
        let y = outside ? targetY : Math.max(16, rect.top - 16);
        // Separate badges sharing a region; a short leader retains the real attachment point.
        while (marks.some((mark) => Math.abs(mark.x - x) < 27 && Math.abs(mark.y - y) < 27)) y += 28;
        if (y > window.innerHeight - 16) continue;
        marks.push({
          id: change.id,
          number: index + 1,
          x: Math.round(x),
          y: Math.round(y),
          targetX: Math.round(onLeft ? rect.left : outside ? rect.right : x),
          targetY: Math.round(targetY),
        });
      }
      for (const element of observed)
        if (!targets.has(element)) {
          resize.unobserve(element);
          observed.delete(element);
        }
      for (const element of targets)
        if (!observed.has(element)) {
          resize.observe(element);
          observed.add(element);
        }
      let notePosition: Scene["notePosition"] = null;
      if (dialog && !dialog.matches(".interfold-mobile-menu-overlay")) {
        const bounds = dialog.getBoundingClientRect();
        if (bounds.left >= 340) notePosition = { left: 16, top: Math.max(80, bounds.top) };
        else if (window.innerWidth - bounds.right >= 340)
          notePosition = { left: bounds.right + 24, top: Math.max(80, bounds.top) };
      }
      const geometry = JSON.stringify({ marks, notePosition });
      if (geometry !== lastGeometry || dialog !== lastDialog) {
        lastGeometry = geometry;
        lastDialog = dialog;
        setScene({ marks, dialog, notePosition });
      }
      // Follow finite UI transitions only while they run, never idle-poll or follow looping artwork.
      if (
        performance.now() < motionDeadline &&
        document.getAnimations().some((animation) => {
          const effect = animation.effect;
          return (
            animation.playState === "running" &&
            effect instanceof KeyframeEffect &&
            effect.target instanceof Element &&
            !effect.target.closest("[data-review-changes]") &&
            Number.isFinite(effect.getComputedTiming().iterations)
          );
        })
      )
        frame = requestAnimationFrame(measure);
    };
    function schedule(followMotion = false) {
      if (followMotion) motionDeadline = performance.now() + 800;
      if (!frame && !stopped) frame = requestAnimationFrame(measure);
    }
    const onGeometry = () => schedule();
    const onMotion = (event: Event) => {
      if (event.target instanceof Element && !event.target.closest("[data-review-changes]")) schedule(true);
    };
    const mutations = new MutationObserver((records) => {
      if (records.some((record) => record.target instanceof Element && !record.target.closest("[data-review-changes]")))
        schedule(true);
    });
    mutations.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [
        "class",
        "style",
        "hidden",
        "inert",
        "aria-hidden",
        "data-open",
        "data-state",
        "data-morphing",
        "data-morph-hidden",
      ],
    });
    window.addEventListener("scroll", onGeometry, { passive: true, capture: true });
    window.addEventListener("resize", onGeometry);
    window.addEventListener("hashchange", onGeometry);
    document.addEventListener("transitionrun", onMotion, true);
    document.addEventListener("transitionend", onGeometry, true);
    document.addEventListener("animationstart", onMotion, true);
    document.addEventListener("animationend", onGeometry, true);
    schedule(true);
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      mutations.disconnect();
      resize.disconnect();
      window.removeEventListener("scroll", onGeometry, true);
      window.removeEventListener("resize", onGeometry);
      window.removeEventListener("hashchange", onGeometry);
      document.removeEventListener("transitionrun", onMotion, true);
      document.removeEventListener("transitionend", onGeometry, true);
      document.removeEventListener("animationstart", onMotion, true);
      document.removeEventListener("animationend", onGeometry, true);
    };
  }, [enabled, showMarks]);
  return scene;
}

function ChangeNote({ change }: { change: Change }) {
  return (
    <dl className={styles.note}>
      <div>
        <dt>Antes</dt>
        <dd>{change.before}</dd>
      </div>
      <div>
        <dt>Agora</dt>
        <dd>{change.after}</dd>
      </div>
      <div>
        <dt>Como testar</dt>
        <dd>{change.test}</dd>
      </div>
    </dl>
  );
}

export function ReviewChanges() {
  const router = useRouter();
  const [enabled, setEnabled] = useState(false);
  const [showMarks, setShowMarks] = useState(true);
  const [notesOpen, setNotesOpen] = useState(false);
  const [selected, setSelected] = useState(reviewChanges[0].id);
  const toolbar = useRef<HTMLElement>(null);
  const scene = useReviewScene(enabled, showMarks);
  useEffect(() => {
    if (!DESIGN_PREVIEW) return;
    const sync = () => {
      const url = new URL(window.location.href);
      let stored = false;
      try {
        if (url.searchParams.get("review") === "changes") sessionStorage.setItem(storageKey, "on");
        stored = sessionStorage.getItem(storageKey) === "on";
      } catch {
        stored = url.searchParams.get("review") === "changes";
      }
      setEnabled(stored);
      if (stored && url.searchParams.get("review") !== "changes") {
        url.searchParams.set("review", "changes");
        window.history.replaceState(window.history.state, "", url);
      }
    };
    sync();
    router.events.on("routeChangeComplete", sync);
    return () => router.events.off("routeChangeComplete", sync);
  }, [router.events]);
  const close = useCallback(() => {
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      /* Query opt-in also works without storage. */
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("review");
    window.history.replaceState(window.history.state, "", url);
    setEnabled(false);
  }, []);
  if (!DESIGN_PREVIEW || !enabled) return null;
  const change = reviewChanges.find((item) => item.id === selected)!;
  const activeMark = scene.marks.find((mark) => mark.id === selected);
  const dialogMark = activeMark ?? scene.marks[0];
  const dialogNote = reviewChanges.find((item) => item.id === dialogMark?.id);
  return (
    <>
      <section
        ref={toolbar}
        className={styles.review}
        data-review-changes="controls"
        aria-label="Review das alterações locais"
      >
        <div className={styles.bar}>
          <div className={styles.label}>
            <strong>Review local</strong>
            <span>{reviewChanges.length} alterações</span>
          </div>
          <nav className={styles.links} aria-label="Fluxos do review">
            <Link href={proposals}>Proposals</Link>
            <Link href={power}>Voting power</Link>
          </nav>
          <div className={styles.controls}>
            <ActionButton
              size="compact"
              aria-expanded={notesOpen}
              aria-controls="review-change-notes"
              onClick={() => setNotesOpen(!notesOpen)}
            >
              {notesOpen ? "Recolher notas" : "Ver notas"}
            </ActionButton>
            <ActionButton size="compact" aria-pressed={showMarks} onClick={() => setShowMarks(!showMarks)}>
              {showMarks ? "Ocultar marcas" : "Mostrar marcas"}
            </ActionButton>
            <ActionButton size="compact" onClick={close}>
              Fechar review
            </ActionButton>
          </div>
        </div>
        <Disclosure open={notesOpen} id="review-change-notes">
          <div className={styles.notesLayout}>
            <ol className={styles.index} aria-label="Alterações">
              {reviewChanges.map((item, index) => (
                <li key={item.id}>
                  <button
                    type="button"
                    aria-current={selected === item.id ? "true" : undefined}
                    onClick={() => setSelected(item.id)}
                  >
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    {item.title}
                  </button>
                </li>
              ))}
            </ol>
            <article className={styles.detail} aria-labelledby="review-change-title">
              <h2 id="review-change-title">
                <span>{String(reviewChanges.indexOf(change) + 1).padStart(2, "0")}</span>
                {change.title}
              </h2>
              <ChangeNote change={change} />
              <Link className="ui-text-action" href={change.href}>
                Abrir o fluxo para testar →
              </Link>
              {change.id === "chrome" || change.id === "cta_focus" ? (
                <a
                  className="ui-text-action"
                  href="http://127.0.0.1:3200/?review=changes"
                  target="_blank"
                  rel="noreferrer"
                >
                  Marketing local ↗
                </a>
              ) : null}
              <p className={styles.hint}>
                {activeMark
                  ? "A marca desta alteração está visível na página."
                  : change.id === "result_disconnected"
                    ? "A ação não está disponível nos exemplos atuais. A marca surge quando a ação real estiver presente."
                    : change.id === "newsletter_layout"
                      ? "Esta alteração está no marketing. O link acima abre o respetivo review local."
                      : "Segue os passos acima para fazer aparecer a marca no elemento alterado."}{" "}
                As marcas deixam passar os cliques e não entram na sequência de Tab.
              </p>
            </article>
          </div>
        </Disclosure>
      </section>
      {showMarks &&
        createPortal(
          <div className={styles.overlay} data-review-changes="marks" aria-hidden="true">
            <svg className={styles.leaders}>
              {scene.marks.map((mark) => (
                <line key={mark.id} x1={mark.x} y1={mark.y} x2={mark.targetX} y2={mark.targetY} />
              ))}
            </svg>
            {scene.marks.map((mark) => (
              <span
                key={mark.id}
                className={styles.mark}
                data-selected={mark.id === selected}
                style={{ left: mark.x, top: mark.y }}
              >
                {String(mark.number).padStart(2, "0")}
              </span>
            ))}
            {scene.dialog && scene.notePosition && dialogNote && (
              <aside className={styles.dialogNote} style={scene.notePosition}>
                <p className={styles.dialogLabel}>
                  Review · {String(reviewChanges.indexOf(dialogNote) + 1).padStart(2, "0")}
                </p>
                <h2>{dialogNote.title}</h2>
                <ChangeNote change={dialogNote} />
              </aside>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
