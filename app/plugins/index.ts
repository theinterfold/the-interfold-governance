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
  // With a voting escrow configured, locking and delegation are ONE surface (the adapter), so
  // they share one page. Without one (testnet), delegation lives on the token and stands alone.
  ...(PUB_ENABLE_LOCKING
    ? [
        {
          id: "lock",
          folderName: "velocker",
          title: "Voting power",
          icon: IconType.APP_MEMBERS,
          pluginAddress: PUB_VE_LOCKER_ADDRESS,
        },
      ]
    : [
        {
          id: "members",
          folderName: "members",
          title: "Voting power",
          icon: IconType.APP_MEMBERS,
          pluginAddress: PUB_TOKEN_ADDRESS,
        },
      ]),
];
