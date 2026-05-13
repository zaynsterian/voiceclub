import { Crown, Shield, Trash2, UserCog, UserMinus, UserPlus } from "lucide-react";
import { useState } from "react";
import { supabase } from "../lib/supabase";

type Member = {
  userId: string;
  username: string;
  avatarUrl: string | null;
  accentColor: string;
  role: string;
  status: string;
  online: boolean;
  speaking: boolean;
};

type MemberManagementPanelProps = {
  teamId: string;
  members: Member[];
  currentUserId: string;
  currentUserRole: string;
  onRoleChanged: (userId: string, nextRole: "Admin" | "Member") => void;
  onMemberRemoved: (userId: string) => void;
};

function getInitials(name: string): string {
  return name.slice(0, 1).toUpperCase();
}

function canCurrentUserManageTarget(
  currentUserId: string,
  currentUserRole: string,
  target: Member
): boolean {
  if (target.userId === currentUserId) return false;
  if (target.role === "Owner") return false;

  if (currentUserRole === "Owner") return true;

  if (currentUserRole === "Admin" && target.role === "Member") return true;

  return false;
}

export default function MemberManagementPanel({
  teamId,
  members,
  currentUserId,
  currentUserRole,
  onRoleChanged,
  onMemberRemoved
}: MemberManagementPanelProps) {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const canChangeRoles = currentUserRole === "Owner";
  const canRemoveMembers =
    currentUserRole === "Owner" || currentUserRole === "Admin";

  async function changeRole(member: Member, nextRole: "admin" | "member") {
    setLoadingAction(`${member.userId}:role`);
    setErrorMessage("");
    setStatusMessage("");

    const { error } = await supabase.rpc("set_team_member_role", {
      input_team_id: teamId,
      input_user_id: member.userId,
      input_role: nextRole
    });

    setLoadingAction(null);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    const displayRole = nextRole === "admin" ? "Admin" : "Member";

    onRoleChanged(member.userId, displayRole);

    setStatusMessage(
      nextRole === "admin"
        ? `${member.username} is now an admin.`
        : `${member.username} is now a member.`
    );
  }

  async function removeMember(member: Member) {
    const confirmed = window.confirm(
      `Remove ${member.username} from this VoiceClub team?`
    );

    if (!confirmed) return;

    setLoadingAction(`${member.userId}:remove`);
    setErrorMessage("");
    setStatusMessage("");

    const { error } = await supabase.rpc("remove_team_member", {
      input_team_id: teamId,
      input_user_id: member.userId
    });

    setLoadingAction(null);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    onMemberRemoved(member.userId);

    setStatusMessage(`${member.username} was removed from the team.`);
  }

  if (!canRemoveMembers && !canChangeRoles) {
    return null;
  }

  return (
    <div className="member-management-card">
      <div className="member-management-header">
        <div>
          <h3>Member Management</h3>
          <p>Manage roles and access.</p>
        </div>

        <UserCog size={20} />
      </div>

      {statusMessage && <div className="member-management-status">{statusMessage}</div>}
      {errorMessage && <div className="member-management-error">{errorMessage}</div>}

      <div className="member-management-list">
        {members.map((member) => {
          const isCurrentUser = member.userId === currentUserId;
          const canManage = canCurrentUserManageTarget(
            currentUserId,
            currentUserRole,
            member
          );

          return (
            <div key={member.userId} className="member-management-row">
              <div className="member-management-avatar">
                {getInitials(member.username)}
              </div>

              <div className="member-management-info">
                <strong>{member.username}</strong>
                <span>
                  {member.role}
                  {isCurrentUser ? " · You" : ""}
                </span>
              </div>

              <div className="member-management-actions">
                {member.role === "Owner" && (
                  <span className="member-role-icon" title="Owner">
                    <Crown size={15} />
                  </span>
                )}

                {member.role === "Admin" && (
                  <span className="member-role-icon" title="Admin">
                    <Shield size={15} />
                  </span>
                )}

                {canChangeRoles && canManage && member.role === "Member" && (
                  <button
                    type="button"
                    title="Promote to admin"
                    disabled={loadingAction === `${member.userId}:role`}
                    onClick={() => changeRole(member, "admin")}
                  >
                    <UserPlus size={14} />
                  </button>
                )}

                {canChangeRoles && canManage && member.role === "Admin" && (
                  <button
                    type="button"
                    title="Demote to member"
                    disabled={loadingAction === `${member.userId}:role`}
                    onClick={() => changeRole(member, "member")}
                  >
                    <UserMinus size={14} />
                  </button>
                )}

                {canRemoveMembers && canManage && (
                  <button
                    type="button"
                    title="Remove member"
                    disabled={loadingAction === `${member.userId}:remove`}
                    onClick={() => removeMember(member)}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}