/** Inline feedback is linked to its field through aria-describedby. */
export function FieldError({ id, message, role }: { id: string; message?: string; role?: "alert" | "status" }) {
  return message ? <p id={id} className="ui-field-error" role={role}>{message}</p> : null;
}
