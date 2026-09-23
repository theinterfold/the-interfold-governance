import { describe, expect, test } from "bun:test";
import { createConfig } from "wagmi";
import { encodeFunctionData, decodeFunctionResult, erc20Abi, createPublicClient } from "viem";
import { DESIGN_PREVIEW, DEMO_WALLET, DEMO_MESSAGE } from "../dev/previewMode";
import { demoConnector } from "../dev/demoConnector";
import { demoTransport, demoCall, demoSdk } from "../dev/fixtures";
import { PUB_CHAIN, PUB_TOKEN_ADDRESS, PUB_CRISP_VOTING_PLUGIN_ADDRESS, PUB_SPP_PRIVATE_ADDRESS } from "../constants";
import { CrispVotingAbi } from "../plugins/crispVoting/artifacts/CrispVoting";
import { StagedProposalProcessorAbi } from "../plugins/spp/artifacts/StagedProposalProcessor";
import { uploadToPinata } from "../utils/ipfs";

describe.skipIf(!DESIGN_PREVIEW)("Local design preview isolation", () => {
  test("the connector rejects every signing and transaction method", async () => {
    const config = createConfig({
      chains: [PUB_CHAIN],
      transports: { [PUB_CHAIN.id]: demoTransport() },
      connectors: [demoConnector()],
      multiInjectedProviderDiscovery: false,
    });
    const connector = config.connectors[0];
    expect((await connector.connect()).accounts).toEqual([DEMO_WALLET]);
    const provider = (await connector.getProvider()) as { request: (input: { method: string }) => Promise<unknown> };
    for (const method of [
      "eth_sendTransaction",
      "eth_sendRawTransaction",
      "eth_sign",
      "personal_sign",
      "eth_signTypedData_v4",
      "wallet_sendCalls",
    ]) {
      await expect(provider.request({ method })).rejects.toThrow(DEMO_MESSAGE);
    }
  });

  test("even an eth_call cannot simulate a write through demo fixtures", () => {
    const data = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [DEMO_WALLET, 1n] });
    expect(() => demoCall(PUB_TOKEN_ADDRESS, data)).toThrow(DEMO_MESSAGE);
  });

  test("batched reads decode through the normal application contract ABIs", async () => {
    const client = createPublicClient({ chain: PUB_CHAIN, transport: demoTransport() });
    const result = await client.multicall({
      allowFailure: false,
      contracts: [
        { address: PUB_TOKEN_ADDRESS, abi: erc20Abi, functionName: "decimals" },
        { address: PUB_TOKEN_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [DEMO_WALLET] },
      ],
    });
    expect(result).toEqual([18, 125000n * 10n ** 18n]);
  });

  test("SPP and CRISP decode their distinct proposal structures", () => {
    for (const [address, abi] of [
      [PUB_SPP_PRIVATE_ADDRESS, StagedProposalProcessorAbi],
      [PUB_CRISP_VOTING_PLUGIN_ADDRESS, CrispVotingAbi],
    ] as const) {
      const data = encodeFunctionData({ abi, functionName: "getProposal", args: [1n] });
      const proposal = decodeFunctionResult({ abi, functionName: "getProposal", data: demoCall(address, data) });
      expect(proposal.executed).toBe(false);
    }
  });

  test("metadata uploads are blocked before any fetch", async () => {
    await expect(uploadToPinata("{}")).rejects.toThrow(DEMO_MESSAGE);
  });

  test("the CRISP fixture rejects ballot preparation and unrecognised methods", async () => {
    const sdk = demoSdk() as unknown as Record<string, () => Promise<unknown>>;
    await expect(sdk.prepareBallot()).rejects.toThrow(DEMO_MESSAGE);
    await expect(sdk.broadcastVote()).rejects.toThrow(DEMO_MESSAGE);
  });

  test("production ignores an enabled preview flag", () => {
    const result = Bun.spawnSync(
      [
        process.execPath,
        "-e",
        'import { DESIGN_PREVIEW } from "./dev/previewMode"; if (DESIGN_PREVIEW) process.exit(1);',
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env, NODE_ENV: "production", NEXT_PUBLIC_DESIGN_PREVIEW: "true" },
      }
    );
    expect(result.exitCode).toBe(0);
  });
});
