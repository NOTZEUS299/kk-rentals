import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/session";

/** Header dropdown to switch firms. Hidden when the tenant has one firm. */
export function FirmSwitcher() {
  const { firms, firm, userId, refresh } = useSession();
  const [pending, setPending] = useState(false);

  if (firms.length < 2 || !userId) return null;

  const onChange = async (firmId: string) => {
    if (!firms.some((f) => f.id === firmId)) return;
    setPending(true);
    await supabase
      .from("profiles")
      .update({ current_firm_id: firmId })
      .eq("id", userId);
    await refresh();
    setPending(false);
  };

  return (
    <select
      value={firm?.id ?? ""}
      disabled={pending}
      onChange={(e) => void onChange(e.target.value)}
      className="min-h-9 max-w-32 truncate rounded-app border border-border bg-card px-2 text-sm"
      aria-label="Firm"
    >
      {firms.map((f) => (
        <option key={f.id} value={f.id}>
          {f.name}
        </option>
      ))}
    </select>
  );
}
