interface IVotingStageStatus {
  endDate: string;
  status?: string;
}

const STATUS_LABELS: Record<string, string> = {
  loading: "Loading",
  pending: "Pending",
  active: "Active",
  accepted: "Accepted",
  rejected: "Rejected",
  unreached: "Not started",
  executable: "Executable",
  executed: "Executed",
  expired: "Expired",
  canceled: "Canceled",
  vetoed: "Vetoed",
};

export const VotingStageStatus: React.FC<IVotingStageStatus> = ({ endDate, status }) => {
  const normalized = status?.toLowerCase() ?? "loading";
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm leading-tight">
      <span className={`badge ${normalized}`}>{STATUS_LABELS[normalized] ?? status}</span>
      {normalized === "active" && endDate && <span className="text-neutral-500">{endDate} left to participate</span>}
    </div>
  );
};
