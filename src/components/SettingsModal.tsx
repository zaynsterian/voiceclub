import {
  Headphones,
  LogOut,
  Settings,
  ShieldCheck,
  UserRound,
  Users,
  X,
  Zap
} from "lucide-react";
import { useState } from "react";
import AudioSettingsPanel from "./AudioSettingsPanel";
import TeamSettingsPanel, {
  type UpdatedTeamIdentity
} from "./TeamSettingsPanel";
import UserSettingsPanel, { type UpdatedUserProfile } from "./UserSettingsPanel";

type SettingsTab = "profile" | "team" | "audio" | "performance" | "account";

type SettingsModalProps = {
  userId: string;
  username: string;
  avatarUrl: string | null;
  accentColor: string;
  performanceMode: boolean;

  muted: boolean;
  deafened: boolean;

  teamId: string;
  teamName: string;
  teamAvatarUrl: string | null;
  canManageTeamIdentity: boolean;

  onClose: () => void;
  onProfileUpdated: (profile: UpdatedUserProfile) => void | Promise<void>;
  onTeamUpdated: (team: UpdatedTeamIdentity) => void | Promise<void>;
  onPerformanceModeChange: (enabled: boolean) => void;
  onMutedChange: (value: boolean) => void;
  onDeafenedChange: (value: boolean) => void;
  onSignOut: () => Promise<void>;
};

export default function SettingsModal({
  userId,
  username,
  avatarUrl,
  accentColor,
  performanceMode,
  muted,
  deafened,
  teamId,
  teamName,
  teamAvatarUrl,
  canManageTeamIdentity,
  onClose,
  onProfileUpdated,
  onTeamUpdated,
  onPerformanceModeChange,
  onMutedChange,
  onDeafenedChange,
  onSignOut
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="settings-modal-card"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="settings-modal-header">
          <div>
            <h2>Settings</h2>
            <p>Manage VoiceClub without leaving voice.</p>
          </div>

          <button type="button" onClick={onClose} title="Close settings">
            <X size={18} />
          </button>
        </div>

        <div className="settings-modal-body">
          <aside className="settings-tabs">
            <button
              type="button"
              className={activeTab === "profile" ? "active" : ""}
              onClick={() => setActiveTab("profile")}
            >
              <UserRound size={16} />
              Profile
            </button>

            {canManageTeamIdentity && (
              <button
                type="button"
                className={activeTab === "team" ? "active" : ""}
                onClick={() => setActiveTab("team")}
              >
                <Users size={16} />
                Team
              </button>
            )}

            <button
              type="button"
              className={activeTab === "audio" ? "active" : ""}
              onClick={() => setActiveTab("audio")}
            >
              <Headphones size={16} />
              Audio
            </button>

            <button
              type="button"
              className={activeTab === "performance" ? "active" : ""}
              onClick={() => setActiveTab("performance")}
            >
              <Zap size={16} />
              Performance
            </button>

            <button
              type="button"
              className={activeTab === "account" ? "active" : ""}
              onClick={() => setActiveTab("account")}
            >
              <ShieldCheck size={16} />
              Account
            </button>
          </aside>

          <section className="settings-content">
            {activeTab === "profile" && (
              <UserSettingsPanel
                userId={userId}
                username={username}
                avatarUrl={avatarUrl}
                accentColor={accentColor}
                onUpdated={onProfileUpdated}
              />
            )}

            {activeTab === "team" && canManageTeamIdentity && (
              <TeamSettingsPanel
                teamId={teamId}
                teamName={teamName}
                teamAvatarUrl={teamAvatarUrl}
                onUpdated={onTeamUpdated}
              />
            )}

            {activeTab === "audio" && (
              <AudioSettingsPanel
                muted={muted}
                deafened={deafened}
                onMutedChange={onMutedChange}
                onDeafenedChange={onDeafenedChange}
              />
            )}

            {activeTab === "performance" && (
              <div className="settings-placeholder-card">
                <div className="settings-placeholder-icon">
                  <Zap size={22} />
                </div>

                <h3>Performance Mode</h3>
                <p>
                  Performance Mode keeps VoiceClub lightweight while gaming.
                  Later this will reduce animations and UI refresh frequency.
                </p>

                <label className="settings-toggle-card">
                  <div>
                    <strong>Performance Mode</strong>
                    <span>Prioritize low resource usage while playing.</span>
                  </div>

                  <input
                    type="checkbox"
                    checked={performanceMode}
                    onChange={(event) =>
                      onPerformanceModeChange(event.target.checked)
                    }
                  />
                </label>
              </div>
            )}

            {activeTab === "account" && (
              <div className="settings-placeholder-card">
                <div className="settings-placeholder-icon">
                  <Settings size={22} />
                </div>

                <h3>Account</h3>
                <p>Sign out of this VoiceClub session.</p>

                <button
                  type="button"
                  className="settings-danger-button"
                  onClick={onSignOut}
                >
                  <LogOut size={16} />
                  Sign Out
                </button>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}