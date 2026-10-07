import { useCallback, useEffect, useState } from "react";
import {
  preparedBallotKey,
  readPreparedBallot,
  savePreparedBallot,
  type BallotScope,
  type PreparedBallot,
} from "../utils/preparedBallot";

const changed = "interfold-prepared-ballot-changed";
export function usePreparedBallot(scope: BallotScope | undefined) {
  const key = scope ? preparedBallotKey(scope) : undefined;
  const [loaded, setLoaded] = useState<{ key?: string; ballot: PreparedBallot | null }>({ ballot: null });
  useEffect(() => {
    const refresh = () => {
      try {
        setLoaded({ key, ballot: scope ? readPreparedBallot(window.localStorage, scope) : null });
      } catch {
        setLoaded({ key, ballot: null });
      }
    };
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener(changed, refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener(changed, refresh);
    };
  }, [key]);
  const save = useCallback((ballot: PreparedBallot) => {
    try {
      savePreparedBallot(window.localStorage, ballot);
    } catch (error) {
      if (ballot.transactionHash) {
        // A broadcast transaction cannot be undone. Keep its hash even if storage fills up.
        setLoaded({ key: preparedBallotKey(ballot), ballot });
        throw new Error(
          "Transaction sent, but its status could not be saved. Keep this page open and check confirmation."
        );
      }
      throw error;
    }
    window.dispatchEvent(new Event(changed));
  }, []);
  const remove = useCallback((ballot: PreparedBallot) => {
    // Do not remove a newer ballot prepared in another tab while an old send was in flight.
    const current = readPreparedBallot(window.localStorage, ballot);
    if (current?.attestedPayload === ballot.attestedPayload && current.createdAt === ballot.createdAt) {
      window.localStorage.removeItem(preparedBallotKey(ballot));
    }
    window.dispatchEvent(new Event(changed));
  }, []);
  return { ballot: loaded.key === key ? loaded.ballot : null, save, remove };
}
