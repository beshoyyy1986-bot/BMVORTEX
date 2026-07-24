import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// ── Footer mascot ─────────────────────────────────────────────────────────────
// A fixed, floating mascot pinned to any corner of every page. Its visibility,
// size, and position are controlled site-wide from the admin panel via the
// single-row `site_settings` table (public-read), and update live for every
// visitor through a realtime subscription.
const MASCOT_SRC = "/mascot.png";

export default function Mascot() {
  const [enabled, setEnabled]       = useState(true); // visible by default until the server says otherwise
  const [size, setSize]             = useState(120);
  const [bottom, setBottom]         = useState(50);    // px from bottom
  const [right, setRight]           = useState(12);    // px from right
  const [ready, setReady]           = useState(false);

  useEffect(() => {
    let alive = true;

    const apply = (row) => {
      if (!row || !alive) return;
      if (typeof row.mascot_enabled === "boolean") setEnabled(row.mascot_enabled);
      if (Number.isFinite(Number(row.mascot_size)))   setSize(Number(row.mascot_size));
      if (Number.isFinite(Number(row.mascot_bottom))) setBottom(Number(row.mascot_bottom));
      if (Number.isFinite(Number(row.mascot_right)))  setRight(Number(row.mascot_right));
      setReady(true);
    };

    // Initial fetch (public read — works signed-out too).
    supabase
      .from("site_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle()
      .then(({ data }) => apply(data))
      .catch(() => { if (alive) setReady(true); });

    // Live updates for every connected visitor.
    const channel = supabase
      .channel("public:site_settings")
      .on("postgres_changes",
        { event: "*", schema: "public", table: "site_settings", filter: "id=eq.1" },
        (payload) => apply(payload.new))
      .subscribe();

    return () => { alive = false; supabase.removeChannel(channel); };
  }, []);

  if (!ready || !enabled) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed z-40 select-none"
      style={{ width: size, maxWidth: "40vw", bottom: bottom, right: right }}
    >
      <img
        src={MASCOT_SRC}
        alt=""
        draggable="false"
        className="vortex-mascot-float h-auto w-full object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
      />
    </div>
  );
}
