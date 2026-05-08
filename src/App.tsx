import {
  Activity,
  Crown,
  Headphones,
  Lock,
  LogOut,
  MessageSquare,
  Mic,
  MicOff,
  Plus,
  Radio,
  Settings,
  Signal,
  Users,
  Volume2,
  Zap
} from "lucide-react";
import { useMemo, useState } from "react";

type UserRole = "Owner" | "Admin" | "Member";

type Member = {
  id: string;
  name: string;
  role: UserRole;
  online: boolean;
  speaking: boolean;
};

type VoiceChannel = {
  id: string;
  name: string;
  locked: boolean;
  users: string[];
};

type TextChannel = {
  id: string;
  name: string;
};

type ChatMessage = {
  id: string;
  user: string;
  time: string;
  text: string;
};

const voiceChannels: VoiceChannel[] = [
  {
    id: "match-room",
    name: "Match Room",
    locked: false,
    users: ["dragsteR", "M3KANIX", "bip0lar"]
  },
  {
    id: "practice",
    name: "Practice",
    locked: false,
    users: ["soynA"]
  },
  {
    id: "chill-zone",
    name: "Chill Zone",
    locked: false,
    users: []
  },
  {
    id: "admin-room",
    name: "Admin Room",
    locked: true,
    users: []
  }
];

const textChannels: TextChannel[] = [
  { id: "general", name: "general" },
  { id: "match-notes", name: "match-notes" },
  { id: "setups", name: "setups" }
];

const members: Member[] = [
  {
    id: "dragster",
    name: "dragsteR",
    role: "Owner",
    online: true,
    speaking: true
  },
  {
    id: "m3kanix",
    name: "M3KANIX",
    role: "Member",
    online: true,
    speaking: false
  },
  {
    id: "bipolar",
    name: "bip0lar",
    role: "Member",
    online: true,
    speaking: true
  },
  {
    id: "soyna",
    name: "soynA",
    role: "Member",
    online: true,
    speaking: false
  },
  {
    id: "bucatarul",
    name: "bucatarul",
    role: "Member",
    online: false,
    speaking: false
  }
];

const initialMessages: ChatMessage[] = [
  {
    id: "m1",
    user: "dragsteR",
    time: "20:41",
    text: "Warmup 10 minutes, then we go into Mirage practice."
  },
  {
    id: "m2",
    user: "bip0lar",
    time: "20:42",
    text: "Mic sounds clean. No lag so far."
  },
  {
    id: "m3",
    user: "M3KANIX",
    time: "20:43",
    text: "I am joining Match Room now."
  }
];

