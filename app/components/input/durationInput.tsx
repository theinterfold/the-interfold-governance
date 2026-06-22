import { InputNumber } from "@aragon/ods";

const DAY = 86400;
const HOUR = 3600;
const MINUTE = 60;

/** Voting-duration field split into Days + Hours + Minutes, bound to a single seconds value. */
export function DurationInput({
  durationSeconds,
  setDurationSeconds,
  minSeconds = 0,
  disabled,
}: {
  durationSeconds: number;
  setDurationSeconds: (seconds: number) => void;
  minSeconds?: number;
  disabled?: boolean;
}) {
  const days = Math.floor(durationSeconds / DAY);
  const hours = Math.floor((durationSeconds % DAY) / HOUR);
  const minutes = Math.floor((durationSeconds % HOUR) / MINUTE);

  const set = (nextDays: number, nextHours: number, nextMinutes: number) => {
    setDurationSeconds(Math.max(0, nextDays) * DAY + Math.max(0, nextHours) * HOUR + Math.max(0, nextMinutes) * MINUTE);
  };

  const minHelp =
    minSeconds > 0
      ? ` Minimum ${Math.floor(minSeconds / DAY)}d ${Math.floor((minSeconds % DAY) / HOUR)}h ${Math.floor((minSeconds % HOUR) / MINUTE)}m.`
      : "";

  return (
    <div className="flex flex-col gap-y-2">
      <p className="field-section-label">Voting duration</p>
      <div className="flex gap-x-4">
        <InputNumber
          label="Days"
          min={0}
          step={1}
          value={days}
          disabled={disabled}
          onChange={(v) => {
            const n = Number.parseInt(v, 10);
            set(Number.isNaN(n) ? 0 : n, hours, minutes);
          }}
        />
        <InputNumber
          label="Hours"
          min={0}
          step={1}
          value={hours}
          disabled={disabled}
          onChange={(v) => {
            const n = Number.parseInt(v, 10);
            set(days, Number.isNaN(n) ? 0 : n, minutes);
          }}
        />
        <InputNumber
          label="Minutes"
          min={0}
          step={1}
          value={minutes}
          disabled={disabled}
          onChange={(v) => {
            const n = Number.parseInt(v, 10);
            set(days, hours, Number.isNaN(n) ? 0 : n);
          }}
        />
      </div>
      <p className="text-sm font-normal leading-normal text-neutral-500">
        Voting opens immediately and stays open this long.{minHelp}
      </p>
    </div>
  );
}
