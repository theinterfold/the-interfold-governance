import {
  PUB_CRISP_VOTING_PLUGIN_ADDRESS,
  PUB_ENABLE_LOCKING,
  VOTING_POWER_PLUGIN_ID,
  PUB_TOKEN_ADDRESS,
  PUB_VE_LOCKER_ADDRESS,
} from "@/constants";
import { IconType } from "@aragon/ods";

type PluginItem = {
  /** The URL fragment after /plugins */
  id: string;
  /** The name of the folder within `/plugins` */
  folderName: string;
  /** Title on menu */
  title: string;
  icon?: IconType;
  pluginAddress: string;
};

export const plugins: PluginItem[] = [
  {
    id: "proposals",
    folderName: "governance",
    title: "Proposals",
    icon: IconType.BLOCKCHAIN_BLOCKCHAIN,
    // Informational only — the governance shell talks to both plugin addresses.
    pluginAddress: PUB_CRISP_VOTING_PLUGIN_ADDRESS,
  },
  // With a voting escrow configured, locking and self-delegation share one page (the adapter).
  // Without one (testnet), the token page activates wallet FOLD.
  {
    id: VOTING_POWER_PLUGIN_ID,
    folderName: PUB_ENABLE_LOCKING ? "velocker" : "members",
    title: "Voting power",
    icon: IconType.APP_MEMBERS,
    pluginAddress: PUB_ENABLE_LOCKING ? PUB_VE_LOCKER_ADDRESS : PUB_TOKEN_ADDRESS,
  },
];
