/** Inline feedback is linked to its field through aria-describedby. */
export function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? <p id={id} className="ui-field-error">{message}</p> : null;
}
