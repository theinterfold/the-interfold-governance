import { Button } from "@aragon/ods";
import { PUB_APP_NAME, PUB_PROJECT_LOGO } from "@/constants";
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
        <Illustration />
      </div>
    );
  }

  return (
    <div className="w-full">
      <p className="text-md text-neutral-400">{children}</p>
      <Illustration />
      <div className="flex justify-center">
        <Button size="md" variant="primary" isLoading={!!isLoading} onClick={onClick ? onClick : () => {}}>
          <span>{callToAction}</span>
        </Button>
      </div>
    </div>
  );
};

function Illustration() {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={PUB_PROJECT_LOGO} alt={PUB_APP_NAME} className="mx-auto my-10 w-24 opacity-60" />;
}
