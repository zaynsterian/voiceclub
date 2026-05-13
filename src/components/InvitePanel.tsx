import { Copy, RefreshCw, Ticket, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type InviteRow = {
  id: string;
  team_id: string;
  code: string;
  expires_at: string | null;
  max_uses: number | null;
  used_count: number;
  created_at: string;
};

type InvitePanelProps = {
  teamId: string;
};

function formatExpiry(value: string | null): string {
  if (!value) return "Never";

  const date = new Date(value);

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export default function InvitePanel({ teamId }: InvitePanelProps) {
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [maxUses, setMaxUses] = useState(1);
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  async function loadInvites() {
    setLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("invites")
      .select("id, team_id, code, expires_at, max_uses, used_count, created_at")
      .eq("team_id", teamId)
      .order("created_at", { ascending: false });

    setLoading(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setInvites((data ?? []) as InviteRow[]);
  }

  async function createInvite() {
    setCreating(true);
    setStatusMessage("");
    setErrorMessage("");

    const { data, error } = await supabase.rpc("create_team_invite", {
      input_team_id: teamId,
      input_max_uses: maxUses,
      input_expires_in_days: expiresInDays
    });

    setCreating(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    const code = String(data);

    setStatusMessage(`Invite created: ${code}`);

    if (navigator.clipboard) {
      await navigator.clipboard.writeText(code);
      setStatusMessage(`Invite created and copied: ${code}`);
    }

    await loadInvites();
  }

  async function copyInvite(code: string) {
    if (!navigator.clipboard) {
      setStatusMessage(code);
      return;
    }

    await navigator.clipboard.writeText(code);
    setStatusMessage(`Copied: ${code}`);
  }

  async function revokeInvite(inviteId: string) {
    const confirmed = window.confirm("Revoke this invite code?");

    if (!confirmed) return;

    setErrorMessage("");
    setStatusMessage("");

    const { error } = await supabase
      .from("invites")
      .delete()
      .eq("id", inviteId);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setStatusMessage("Invite revoked.");
    await loadInvites();
  }

  useEffect(() => {
    loadInvites();
  }, [teamId]);

  return (
    <div className="invite-card">
      <div className="invite-header">
        <div>
          <h3>Private Invites</h3>
          <p>Create access codes for teammates.</p>
        </div>

        <button type="button" onClick={loadInvites} disabled={loading}>
          <RefreshCw size={15} />
        </button>
      </div>

      <div className="invite-controls">
        <label>
          <span>Uses</span>
          <input
            type="number"
            min={1}
            max={50}
            value={maxUses}
            onChange={(event) => setMaxUses(Number(event.target.value))}
          />
        </label>

        <label>
          <span>Days</span>
          <input
            type="number"
            min={0}
            max={365}
            value={expiresInDays}
            onChange={(event) => setExpiresInDays(Number(event.target.value))}
          />
        </label>
      </div>

      <button
        type="button"
        className="invite-create-button"
        onClick={createInvite}
        disabled={creating}
      >
        <Ticket size={15} />
        {creating ? "Creating..." : "Create Invite"}
      </button>

      {statusMessage && <div className="invite-status">{statusMessage}</div>}
      {errorMessage && <div className="invite-error">{errorMessage}</div>}

      <div className="invite-list">
        {loading && <div className="invite-empty">Loading invites...</div>}

        {!loading && invites.length === 0 && (
          <div className="invite-empty">No invite codes yet.</div>
        )}

        {!loading &&
          invites.map((invite) => (
            <div key={invite.id} className="invite-row">
              <div className="invite-code">
                <strong>{invite.code}</strong>
                <span>
                  {invite.used_count}/{invite.max_uses ?? "∞"} uses · expires{" "}
                  {formatExpiry(invite.expires_at)}
                </span>
              </div>

              <div className="invite-actions">
                <button
                  type="button"
                  title="Copy invite"
                  onClick={() => copyInvite(invite.code)}
                >
                  <Copy size={14} />
                </button>

                <button
                  type="button"
                  title="Revoke invite"
                  onClick={() => revokeInvite(invite.id)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}