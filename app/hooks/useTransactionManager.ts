import { useEffect } from "react";
import { useAlerts } from "@/context/Alerts";
import { useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { decodeTxError } from "@/utils/tx-errors";

export type TxLifecycleParams = {
  onSuccessMessage?: string;
  onSuccessDescription?: string;
  onSuccess?: () => any;
  onErrorMessage?: string;
  onErrorDescription?: string;
  onError?: () => any;
};

export function useTransactionManager(params: TxLifecycleParams) {
  const { onSuccess, onError } = params;
  const { writeContract, writeContractAsync, data: hash, error, status } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });
  const { addAlert } = useAlerts();

  useEffect(() => {
    if (status === "idle" || status === "pending") {
      return;
    } else if (status === "error") {
      const friendly = decodeTxError(error, params.onErrorMessage || "Could not fulfill the transaction");
      if (friendly.isUserRejection) {
        addAlert("The transaction signature was declined", {
          description: friendly.description,
          timeout: 4 * 1000,
        });
      } else {
        console.error("ERROR", error);
        addAlert(friendly.title, {
          type: "error",
          description: params.onErrorDescription || friendly.description,
        });
      }

      if (typeof onError === "function") {
        onError();
      }
      return;
    }

    // TX submitted
    if (!hash) {
      return;
    } else if (isConfirming) {
      addAlert("Transaction submitted", {
        description: "Waiting for the transaction to be validated",
        txHash: hash,
      });
      return;
    } else if (!isConfirmed) {
      return;
    }

    addAlert(params.onSuccessMessage || "Transaction fulfilled", {
      description: params.onSuccessDescription || "The transaction has been validated on the network",
      type: "success",
      txHash: hash,
    });

    if (typeof onSuccess === "function") {
      onSuccess();
    }
  }, [status, hash, isConfirming, isConfirmed]);

  return { writeContract, writeContractAsync, hash, status, isConfirming, isConfirmed };
}
