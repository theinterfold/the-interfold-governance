import { AddressText } from "@/components/text/address";
import { IconType, Link } from "@aragon/ods";
import type { Address } from "viem";

export interface IVotingDetailsProps {
  startDate?: string;
  endDate: string;
  snapshotTakenAt: string;
  snapshotBlockURL?: string;
  tokenAddress?: Address;
  options: string;
  strategy: string;
}

/** Match the exact UTC dates used by the proposal's deadline help. */
function VotingDate({ value }: { value: string }) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return <span>{value}</span>;
  const day = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
  const clock = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(date);
  return (
    <time className="voting-detail-date" dateTime={date.toISOString()}>
      <span>{day}</span>
      <span>{clock}</span>
    </time>
  );
}

export const VotingDetails: React.FC<IVotingDetailsProps> = (props) => {
  const { startDate, endDate, snapshotBlockURL, snapshotTakenAt, tokenAddress, options, strategy } = props;
  return (
    <div className="voting-method-details">
      <section>
        <div className="vp-head">
          <h3>Schedule</h3>
        </div>
        <div className="vp-body">
          {startDate && (
            <div className="ui-fact-row">
              <span className="text-neutral-500">Starts</span>
              <VotingDate value={startDate} />
            </div>
          )}
          <div className="ui-fact-row">
            <span className="text-neutral-500">Ends</span>
            <VotingDate value={endDate} />
          </div>
          <div className="ui-fact-row">
            <span className="text-neutral-500">Snapshot</span>
            {snapshotBlockURL ? (
              <Link iconRight={IconType.LINK_EXTERNAL} href={snapshotBlockURL} target="_blank">
                <VotingDate value={snapshotTakenAt} />
              </Link>
            ) : (
              <VotingDate value={snapshotTakenAt} />
            )}
          </div>
        </div>
      </section>
      <section>
        <div className="vp-head">
          <h3>Governance settings</h3>
        </div>
        <div className="vp-body">
          {tokenAddress && (
            <div className="ui-fact-row">
              <span className="text-neutral-500">Token contract</span>
              <AddressText>{tokenAddress}</AddressText>
            </div>
          )}
          <div className="ui-fact-row">
            <span className="text-neutral-500">Strategy</span>
            <span>{strategy}</span>
          </div>
          <div className="ui-fact-row">
            <span className="text-neutral-500">Voting options</span>
            <span>{options}</span>
          </div>
        </div>
      </section>
    </div>
  );
};
