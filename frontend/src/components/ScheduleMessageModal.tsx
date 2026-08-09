import { useEffect, useState } from "react";
import "../styles/chat.css";

type Props = {
  isOpen: boolean;
  submitting?: boolean;
  onCancel: () => void;
  onConfirm: (scheduledAt: Date) => void;
};

function getMinDateTimeLocal(): string {
  // At least 1 minute in the future, formatted for <input type="datetime-local">
  const now = new Date(Date.now() + 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");

  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
    now.getDate()
  )}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

export default function ScheduleMessageModal({
  isOpen,
  submitting = false,
  onCancel,
  onConfirm,
}: Props) {
  const [value, setValue] = useState(getMinDateTimeLocal());
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOpen) {
      setValue(getMinDateTimeLocal());
      setError("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (!value) {
      setError("Please choose a date and time.");
      return;
    }

    const chosenDate = new Date(value);

    if (Number.isNaN(chosenDate.getTime())) {
      setError("That date/time isn't valid.");
      return;
    }

    if (chosenDate.getTime() <= Date.now()) {
      setError("Scheduled time must be in the future.");
      return;
    }

    setError("");
    onConfirm(chosenDate);
  };

  return (
    <div className="schedule-modal-overlay" onClick={onCancel}>
      <div
        className="schedule-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <h3>Schedule message</h3>
        <p>Pick a future date and time — it'll be sent automatically.</p>

        <input
          type="datetime-local"
          value={value}
          min={getMinDateTimeLocal()}
          onChange={(event) => setValue(event.target.value)}
          disabled={submitting}
        />

        {error && <div className="schedule-modal-error">{error}</div>}

        <div className="schedule-modal-actions">
          <button type="button" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
          <button type="button" onClick={handleConfirm} disabled={submitting}>
            {submitting ? "Scheduling..." : "Schedule"}
          </button>
        </div>
      </div>
    </div>
  );
}