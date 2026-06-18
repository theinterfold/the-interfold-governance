import { PUB_CRISP_SERVER_URL } from "@/constants";
import { CrispSDK } from "@crisp-e3/sdk";

export const crispSdk = new CrispSDK(PUB_CRISP_SERVER_URL);
