import { Button } from "@aragon/ods";
import { ReactNode } from "react";

export const MissingContentView = ({
  children,
  callToAction,
  onClick,
  isLoading,
}: {
  children: ReactNode;
  callToAction?: string;
  onClick?: () => any;
  isLoading?: boolean;
}) => {
  if (!callToAction) {
    return (
      <div className="w-full">
        <p className="text-md text-neutral-400">{children}</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <p className="text-md text-neutral-400">{children}</p>
      <div className="mt-6 flex justify-center">
        <Button size="md" variant="primary" isLoading={!!isLoading} onClick={onClick ? onClick : () => {}}>
          <span>{callToAction}</span>
        </Button>
      </div>
    </div>
  );
};
