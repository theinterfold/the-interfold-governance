/**
 * Renders the settlement unlock as a relative wait plus the absolute local time.
 *
 * After an E3 fails, Interfold does not refund immediately: `processE3Failure` freezes the payer
 * snapshot, and the slashing manager refuses it while a committee-affecting accusation can still
 * be filed (the ZEN2-04 guard). Claiming before that window closes reverts `SettlementBlocked()`,
 * so the caller pays gas to learn they must wait. The refund card says when instead.
 *
 * Relative alone ("in about 20 hours") is the useful part, but a reader deciding whether to come
 * back tomorrow needs the wall-clock time too, and the absolute value stays correct if the card is
 * left open.
 *
 * @param opensAt Unix seconds after which settlement opens (the accusation submission deadline).
 */
export const formatSettlementOpensAt = (opensAt: number): string => {
  const secondsAway = opensAt - Math.floor(Date.now() / 1000);
  const absolute = new Date(opensAt * 1000).toLocaleString();

  // The contract compares against BLOCK time, which can trail the browser clock by a few seconds.
  // A deadline that has just passed reads as imminent rather than as a negative wait.
  if (secondsAway <= 60) return `shortly (${absolute})`;

  const hours = secondsAway / 3600;
  const relative =
    hours < 1
      ? `in about ${Math.round(secondsAway / 60)} minutes`
      : hours < 48
        ? `in about ${Math.round(hours)} hours`
        : `in about ${Math.round(hours / 24)} days`;

  return `${relative} (${absolute})`;
};
