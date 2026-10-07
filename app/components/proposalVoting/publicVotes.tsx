import type { IVote } from "@/utils/types";
import { BallotDisclosure } from "./ballotDisclosure";
import { VotesDataList } from "./votesDataList/votesDataList";

export function PublicVotes({ votes }: { votes: IVote[] }) {
  return (
    <BallotDisclosure
      title={
        <>
          Public votes <span className="proposal-detail-count">{votes.length}</span>
        </>
      }
    >
      <div className="proposal-activity-body">
        <VotesDataList votes={votes} />
      </div>
    </BallotDisclosure>
  );
}
