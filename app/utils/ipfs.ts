import { PUB_IPFS_ENDPOINTS, PUB_APP_NAME } from "@/constants";
import { type Hex, fromHex, toBytes } from "viem";
import { CID } from "multiformats/cid";
import * as raw from "multiformats/codecs/raw";
import { sha256 } from "multiformats/hashes/sha2";

/** How long the gateways together may take to answer a read. */
const IPFS_FETCH_TIMEOUT = 15_000;
const UPLOAD_FILE_NAME = `${PUB_APP_NAME.toLowerCase().trim().replaceAll(" ", "-")}.json`;

export function fetchIpfsAsJson(ipfsUri: string) {
  return fetchRawIpfs(ipfsUri).then((res) => res.json());
}

export function fetchIpfsAsText(ipfsUri: string) {
  return fetchRawIpfs(ipfsUri).then((res) => res.text());
}

export function fetchIpfsAsBlob(ipfsUri: string) {
  return fetchRawIpfs(ipfsUri).then((res) => res.blob());
}

/**
 * Pins metadata via the server-side proxy (`/api/ipfs/pin`).
 *
 * The Pinata credential lives on the server only — see `pages/api/ipfs/pin.ts`.
 * Never call Pinata directly from the browser: a `NEXT_PUBLIC_*` token is
 * inlined into the bundle and readable by every visitor.
 */
export async function uploadToPinata(strBody: string) {
  const res = await fetch("/api/ipfs/pin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: strBody, name: UPLOAD_FILE_NAME }),
  });

  const resData = (await res.json()) as { uri?: string; error?: string };

  if (!res.ok || resData.error) throw new Error(resData.error ?? "Could not pin the metadata");
  else if (!resData.uri) throw new Error("Could not pin the metadata");
  return resData.uri;
}

export async function getContentCid(strMetadata: string) {
  const bytes = raw.encode(toBytes(strMetadata));
  const hash = await sha256.digest(bytes);
  const cid = CID.create(1, raw.code, hash);
  return `ipfs://${cid.toV1().toString()}`;
}

// Internal helpers

async function fetchRawIpfs(ipfsUri: string): Promise<Response> {
  if (!ipfsUri) throw new Error("Invalid IPFS URI");
  else if (ipfsUri.startsWith("0x")) {
    // fallback
    ipfsUri = fromHex(ipfsUri as Hex, "string");

    if (!ipfsUri) throw new Error("Invalid IPFS URI");
  }

  const uriPrefixes = PUB_IPFS_ENDPOINTS.split(",")
    .map((uri) => uri.trim())
    .filter(Boolean);
  if (!uriPrefixes.length) throw new Error("No available IPFS endpoints to fetch from");

  return fetchFromFirstGateway(uriPrefixes, resolvePath(ipfsUri));
}

/**
 * Ask every gateway at once and keep the first good answer. A gateway that is down or blocked on
 * the voter's network then costs no time, and a slow one cannot use up the time of a fast one.
 */
export async function fetchFromFirstGateway(uriPrefixes: string[], cid: string): Promise<Response> {
  const controllers = uriPrefixes.map(() => new AbortController());
  const timer = setTimeout(() => controllers.forEach((controller) => controller.abort()), IPFS_FETCH_TIMEOUT);
  try {
    const { response, index } = await Promise.any(
      uriPrefixes.map(async (uriPrefix, index) => {
        const response = await fetch(`${uriPrefix}/${cid}`, { method: "GET", signal: controllers[index].signal });
        if (!response.ok) throw new Error(`${uriPrefix} answered ${response.status}`);
        return { response, index };
      })
    );
    controllers.forEach((controller, other) => other !== index && controller.abort());
    return response; // .json(), .text(), .blob(), etc.
  } catch {
    throw new Error("Could not connect to any of the IPFS endpoints");
  } finally {
    // The answer's body is read after this returns, so the time limit ends here.
    clearTimeout(timer);
  }
}

function resolvePath(uri: string) {
  const path = uri.includes("ipfs://") ? uri.substring(7) : uri;
  return path;
}
