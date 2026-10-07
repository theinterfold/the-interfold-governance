import React, { type ReactNode } from "react";

interface IMainSectionProps {
  children?: ReactNode;
  narrow?: boolean;
}

// Same outer container the navbar and footer use — max-w-[1440px] with px-4/md:px-6
// — so every page's content lines up with the wordmark above it and the wordmark
// below it. It used to be max-w-screen-xl (1280px), a second container width with
// its own centring math, which put the visible column ~50-360px off the chrome's
// left edge depending on viewport (424px vs the nav's 64px at 1568 wide).
const CONTAINER = "mx-auto w-full max-w-[1440px] px-4 pb-6 pt-[var(--page-intro-space)] md:px-6 md:pb-20";

export const MainSection: React.FC<IMainSectionProps> = (props) => {
  const { children, narrow } = props;

  if (narrow) {
    return (
      <div className={CONTAINER}>
        {/* max-w-[768px] with NO mx-auto: forms and short-measure text (InputText
            has no intrinsic width and would stretch edge-to-edge without a cap) stay
            capped for readability, but left-anchored to the container's own edge
            rather than re-centered inside it — a second centring step that is what
            put this column out of line with the chrome in the first place.

            items-stretch, not items-center: children here set their own max-width
            (.form-intro is 58ch, .detail-summary 60ch), so centring them inside
            even a left-anchored 768px box would still indent each block from the
            heading above it. Stretching lets each block start at the container's
            edge and end where its own measure runs out. */}
        <div className="flex w-full max-w-[768px] flex-col items-stretch gap-y-6">{children}</div>
      </div>
    );
  }
  return <div className={CONTAINER}>{children}</div>;
};
