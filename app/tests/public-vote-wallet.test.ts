import { afterEach, expect, mock, spyOn, test } from "bun:test";
import * as query from "@tanstack/react-query";
import * as wagmi from "wagmi";
import * as transactions from "../hooks/useTransactionManager";
import * as spp from "../plugins/spp/hooks/useSppProposal";
import { useProposalVoting } from "../plugins/tokenVoting/hooks/useProposalVoting";
import ProposalDetail from "../plugins/tokenVoting/pages/proposal";

const firstAccount = "0x1111111111111111111111111111111111111111";
const secondAccount = "0x2222222222222222222222222222222222222222";

afterEach(() => mock.restore());

test("the public vote's transaction-owning detail resets across wallets and proposals", () => {
  let address = firstAccount;
  let subProposalId = 1n;
  spyOn(wagmi, "useAccount").mockImplementation(() => ({ address }) as ReturnType<typeof wagmi.useAccount>);
  spyOn(spp, "useSppProposal").mockImplementation(() => (
    { subProposalId, metadataUri: "ipfs://example" } as ReturnType<typeof spp.useSppProposal>
  ));

  // A different React key discards the old mutation and its confirmation along with the ballot.
  const detail = () => ProposalDetail({ index: subProposalId });
  const initial = detail().key;
  expect(detail().key).toBe(initial);
  address = secondAccount;
  const switched = detail().key;
  expect(switched).not.toBe(initial);
  subProposalId = 2n;
  expect(detail().key).not.toBe(switched);
});

test("the public vote writer sends the reviewed account and proposal to the wallet", () => {
  const writeContract = mock(() => {});
  spyOn(query, "useQueryClient").mockReturnValue(new query.QueryClient());
  spyOn(transactions, "useTransactionManager").mockReturnValue({
    writeContract, writeContractAsync: mock(), status: "idle", isConfirmed: false,
    isConfirming: false, error: undefined, hash: undefined,
  });

  useProposalVoting(3n, undefined).voteProposal(2, true);
  expect(writeContract).not.toHaveBeenCalled();
  useProposalVoting(3n, secondAccount).voteProposal(2, true);
  expect(writeContract).toHaveBeenCalledWith(expect.objectContaining({
    account: secondAccount, functionName: "vote", args: [3n, 2, true],
  }));
});
