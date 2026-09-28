import { SiteFooter } from "@/vendor/site-header";
import { ScrollFadeIn } from "@/vendor/site-header/motion";
import { PUB_APP_NAME, PUB_BLOG_URL, PUB_CHAIN, PUB_CONSTITUTION_URL, PUB_PROJECT_URL, PUB_SOCIALS_URL } from "@/constants";

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
          { label: "Blog", href: PUB_BLOG_URL },
        ],
      },
      { title: "Follow us", links: [{ label: "X (Twitter)", href: PUB_SOCIALS_URL }] },
    ]}
    showUpdates={false}
    copyright={`© ${new Date().getFullYear()} ${PUB_APP_NAME} · ${PUB_CHAIN.name}`}
  />
);
