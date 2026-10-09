import React, { type ReactNode } from "react";

interface IMainSectionProps {
  children?: ReactNode;
  narrow?: boolean;
}

// The content frame of the site header and footer (`.page-content`: --page-content-width centred
// inside --page-content-gutter), so every page's content lines up with the wordmark above it and
// the wordmark below it.
const CONTAINER = "page-content pb-6 pt-[var(--page-intro-space)] md:pb-20";

export const MainSection: React.FC<IMainSectionProps> = (props) => {
  const { children, narrow } = props;

  if (narrow) {
    return (
      <div className={CONTAINER}>
        {/* max-w-[768px] with NO mx-auto: forms and short-measure text (InputText
            has no intrinsic width and would stretch edge-to-edge without a cap) stay
            capped for readability, but start at the frame's left edge, under the
            wordmark.

            items-stretch, not items-center: children here set their own max-width
            (.form-intro is 58ch, .detail-summary 60ch), so centring them inside
            the 768px box would indent each block from the heading above it.
            Stretching lets each block start at the frame's edge and end where its
            own measure runs out. */}
        <div className="flex w-full max-w-[768px] flex-col items-stretch gap-y-6">{children}</div>
      </div>
    );
  }
  return <div className={CONTAINER}>{children}</div>;
};
