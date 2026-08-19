import {
  PUB_CRISP_VOTING_PLUGIN_ADDRESS,
  PUB_ENABLE_LOCKING,
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
  {
    id: "members",
    folderName: "members",
    title: "Delegation",
    icon: IconType.APP_MEMBERS,
    pluginAddress: PUB_TOKEN_ADDRESS,
  },
  // Only when a voting escrow is configured — without one there is nothing to lock into.
  ...(PUB_ENABLE_LOCKING
    ? [
        {
          id: "lock",
          folderName: "velocker",
          title: "Lock",
          icon: IconType.APP_ASSETS,
          pluginAddress: PUB_VE_LOCKER_ADDRESS,
        },
      ]
    : []),
];
