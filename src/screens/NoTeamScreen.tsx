import { useState } from "react";
import { supabase } from "../lib/supabase";

type NoTeamScreenProps = {
  onDone: () => void;
};

export default function NoTeamScreen({ onDone }: NoTeamScreenProps) {
  const [inviteCode, setInviteCode] = useState("");
  const [teamName, setTeamName] = useState("VoiceClub Team");
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [loadingInvite, setLoadingInvite] = useState(false);
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  async function redeemInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const cleanCode = inviteCode.trim();

    if (cleanCode.length < 4) {
      setErrorMessage("Enter a valid invite code.");
      return;
    }

    setLoadingInvite(true);
    setErrorMessage("");
    setStatusMessage("");

    const { error } = await supabase.rpc("redeem_team_invite", {
      input_code: cleanCode
    });

    setLoadingInvite(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setStatusMessage("Invite accepted. Loading team...");
    onDone();
  }

  async function createTeam(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const cleanTeamName = teamName.trim();

    if (cleanTeamName.length < 2) {
      setErrorMessage("Team name must have at least 2 characters.");
      return;
    }

    setLoadingTeam(true);
    setErrorMessage("");
    setStatusMessage("");

    const { error } = await supabase.rpc("create_team_with_defaults", {
      team_name: cleanTeamName
    });

    setLoadingTeam(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setStatusMessage("Team created. Loading workspace...");
    onDone();
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="brand-logo large">VC</div>

          <div>
            <h1>Join VoiceClub</h1>
            <p>Use a private invite code from your team.</p>
          </div>
        </div>

        <form className="auth-form" onSubmit={redeemInvite}>
          <label>
            <span>Invite code</span>
            <input
              value={inviteCode}
              onChange={(event) => setInviteCode(event.target.value)}
              placeholder="VC-XXXXXXXXXX"
              autoFocus
            />
          </label>

          {errorMessage && <div className="auth-error">{errorMessage}</div>}
          {statusMessage && <div className="auth-success">{statusMessage}</div>}

          <button className="auth-submit" type="submit" disabled={loadingInvite}>
            {loadingInvite ? "Joining..." : "Join team"}
          </button>
        </form>

        <div className="auth-divider">
          <span />
          <strong>Owner setup</strong>
          <span />
        </div>

        {!showCreateTeam && (
          <button
            className="auth-secondary-button"
            type="button"
            onClick={() => setShowCreateTeam(true)}
          >
            Create a new private team
          </button>
        )}

        {showCreateTeam && (
          <form className="auth-form auth-form-spaced" onSubmit={createTeam}>
            <label>
              <span>Team name</span>
              <input
                value={teamName}
                onChange={(event) => setTeamName(event.target.value)}
                placeholder="VoiceClub Team"
              />
            </label>

            <button className="auth-submit" type="submit" disabled={loadingTeam}>
              {loadingTeam ? "Creating..." : "Create team"}
            </button>
          </form>
        )}

        <button className="auth-ghost-button" type="button" onClick={signOut}>
          Sign out
        </button>
      </div>
    </div>
  );
}