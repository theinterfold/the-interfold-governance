import { AccordionHeader } from "@/components/motion/AccordionHeader";
import { PUB_CHAIN } from "@/constants";
import { formatHexString } from "@/utils/evm";
import { AccordionContainer, AccordionItem, Button, Icon, IconType } from "@aragon/ods";
import { CallFunctionSignatureField, CallParamField } from "./callParamField";
import { ActionDetailField } from "./actionDetailField";
import { AddressText } from "@/components/text/address";
import { EncodedView } from "./encodedView";
import type { RawAction } from "@/utils/types";
import { If } from "../if";
import { useAction } from "@/hooks/useAction";
import { decodeCamelCase } from "@/utils/case";
import { formatEther } from "viem";
import { AccordionContent } from "@/components/motion/AccordionContent";

const DEFAULT_DESCRIPTION =
  "When the proposal passes the community vote, the following actions will be executable by the DAO.";
const DEFAULT_EMPTY_LIST_DESCRIPTION = "The proposal has no actions defined, it will behave as a signaling poll.";

interface IProposalActionsProps {
  compact?: boolean;
  description?: string;
  emptyListDescription?: string;
  actions?: RawAction[];
  onRemove?: (index: number) => any;
}

export const ProposalActions: React.FC<IProposalActionsProps> = (props) => {
  const { actions, description, emptyListDescription, onRemove, compact = false } = props;

  let message: string;
  if (actions?.length) {
    message = description ?? DEFAULT_DESCRIPTION;
  } else {
    message = emptyListDescription ?? DEFAULT_EMPTY_LIST_DESCRIPTION;
  }

  return (
    <div className={`proposal-actions ${compact ? "composer-action-list" : "proposal-actions-card"}`}>
      {/* Header */}
      {!compact && (
        <div className="proposal-actions-heading">
          <h3>Actions</h3>
          <p>{message}</p>
        </div>
      )}

      {/* Content */}
      <If lengthOf={actions} above={0}>
        <AccordionContainer isMulti={true} className="proposal-action-items">
          {actions?.map((action, index) => (
            <ActionItem
              key={index}
              index={index}
              rawAction={action}
              onRemove={onRemove ? () => onRemove?.(index) : undefined}
            />
          ))}
        </AccordionContainer>
      </If>
    </div>
  );
};

const ActionItem = ({ index, rawAction, onRemove }: { index: number; rawAction: RawAction; onRemove?: () => any }) => {
  const action = useAction(rawAction);
  const title = `Action ${index + 1}`;
  const coinName = PUB_CHAIN.nativeCurrency.symbol;
  const isEthTransfer = !action.data || action.data === "0x";
  const functionName = isEthTransfer
    ? `Transfer ${coinName}`
    : decodeCamelCase(action.functionName ?? "(function call)");
  const functionAbi = action.functionAbi ?? null;

  return (
    <AccordionItem className="proposal-action-item" value={title}>
      <AccordionHeader className="proposal-action-trigger">
        <span className="proposal-action-number">
          {index + 1}
          <span className="sr-only">. Action</span>
        </span>
        <span className="proposal-action-summary">
          <strong>{functionName}</strong>
          <span className="proposal-action-destination">
            {formatHexString(rawAction.to)}
            {!isEthTransfer && (
              <span className="proposal-action-verification">
                <Icon icon={functionAbi ? IconType.CHECKMARK : IconType.WARNING} />
                {functionAbi ? "Decoded" : "Not verified"}
              </span>
            )}
          </span>
        </span>
      </AccordionHeader>

      <AccordionContent>
        <div className="proposal-action-facts">
          {!functionAbi ? (
            <EncodedView rawAction={rawAction} />
          ) : (
            <>
              <ActionDetailField label="To">
                <AddressText bold={false} label={rawAction.to}>
                  {rawAction.to}
                </AddressText>
              </ActionDetailField>
              <CallFunctionSignatureField functionAbi={functionAbi} />
              {action.args.map((arg, i) => (
                <CallParamField key={i} value={arg} idx={i} functionAbi={functionAbi} />
              ))}
              {!action.args.length && <p className="proposal-action-note">This action has no parameters.</p>}
              {action.value > 0n && (
                <ActionDetailField label="Value">
                  {formatEther(action.value)} {coinName}
                </ActionDetailField>
              )}
            </>
          )}
          <If true={!!onRemove}>
            <div className="mt-2">
              <Button variant="tertiary" size="sm" iconLeft={IconType.CLOSE} onClick={onRemove}>
                Remove action
              </Button>
            </div>
          </If>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
};
