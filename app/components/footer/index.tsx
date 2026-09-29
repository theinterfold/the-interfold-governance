import { SiteFooter } from "@/vendor/site-header";
import { ScrollFadeIn } from "@/vendor/site-header/motion";
import {
  PUB_APP_NAME,
  PUB_DOCUMENTATION_URL,
  PUB_COMMUNITY_URL,
  PUB_CHAIN,
  PUB_CONSTITUTION_URL,
  PUB_PROJECT_URL,
  PUB_SOCIALS_URL,
} from "@/constants";

export const Footer = () => (
  <SiteFooter
    Reveal={ScrollFadeIn}
    background="var(--page-ground-shade)"
    linkGroups={[
      {
        title: "Elsewhere",
        links: [
          { label: "The Interfold", href: PUB_PROJECT_URL },
          { label: "DAO Constitution", href: PUB_CONSTITUTION_URL },
          { label: "Documentation", href: PUB_DOCUMENTATION_URL },
        ],
      },
      {
        title: "Follow us",
        links: [
          { label: "X", href: PUB_SOCIALS_URL },
          { label: "Telegram", href: PUB_COMMUNITY_URL },
        ],
      },
    ]}
    showUpdates={false}
    copyright={`© ${new Date().getFullYear()} ${PUB_APP_NAME} · ${PUB_CHAIN.name}`}
  />
);
