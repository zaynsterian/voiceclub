import type { RealtimeChannel, Session } from "@supabase/supabase-js";
import {
  Crown,
  Edit3,
  Headphones,
  Lock,
  MessageSquare,
  Mic,
  MicOff,
  Plus,
  Radio,
  Settings,
  Signal,
  Trash2,
  Unlock,
  Users,
  Volume2,
  Zap
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import InvitePanel from "./components/InvitePanel";
import MemberManagementPanel from "./components/MemberManagementPanel";
import SettingsModal from "./components/SettingsModal";
import VoiceRoom from "./components/VoiceRoom";
import type { UpdatedTeamIdentity } from "./components/TeamSettingsPanel";
import type { UpdatedUserProfile } from "./components/UserSettingsPanel";
import { applyAccentColor } from "./lib/accent";
import { supabase } from "./lib/supabase";

type ChannelType = "voice" | "text";

type Team = {
  id: string;
  name: string;
  avatarUrl: string | null;
};

type Channel = {
  id: string;
  team_id: string;
  name: string;
  type: ChannelType;
  locked: boolean;
  position: number;
  created_at: string;
};

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

type Message = {
  id: string;
  channel_id: string;
  user_id: string;
  username: string;
  avatarUrl: string | null;
  content: string;
  created_at: string;
};

type VoicePresenceState = {
  userId: string;
  username: string;
  avatarUrl: string | null;
  teamId: string;
  voiceChannelId: string;
  muted: boolean;
  deafened: boolean;
  speaking: boolean;
  listenOnly: boolean;
  connected: boolean;
  joinedAt: string;
  updatedAt: string;
};

type LocalVoicePresenceUpdate = {
  voiceChannelId: string;
  muted: boolean;
  deafened: boolean;
  speaking: boolean;
  listenOnly: boolean;
  connected: boolean;
};

type DashboardProps = {
  session: Session;
};

type TeamMemberRow = {
  team_id: string;
  role: string;
};

type TeamRow = {
  id: string;
  name: string;
  avatar_url: string | null;
};

type TeamMemberRealtimeRow = {
  id: string;
  team_id: string;
  user_id: string;
  role: string;
  joined_at: string;
};

type ProfileRow = {
  id: string;
  username: string;
  avatar_url: string | null;
  accent_color: string | null;
  status: string;
};

type TeamMemberWithProfileRow = {
  user_id: string;
  role: string;
  profiles: ProfileRow | ProfileRow[] | null;
};

type MessageWithProfileRow = {
  id: string;
  channel_id: string;
  user_id: string;
  content: string;
  created_at: string;
  profiles: ProfileRow | ProfileRow[] | null;
};

type ChannelModalMode = "create" | "edit";

type ChannelModalState = {
  mode: ChannelModalMode;
  channelType: ChannelType;
  channel?: Channel;
} | null;

const PERFORMANCE_MODE_STORAGE_KEY = "voiceclub_performance_mode_v1";

function loadPerformanceModePreference(): boolean {
  try {
    const savedValue = localStorage.getItem(PERFORMANCE_MODE_STORAGE_KEY);

    if (savedValue === "standard") return false;
    if (savedValue === "performance") return true;

    return true;
  } catch {
    return true;
  }
}

function getInitials(name: string): string {
  return name.slice(0, 1).toUpperCase();
}

function getTeamInitials(name: string): string {
  const cleanName = name.trim();

  if (!cleanName) return "VC";

  const words = cleanName.split(/\s+/).filter(Boolean);

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

function AvatarImage({
  name,
  avatarUrl,
  className
}: {
  name: string;
  avatarUrl: string | null;
  className: string;
}) {
  if (avatarUrl) {
    return (
      <div className={className}>
        <img src={avatarUrl} alt={name} />
      </div>
    );
  }

  return <div className={className}>{getInitials(name)}</div>;
}

function TeamLogo({
  name,
  avatarUrl,
  className = "brand-logo"
}: {
  name: string;
  avatarUrl: string | null;
  className?: string;
}) {
  if (avatarUrl) {
    return (
      <div className={className}>
        <img src={avatarUrl} alt={name} />
      </div>
    );
  }

  return <div className={className}>{getTeamInitials(name)}</div>;
}

function unwrapProfile(profile: ProfileRow | ProfileRow[] | null): ProfileRow | null {
  if (!profile) return null;
  if (Array.isArray(profile)) return profile[0] ?? null;
  return profile;
}

function formatTime(dateValue: string): string {
  const date = new Date(dateValue);

  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function normalizeRole(role: string): string {
  if (role === "owner") return "Owner";
  if (role === "admin") return "Admin";
  return "Member";
}

function StatusDot({
  online,
  speaking
}: {
  online: boolean;
  speaking?: boolean;
}) {
  const className = speaking
    ? "status-dot speaking"
    : online
      ? "status-dot online"
      : "status-dot offline";

  return <span className={className} />;
}

function getPresenceTimestamp(presence: VoicePresenceState): number {
  const updatedTime = Date.parse(presence.updatedAt);
  const joinedTime = Date.parse(presence.joinedAt);

  if (!Number.isNaN(updatedTime)) return updatedTime;
  if (!Number.isNaN(joinedTime)) return joinedTime;

  return 0;
}

function dedupeVoicePresences(
  presenceList: VoicePresenceState[]
): VoicePresenceState[] {
  const presenceByUserId = new Map<string, VoicePresenceState>();

  presenceList.forEach((presence) => {
    const existing = presenceByUserId.get(presence.userId);

    if (!existing) {
      presenceByUserId.set(presence.userId, presence);
      return;
    }

    if (getPresenceTimestamp(presence) >= getPresenceTimestamp(existing)) {
      presenceByUserId.set(presence.userId, presence);
    }
  });

  return Array.from(presenceByUserId.values()).sort((a, b) =>
    a.username.localeCompare(b.username)
  );
}

function IconButton({
  label,
  active,
  danger,
  children,
  onClick
}: {
  label: string;
  active?: boolean;
  danger?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  let className = "icon-button";

  if (active) className += " active";
  if (danger) className += " danger";

  return (
    <button className={className} title={label} onClick={onClick} type="button">
      {children}
    </button>
  );
}

function LoadingPanel() {
  return (
    <div className="auth-page">
      <div className="auth-card auth-card-small">
        <div className="auth-brand">
          <div className="brand-logo large">VC</div>
          <div>
            <h1>VoiceClub</h1>
            <p>Loading your team workspace...</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard({ session }: DashboardProps) {
  const [team, setTeam] = useState<Team | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);

  const [selectedVoiceChannelId, setSelectedVoiceChannelId] = useState<
    string | null
  >(null);
  const [selectedTextChannelId, setSelectedTextChannelId] = useState<
    string | null
  >(null);

  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [performanceMode, setPerformanceMode] = useState(loadPerformanceModePreference);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [messageDraft, setMessageDraft] = useState("");
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [channelModal, setChannelModal] = useState<ChannelModalState>(null);
  const [channelNameDraft, setChannelNameDraft] = useState("");
  const [channelLockedDraft, setChannelLockedDraft] = useState(false);
  const [savingChannel, setSavingChannel] = useState(false);
  const [channelActionError, setChannelActionError] = useState("");

  const [voicePresences, setVoicePresences] = useState<VoicePresenceState[]>([]);
  const voicePresenceChannelRef = useRef<RealtimeChannel | null>(null);
  const voicePresenceJoinedAtRef = useRef<string | null>(null);
  const lastPresenceChannelIdRef = useRef<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(
        PERFORMANCE_MODE_STORAGE_KEY,
        performanceMode ? "performance" : "standard"
      );
    } catch {
      // Local storage may be blocked. The in-memory setting still works.
    }

    document.body.classList.toggle("voiceclub-performance-mode", performanceMode);
    document.body.classList.toggle("voiceclub-standard-mode", !performanceMode);

    return () => {
      document.body.classList.remove("voiceclub-performance-mode");
      document.body.classList.remove("voiceclub-standard-mode");
    };
  }, [performanceMode]);

  const voiceChannels = useMemo(() => {
    return channels.filter((channel) => channel.type === "voice");
  }, [channels]);

  const textChannels = useMemo(() => {
    return channels.filter((channel) => channel.type === "text");
  }, [channels]);

  const activeVoiceChannel = useMemo(() => {
    return (
      voiceChannels.find((channel) => channel.id === selectedVoiceChannelId) ??
      voiceChannels[0] ??
      null
    );
  }, [selectedVoiceChannelId, voiceChannels]);

  const activeTextChannel = useMemo(() => {
    return (
      textChannels.find((channel) => channel.id === selectedTextChannelId) ??
      textChannels[0] ??
      null
    );
  }, [selectedTextChannelId, textChannels]);

  const membersByUserId = useMemo(() => {
    return new Map(members.map((member) => [member.userId, member]));
  }, [members]);

  const voicePresenceByUserId = useMemo(() => {
    return new Map(
      voicePresences
        .filter((presence) => presence.connected)
        .map((presence) => [presence.userId, presence])
    );
  }, [voicePresences]);

  const voicePresenceByChannelId = useMemo(() => {
    const groupedPresences = new Map<string, VoicePresenceState[]>();

    voicePresences
      .filter((presence) => presence.connected)
      .forEach((presence) => {
        const existing = groupedPresences.get(presence.voiceChannelId) ?? [];
        groupedPresences.set(presence.voiceChannelId, [...existing, presence]);
      });

    groupedPresences.forEach((presenceList, channelId) => {
      groupedPresences.set(channelId, dedupeVoicePresences(presenceList));
    });

    return groupedPresences;
  }, [voicePresences]);

  const displayMembers = useMemo(() => {
    return members.map((member) => {
      const presence = voicePresenceByUserId.get(member.userId);

      return {
        ...member,
        online: member.online || Boolean(presence),
        speaking: presence?.speaking ?? member.speaking
      };
    });
  }, [members, voicePresenceByUserId]);

  const currentMember = membersByUserId.get(session.user.id);
  const currentUsername = currentMember?.username ?? "You";
  const canManageChannels =
    currentMember?.role === "Owner" || currentMember?.role === "Admin";
  const currentUserRole = currentMember?.role ?? "Member";
  const currentVoicePresence = voicePresenceByUserId.get(session.user.id);
  const currentVoiceChannelName = currentVoicePresence
    ? channels.find((channel) => channel.id === currentVoicePresence.voiceChannelId)
        ?.name ?? "Connected to voice"
    : activeVoiceChannel?.name ?? "No voice room selected";

  const handleLocalVoicePresenceChange = useCallback(
    async (presence: LocalVoicePresenceUpdate | null) => {
      const realtimeChannel = voicePresenceChannelRef.current;

      if (!realtimeChannel || !team?.id) return;

      if (!presence || !presence.connected) {
        voicePresenceJoinedAtRef.current = null;
        lastPresenceChannelIdRef.current = null;

        try {
          await realtimeChannel.untrack();
        } catch (error) {
          console.warn("Could not clear voice presence:", error);
        }

        setVoicePresences((currentPresences) =>
          currentPresences.filter((item) => item.userId !== session.user.id)
        );

        return;
      }

      if (
        !voicePresenceJoinedAtRef.current ||
        lastPresenceChannelIdRef.current !== presence.voiceChannelId
      ) {
        voicePresenceJoinedAtRef.current = new Date().toISOString();
        lastPresenceChannelIdRef.current = presence.voiceChannelId;
      }

      const payload: VoicePresenceState = {
        userId: session.user.id,
        username: currentUsername,
        avatarUrl: currentMember?.avatarUrl ?? null,
        teamId: team.id,
        voiceChannelId: presence.voiceChannelId,
        muted: presence.muted,
        deafened: presence.deafened,
        speaking: presence.speaking,
        listenOnly: presence.listenOnly,
        connected: true,
        joinedAt: voicePresenceJoinedAtRef.current ?? new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      setVoicePresences((currentPresences) =>
        dedupeVoicePresences([
          ...currentPresences.filter((item) => item.userId !== session.user.id),
          payload
        ])
      );

      try {
        await realtimeChannel.track(payload);
      } catch (error) {
        console.warn("Could not publish voice presence:", error);
      }
    },
    [currentMember?.avatarUrl, currentUsername, session.user.id, team?.id]
  );

  function syncVoicePresenceState(realtimeChannel: RealtimeChannel) {
    const rawPresenceState = realtimeChannel.presenceState() as Record<
      string,
      VoicePresenceState[]
    >;

    const flattenedPresences = Object.values(rawPresenceState)
      .flat()
      .filter(
        (presence) =>
          presence &&
          presence.teamId === team?.id &&
          presence.connected &&
          Boolean(presence.voiceChannelId)
      )
      .filter((presence) => {
        const isCurrentUser = presence.userId === session.user.id;

        // After the current user leaves voice, Supabase can briefly still return
        // stale local metas during a presence sync. Do not render them locally.
        if (isCurrentUser && !voicePresenceJoinedAtRef.current) {
          return false;
        }

        return true;
      });

    setVoicePresences(dedupeVoicePresences(flattenedPresences));
  }

  function handleCurrentUserProfileUpdated(profile: UpdatedUserProfile) {
    setMembers((currentMembers) =>
      sortMembers(
        currentMembers.map((member) =>
          member.userId === profile.userId
            ? {
                ...member,
                username: profile.username,
                avatarUrl: profile.avatarUrl,
                accentColor: profile.accentColor
              }
            : member
        )
      )
    );

    setMessages((currentMessages) =>
      currentMessages.map((message) =>
        message.user_id === profile.userId
          ? {
              ...message,
              username: profile.username,
              avatarUrl: profile.avatarUrl
            }
          : message
      )
    );

    applyAccentColor(profile.accentColor);
  }

  function handleTeamIdentityUpdated(nextTeam: UpdatedTeamIdentity) {
    setTeam((currentTeam) => {
      if (!currentTeam || currentTeam.id !== nextTeam.teamId) {
        return currentTeam;
      }

      return {
        ...currentTeam,
        name: nextTeam.name,
        avatarUrl: nextTeam.avatarUrl
      };
    });
  }

  function sortChannels(channelList: Channel[]) {
    return [...channelList].sort((a, b) => {
      if (a.position !== b.position) {
        return a.position - b.position;
      }

      return a.name.localeCompare(b.name);
    });
  }

  function upsertChannelInState(nextChannel: Channel) {
    setChannels((currentChannels) => {
      const exists = currentChannels.some(
        (channel) => channel.id === nextChannel.id
      );

      if (exists) {
        return sortChannels(
          currentChannels.map((channel) =>
            channel.id === nextChannel.id ? nextChannel : channel
          )
        );
      }

      return sortChannels([...currentChannels, nextChannel]);
    });
  }

  function removeChannelFromState(channelId: string) {
    setChannels((currentChannels) =>
      currentChannels.filter((channel) => channel.id !== channelId)
    );
  }

  function sortMembers(memberList: Member[]) {
    return [...memberList].sort((a, b) => {
      const roleWeight = {
        Owner: 0,
        Admin: 1,
        Member: 2
      };

      const aWeight = roleWeight[a.role as keyof typeof roleWeight] ?? 3;
      const bWeight = roleWeight[b.role as keyof typeof roleWeight] ?? 3;

      if (aWeight !== bWeight) {
        return aWeight - bWeight;
      }

      return a.username.localeCompare(b.username);
    });
  }

  function upsertMemberInState(nextMember: Member) {
    setMembers((currentMembers) => {
      const exists = currentMembers.some(
        (member) => member.userId === nextMember.userId
      );

      if (exists) {
        return sortMembers(
          currentMembers.map((member) =>
            member.userId === nextMember.userId ? nextMember : member
          )
        );
      }

      return sortMembers([...currentMembers, nextMember]);
    });
  }

  function updateMemberRoleInState(
    userId: string,
    nextRole: "Owner" | "Admin" | "Member"
  ) {
    setMembers((currentMembers) =>
      sortMembers(
        currentMembers.map((member) =>
          member.userId === userId
            ? {
                ...member,
                role: nextRole
              }
            : member
        )
      )
    );
  }

  function removeMemberFromState(userId: string) {
    setMembers((currentMembers) =>
      currentMembers.filter((member) => member.userId !== userId)
    );
  }

  async function buildMemberFromMembership(
    row: TeamMemberRealtimeRow
  ): Promise<Member | null> {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, username, avatar_url, accent_color, status")
      .eq("id", row.user_id)
      .maybeSingle();

    if (error) {
      console.error("Profile fetch for member failed:", error);
      return null;
    }

    return {
      userId: row.user_id,
      username: data?.username ?? "Unknown",
      avatarUrl: data?.avatar_url ?? null,
      accentColor: data?.accent_color ?? "#ff6a00",
      role: normalizeRole(row.role),
      status: data?.status ?? "active",
      online: row.user_id === session.user.id,
      speaking: false
    };
  }

  async function loadWorkspace() {
    setWorkspaceLoading(true);
    setErrorMessage("");

    const { data: membershipData, error: membershipError } = await supabase
      .from("team_members")
      .select("team_id, role")
      .eq("user_id", session.user.id)
      .limit(1)
      .maybeSingle();

    if (membershipError) {
      setErrorMessage(membershipError.message);
      setWorkspaceLoading(false);
      return;
    }

    const membership = membershipData as TeamMemberRow | null;

    if (!membership) {
      setErrorMessage("No team membership found for this user.");
      setWorkspaceLoading(false);
      return;
    }

    const { data: teamData, error: teamError } = await supabase
      .from("teams")
      .select("id, name, avatar_url")
      .eq("id", membership.team_id)
      .single();

    if (teamError) {
      setErrorMessage(teamError.message);
      setWorkspaceLoading(false);
      return;
    }

    const { data: channelData, error: channelError } = await supabase
      .from("channels")
      .select("id, team_id, name, type, locked, position, created_at")
      .eq("team_id", membership.team_id)
      .order("position", { ascending: true });

    if (channelError) {
      setErrorMessage(channelError.message);
      setWorkspaceLoading(false);
      return;
    }

    const { data: memberData, error: memberError } = await supabase
      .from("team_members")
      .select(
        "user_id, role, profiles:profiles(id, username, avatar_url, accent_color, status)"
      )
      .eq("team_id", membership.team_id);

    if (memberError) {
      setErrorMessage(memberError.message);
      setWorkspaceLoading(false);
      return;
    }

    const loadedTeam = teamData as TeamRow;
    const loadedChannels = sortChannels((channelData ?? []) as Channel[]);

    const loadedMembers = sortMembers(
      ((memberData ?? []) as unknown as TeamMemberWithProfileRow[]).map((row) => {
        const profile = unwrapProfile(row.profiles);

        return {
          userId: row.user_id,
          username: profile?.username ?? "Unknown",
          avatarUrl: profile?.avatar_url ?? null,
          accentColor: profile?.accent_color ?? "#ff6a00",
          role: normalizeRole(row.role),
          status: profile?.status ?? "active",
          online: row.user_id === session.user.id,
          speaking: false
        };
      })
    );

    setTeam({
      id: loadedTeam.id,
      name: loadedTeam.name,
      avatarUrl: loadedTeam.avatar_url ?? null
    });
    setChannels(loadedChannels);
    setMembers(loadedMembers);

    const firstVoiceChannel = loadedChannels.find(
      (channel) => channel.type === "voice"
    );
    const firstTextChannel = loadedChannels.find(
      (channel) => channel.type === "text"
    );

    setSelectedVoiceChannelId((current) => {
      const stillExists = loadedChannels.some(
        (channel) => channel.id === current && channel.type === "voice"
      );

      return stillExists ? current : firstVoiceChannel?.id ?? null;
    });

    setSelectedTextChannelId((current) => {
      const stillExists = loadedChannels.some(
        (channel) => channel.id === current && channel.type === "text"
      );

      return stillExists ? current : firstTextChannel?.id ?? null;
    });

    setWorkspaceLoading(false);
  }

  useEffect(() => {
    loadWorkspace();
  }, [session.user.id]);

  useEffect(() => {
    if (!selectedVoiceChannelId) {
      setSelectedVoiceChannelId(voiceChannels[0]?.id ?? null);
      return;
    }

    const selectedStillExists = voiceChannels.some(
      (channel) => channel.id === selectedVoiceChannelId
    );

    if (!selectedStillExists) {
      setSelectedVoiceChannelId(voiceChannels[0]?.id ?? null);
    }
  }, [selectedVoiceChannelId, voiceChannels]);

  useEffect(() => {
    if (!selectedTextChannelId) {
      setSelectedTextChannelId(textChannels[0]?.id ?? null);
      return;
    }

    const selectedStillExists = textChannels.some(
      (channel) => channel.id === selectedTextChannelId
    );

    if (!selectedStillExists) {
      setSelectedTextChannelId(textChannels[0]?.id ?? null);
    }
  }, [selectedTextChannelId, textChannels]);

  useEffect(() => {
    if (!team?.id) return;

    const realtimeChannel = supabase
      .channel(`team-channels:${team.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "channels",
          filter: `team_id=eq.${team.id}`
        },
        (payload) => {
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            upsertChannelInState(payload.new as Channel);
          }

          if (payload.eventType === "DELETE") {
            const oldChannel = payload.old as Partial<Channel>;

            if (oldChannel.id) {
              removeChannelFromState(oldChannel.id);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(realtimeChannel);
    };
  }, [team?.id]);

  useEffect(() => {
    if (!team?.id) return;

    const realtimeChannel = supabase
      .channel(`team-identity:${team.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "teams",
          filter: `id=eq.${team.id}`
        },
        (payload) => {
          const updatedTeam = payload.new as TeamRow;

          setTeam({
            id: updatedTeam.id,
            name: updatedTeam.name,
            avatarUrl: updatedTeam.avatar_url ?? null
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(realtimeChannel);
    };
  }, [team?.id]);

  useEffect(() => {
    if (!team?.id) return;

    const realtimeChannel = supabase.channel(`voice-presence:${team.id}`, {
      config: {
        presence: {
          key: session.user.id
        }
      }
    });

    voicePresenceChannelRef.current = realtimeChannel;

    realtimeChannel
      .on("presence", { event: "sync" }, () => {
        syncVoicePresenceState(realtimeChannel);
      })
      .on("presence", { event: "join" }, () => {
        syncVoicePresenceState(realtimeChannel);
      })
      .on("presence", { event: "leave" }, () => {
        syncVoicePresenceState(realtimeChannel);
      })
      .subscribe();

    return () => {
      realtimeChannel.untrack().catch((error) => {
        console.warn("Could not untrack voice presence:", error);
      });

      supabase.removeChannel(realtimeChannel);
      voicePresenceChannelRef.current = null;
      voicePresenceJoinedAtRef.current = null;
      lastPresenceChannelIdRef.current = null;
      setVoicePresences([]);
    };
  }, [team?.id, session.user.id]);

  useEffect(() => {
    if (!team?.id) return;

    const realtimeChannel = supabase
      .channel(`team-members:${team.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "team_members",
          filter: `team_id=eq.${team.id}`
        },
        async (payload) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as TeamMemberRealtimeRow;
            const member = await buildMemberFromMembership(row);

            if (member) {
              upsertMemberInState(member);
            }
          }

          if (payload.eventType === "UPDATE") {
            const row = payload.new as TeamMemberRealtimeRow;

            updateMemberRoleInState(
              row.user_id,
              normalizeRole(row.role) as "Owner" | "Admin" | "Member"
            );
          }

          if (payload.eventType === "DELETE") {
            const oldRow = payload.old as Partial<TeamMemberRealtimeRow>;

            if (!oldRow.user_id) return;

            if (oldRow.user_id === session.user.id) {
              setTeam(null);
              setChannels([]);
              setMembers([]);
              setMessages([]);
              setErrorMessage("You were removed from this VoiceClub team.");
              setWorkspaceLoading(false);
              return;
            }

            removeMemberFromState(oldRow.user_id);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(realtimeChannel);
    };
  }, [team?.id, session.user.id]);

  useEffect(() => {
    if (!team?.id) return;

    const realtimeChannel = supabase
      .channel(`team-profiles:${team.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles"
        },
        (payload) => {
          const profile = payload.new as ProfileRow;

          setMembers((currentMembers) => {
            const profileBelongsToCurrentTeam = currentMembers.some(
              (member) => member.userId === profile.id
            );

            if (!profileBelongsToCurrentTeam) {
              return currentMembers;
            }

            return sortMembers(
              currentMembers.map((member) =>
                member.userId === profile.id
                  ? {
                      ...member,
                      username: profile.username,
                      avatarUrl: profile.avatar_url,
                      accentColor: profile.accent_color ?? "#ff6a00",
                      status: profile.status
                    }
                  : member
              )
            );
          });

          setMessages((currentMessages) =>
            currentMessages.map((message) =>
              message.user_id === profile.id
                ? {
                    ...message,
                    username: profile.username,
                    avatarUrl: profile.avatar_url
                  }
                : message
            )
          );

          if (profile.id === session.user.id && profile.accent_color) {
            applyAccentColor(profile.accent_color);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(realtimeChannel);
    };
  }, [team?.id, session.user.id]);

  useEffect(() => {
    if (currentMember?.accentColor) {
      applyAccentColor(currentMember.accentColor);
    }
  }, [currentMember?.accentColor]);

  useEffect(() => {
    async function loadMessages() {
      if (!activeTextChannel) {
        setMessages([]);
        return;
      }

      setMessagesLoading(true);
      setErrorMessage("");

      const { data, error } = await supabase
        .from("messages")
        .select(
          "id, channel_id, user_id, content, created_at, profiles:profiles(id, username, avatar_url, accent_color, status)"
        )
        .eq("channel_id", activeTextChannel.id)
        .order("created_at", { ascending: true })
        .limit(100);

      if (error) {
        setErrorMessage(error.message);
        setMessages([]);
        setMessagesLoading(false);
        return;
      }

      const loadedMessages = (
        (data ?? []) as unknown as MessageWithProfileRow[]
      ).map((row) => {
        const profile = unwrapProfile(row.profiles);

        return {
          id: row.id,
          channel_id: row.channel_id,
          user_id: row.user_id,
          username: profile?.username ?? "Unknown",
          avatarUrl: profile?.avatar_url ?? null,
          content: row.content,
          created_at: row.created_at
        };
      });

      setMessages(loadedMessages);
      setMessagesLoading(false);
    }

    loadMessages();
  }, [activeTextChannel?.id]);

  useEffect(() => {
    if (!activeTextChannel) return;

    const realtimeChannel = supabase
      .channel(`messages:${activeTextChannel.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `channel_id=eq.${activeTextChannel.id}`
        },
        (payload) => {
          const row = payload.new as {
            id: string;
            channel_id: string;
            user_id: string;
            content: string;
            created_at: string;
          };

          const member = membersByUserId.get(row.user_id);

          const newMessage: Message = {
            id: row.id,
            channel_id: row.channel_id,
            user_id: row.user_id,
            username: member?.username ?? "Unknown",
            avatarUrl: member?.avatarUrl ?? null,
            content: row.content,
            created_at: row.created_at
          };

          setMessages((currentMessages) => {
            const alreadyExists = currentMessages.some(
              (message) => message.id === newMessage.id
            );

            if (alreadyExists) return currentMessages;

            return [...currentMessages, newMessage];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(realtimeChannel);
    };
  }, [activeTextChannel?.id, membersByUserId]);

  function openCreateChannelModal(channelType: ChannelType) {
    setChannelModal({
      mode: "create",
      channelType
    });
    setChannelNameDraft(channelType === "voice" ? "New Voice Room" : "new-chat");
    setChannelLockedDraft(false);
    setChannelActionError("");
  }

  function openEditChannelModal(channel: Channel) {
    setChannelModal({
      mode: "edit",
      channelType: channel.type,
      channel
    });
    setChannelNameDraft(channel.name);
    setChannelLockedDraft(channel.locked);
    setChannelActionError("");
  }

  function closeChannelModal() {
    if (savingChannel) return;
    setChannelModal(null);
    setChannelNameDraft("");
    setChannelLockedDraft(false);
    setChannelActionError("");
  }

  async function saveChannel(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!team || !channelModal || savingChannel) return;

    const cleanName = channelNameDraft.trim();

    if (cleanName.length < 2) {
      setChannelActionError("Channel name must have at least 2 characters.");
      return;
    }

    setSavingChannel(true);
    setChannelActionError("");

    if (channelModal.mode === "create") {
      const sameTypeChannels = channels.filter(
        (channel) => channel.type === channelModal.channelType
      );

      const nextPosition =
        channels.length > 0
          ? Math.max(...channels.map((channel) => channel.position)) + 1
          : 1;

      const duplicate = sameTypeChannels.some(
        (channel) => channel.name.toLowerCase() === cleanName.toLowerCase()
      );

      if (duplicate) {
        setSavingChannel(false);
        setChannelActionError("A channel with this name already exists.");
        return;
      }

      const { data, error } = await supabase
        .from("channels")
        .insert({
          team_id: team.id,
          name: cleanName,
          type: channelModal.channelType,
          locked: channelLockedDraft,
          position: nextPosition
        })
        .select("id, team_id, name, type, locked, position, created_at")
        .single();

      if (error) {
        setSavingChannel(false);
        setChannelActionError(error.message);
        return;
      }

      const createdChannel = data as Channel;

      upsertChannelInState(createdChannel);

      if (createdChannel.type === "voice") {
        setSelectedVoiceChannelId(createdChannel.id);
      } else {
        setSelectedTextChannelId(createdChannel.id);
      }
    }

    if (channelModal.mode === "edit" && channelModal.channel) {
      const duplicate = channels.some(
        (channel) =>
          channel.id !== channelModal.channel?.id &&
          channel.type === channelModal.channelType &&
          channel.name.toLowerCase() === cleanName.toLowerCase()
      );

      if (duplicate) {
        setSavingChannel(false);
        setChannelActionError("A channel with this name already exists.");
        return;
      }

      const { data, error } = await supabase
        .from("channels")
        .update({
          name: cleanName,
          locked: channelLockedDraft
        })
        .eq("id", channelModal.channel.id)
        .select("id, team_id, name, type, locked, position, created_at")
        .single();

      if (error) {
        setSavingChannel(false);
        setChannelActionError(error.message);
        return;
      }

      upsertChannelInState(data as Channel);
    }

    setSavingChannel(false);
    closeChannelModal();
  }

  async function deleteChannel(channel: Channel) {
    if (!canManageChannels) return;

    const confirmed = window.confirm(
      `Delete ${channel.type} channel "${channel.name}"? This cannot be undone.`
    );

    if (!confirmed) return;

    setErrorMessage("");

    const { error } = await supabase
      .from("channels")
      .delete()
      .eq("id", channel.id);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    removeChannelFromState(channel.id);
  }

  async function toggleChannelLock(channel: Channel) {
    if (!canManageChannels) return;

    setErrorMessage("");

    const { data, error } = await supabase
      .from("channels")
      .update({
        locked: !channel.locked
      })
      .eq("id", channel.id)
      .select("id, team_id, name, type, locked, position, created_at")
      .single();

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    upsertChannelInState(data as Channel);
  }

  async function sendMessage() {
    if (!activeTextChannel || sendingMessage) return;

    const cleanMessage = messageDraft.trim();

    if (!cleanMessage) return;

    setSendingMessage(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("messages")
      .insert({
        channel_id: activeTextChannel.id,
        user_id: session.user.id,
        content: cleanMessage
      })
      .select("id, channel_id, user_id, content, created_at")
      .single();

    setSendingMessage(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setMessageDraft("");

    if (data) {
      const insertedMessage: Message = {
        id: data.id,
        channel_id: data.channel_id,
        user_id: data.user_id,
        username: currentUsername,
        avatarUrl: currentMember?.avatarUrl ?? null,
        content: data.content,
        created_at: data.created_at
      };

      setMessages((currentMessages) => {
        const alreadyExists = currentMessages.some(
          (message) => message.id === insertedMessage.id
        );

        if (alreadyExists) return currentMessages;

        return [...currentMessages, insertedMessage];
      });
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  if (workspaceLoading) {
    return <LoadingPanel />;
  }

  if (errorMessage && !team) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-brand">
            <div className="brand-logo large">VC</div>
            <div>
              <h1>VoiceClub</h1>
              <p>Something went wrong.</p>
            </div>
          </div>

          <div className="auth-error">{errorMessage}</div>

          <button className="auth-submit" type="button" onClick={signOut}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="app-shell">
        <div className="desktop-frame">
          <aside className="sidebar">
            <div className="brand-section">
              <TeamLogo
                name={team?.name ?? "VoiceClub"}
                avatarUrl={team?.avatarUrl ?? null}
              />

              <div>
                <h1>{team?.name ?? "Private Team"}</h1>
                <p>VoiceClub</p>
              </div>
            </div>

            <div className="channel-scroll">
              <section className="channel-section">
                <div className="section-header">
                  <span>Voice</span>
                  {canManageChannels && (
                    <button
                      type="button"
                      className="small-action"
                      title="Create voice channel"
                      onClick={() => openCreateChannelModal("voice")}
                    >
                      <Plus size={15} />
                    </button>
                  )}
                </div>

                <div className="channel-list">
                  {voiceChannels.map((channel) => {
                    const selected = channel.id === activeVoiceChannel?.id;
                    const channelPresences =
                      voicePresenceByChannelId.get(channel.id) ?? [];

                    return (
                      <div key={channel.id} className="voice-channel-block">
                        <div
                          className={
                            selected
                              ? "channel-row-wrap selected"
                              : "channel-row-wrap"
                          }
                        >
                          <button
                            type="button"
                            className={
                              selected
                                ? "voice-channel selected"
                                : "voice-channel"
                            }
                            onClick={() => setSelectedVoiceChannelId(channel.id)}
                          >
                            <div className="channel-title">
                              <div className="channel-title-left">
                                <Radio size={16} />
                                <span>{channel.name}</span>
                              </div>

                              <div className="voice-channel-meta">
                                {channelPresences.length > 0 && (
                                  <span>{channelPresences.length}</span>
                                )}
                                {channel.locked && <Lock size={14} />}
                              </div>
                            </div>
                          </button>

                          {canManageChannels && (
                            <div className="channel-actions">
                              <button
                                type="button"
                                title="Rename channel"
                                onClick={() => openEditChannelModal(channel)}
                              >
                                <Edit3 size={13} />
                              </button>

                              <button
                                type="button"
                                title={
                                  channel.locked
                                    ? "Unlock channel"
                                    : "Lock channel"
                                }
                                onClick={() => toggleChannelLock(channel)}
                              >
                                {channel.locked ? (
                                  <Unlock size={13} />
                                ) : (
                                  <Lock size={13} />
                                )}
                              </button>

                              <button
                                type="button"
                                title="Delete channel"
                                onClick={() => deleteChannel(channel)}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          )}
                        </div>

                        {channelPresences.length > 0 && (
                          <div className="channel-users voice-presence-users">
                            {channelPresences.map((presence) => (
                              <button
                                key={presence.userId}
                                type="button"
                                className={
                                  presence.speaking
                                    ? "channel-user voice-presence-user speaking"
                                    : "channel-user voice-presence-user"
                                }
                                onClick={() => setSelectedVoiceChannelId(channel.id)}
                                title={`${presence.username}${
                                  presence.listenOnly
                                    ? " · listen-only"
                                    : presence.muted
                                      ? " · muted"
                                      : " · mic active"
                                }${presence.deafened ? " · deafened" : ""}`}
                              >
                                <span
                                  className={
                                    presence.speaking
                                      ? "status-dot speaking"
                                      : "status-dot online"
                                  }
                                />
                                <span className="voice-presence-name">
                                  {presence.username}
                                </span>
                                <span className="voice-presence-icons">
                                  {presence.listenOnly || presence.muted ? (
                                    <MicOff size={12} />
                                  ) : (
                                    <Mic size={12} />
                                  )}
                                  {presence.deafened && <Headphones size={12} />}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="channel-section">
                <div className="section-header">
                  <span>Text</span>
                  {canManageChannels && (
                    <button
                      type="button"
                      className="small-action"
                      title="Create text channel"
                      onClick={() => openCreateChannelModal("text")}
                    >
                      <Plus size={15} />
                    </button>
                  )}
                </div>

                <div className="channel-list">
                  {textChannels.map((channel) => {
                    const selected = channel.id === activeTextChannel?.id;

                    return (
                      <div
                        key={channel.id}
                        className={
                          selected
                            ? "channel-row-wrap selected"
                            : "channel-row-wrap"
                        }
                      >
                        <button
                          type="button"
                          className={
                            selected ? "text-channel selected" : "text-channel"
                          }
                          onClick={() => setSelectedTextChannelId(channel.id)}
                        >
                          <MessageSquare size={16} />
                          <span>#{channel.name}</span>
                          {channel.locked && <Lock size={14} />}
                        </button>

                        {canManageChannels && (
                          <div className="channel-actions">
                            <button
                              type="button"
                              title="Rename channel"
                              onClick={() => openEditChannelModal(channel)}
                            >
                              <Edit3 size={13} />
                            </button>

                            <button
                              type="button"
                              title={
                                channel.locked
                                  ? "Unlock channel"
                                  : "Lock channel"
                              }
                              onClick={() => toggleChannelLock(channel)}
                            >
                              {channel.locked ? (
                                <Unlock size={13} />
                              ) : (
                                <Lock size={13} />
                              )}
                            </button>

                            <button
                              type="button"
                              title="Delete channel"
                              onClick={() => deleteChannel(channel)}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>

            <div className="user-control-section">
              <div className="user-card">
                <div className="user-meta-row">
                  <AvatarImage
                    name={currentUsername}
                    avatarUrl={currentMember?.avatarUrl ?? null}
                    className="avatar"
                  />

                  <div className="user-meta">
                    <div className="user-name-row">
                      <strong>{currentUsername}</strong>
                      {currentMember?.role === "Owner" && <Crown size={14} />}
                    </div>
                    <span>
                      {currentVoiceChannelName}
                    </span>
                  </div>
                </div>

                <div className="controls-row">
                  <IconButton
                    label={muted ? "Unmute microphone" : "Mute microphone"}
                    active={!muted}
                    danger={muted}
                    onClick={() => setMuted((value) => !value)}
                  >
                    {muted ? <MicOff size={20} /> : <Mic size={20} />}
                  </IconButton>

                  <IconButton
                    label={deafened ? "Undeafen" : "Deafen"}
                    active={!deafened}
                    danger={deafened}
                    onClick={() => setDeafened((value) => !value)}
                  >
                    <Headphones size={20} />
                  </IconButton>

                  <IconButton label="Settings" onClick={() => setSettingsOpen(true)}>
                    <Settings size={20} />
                  </IconButton>
                </div>
              </div>
            </div>
          </aside>

          <main className="main-area">
            <header className="top-bar">
              <div>
                <div className="title-row">
                  <h2>{activeVoiceChannel?.name ?? "Voice Room"}</h2>
                </div>
              </div>

              <div className="top-actions">
                <div className="ping-box">
                  <Signal size={16} />
                  <span>Local</span>
                </div>

                <button
                  type="button"
                  className={
                    performanceMode
                      ? "performance-button enabled"
                      : "performance-button"
                  }
                  onClick={() => setPerformanceMode((value) => !value)}
                >
                  <Zap size={16} />
                  <span>Performance Mode</span>
                </button>
              </div>
            </header>

            <div className="content-grid">
              <section className="center-column">
                {team && (
                  <VoiceRoom
                    teamId={team.id}
                    channel={activeVoiceChannel}
                    currentUserId={session.user.id}
                    currentUsername={currentUsername}
                    currentAvatarUrl={currentMember?.avatarUrl ?? null}
                    muted={muted}
                    deafened={deafened}
                    performanceMode={performanceMode}
                    onMutedChange={setMuted}
                    onPresenceChange={handleLocalVoicePresenceChange}
                  />
                )}

                <div className="chat-panel">
                  <div className="chat-header">
                    <h3>#{activeTextChannel?.name ?? "text"}</h3>
                  </div>

                  {errorMessage && <div className="chat-error">{errorMessage}</div>}

                  <div className="message-list">
                    {messagesLoading && (
                      <div className="chat-empty">Loading messages...</div>
                    )}

                    {!messagesLoading && messages.length === 0 && (
                      <div className="chat-empty">
                        No messages yet. Start the first VoiceClub message.
                      </div>
                    )}

                    {!messagesLoading &&
                      messages.map((message) => (
                        <div key={message.id} className="message-row">
                          <AvatarImage
                            name={message.username}
                            avatarUrl={message.avatarUrl}
                            className="message-avatar"
                          />

                          <div className="message-body">
                            <div className="message-meta">
                              <strong>{message.username}</strong>
                              <span>{formatTime(message.created_at)}</span>
                            </div>
                            <p>{message.content}</p>
                          </div>
                        </div>
                      ))}
                  </div>

                  <div className="chat-input-row">
                    <input
                      value={messageDraft}
                      onChange={(event) => setMessageDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          sendMessage();
                        }
                      }}
                      placeholder={
                        activeTextChannel
                          ? `Message #${activeTextChannel.name}`
                          : "No text channel selected"
                      }
                      disabled={!activeTextChannel || sendingMessage}
                    />

                    <button
                      type="button"
                      onClick={sendMessage}
                      disabled={!activeTextChannel || sendingMessage}
                    >
                      {sendingMessage ? "Sending..." : "Send"}
                    </button>
                  </div>
                </div>
              </section>

              <aside className="members-panel">
                <div className="members-header">
                  <div>
                    <h3>Team Members</h3>
                    <p>{displayMembers.length} member(s)</p>
                  </div>
                  <Users size={20} />
                </div>

                <div className="member-list">
                  {displayMembers.map((member) => (
                    <div key={member.userId} className="member-row">
                      <div className="member-avatar-wrap">
                        <AvatarImage
                          name={member.username}
                          avatarUrl={member.avatarUrl}
                          className="member-avatar"
                        />
                        <StatusDot
                          online={member.online}
                          speaking={member.speaking}
                        />
                      </div>

                      <div className="member-info">
                        <strong>{member.username}</strong>
                        <span>{member.role}</span>
                      </div>

                      {member.speaking && <Volume2 size={16} />}
                    </div>
                  ))}
                </div>

                <div className="session-card">
                  <h3>Session Quality</h3>

                  <div className="session-row">
                    <span>Database</span>
                    <strong className="good">Connected</strong>
                  </div>

                  <div className="session-row">
                    <span>Chat</span>
                    <strong className="good">Live</strong>
                  </div>

                  <div className="session-row">
                    <span>Voice</span>
                    <strong className={voicePresences.length > 0 ? "good" : "accent"}>
                      {voicePresences.length > 0
                        ? `${voicePresences.length} connected`
                        : "Ready"}
                    </strong>
                  </div>

                  <div className="session-row">
                    <span>Mode</span>
                    <strong className="accent">
                      {performanceMode ? "Performance" : "Standard"}
                    </strong>
                  </div>
                </div>

                {team && canManageChannels && (
                  <MemberManagementPanel
                    teamId={team.id}
                    members={members}
                    currentUserId={session.user.id}
                    currentUserRole={currentUserRole}
                    onRoleChanged={updateMemberRoleInState}
                    onMemberRemoved={removeMemberFromState}
                  />
                )}

                {team && canManageChannels && <InvitePanel teamId={team.id} />}

              </aside>
            </div>
          </main>
        </div>
      </div>

      {channelModal && (
        <div className="modal-backdrop" onMouseDown={closeChannelModal}>
          <div className="modal-card" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>
                  {channelModal.mode === "create" ? "Create" : "Edit"}{" "}
                  {channelModal.channelType === "voice" ? "voice" : "text"} channel
                </h3>
                <p>
                  {channelModal.channelType === "voice"
                    ? "Voice channels are used for team comms."
                    : "Text channels are used for lightweight team messages."}
                </p>
              </div>
            </div>

            <form className="modal-form" onSubmit={saveChannel}>
              <label>
                <span>Channel name</span>
                <input
                  value={channelNameDraft}
                  onChange={(event) => setChannelNameDraft(event.target.value)}
                  placeholder={
                    channelModal.channelType === "voice"
                      ? "Match Room"
                      : "general"
                  }
                  autoFocus
                />
              </label>

              <label className="toggle-row">
                <div>
                  <strong>Locked channel</strong>
                  <span>Locked channels are reserved for restricted rooms.</span>
                </div>

                <input
                  type="checkbox"
                  checked={channelLockedDraft}
                  onChange={(event) => setChannelLockedDraft(event.target.checked)}
                />
              </label>

              {channelActionError && (
                <div className="auth-error">{channelActionError}</div>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  className="modal-secondary"
                  onClick={closeChannelModal}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="modal-primary"
                  disabled={savingChannel}
                >
                  {savingChannel
                    ? "Saving..."
                    : channelModal.mode === "create"
                      ? "Create channel"
                      : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {settingsOpen && currentMember && team && (
        <SettingsModal
          userId={session.user.id}
          username={currentMember.username}
          avatarUrl={currentMember.avatarUrl}
          accentColor={currentMember.accentColor}
          performanceMode={performanceMode}
          muted={muted}
          deafened={deafened}
          teamId={team.id}
          teamName={team.name}
          teamAvatarUrl={team.avatarUrl}
          canManageTeamIdentity={currentUserRole === "Owner"}
          onClose={() => setSettingsOpen(false)}
          onProfileUpdated={handleCurrentUserProfileUpdated}
          onTeamUpdated={handleTeamIdentityUpdated}
          onPerformanceModeChange={setPerformanceMode}
          onMutedChange={setMuted}
          onDeafenedChange={setDeafened}
          onSignOut={signOut}
        />
      )}
    </>
  );
}