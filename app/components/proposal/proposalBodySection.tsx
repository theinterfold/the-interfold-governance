import { BendingChevron } from "@/vendor/site-header";
import { DocumentParser } from "@aragon/ods";
import classNames from "classnames";
import { useId, useRef, useState } from "react";
import { FluidHeight } from "@/components/motion/FluidHeight";

interface IBodySectionProps {
  body: string;
}

export const BodySection: React.FC<IBodySectionProps> = (props) => {
  let { body } = props;
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const contentId = useId();
  const cardRef = useRef<HTMLElement>(null);

  const toggle = () => {
    if (expanded && (cardRef.current?.getBoundingClientRect().top ?? 0) < 80) {
      cardRef.current?.scrollIntoView({
        block: "start",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      });
    }
    setExpanded(!expanded);
  };

  if (!body.trim() || body === "<p></p>") body = "No description was provided";

  return (
    <section ref={cardRef} className="proposal-description" data-expanded={expanded} aria-label="Proposal description">
      <div className="proposal-description-content" data-truncated={overflows && !expanded}>
        <FluidHeight
          id={contentId}
          expanded={expanded}
          collapsedHeight={420}
          onOverflowChange={setOverflows}
          onFocusCapture={() => setExpanded(true)}
        >
          <div className="detail-body flex flex-col gap-y-4">
            <DocumentParser document={body} className={proseClasses} />
          </div>
        </FluidHeight>
      </div>
      {overflows && (
        <button
          type="button"
          className="description-toggle"
          onClick={toggle}
          aria-expanded={expanded}
          aria-controls={contentId}
        >
          <span>{expanded ? "Read less" : "Read full description"}</span>
          <BendingChevron open={expanded} width={8} thickness={1.5} />
        </button>
      )}
    </section>
  );
};

// Temporary until exported prose has been fixed
const proseClasses = classNames(
  "proposal-prose",
  "prose-p:text-base prose-p:md:text-lg", //prose-p
  "prose-a:text-primary-400 prose-a:no-underline prose-a:hover:text-primary-600 prose-a:active:text-primary-800", // prose-a
  "prose-strong:text-base prose-strong:md:text-lg prose-strong:text-neutral-500", // prose-strong
  "prose-em:text-base prose-em:md:text-lg prose-em:text-neutral-500", //em
  "prose-blockquote:rounded-lg prose-blockquote:border prose-blockquote:border-neutral-200 prose-blockquote:bg-neutral-50 prose-blockquote:prose-p-10 prose-blockquote:shadow-md", // blockquote
  "prose-pre:rounded-lg prose-pre:bg-neutral-900 prose-pre:text-neutral-50", //pre
  "prose-code:bg-neutral-900 prose-code:text-neutral-50 prose-code:text-sm prose-code:py-1 prose-code:px-1 prose-code:rounded prose-code:font-normal", //code
  "prose-img:overflow-hidden prose-img:rounded-xl prose-img:shadow-md", // img
  "prose-video:overflow-hidden prose-video:rounded-xl prose-video:shadow-md", // video
  "prose-hr:mt-10 prose-hr:border-neutral-200", // hr
  "prose-lead:text-neutral-600",
  "prose-headings:text-neutral-800 prose-headings:leading-tight text-neutral-500 prose-headings:font-normal"
);
