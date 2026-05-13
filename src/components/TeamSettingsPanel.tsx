import { ImagePlus, Save, Shield, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

export type UpdatedTeamIdentity = {
  teamId: string;
  name: string;
  avatarUrl: string | null;
};

type TeamSettingsPanelProps = {
  teamId: string;
  teamName: string;
  teamAvatarUrl: string | null;
  onUpdated: (team: UpdatedTeamIdentity) => void | Promise<void>;
};

export default function TeamSettingsPanel({
  teamId,
  teamName,
  teamAvatarUrl,
  onUpdated
}: TeamSettingsPanelProps) {
  const [nameDraft, setNameDraft] = useState(teamName);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(teamAvatarUrl);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const initials = useMemo(() => {
    const clean = nameDraft.trim();

    if (!clean) return "VC";

    const words = clean.split(/\s+/).filter(Boolean);

    if (words.length === 1) {
      return words[0].slice(0, 2).toUpperCase();
    }

    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }, [nameDraft]);

  useEffect(() => {
    setNameDraft(teamName);
    setAvatarPreview(teamAvatarUrl);
  }, [teamName, teamAvatarUrl]);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    setErrorMessage("");
    setStatusMessage("");

    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setErrorMessage("Use a JPG, PNG, or WEBP image.");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setErrorMessage("Team picture must be under 2MB.");
      return;
    }

    setSelectedFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  async function uploadTeamIconIfNeeded(): Promise<string | undefined> {
    if (!selectedFile) return undefined;

    const extension = selectedFile.name.split(".").pop()?.toLowerCase() || "png";
    const path = `${teamId}/${Date.now()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from("team-icons")
      .upload(path, selectedFile, {
        cacheControl: "3600",
        upsert: true
      });

    if (uploadError) {
      throw uploadError;
    }

    const { data } = supabase.storage.from("team-icons").getPublicUrl(path);

    return data.publicUrl;
  }

  async function saveTeamIdentity(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const cleanName = nameDraft.trim();

    if (cleanName.length < 2) {
      setErrorMessage("Team name must have at least 2 characters.");
      return;
    }

    setSaving(true);
    setErrorMessage("");
    setStatusMessage("");

    try {
      const uploadedAvatarUrl = await uploadTeamIconIfNeeded();

      const nextAvatarUrl =
        uploadedAvatarUrl !== undefined ? uploadedAvatarUrl : teamAvatarUrl;

      const updates: {
        name: string;
        avatar_url?: string | null;
      } = {
        name: cleanName
      };

      if (uploadedAvatarUrl !== undefined) {
        updates.avatar_url = uploadedAvatarUrl;
      }

      const { error } = await supabase
        .from("teams")
        .update(updates)
        .eq("id", teamId);

      if (error) {
        throw error;
      }

      setSelectedFile(null);
      setAvatarPreview(nextAvatarUrl ?? null);
      setStatusMessage("Team identity updated.");

      await onUpdated({
        teamId,
        name: cleanName,
        avatarUrl: nextAvatarUrl ?? null
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not save team identity.";
      setErrorMessage(message);
    } finally {
      setSaving(false);
    }
  }

  async function removeTeamIcon() {
    setSaving(true);
    setErrorMessage("");
    setStatusMessage("");

    const { error } = await supabase
      .from("teams")
      .update({
        avatar_url: null
      })
      .eq("id", teamId);

    setSaving(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setSelectedFile(null);
    setAvatarPreview(null);
    setStatusMessage("Team picture removed.");

    await onUpdated({
      teamId,
      name: nameDraft.trim(),
      avatarUrl: null
    });
  }

  return (
    <div className="team-settings-card settings-inner-card">
      <div className="team-settings-header">
        <div>
          <h3>Team Identity</h3>
          <p>Change the private team name and picture.</p>
        </div>

        <Shield size={20} />
      </div>

      <form className="team-settings-form" onSubmit={saveTeamIdentity}>
        <div className="team-preview-row">
          <div className="team-preview-avatar">
            {avatarPreview ? (
              <img src={avatarPreview} alt={nameDraft} />
            ) : (
              <span>{initials}</span>
            )}
          </div>

          <div className="team-preview-actions">
            <label className="team-upload-button">
              <ImagePlus size={15} />
              <span>Change team picture</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleFileChange}
              />
            </label>

            {(avatarPreview || selectedFile) && (
              <button
                type="button"
                className="team-remove-button"
                onClick={removeTeamIcon}
                disabled={saving}
              >
                <Trash2 size={14} />
                Remove
              </button>
            )}
          </div>
        </div>

        <label>
          <span>Team name</span>
          <input
            value={nameDraft}
            onChange={(event) => setNameDraft(event.target.value)}
            placeholder="VoiceClub Team"
          />
        </label>

        {statusMessage && <div className="team-settings-status">{statusMessage}</div>}
        {errorMessage && <div className="team-settings-error">{errorMessage}</div>}

        <button className="team-settings-save" type="submit" disabled={saving}>
          <Save size={15} />
          {saving ? "Saving..." : "Save Team Identity"}
        </button>
      </form>
    </div>
  );
}