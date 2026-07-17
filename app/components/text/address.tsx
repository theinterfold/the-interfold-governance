import { formatHexString } from "@/utils/evm";
import { getChildrenText } from "@/utils/content";
import { type ReactNode, useState, useEffect } from "react";
import { usePublicClient } from "wagmi";
// import { Link } from '@aragon/ods'

export const AddressText = ({
  children,
  bold,
  asLink = true,
}: {
  children: ReactNode;
  bold?: boolean;
  /** Set false when rendered inside another <a> to avoid invalid nesting. */
  asLink?: boolean;
}) => {
  const address = getChildrenText(children);
  const client = usePublicClient();
  const [link, setLink] = useState<string>();

  const useBold = bold === undefined ? true : bold;

  useEffect(() => {
    if (!client) return;

    setLink(`${client.chain.blockExplorers?.default.url}/address/${address}`);
  }, [address, client]);

  const formattedAddress = formatHexString(address.trim());
  if (!link || !asLink) {
    return <span className={(useBold ? "font-semibold" : "") + " text-primary-400 underline"}>{formattedAddress}</span>;
  }
  return (
    <>
      <a href={link} target="_blank" className={(useBold ? "font-semibold" : "") + " text-primary-400 underline"}>
        {formattedAddress}
      </a>
    </>
  );
};
