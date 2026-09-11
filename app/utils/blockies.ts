import { useEffect, useState } from "react";
import { isAddress } from "viem";
import blockies from "blockies-ts";

/**
 * Identicons that match what block explorers draw for the same account.
 *
 * Etherscan generates its address icons with (`etherscan.io/jss/blockies.js`, called from
 * `assets/js/custom/combine-js-bottom2.js`):
 *
 *     blockies.create({ seed: address.toLowerCase(), size: 8, scale: 16 })
 *
 * `blockies-ts` is a port of that exact script — byte-identical PRNG, `createColor`,
 * `createImageData`, and the same call order — so it reproduces an explorer icon precisely as
 * long as the inputs match. Neither library normalises the seed, so the icon is a pure function
 * of (seed string, size) and BOTH have to be right:
 *
 *   - seed MUST be lowercase. A checksummed address yields a completely different icon. This is
 *     the trap: ODS `MemberAvatar` seeds with `getChecksum(address)` internally, so its default
 *     fallback never matches an explorer. Pass `useBlockieDataUrl` into its `src` to override it.
 *   - size MUST be 8. `size` is the grid dimension, not a display scale — changing it changes how
 *     much randomness is drawn and therefore the pattern. `scale` is the cosmetic knob and does
 *     not affect which pixels are set.
 */
export const EXPLORER_BLOCKIE_SIZE = 8;
export const EXPLORER_BLOCKIE_SCALE = 16;

/**
 * The explorer-identical blockie for an address, as a PNG data URL.
 *
 * Returns `undefined` during SSR and on the first client render: `blockies-ts` needs a real
 * `<canvas>`, and generating it while rendering on the server would produce a hydration mismatch.
 * Callers should treat `undefined` as "no override" and let their component's own fallback show.
 *
 * @param address The account to draw. Anything that is not a well-formed address yields
 *   `undefined` rather than a garbage icon.
 */
export const useBlockieDataUrl = (address?: string): string | undefined => {
  const [dataUrl, setDataUrl] = useState<string>();

  useEffect(() => {
    if (!address || !isAddress(address)) {
      setDataUrl(undefined);
      return;
    }

    setDataUrl(
      blockies
        .create({
          // Lowercase, exactly as Etherscan seeds it.
          seed: address.toLowerCase(),
          size: EXPLORER_BLOCKIE_SIZE,
          scale: EXPLORER_BLOCKIE_SCALE,
        })
        .toDataURL()
    );
  }, [address]);

  return dataUrl;
};
