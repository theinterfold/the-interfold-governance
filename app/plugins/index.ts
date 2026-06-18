import { PUB_CRISP_VOTING_PLUGIN_ADDRESS } from "@/constants";
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
];
