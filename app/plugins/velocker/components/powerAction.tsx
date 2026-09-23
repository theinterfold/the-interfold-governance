import type { ButtonHTMLAttributes, ComponentProps } from "react";
import { Button, IconType } from "@aragon/ods";

type Props = ButtonHTMLAttributes<HTMLButtonElement> &
  Pick<ComponentProps<typeof Button>, "size" | "isLoading"> & {
    intent?: "open" | "create" | "confirm";
    affordance?: "plus" | "next";
  };

/** A primary creation action stands apart from row actions; confirmations live in the tray. */
export function PowerAction({ intent = "open", affordance, className = "", ...props }: Props) {
  return (
    <Button
      {...props}
      variant={intent === "open" ? "secondary" : "primary"}
      iconRight={affordance === "plus" ? IconType.PLUS : affordance === "next" ? IconType.CHEVRON_RIGHT : undefined}
      className={`power-action power-action-${intent} ${className}`}
    />
  );
}
