import { BendingChevron } from "@/vendor/site-header";
import { MemberAvatar } from "@aragon/ods";
import { Shuffle } from "@phosphor-icons/react";
import { isAddress } from "viem";
import { MaskIcon } from "@/components/proposalVoting/ballot";
import { PrivacyReviewRow } from "@/components/proposalVoting/privacyTools";
import { AddressText } from "@/components/text/address";
import { PowerInfo } from "@/plugins/velocker/components/powerInfo";
import { blockieDataUrl } from "@/utils/blockies";
import type { MaskEntry } from "./maskQueue";
import { groupMaskRecipients } from "../../utils/maskRecipientGroups";
import styles from "./maskRecipientsReview.module.css";

const visibleAvatars = 5;

/** Random recipients remain unknown until confirmation; never give them a wallet identicon. */
function RecipientAvatar({ entry }: { entry: MaskEntry }) {
  const address = entry.target.trim();
  return (
    <span className={styles.avatar} data-random={entry.mode === "random"} aria-hidden="true">
      {entry.mode === "random" ? (
        <Shuffle size={16} />
      ) : isAddress(address) ? (
        <MemberAvatar src={blockieDataUrl(address) ?? ""} address={address} alt="" size="sm" />
      ) : (
        <span>?</span>
      )}
    </span>
  );
}

/** One shared review row for combined ballots, standalone masks and the review study. */
export function MaskRecipientsReview({
  entries,
  isInvalid,
  embedded = false,
}: {
  entries: readonly MaskEntry[];
  embedded?: boolean;
  isInvalid?: (entry: MaskEntry) => boolean;
}) {
  if (!entries.length) return null;
  const first = entries[0];
  const multiple = entries.length > 1;
  const groups = groupMaskRecipients(entries);
  const chosenCount = groups.filter(group => group.entry.mode === "address").length;
  const randomCount = entries.filter(entry => entry.mode === "random").length;
  const incomplete = entries.filter((entry) =>
    isInvalid ? isInvalid(entry) : entry.mode === "address" && !isAddress(entry.target.trim())
  ).length;

  const value = multiple ? (
        <span className={styles.summary}>
          <PowerInfo
            label={`Show recipients for ${entries.length} masks${incomplete ? `, ${incomplete} need attention` : ""}`}
            interactive={true}
            contentClassName={styles.details}
            trigger={
              <span className={styles.trigger}>
                {!embedded && <span className={styles.stack} aria-hidden="true">
                  {groups.slice(0, visibleAvatars).map((group) => <RecipientAvatar key={group.key} entry={group.entry} />)}
                  {groups.length > visibleAvatars && (
                    <span className={`${styles.avatar} ${styles.overflow}`}>+{groups.length - visibleAvatars}</span>
                  )}
                </span>}
                <span className={styles.count}>{embedded ? [
                  chosenCount ? `${chosenCount} chosen ${chosenCount === 1 ? "wallet" : "wallets"}` : null,
                  randomCount ? `${randomCount} random ${randomCount === 1 ? "recipient" : "recipients"}` : null,
                ].filter(Boolean).join(" · ") : `${entries.length} masks`}</span>
                {embedded && <BendingChevron open={false} width={8} thickness={1.3} />}
              </span>
            }
          >
            <strong className={styles.heading}>Mask recipients</strong>
            <ul className={styles.list} tabIndex={0} aria-label="Mask recipients, grouped by wallet">
              {groups.map(({ key, entry, entries: members }) => {
                const address = entry.target.trim();
                const invalid = members.some((member) =>
                  isInvalid ? isInvalid(member) : member.mode === "address" && !isAddress(member.target.trim())
                );
                return (
                  <li key={key} data-invalid={invalid}>
                    <RecipientAvatar entry={entry} />
                    <div className={styles.identity}>
                      {entry.mode === "random" ? (
                        <span>{members.length === 1 ? "Random eligible voter" : "Random eligible voters"}</span>
                      ) : isAddress(address) ? (
                        <code className={styles.address}>{address}</code>
                      ) : (
                        <span>No wallet selected</span>
                      )}
                      {invalid && isAddress(address) && <span className={styles.invalid}>Choose an eligible wallet</span>}
                    </div>
                    <span className={styles.quantity} aria-label={`${members.length} ${members.length === 1 ? "mask" : "masks"}`}>
                      ×{members.length}
                    </span>
                  </li>
                );
              })}
            </ul>
            {(embedded || entries.some((entry) => entry.mode === "random")) && (
              <p className={styles.note}>
                {embedded && "Each mask is sent separately. "}
                {entries.some(entry => entry.mode === "random") && "Random recipients are chosen when you confirm, each a different voter where possible."}
              </p>
            )}
          </PowerInfo>
          {incomplete > 0 && <span className={styles.invalid}>{incomplete} {incomplete === 1 ? "recipient needs" : "recipients need"} attention</span>}
        </span>
      ) : first.mode === "random" ? (
        "Random eligible voter"
      ) : isAddress(first.target.trim()) ? (
        <AddressText>{first.target.trim()}</AddressText>
      ) : (
        "No wallet selected"
      );
  if (embedded) return <div className={styles.embedded}>{value}</div>;
  return <PrivacyReviewRow tool="Add a mask" icon={<MaskIcon />} active={true}
    label={multiple ? "Mask recipients" : "Mask recipient"} value={value} />;
}
