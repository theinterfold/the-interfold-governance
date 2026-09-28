import { useState } from "react";
import { createRoot } from "react-dom/client";
import { parseUnits, type Address } from "viem";
import { ActionButton } from "@/components/input/actionButton";
import { HeaderWordmark } from "@/vendor/site-header";
import { LockReviewPanel, type PreviewLock } from "@/dev/lockReviewPanel";
import { LockReviewFormAction } from "@/dev/lockReviewForm";
import { ADDRESS_ZERO } from "@/utils/evm";
import { LocksShareProvider, DEMO_ACCOUNT, DEMO_CURRENT_DELEGATE } from "./fixtures";
import "./share.css";

type Scenario = "standard" | "all" | "many" | "empty";
type ReviewState = { locks: PreviewLock[]; balance: number; delegate: Address };
function initialState(scenario: Scenario): ReviewState {
  const now = Math.floor(Date.now() / 1000);
  const base: PreviewLock[] = [
    { id: "2", amount: 10000, status: "active" },
    { id: "5", amount: 125000, status: "active" },
    { id: "1", amount: 15000, status: "cooldown", days: 12 },
    { id: "4", amount: 2500, status: "cooldown", days: 26 },
  ];
  const statuses = ["active", "inactive", "cooldown", "ready"] as const;
  const positions =
    scenario === "empty"
      ? []
      : scenario === "all"
        ? base.map((lock, i) => ({ ...lock, status: statuses[i] }))
        : scenario === "many"
          ? Array.from({ length: 12 }, (_, i) => ({
              id: String(i + 1),
              amount: (i + 1) * 2500,
              status: statuses[i % 4],
              days: i + 2,
            }))
          : base;
  return {
    balance: 2500,
    delegate: DEMO_CURRENT_DELEGATE,
    locks: positions.map((lock) => ({
      ...lock,
      cooldown: lock.status === "cooldown" ? { endsAt: now + (lock.days ?? 12) * 86400, observedAt: now } : undefined,
    })),
  };
}
function Review() {
  const [option, setOption] = useState<"a" | "b">(() =>
    new URLSearchParams(location.search).get("option") === "a" ? "a" : "b"
  );
  const [scenario, setScenario] = useState<Scenario>("standard");
  const [state, setState] = useState(() => initialState("standard"));
  const [reset, setReset] = useState(0);
  const activeAmount = state.locks
    .filter((lock) => lock.status === "active" || lock.status === "inactive")
    .reduce((sum, lock) => sum + lock.amount, 0);
  const selfDelegatedAmount =
    state.delegate.toLowerCase() === DEMO_ACCOUNT.toLowerCase()
      ? state.locks.filter((lock) => lock.status === "active").reduce((sum, lock) => sum + lock.amount, 0)
      : 0;
  function restart(next = scenario) {
    setScenario(next);
    setState(initialState(next));
    setReset((value) => value + 1);
  }
  function selectOption(next: "a" | "b") {
    setOption(next);
    const url = new URL(location.href);
    url.searchParams.set("option", next);
    history.replaceState(null, "", url);
  }
  const onCreated = ({ amount, owner }: { amount: number; owner: Address }) => {
    setState((current) => ({
      ...current,
      balance: Math.max(0, Number((current.balance - amount).toFixed(12))),
      locks:
        owner.toLowerCase() !== DEMO_ACCOUNT.toLowerCase()
          ? current.locks
          : [
              ...current.locks,
              {
                id: String(Math.max(0, ...current.locks.map((lock) => Number(lock.id))) + 1),
                amount,
                status: current.delegate === ADDRESS_ZERO ? "inactive" : "active",
              },
            ],
    }));
  };
  const onDelegate = (delegate: Address) =>
    setState((current) => ({
      ...current,
      delegate,
      locks: current.locks.map((lock) =>
        lock.status === "active" || lock.status === "inactive"
          ? { ...lock, status: delegate === ADDRESS_ZERO ? "inactive" : "active" }
          : lock
      ),
    }));
  return (
    <LocksShareProvider
      value={{
        account: DEMO_ACCOUNT,
        currentDelegate: state.delegate,
        votingPower: parseUnits(String(25000 + selfDelegatedAmount), 18),
      }}
    >
      <header className="share-brand" aria-label="The Interfold Governance">
        <HeaderWordmark governance={true} />
        <span>Design review</span>
      </header>
      <main className="share-review">
        <header className="share-intro">
          <h1>Voting power</h1>
          <p>Duas formas de apresentar os locks. Compare as opções e experimente o fluxo de Lock FOLD.</p>
          <span className="share-note">Dados de exemplo · alterações simuladas · sem ligação a uma carteira</span>
        </header>
        <div className="share-toolbar">
          <div className="share-options" role="group" aria-label="Opção de design">
            <ActionButton aria-pressed={option === "a"} onClick={() => selectOption("a")}>
              A · Contagem + marcadores
            </ActionButton>
            <ActionButton aria-pressed={option === "b"} onClick={() => selectOption("b")}>
              B · Estados à vista
            </ActionButton>
          </div>
          <div className="share-scenarios">
            <label>
              Cenário
              <select
                aria-label="Cenário"
                value={scenario}
                onChange={(event) => restart(event.target.value as Scenario)}
              >
                <option value="standard">4 locks</option>
                <option value="all">Todos os estados</option>
                <option value="many">12 locks</option>
                <option value="empty">Sem locks</option>
              </select>
            </label>
            <button className="share-reset" onClick={() => restart()}>
              Repor exemplo
            </button>
          </div>
        </div>
        <p className="share-description">
          {option === "a"
            ? "Cada marcador representa um lock. Passe o cursor para ver os estados e os valores."
            : "Contagem e estado em badges, com os mesmos ícones e cores na lista expandida."}
        </p>
        <LockReviewPanel
          key={`${option}-${reset}`}
          locks={state.locks}
          variant={option}
          layout="hierarchy"
          stateTreatment="badges"
          unlockedAmount={state.balance}
          selfDelegatedAmount={selfDelegatedAmount}
          lockAction={
            <LockReviewFormAction
              account={DEMO_ACCOUNT}
              balance={state.balance}
              locksAmount={activeAmount}
              currentDelegate={state.delegate}
              onCreated={onCreated}
              onDelegate={onDelegate}
            />
          }
        />
      </main>
      <footer className="share-footer">The Interfold · Governance design review</footer>
    </LocksShareProvider>
  );
}

createRoot(document.getElementById("root")!).render(<Review />);
