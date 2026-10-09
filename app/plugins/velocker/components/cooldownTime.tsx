import { useEffect, useState } from "react";

export function CooldownTime({ endsAt, observedAt }: { endsAt: number; observedAt: number }) {
  const [now, setNow] = useState(observedAt);
  useEffect(() => {
    const tick = () => setNow(Math.floor(Date.now() / 1000));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [endsAt]);
  const remaining = Math.max(0, endsAt - now);
  const unit =
    remaining >= 86400
      ? { seconds: 86400, label: "day" }
      : remaining >= 3600
        ? { seconds: 3600, label: "hour" }
        : remaining >= 60
          ? { seconds: 60, label: "minute" }
          : { seconds: 1, label: "second" };
  const count = Math.ceil(remaining / unit.seconds);
  const relative = remaining ? `${count} ${unit.label}${count === 1 ? "" : "s"}` : "Ended";
  const end = new Date(endsAt * 1000);
  return (
    <span className="power-cooldown-time">
      <span aria-hidden="true">·</span>
      <time dateTime={end.toISOString()}>{relative}</time>
    </span>
  );
}