function getInitials(name: string): string {
  return name.slice(0, 1).toUpperCase();
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

function App() {
  const [selectedVoiceChannelId, setSelectedVoiceChannelId] =
    useState("match-room");
  const [selectedTextChannelId, setSelectedTextChannelId] = useState("general");
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [performanceMode, setPerformanceMode] = useState(true);
  const [messageDraft, setMessageDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);

  const activeVoiceChannel = useMemo(() => {
    return voiceChannels.find((channel) => channel.id === selectedVoiceChannelId);
  }, [selectedVoiceChannelId]);

  const activeTextChannel = useMemo(() => {
    return textChannels.find((channel) => channel.id === selectedTextChannelId);
  }, [selectedTextChannelId]);

  function sendMessage() {
    const cleanMessage = messageDraft.trim();

    if (!cleanMessage) return;

    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, "0")}:${String(
      now.getMinutes()
    ).padStart(2, "0")}`;

    setMessages((currentMessages) => [
      ...currentMessages,
      {
        id: crypto.randomUUID(),
        user: "dragsteR",
        time,
        text: cleanMessage
      }
    ]);

    setMessageDraft("");
  }

  return (
    <div className="app-shell">
      <div className="desktop-frame">
        <aside className="sidebar">
          <div className="brand-section">
            <div className="brand-logo">VC</div>
            <div>
              <h1>VoiceClub</h1>
              <p>Private Team Comms</p>
            </div>
          </div>

          <div className="channel-scroll">
            <section className="channel-section">
              <div className="section-header">
                <span>Voice</span>
                <button type="button" className="small-action">
                  <Plus size={15} />
                </button>
              </div>

              <div className="channel-list">
                {voiceChannels.map((channel) => {
                  const selected = channel.id === selectedVoiceChannelId;

                  return (
                    <button
                      key={channel.id}
                      type="button"
                      className={
                        selected ? "voice-channel selected" : "voice-channel"
                      }
                      onClick={() => setSelectedVoiceChannelId(channel.id)}
                    >
                      <div className="channel-title">
                        <div className="channel-title-left">
                          <Radio size={16} />
                          <span>{channel.name}</span>
                        </div>

                        {channel.locked && <Lock size={14} />}
                      </div>

                      {channel.users.length > 0 && (
                        <div className="channel-users">
                          {channel.users.map((user) => {
                            const member = members.find(
                              (item) => item.name === user
                            );

                            return (
                              <div key={user} className="channel-user">
                                <StatusDot
                                  online
                                  speaking={member?.speaking || false}
                                />
                                <span>{user}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="channel-section">
              <div className="section-header">
                <span>Text</span>
                <button type="button" className="small-action">
                  <Plus size={15} />
                </button>
              </div>

              <div className="channel-list">
                {textChannels.map((channel) => {
                  const selected = channel.id === selectedTextChannelId;

                  return (
                    <button
                      key={channel.id}
                      type="button"
                      className={
                        selected ? "text-channel selected" : "text-channel"
                      }
                      onClick={() => setSelectedTextChannelId(channel.id)}
                    >
                      <MessageSquare size={16} />
                      <span>#{channel.name}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          </div>

          <div className="user-control-section">
            <div className="user-card">
              <div className="user-meta-row">
                <div className="avatar">D</div>
                <div className="user-meta">
                  <div className="user-name-row">
                    <strong>dragsteR</strong>
                    <Crown size={14} />
                  </div>
                  <span>Connected to {activeVoiceChannel?.name}</span>
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

                <IconButton label="Settings">
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
                <h2>{activeVoiceChannel?.name}</h2>
                <span className="status-pill">Voice Active</span>
              </div>
              <p>Low-latency private voice session for your team.</p>
            </div>

            <div className="top-actions">
              <div className="ping-box">
                <Signal size={16} />
                <span>24 ms</span>
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
              <div className="voice-panel">
                <div className="panel-header">
                  <div>
                    <h3>Live Voice Room</h3>
                    <p>{activeVoiceChannel?.users.length || 0} users connected</p>
                  </div>

                  <div className="quality-pill">
                    <Activity size={16} />
                    <span>Stable</span>
                  </div>
                </div>

                <div className="voice-user-grid">
                  {(activeVoiceChannel?.users || []).map((user) => {
                    const member = members.find((item) => item.name === user);
                    const speaking = member?.speaking || false;

                    return (
                      <div
                        key={user}
                        className={
                          speaking ? "voice-user-card speaking" : "voice-user-card"
                        }
                      >
                        <div className="voice-user-top">
                          <div className="large-avatar">{getInitials(user)}</div>
                          <StatusDot online speaking={speaking} />
                        </div>

                        <strong>{user}</strong>
                        <span>{speaking ? "Speaking" : "Connected"}</span>

                        <div className="audio-meter">
                          <div
                            className={
                              speaking ? "audio-fill speaking" : "audio-fill"
                            }
                          />
                        </div>
                      </div>
                    );
                  })}

                  {activeVoiceChannel?.users.length === 0 && (
                    <div className="empty-room">
                      <Radio size={28} />
                      <h3>Room is empty</h3>
                      <p>Join this room when your team is ready.</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="chat-panel">
                <div className="chat-header">
                  <h3>#{activeTextChannel?.name}</h3>
                  <p>Lightweight text chat. No heavy embeds. No noise.</p>
                </div>

                <div className="message-list">
                  {messages.map((message) => (
                    <div key={message.id} className="message-row">
                      <div className="message-avatar">
                        {getInitials(message.user)}
                      </div>

                      <div className="message-body">
                        <div className="message-meta">
                          <strong>{message.user}</strong>
                          <span>{message.time}</span>
                        </div>
                        <p>{message.text}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="chat-input-row">
                  <input
                    value={messageDraft}
                    onChange={(event) => setMessageDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        sendMessage();
                      }
                    }}
                    placeholder={`Message #${activeTextChannel?.name}`}
                  />

                  <button type="button" onClick={sendMessage}>
                    Send
                  </button>
                </div>
              </div>
            </section>

            <aside className="members-panel">
              <div className="members-header">
                <div>
                  <h3>Team Members</h3>
                  <p>{members.filter((member) => member.online).length} online</p>
                </div>
                <Users size={20} />
              </div>

              <div className="member-list">
                {members.map((member) => (
                  <div key={member.id} className="member-row">
                    <div className="member-avatar-wrap">
                      <div className="member-avatar">
                        {getInitials(member.name)}
                      </div>
                      <StatusDot
                        online={member.online}
                        speaking={member.speaking}
                      />
                    </div>

                    <div className="member-info">
                      <strong>{member.name}</strong>
                      <span>{member.role}</span>
                    </div>

                    {member.speaking && <Volume2 size={16} />}
                  </div>
                ))}
              </div>

              <div className="session-card">
                <h3>Session Quality</h3>

                <div className="session-row">
                  <span>Latency</span>
                  <strong className="good">24 ms</strong>
                </div>

                <div className="session-row">
                  <span>Packet Loss</span>
                  <strong className="good">0.0%</strong>
                </div>

                <div className="session-row">
                  <span>Mode</span>
                  <strong className="accent">
                    {performanceMode ? "Performance" : "Standard"}
                  </strong>
                </div>
              </div>

              <button type="button" className="leave-button">
                <LogOut size={16} />
                <span>Leave Voice</span>
              </button>
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
