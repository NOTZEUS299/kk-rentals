import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/session";

/**
 * TESTING AID — two-tap confirm to wipe the tenant's data via the
 * reset_tenant_data RPC. Only rendered in dev builds (import.meta.env.DEV).
 */
export function ResetDataButton() {
  const { refresh } = useSession();
  const [armed, setArmed] = useState(false);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  const run = async () => {
    setPending(true);
    const { error } = await supabase.rpc("reset_tenant_data");
    setPending(false);
    setArmed(false);
    if (!error) {
      setDone(true);
      await refresh();
      setTimeout(() => setDone(false), 2000);
    }
  };

  return (
    <div className="flex items-center justify-between rounded-app border border-dashed border-red-300 px-3 py-2">
      <span className="text-xs text-muted">
        Testing: wipe all data for this account
      </span>
      {armed ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setArmed(false)}
            className="min-h-8 rounded-app border border-border px-2 text-xs"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void run()}
            disabled={pending}
            className="min-h-8 rounded-app bg-red-600 px-2 text-xs font-medium text-white disabled:opacity-50"
          >
            {pending ? "Resetting…" : "Confirm reset"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setArmed(true)}
          className="min-h-8 rounded-app border border-red-400 px-2 text-xs font-medium text-red-600"
        >
          {done ? "Done ✓" : "Reset data"}
        </button>
      )}
    </div>
  );
}
