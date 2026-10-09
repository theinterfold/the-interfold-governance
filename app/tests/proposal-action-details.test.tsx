import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createConfig, WagmiProvider } from "wagmi";
import { custom } from "viem";
import { mainnet } from "viem/chains";
import { EncodedView } from "../components/proposalActions/encodedView";
import { CallParamField } from "../components/proposalActions/callParamField";
import type { RawAction } from "../utils/types";

const config = createConfig({
  chains: [mainnet],
  transports: {
    [mainnet.id]: custom({
      request: async () => {
        throw new Error("No network in rendering tests");
      },
    }),
  },
  ssr: true,
});
const recipient = "0x123456789012345678901234567890123456789012";
const render = (action: RawAction) =>
  renderToStaticMarkup(
    <WagmiProvider config={config}>
      <EncodedView rawAction={action} />
    </WagmiProvider>
  );

describe("Read-only proposal action details", () => {
  test("a one-wei transfer remains visible with its complete recipient", () => {
    const html = render({ to: recipient, data: "0x", value: 1n });
    expect(html).toContain("0.000000000000000001 ETH");
    expect(html).toContain(recipient);
    expect(html).not.toContain("<input");
  });

  test("rendering an unknown contract call preserves immutable transaction data and exact value", () => {
    const action = Object.freeze({
      to: recipient,
      data: "0xa9059cbb0000000000000001" as const,
      value: 123456789123456789123456789n,
    });
    const html = render(action);
    expect(html).toContain(action.data);
    expect(html).toContain("123456789.123456789123456789 ETH");
    expect(html).toContain(recipient);
    expect(action.value).toBe(123456789123456789123456789n);
  });

  test("decoded large integer arguments keep their precision", () => {
    const html = renderToStaticMarkup(
      <CallParamField
        idx={0}
        value={123456789123456789123456789n}
        functionAbi={{
          type: "function",
          name: "setLimit",
          inputs: [{ name: "limit", type: "uint256" }],
          outputs: [],
          stateMutability: "nonpayable",
        }}
      />
    );
    expect(html).toContain("123456789123456789123456789");
    expect(html).not.toContain("<input");
  });
});
