import { ImagePlus, Palette, Save, Trash2, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { applyAccentColor, isValidHexColor } from "../lib/accent";
import { supabase } from "../lib/supabase";
import ImageCropModal from "./ImageCropModal";

export type UpdatedUserProfile = {
  userId: string;
  username: string;
  avatarUrl: string | null;
  accentColor: string;
};

type UserSettingsPanelProps = {
  userId: string;
  username: string;
  avatarUrl: string | null;
  accentColor: string;
  onUpdated: (profile: UpdatedUserProfile) => void | Promise<void>;
};

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

const presetColors = [
  "#ff6a00",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#22c55e",
  "#06b6d4",
  "#ef4444",
  "#eab308"
];

export default function UserSettingsPanel({
  userId,
  username,
  avatarUrl,
  accentColor,
  onUpdated
}: UserSettingsPanelProps) {
  const [nameDraft, setNameDraft] = useState(username);
  const [colorDraft, setColorDraft] = useState(accentColor || "#ff6a00");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(avatarUrl);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [cropSource, setCropSource] = useState<string | null>(null);
  const [cropFileName, setCropFileName] = useState("profile-picture.webp");

  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const initials = useMemo(() => {
    return nameDraft.trim().slice(0, 1).toUpperCase() || "U";
  }, [nameDraft]);

  useEffect(() => {
    setNameDraft(username);
    setColorDraft(accentColor || "#ff6a00");
    setAvatarPreview(avatarUrl);
    applyAccentColor(accentColor || "#ff6a00");
  }, [username, avatarUrl, accentColor]);

  useEffect(() => {
    return () => {
      if (cropSource) {
        URL.revokeObjectURL(cropSource);
      }
    };
  }, [cropSource]);

  function handleColorChange(value: string) {
    setColorDraft(value);

    if (isValidHexColor(value)) {
      applyAccentColor(value);
    }
  }

  function closeCropModal() {
    if (cropSource) {
      URL.revokeObjectURL(cropSource);
    }

    setCropSource(null);
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    event.target.value = "";
    setErrorMessage("");
    setStatusMessage("");

    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setErrorMessage("Use a JPG, PNG, or WEBP image.");
      return;
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      setErrorMessage("Profile picture must be under 5MB.");
      return;
    }

    closeCropModal();
    setCropFileName(file.name);
    setCropSource(URL.createObjectURL(file));
  }

  async function handleCropApplied(file: File) {
    setSelectedFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    closeCropModal();
  }

  async function uploadAvatarIfNeeded(): Promise<string | undefined> {
    if (!selectedFile) return undefined;

    const extension = selectedFile.name.split(".").pop()?.toLowerCase() || "webp";
    const path = `${userId}/${Date.now()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from("profile-avatars")
      .upload(path, selectedFile, {
        cacheControl: "3600",
        upsert: true
      });

    if (uploadError) {
      throw uploadError;
    }

    const { data } = supabase.storage.from("profile-avatars").getPublicUrl(path);

    return data.publicUrl;
  }

  async function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const cleanName = nameDraft.trim();
    const cleanColor = colorDraft.trim();

    if (cleanName.length < 2) {
      setErrorMessage("Display name must have at least 2 characters.");
      return;
    }

    if (!isValidHexColor(cleanColor)) {
      setErrorMessage("Accent color must be a valid HEX color like #ff6a00.");
      return;
    }

    setSaving(true);
    setErrorMessage("");
    setStatusMessage("");

    try {
      const uploadedAvatarUrl = await uploadAvatarIfNeeded();

      const nextAvatarUrl =
        uploadedAvatarUrl !== undefined ? uploadedAvatarUrl : avatarUrl;

      const updates: {
        username: string;
        accent_color: string;
        avatar_url?: string | null;
      } = {
        username: cleanName,
        accent_color: cleanColor
      };

      if (uploadedAvatarUrl !== undefined) {
        updates.avatar_url = uploadedAvatarUrl;
      }

      const { error } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", userId);

      if (error) {
        throw error;
      }

      applyAccentColor(cleanColor);
      setSelectedFile(null);
      setAvatarPreview(nextAvatarUrl ?? null);
      setStatusMessage("Profile updated.");

      await onUpdated({
        userId,
        username: cleanName,
        avatarUrl: nextAvatarUrl ?? null,
        accentColor: cleanColor
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not save profile.";
      setErrorMessage(message);
    } finally {
      setSaving(false);
    }
  }

  async function removeAvatar() {
    setSaving(true);
    setErrorMessage("");
    setStatusMessage("");

    const { error } = await supabase
      .from("profiles")
      .update({
        avatar_url: null
      })
      .eq("id", userId);

    setSaving(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setSelectedFile(null);
    setAvatarPreview(null);
    setStatusMessage("Profile picture removed.");

    await onUpdated({
      userId,
      username: nameDraft.trim(),
      avatarUrl: null,
      accentColor: colorDraft
    });
  }

  return (
    <div className="user-settings-card settings-inner-card">
      <div className="user-settings-header">
        <div>
          <h3>Profile & Appearance</h3>
          <p>Change your display name, avatar, and accent color.</p>
        </div>

        <UserRound size={20} />
      </div>

      <form className="user-settings-form" onSubmit={saveSettings}>
        <div className="profile-preview-row">
          <div className="profile-preview-avatar">
            {avatarPreview ? (
              <img src={avatarPreview} alt={nameDraft} />
            ) : (
              <span>{initials}</span>
            )}
          </div>

          <div className="profile-preview-actions">
            <label className="profile-upload-button">
              <ImagePlus size={15} />
              <span>Change picture</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleFileChange}
              />
            </label>

            {(avatarPreview || selectedFile) && (
              <button
                type="button"
                className="profile-remove-button"
                onClick={removeAvatar}
                disabled={saving}
              >
                <Trash2 size={14} />
                Remove
              </button>
            )}
          </div>
        </div>

        <label>
          <span>Display name</span>
          <input
            value={nameDraft}
            onChange={(event) => setNameDraft(event.target.value)}
            placeholder="dragsteR"
          />
        </label>

        <div className="accent-picker-block">
          <div className="accent-picker-title">
            <Palette size={15} />
            <span>Accent color</span>
          </div>

          <div className="accent-presets">
            {presetColors.map((color) => (
              <button
                key={color}
                type="button"
                className={colorDraft.toLowerCase() === color ? "selected" : ""}
                style={{ background: color }}
                onClick={() => handleColorChange(color)}
                title={color}
              />
            ))}
          </div>

          <input
            value={colorDraft}
            onChange={(event) => handleColorChange(event.target.value)}
            placeholder="#ff6a00"
          />
        </div>

        {statusMessage && <div className="user-settings-status">{statusMessage}</div>}
        {errorMessage && <div className="user-settings-error">{errorMessage}</div>}

        <button className="user-settings-save" type="submit" disabled={saving}>
          <Save size={15} />
          {saving ? "Saving..." : "Save Profile"}
        </button>
      </form>

      {cropSource && (
        <ImageCropModal
          imageUrl={cropSource}
          fileName={cropFileName}
          title="Edit profile picture"
          onCancel={closeCropModal}
          onApply={handleCropApplied}
        />
      )}
    </div>
  );
}
