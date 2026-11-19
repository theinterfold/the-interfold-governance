import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createConfig, WagmiProvider } from "wagmi";
import { custom } from "viem";
import { mainnet } from "viem/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MaskQueue, type MaskEntry } from "../plugins/crispVoting/components/vote/maskQueue";

const address = "0x1111111111111111111111111111111111111111";
const config = createConfig({ chains: [mainnet], ssr: true, transports: {
  [mainnet.id]: custom({ request: async () => { throw new Error("No network in rendering tests"); } }),
} });
function render(entries: MaskEntry[], invalid = false, recipientError = false) {
  return renderToStaticMarkup(<WagmiProvider config={config}>
    <QueryClientProvider client={new QueryClient()}>
      <MaskQueue entries={entries} onChange={() => {}} onAdd={() => {}}
        recipients={[{ address, balance: 1n }]} recipientError={recipientError}
        onRetry={() => {}} pending={false} isInvalid={() => invalid} />
    </QueryClientProvider>
  </WagmiProvider>);
}

test("four random masks keep four visible recipient editors and preserve the entries", () => {
  const entries: MaskEntry[] = Array.from({ length: 4 }, (_, id) => ({ id, mode: "random", target: "" }));
  const before = structuredClone(entries);
  const html = render(entries);
  expect(html).not.toContain('class="mask-queue-group-trigger"');
  expect(html).toContain("4 masks to send");
  expect(html.match(/class="mask-queue-entry"/g)).toHaveLength(4);
  expect(html).not.toContain('<li aria-hidden="true"');
  expect(entries).toEqual(before);
});

test("repeated invalid wallets keep their individual errors visible", () => {
  const html = render([0, 1].map(id => ({ id, mode: "address", target: address })), true);
  expect(html).not.toContain('class="mask-queue-group-trigger"');
  expect(html.match(/This wallet is not eligible/g)).toHaveLength(2);
  expect(html).not.toContain('<li aria-hidden="true"');
});

test("a census failure remains visible above the individual masks", () => {
  const html = render([0, 1].map(id => ({ id, mode: "random", target: "" })), false, true);
  expect(html).toContain("Could not load eligible voters.");
  expect(html).toContain("Try again");
  expect(html).toContain("2 masks to send");
});
