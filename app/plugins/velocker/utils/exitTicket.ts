/** The part of a `DynamicExitQueue` ticket that decides when its lock can be withdrawn. */
export type ExitTicket = { queuedAt: number; minCooldown: number };

/**
 * Unix seconds from which `withdraw` succeeds. This is the rule of `canExit`: the time since
 * `queuedAt` must reach the ticket's `minCooldown`. A later change to the queue's cooldown does not
 * move this time, because each ticket keeps its own copy.
 */
export function ticketExitDate(ticket: ExitTicket): number {
  return ticket.queuedAt + ticket.minCooldown;
}
