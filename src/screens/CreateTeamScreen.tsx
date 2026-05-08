import { useState } from "react";
import { supabase } from "../lib/supabase";

type CreateTeamScreenProps = {
  onCreated: () => void;
};

export default function CreateTeamScreen({ onCreated }: CreateTeamScreenProps) {
  const [teamName, setTeamName] = useState("VoiceClub Team");
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function createTeam(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const cleanTeamName = teamName.trim();

    if (cleanTeamName.length < 2) {
      setErrorMessage("Team name must have at least 2 characters.");
      return;
    }

    setLoading(true);
    setErrorMessage("");

    const { error } = await supabase.rpc("create_team_with_defaults", {
      team_name: cleanTeamName
    });

    setLoading(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    onCreated();
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="brand-logo large">VC</div>
          <div>
            <h1>Create your team</h1>
            <p>This creates your private VoiceClub server.</p>
          </div>
        </div>

        <form className="auth-form" onSubmit={createTeam}>
          <label>
            <span>Team name</span>
            <input
              value={teamName}
              onChange={(event) => setTeamName(event.target.value)}
              placeholder="VoiceClub Team"
            />
          </label>

          {errorMessage && <div className="auth-error">{errorMessage}</div>}

          <button className="auth-submit" type="submit" disabled={loading}>
            {loading ? "Creating..." : "Create team"}
          </button>
        </form>

        <p className="auth-note">
          Default voice and text channels will be created automatically.
        </p>
      </div>
    </div>
  );
}
