import { useState } from "react";
import Modal from "./Modal";

const VERBS = { edit: "Edit", delete: "Delete", move: "Move", resize: "Resize" };

const OPTIONS = [
  { value: "this", label: "This event" },
  { value: "following", label: "This and following events" },
  { value: "all", label: "All events" },
];

export default function RecurrenceScopeDialog({ action, onConfirm, onCancel }) {
  const [scope, setScope] = useState("this");
  const verb = VERBS[action] || "Edit";

  return (
    <Modal title={`${verb} recurring event`} onClose={onCancel} size="sm">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onConfirm(scope);
        }}
        className="space-y-4"
      >
        <fieldset className="space-y-2">
          <legend className="sr-only">Which events should be changed?</legend>
          {OPTIONS.map((o, i) => (
            <label key={o.value} className="flex items-center gap-2 text-sm text-slate-800">
              <input
                type="radio"
                name="scope"
                value={o.value}
                checked={scope === o.value}
                onChange={() => setScope(o.value)}
                data-autofocus={i === 0 ? true : undefined}
              />
              {o.label}
            </label>
          ))}
        </fieldset>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            OK
          </button>
        </div>
      </form>
    </Modal>
  );
}