import type { GetServerSideProps } from "next";
import Head from "next/head";
import { useState } from "react";
import { ActionButton } from "@/components/input/actionButton";
import { ActionLink } from "@/components/input/actionLink";
import { PageIntro } from "@/components/pageIntro";
import { CardResources } from "@/components/proposal/cardResources";
import { LockStatusBadge } from "@/plugins/velocker/components/lockStatusBadge";
import { LockSummaryToggle } from "@/plugins/velocker/components/lockSummaryToggle";
import { PowerDisclosure } from "@/plugins/velocker/components/powerDisclosure";
import { DelegateStatus } from "@/plugins/members/components/delegateStatus";
import { interfaceReferences, interfaceTypeRoles } from "@/dev/interfaceCatalog";
import styles from "@/dev/interfaceCatalog.module.css";

// A local review surface, deliberately absent from the published product/navigation.
export const getServerSideProps: GetServerSideProps = async () =>
  process.env.NODE_ENV === "development" ? { props: {} } : { notFound: true };

export default function InterfaceCatalogue() {
  const [feedback, setFeedback] = useState("Examples only. No wallet operations.");
  const demonstrate = () => setFeedback("Action selected. This catalogue never sends a transaction.");
  return (
    <main className={styles.catalogue}>
      <Head>
        <title>Interface catalogue · Interfold</title>
      </Head>
      <header className={styles.header}>
        <span className="ui-label">Local design reference</span>
        <h1 className="ui-card-title">Interface catalogue</h1>
        <p className="ui-body">The same components and styles used by Voting power and Proposals.</p>
        <nav className={styles.links} aria-label="Catalogue sections">
          <a href="#type">Typography</a>
          <a href="#actions">Actions</a>
          <a href="#states">States</a>
          <a href="#references">References</a>
        </nav>
      </header>
      <section id="type" className={styles.section} aria-labelledby="type-heading">
        <h2 id="type-heading" className="ui-section-title">
          Typography
        </h2>
        <div className={styles.brandSample}>
          <PageIntro
            title="Voting power"
            glyph="voting"
            description="Lock FOLD to vote yourself or choose a delegate."
          />
          <p className="ui-body">
            Page introductions keep the official website’s Gramercy, scale and spacing through PageIntro. Functional
            content uses Inter.
          </p>
        </div>
        {interfaceTypeRoles.map((role) => (
          <article className={styles.typeRow} key={role.name}>
            <div>
              <h3 className="ui-label">{role.name}</h3>
              <p className="ui-body">{role.usage}</p>
              <code>{role.token}</code>
            </div>
            <p className={role.className}>{role.sample}</p>
          </article>
        ))}
        <p className="ui-body">
          Deliberate exceptions: the main voting-power total is 48–64px; the delegated total is 28px. Proposal reading
          text is 16px. Addresses use Office Code Pro; ordinary numbers use Inter.
        </p>
      </section>
      <section id="actions" className={styles.section} aria-labelledby="actions-heading">
        <h2 id="actions-heading" className="ui-section-title">
          Actions
        </h2>
        <p className="ui-body">
          ActionButton and ActionLink share one action family. The PowerAction name is an alias. Standard controls
          follow the website’s 46px mobile / 52px desktop height and 6px corners. Compact list actions use 40px on
          desktop and at least 44px on touch/mobile. All action icons share a 16px size, regular stroke and 8px gap.
          They reveal on hover or keyboard focus; touch and reduced motion show them without animation. Status checks
          stay visible.
        </p>
        <p className="ui-body">
          Panels, fields, dialogs, tooltips, badges and resource links share those same 6px corners and a common
          neutral border. Hover outlines use the same darker grey; semantic state colours remain distinct.
        </p>
        <CardResources title="Supporting links" resources={[{ name: "Help guide", url: "https://docs.theinterfold.com" }]} />
        <div className={styles.actionGrid}>
          <article>
            <h3 className="ui-label">Primary · create or confirm</h3>
            <ActionButton intent="create" size="compact" affordance="lock" onClick={demonstrate}>
              Lock FOLD
            </ActionButton>
          </article>
          <article>
            <h3 className="ui-label">Voting and secondary actions</h3>
            <ActionButton intent="vote" onClick={demonstrate}>
              Vote
            </ActionButton>
            <ActionButton affordance="next" onClick={demonstrate}>
              Change delegate
            </ActionButton>
            <ActionButton affordance="close" onClick={demonstrate}>
              Remove delegation
            </ActionButton>
            <ActionButton affordance="wallet" onClick={demonstrate}>
              Delegate to your wallet
            </ActionButton>
            <ActionButton size="compact" affordance="next" onClick={demonstrate}>
              Select delegate
            </ActionButton>
            <ActionButton size="compact" affordance="clock" onClick={demonstrate}>
              Start withdrawal
            </ActionButton>
          </article>
          <article>
            <h3 className="ui-label">Primary navigation · create a proposal</h3>
            <ActionLink href="#actions" intent="create" affordance="plus">
              Create proposal
            </ActionLink>
            <ActionLink href="#actions" intent="create" affordance="plus" disabled={true}>
              Create proposal
            </ActionLink>
          </article>
          <article>
            <h3 className="ui-label">Selected / current state</h3>
            <DelegateStatus />
            <ActionButton affordance="check" disabled={true}>
              Your wallet selected
            </ActionButton>
            <ActionButton affordance="check" disabled={true}>
              No delegation
            </ActionButton>
          </article>
          <article>
            <h3 className="ui-label">Unavailable / pending</h3>
            <ActionButton size="compact" intent="create" disabled={true}>
              Lock FOLD
            </ActionButton>
            <ActionButton intent="confirm" isLoading={true}>
              Confirming
            </ActionButton>
          </article>
        </div>
        <p className="ui-body" aria-live="polite">
          {feedback}
        </p>
        <p className="ui-label">Saved disclosure study · production locks stay expanded</p>
        <div className="power-card power-overview-card">
          <PowerDisclosure
            className="power-lock-disclosure"
            title="Your locks"
            description="30.10K FOLD"
            renderToggle={(props) => (
              <LockSummaryToggle
                {...props}
                items={[
                  { id: "lock-1", status: "active" },
                  { id: "lock-2", status: "active" },
                  { id: "lock-3", status: "active" },
                  { id: "lock-4", status: "cooldown" },
                  { id: "lock-5", status: "ready" },
                ]}
              />
            )}
            toolbar={
              <ActionButton intent="create" size="compact" affordance="lock" onClick={demonstrate}>
                Lock FOLD
              </ActionButton>
            }
          >
            <p className="ui-body">A disclosure uses the same secondary action and the website’s bending chevron.</p>
          </PowerDisclosure>
        </div>
      </section>
      <section id="states" className={styles.section} aria-labelledby="states-heading">
        <h2 id="states-heading" className="ui-section-title">
          States are supporting information
        </h2>
        <p className="ui-body">
          Each lock has an individual marker inside one disclosure control. Hover or focus shows the full state counts;
          activating the control expands the full lock list. The rows retain their explicit labels.
        </p>
        <div className={styles.samples}>
          <LockStatusBadge status="active" />
          <LockStatusBadge status="inactive" />
          <LockStatusBadge status="cooldown" />
          <LockStatusBadge status="ready" />
        </div>
        <div className={styles.samples}>
          <span className="badge active">Active</span>
          <span className="badge foundation">Veto period</span>
          <span className="badge executed">Executed</span>
        </div>
      </section>
      <section id="references" className={styles.section} aria-labelledby="references-heading">
        <h2 id="references-heading" className="ui-section-title">
          References used
        </h2>
        <p className="ui-body">
          Selected from the existing Interfold Governance Visual Atlas. These guide grouping and consistency; Interfold
          supplies the brand.
        </p>
        {interfaceReferences.map((reference) => (
          <article key={reference.href}>
            <a className={styles.referenceLink} href={reference.href} target="_blank" rel="noreferrer">
              {reference.name} ↗
            </a>
            <p className="ui-body">{reference.lesson}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
