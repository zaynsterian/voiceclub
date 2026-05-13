import {
  Activity,
  AlertTriangle,
  Headphones,
  Keyboard,
  Loader2,
  LogIn,
  LogOut,
  Mic,
  MicOff,
  Radio,
  RefreshCw,
  Users,
  Volume2,
  VolumeX,
  Zap
} from "lucide-react";
import {
  RemoteAudioTrack,
  Room,
  RoomEvent,
  Track,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication
} from "livekit-client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildAudioCaptureOptions,
  loadAudioPreferences,
  type AudioPreferences
} from "../lib/audioPreferences";
import { supabase } from "../lib/supabase";

type VoiceChannel = {
  id: string;
  name: string;
  locked: boolean;
};

type VoiceParticipant = {
  identity: string;
  name: string;
  isLocal: boolean;
  isSpeaking: boolean;
  isMuted: boolean;
};

type LiveKitTokenResponse = {
  url?: string;
  token?: string;
  roomName?: string;
  participantName?: string;
  error?: string;
};

type LocalVoicePresenceUpdate = {
  voiceChannelId: string;
  muted: boolean;
  deafened: boolean;
  speaking: boolean;
  listenOnly: boolean;
  connected: boolean;
};

type VoiceRoomProps = {
  teamId: string;
  channel: VoiceChannel | null;
  currentUserId: string;
  currentUsername: string;
  currentAvatarUrl: string | null;
  muted: boolean;
  deafened: boolean;
  performanceMode?: boolean;
  onMutedChange: (value: boolean) => void;
  onPresenceChange?: (presence: LocalVoicePresenceUpdate | null) => void | Promise<void>;
};

type ConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";

type MicrophonePlan = {
  canPublish: boolean;
  constraints: MediaTrackConstraints;
  warning?: string;
};

type VoiceMonitor = {
  stream: MediaStream;
  audioContext: AudioContext;
  animationFrame: number;
};

const VOICE_ACTIVATION_HOLD_MS = 650;
const STANDARD_ANALYSIS_INTERVAL_MS = 32;
const PERFORMANCE_ANALYSIS_INTERVAL_MS = 82;
const STANDARD_LEVEL_UI_INTERVAL_MS = 90;
const PERFORMANCE_LEVEL_UI_INTERVAL_MS = 240;
const STANDARD_LEVEL_DELTA = 2;
const PERFORMANCE_LEVEL_DELTA = 6;

const VOICE_REMOTE_VOLUME_STORAGE_KEY = "voiceclub_remote_participant_volumes_v1";
const DEFAULT_REMOTE_VOLUME = 100;
const MAX_REMOTE_VOLUME = 100;

type RemoteParticipantVolumes = Record<string, number>;

function clampRemoteVolume(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_REMOTE_VOLUME;
  return Math.min(MAX_REMOTE_VOLUME, Math.max(0, Math.round(value)));
}

function loadRemoteParticipantVolumes(): RemoteParticipantVolumes {
  try {
    const raw = localStorage.getItem(VOICE_REMOTE_VOLUME_STORAGE_KEY);

    if (!raw) return {};

    const parsed = JSON.parse(raw) as RemoteParticipantVolumes;
    const clean: RemoteParticipantVolumes = {};

    Object.entries(parsed).forEach(([identity, value]) => {
      if (typeof identity === "string" && typeof value === "number") {
        clean[identity] = clampRemoteVolume(value);
      }
    });

    return clean;
  } catch {
    return {};
  }
}

function saveRemoteParticipantVolumes(volumes: RemoteParticipantVolumes) {
  localStorage.setItem(
    VOICE_REMOTE_VOLUME_STORAGE_KEY,
    JSON.stringify(volumes)
  );
}

function getStoredRemoteVolume(
  volumes: RemoteParticipantVolumes,
  participantIdentity: string
): number {
  return clampRemoteVolume(
    volumes[participantIdentity] ?? DEFAULT_REMOTE_VOLUME
  );
}

function getInitials(name: string): string {
  return name.slice(0, 1).toUpperCase();
}

function getReadableKey(code: string): string {
  if (!code) return "Not set";

  return code
    .replace("Key", "")
    .replace("Digit", "")
    .replace("Arrow", "Arrow ")
    .replace("Space", "Spacebar");
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;

  const tag = target.tagName.toLowerCase();

  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    target.isContentEditable
  );
}

function LocalAvatar({
  name,
  avatarUrl
}: {
  name: string;
  avatarUrl: string | null;
}) {
  if (avatarUrl) {
    return (
      <div className="voice-live-avatar">
        <img src={avatarUrl} alt={name} />
      </div>
    );
  }

  return <div className="voice-live-avatar">{getInitials(name)}</div>;
}

function getMicrophoneFriendlyMessage(error: unknown): string {
  const rawMessage =
    error instanceof Error ? error.message : "Microphone is not available.";
  const lowerMessage = rawMessage.toLowerCase();

  if (
    lowerMessage.includes("requested device not found") ||
    lowerMessage.includes("device not found") ||
    lowerMessage.includes("notfound") ||
    lowerMessage.includes("not found")
  ) {
    return "No usable microphone was found. You joined this voice room in listen-only mode.";
  }

  if (
    lowerMessage.includes("permission") ||
    lowerMessage.includes("denied") ||
    lowerMessage.includes("notallowed") ||
    lowerMessage.includes("not allowed")
  ) {
    return "Microphone permission is blocked. You joined this voice room in listen-only mode.";
  }

  if (
    lowerMessage.includes("notreadable") ||
    lowerMessage.includes("could not start") ||
    lowerMessage.includes("failed to allocate")
  ) {
    return "Your microphone could not be started. Another app may be using it, so you joined listen-only.";
  }

  return `${rawMessage}. You stayed connected in listen-only mode.`;
}

async function applyOutputDevice(
  audioElement: HTMLAudioElement,
  preferences: AudioPreferences
) {
  if (preferences.outputDeviceId === "default") return;

  const elementWithSink = audioElement as HTMLAudioElement & {
    setSinkId?: (sinkId: string) => Promise<void>;
  };

  if (!elementWithSink.setSinkId) return;

  try {
    await elementWithSink.setSinkId(preferences.outputDeviceId);
  } catch (error) {
    console.warn("Could not apply output device:", error);
  }
}

async function buildMicrophonePlan(
  preferences: AudioPreferences
): Promise<MicrophonePlan> {
  const defaultPreferences = {
    ...preferences,
    inputDeviceId: "default"
  };

  if (!navigator.mediaDevices?.enumerateDevices) {
    return {
      canPublish: true,
      constraints: buildAudioCaptureOptions(preferences)
    };
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter((device) => device.kind === "audioinput");

    if (audioInputs.length === 0) {
      return {
        canPublish: false,
        constraints: buildAudioCaptureOptions(defaultPreferences),
        warning:
          "No microphone was detected on this computer. You joined this voice room in listen-only mode."
      };
    }

    if (
      preferences.inputDeviceId !== "default" &&
      !audioInputs.some((device) => device.deviceId === preferences.inputDeviceId)
    ) {
      return {
        canPublish: true,
        constraints: buildAudioCaptureOptions(defaultPreferences),
        warning:
          "Your saved microphone was not found. VoiceClub is using the default microphone instead."
      };
    }

    return {
      canPublish: true,
      constraints: buildAudioCaptureOptions(preferences)
    };
  } catch {
    return {
      canPublish: true,
      constraints: buildAudioCaptureOptions(preferences)
    };
  }
}

export default function VoiceRoom({
  teamId,
  channel,
  currentUserId,
  currentUsername,
  currentAvatarUrl,
  muted,
  deafened,
  performanceMode = true,
  onMutedChange,
  onPresenceChange
}: VoiceRoomProps) {
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [voiceWarning, setVoiceWarning] = useState("");
  const [microphoneAvailable, setMicrophoneAvailable] = useState(true);
  const [connectedChannelId, setConnectedChannelId] = useState<string | null>(
    null
  );
  const [connectedChannelName, setConnectedChannelName] = useState<string | null>(
    null
  );
  const [participants, setParticipants] = useState<VoiceParticipant[]>([]);
  const [audioPreferences, setAudioPreferences] =
    useState<AudioPreferences>(loadAudioPreferences);
  const [voiceInputLevel, setVoiceInputLevel] = useState(0);
  const [localTransmitting, setLocalTransmitting] = useState(false);
  const [pushToTalkPressed, setPushToTalkPressed] = useState(false);
  const [participantVolumes, setParticipantVolumes] =
    useState<RemoteParticipantVolumes>(loadRemoteParticipantVolumes);

  const roomRef = useRef<Room | null>(null);
  const remoteAudioContainerRef = useRef<HTMLDivElement | null>(null);
  const remoteAudioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const lastPresencePayloadRef = useRef<string | null>(null);
  const connectionAttemptRef = useRef(0);
  const leavingRef = useRef(false);
  const preferencesRef = useRef(audioPreferences);
  const mutedRef = useRef(muted);
  const microphoneAvailableRef = useRef(microphoneAvailable);
  const transmittingRef = useRef(false);
  const transmitActionRef = useRef<Promise<boolean> | null>(null);
  const monitorRef = useRef<VoiceMonitor | null>(null);
  const silenceStartedAtRef = useRef<number | null>(null);
  const pushToTalkPressedRef = useRef(false);
  const participantVolumesRef = useRef(participantVolumes);
  const performanceModeRef = useRef(performanceMode);
  const lastAnalyzerRunAtRef = useRef(0);
  const lastLevelUiUpdateAtRef = useRef(0);
  const lastVoiceInputLevelRef = useRef(0);

  const isConnected = connectionState === "connected";
  const isConnecting = connectionState === "connecting";
  const isReconnecting = connectionState === "reconnecting";
  const selectedChannelIsConnected =
    isConnected && channel?.id && connectedChannelId === channel.id;
  const selectedChannelDiffers =
    isConnected && Boolean(channel?.id) && connectedChannelId !== channel?.id;
  const currentConnectionLabel = connectedChannelName ?? "Voice room";
  const isPushToTalk = audioPreferences.voiceMode === "push-to-talk";
  const isVoiceActivation = audioPreferences.voiceMode === "voice-activation";

  const localParticipantState = useMemo(() => {
    return participants.find((participant) => participant.isLocal) ?? null;
  }, [participants]);

  const statusLabel = useMemo(() => {
    if (isConnecting) return "Connecting";
    if (isReconnecting) return "Reconnecting";
    if (isConnected && !microphoneAvailable) return "Listen-only";
    if (isConnected && muted) return "Muted";
    if (isConnected && localTransmitting) return "Transmitting";
    if (isConnected && isPushToTalk) return "PTT Ready";
    if (isConnected && isVoiceActivation) return "Voice Ready";
    if (isConnected) return "Connected";
    if (connectionState === "error") return "Error";
    return "Ready";
  }, [
    connectionState,
    isConnecting,
    isReconnecting,
    isConnected,
    microphoneAvailable,
    muted,
    localTransmitting,
    isPushToTalk,
    isVoiceActivation
  ]);

  const micModeLabel = useMemo(() => {
    if (!isConnected && !isReconnecting) return "Not connected";
    if (!microphoneAvailable) return "Listen-only";
    if (muted) return "Muted override";
    if (isPushToTalk) {
      return pushToTalkPressed
        ? "Push-to-talk transmitting"
        : `Hold ${getReadableKey(audioPreferences.pushToTalkKey)} to talk`;
    }

    if (isVoiceActivation) {
      return localTransmitting
        ? "Voice detected — transmitting"
        : "Voice activation listening";
    }

    return localTransmitting ? "Transmitting" : "Mic ready";
  }, [
    audioPreferences.pushToTalkKey,
    isConnected,
    isReconnecting,
    isPushToTalk,
    isVoiceActivation,
    localTransmitting,
    microphoneAvailable,
    muted,
    pushToTalkPressed
  ]);

  const voicePanelClassName = useMemo(() => {
    return performanceMode
      ? "voice-live-panel performance-mode"
      : "voice-live-panel standard-mode";
  }, [performanceMode]);

  useEffect(() => {
    performanceModeRef.current = performanceMode;
  }, [performanceMode]);

  useEffect(() => {
    preferencesRef.current = audioPreferences;
  }, [audioPreferences]);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    microphoneAvailableRef.current = microphoneAvailable;
  }, [microphoneAvailable]);

  useEffect(() => {
    participantVolumesRef.current = participantVolumes;
  }, [participantVolumes]);

  function getRoomParticipants(room: Room): VoiceParticipant[] {
    const allParticipants = [
      room.localParticipant,
      ...Array.from(room.remoteParticipants.values())
    ];

    return allParticipants.map((participant) => {
      const micPublication = participant.getTrackPublication(
        Track.Source.Microphone
      );

      const isLocal = participant.identity === currentUserId;

      return {
        identity: participant.identity,
        name:
          participant.name ||
          (isLocal ? currentUsername : `User ${participant.identity.slice(0, 6)}`),
        isLocal,
        isSpeaking: participant.isSpeaking,
        isMuted: isLocal
          ? muted || !microphoneAvailable || !transmittingRef.current
          : micPublication?.isMuted ?? true
      };
    });
  }

  function refreshParticipants(room = roomRef.current) {
    if (!room) {
      setParticipants([]);
      return;
    }

    setParticipants(getRoomParticipants(room));
  }

  function applyRemoteParticipantVolume(
    participantIdentity: string,
    volume: number
  ) {
    const normalizedVolume = clampRemoteVolume(volume) / 100;

    remoteAudioElementsRef.current.forEach((element, key) => {
      if (key.startsWith(`${participantIdentity}:`)) {
        element.volume = Math.min(1, normalizedVolume);
      }
    });
  }

  function updateParticipantVolume(participantIdentity: string, value: number) {
    const normalizedVolume = clampRemoteVolume(value);

    setParticipantVolumes((currentVolumes) => {
      const nextVolumes = {
        ...currentVolumes,
        [participantIdentity]: normalizedVolume
      };

      participantVolumesRef.current = nextVolumes;
      saveRemoteParticipantVolumes(nextVolumes);
      return nextVolumes;
    });

    applyRemoteParticipantVolume(participantIdentity, normalizedVolume);
  }

  function resetParticipantVolume(participantIdentity: string) {
    setParticipantVolumes((currentVolumes) => {
      const nextVolumes = { ...currentVolumes };
      delete nextVolumes[participantIdentity];

      participantVolumesRef.current = nextVolumes;
      saveRemoteParticipantVolumes(nextVolumes);
      return nextVolumes;
    });

    applyRemoteParticipantVolume(participantIdentity, DEFAULT_REMOTE_VOLUME);
  }

  async function attachRemoteAudioTrack(
    track: RemoteTrack,
    participant: RemoteParticipant
  ) {
    if (track.kind !== Track.Kind.Audio) return;

    const audioTrack = track as RemoteAudioTrack;
    const element = audioTrack.attach() as HTMLAudioElement;
    const key = `${participant.identity}:${track.sid}`;

    element.autoplay = true;
    element.muted = deafened;
    element.dataset.voiceclubAudioKey = key;

    await applyOutputDevice(element, audioPreferences);

    element.volume = Math.min(
      1,
      getStoredRemoteVolume(
        participantVolumesRef.current,
        participant.identity
      ) / 100
    );

    remoteAudioElementsRef.current.set(key, element);
    remoteAudioContainerRef.current?.appendChild(element);
  }

  function detachRemoteAudioTrack(track: RemoteTrack, participant?: RemoteParticipant) {
    if (track.kind !== Track.Kind.Audio) return;

    track.detach().forEach((element) => element.remove());

    if (participant) {
      Array.from(remoteAudioElementsRef.current.keys()).forEach((key) => {
        if (key.startsWith(`${participant.identity}:`)) {
          remoteAudioElementsRef.current.delete(key);
        }
      });
    }
  }

  function clearRemoteAudioElements() {
    remoteAudioElementsRef.current.forEach((element) => element.remove());
    remoteAudioElementsRef.current.clear();
  }

  function emitPresenceChange(presence: LocalVoicePresenceUpdate | null) {
    if (!onPresenceChange) return;

    const nextPayload = JSON.stringify(presence);

    if (lastPresencePayloadRef.current === nextPayload) {
      return;
    }

    lastPresencePayloadRef.current = nextPayload;
    void onPresenceChange(presence);
  }

  function forceClearPresence() {
    lastPresencePayloadRef.current = null;
    emitPresenceChange(null);
  }

  function setTransmittingState(value: boolean) {
    transmittingRef.current = value;
    setLocalTransmitting(value);
  }

  function stopVoiceMonitor() {
    const monitor = monitorRef.current;

    if (!monitor) return;

    cancelAnimationFrame(monitor.animationFrame);
    monitor.stream.getTracks().forEach((track) => track.stop());
    monitor.audioContext.close().catch(() => undefined);
    monitorRef.current = null;
    silenceStartedAtRef.current = null;
    lastAnalyzerRunAtRef.current = 0;
    lastLevelUiUpdateAtRef.current = 0;
    lastVoiceInputLevelRef.current = 0;
    setVoiceInputLevel(0);
  }

  function resetVoiceState() {
    stopVoiceMonitor();
    clearRemoteAudioElements();
    setParticipants([]);
    setConnectedChannelId(null);
    setConnectedChannelName(null);
    setConnectionState("idle");
    setErrorMessage("");
    setVoiceWarning("");
    setMicrophoneAvailable(true);
    setPushToTalkPressed(false);
    pushToTalkPressedRef.current = false;
    setTransmittingState(false);
  }

  async function disconnectCurrentRoom(options?: { keepMessages?: boolean }) {
    const room = roomRef.current;

    stopVoiceMonitor();
    setPushToTalkPressed(false);
    pushToTalkPressedRef.current = false;
    setTransmittingState(false);

    if (!room) {
      if (!options?.keepMessages) {
        resetVoiceState();
      }
      forceClearPresence();
      return;
    }

    roomRef.current = null;
    forceClearPresence();

    try {
      await room.localParticipant.setMicrophoneEnabled(false);
    } catch {
      // Ignore. We are already disconnecting.
    }

    try {
      await room.disconnect();
    } catch (error) {
      console.warn("Could not disconnect LiveKit room:", error);
    }

    if (!options?.keepMessages) {
      resetVoiceState();
    } else {
      clearRemoteAudioElements();
      setParticipants([]);
      setConnectedChannelId(null);
      setConnectedChannelName(null);
    }
  }

  async function disableLocalMicrophone(room = roomRef.current) {
    if (!room) return;

    try {
      await room.localParticipant.setMicrophoneEnabled(false);
    } catch (error) {
      console.warn("Could not disable microphone:", error);
    }

    setTransmittingState(false);
    refreshParticipants(room);
  }

  async function enableLocalMicrophoneSafely(room = roomRef.current) {
    if (!room) return false;

    const plan = await buildMicrophonePlan(preferencesRef.current);

    if (!plan.canPublish) {
      await disableLocalMicrophone(room);
      setMicrophoneAvailable(false);
      setVoiceWarning(plan.warning ?? "No microphone detected. Listen-only mode is active.");

      if (!mutedRef.current) {
        onMutedChange(true);
      }

      refreshParticipants(room);
      return false;
    }

    try {
      await room.localParticipant.setMicrophoneEnabled(true, plan.constraints);
      setMicrophoneAvailable(true);
      setVoiceWarning(plan.warning ?? "");
      setTransmittingState(true);
      refreshParticipants(room);
      return true;
    } catch (error) {
      await disableLocalMicrophone(room);
      setMicrophoneAvailable(false);
      setVoiceWarning(getMicrophoneFriendlyMessage(error));

      if (!mutedRef.current) {
        onMutedChange(true);
      }

      refreshParticipants(room);
      return false;
    }
  }

  async function setTransmitEnabled(enabled: boolean, room = roomRef.current) {
    if (!room) return false;

    if (!enabled || mutedRef.current || !microphoneAvailableRef.current) {
      await disableLocalMicrophone(room);
      return false;
    }

    if (transmittingRef.current) {
      return true;
    }

    if (transmitActionRef.current) {
      return transmitActionRef.current;
    }

    transmitActionRef.current = enableLocalMicrophoneSafely(room).finally(() => {
      transmitActionRef.current = null;
    });

    return transmitActionRef.current;
  }

  async function initializeVoiceBehavior(room = roomRef.current) {
    if (!room) return;

    stopVoiceMonitor();
    setPushToTalkPressed(false);
    pushToTalkPressedRef.current = false;
    await disableLocalMicrophone(room);

    const plan = await buildMicrophonePlan(preferencesRef.current);

    if (!plan.canPublish) {
      setMicrophoneAvailable(false);
      setVoiceWarning(plan.warning ?? "No microphone detected. Listen-only mode is active.");

      if (!mutedRef.current) {
        onMutedChange(true);
      }

      refreshParticipants(room);
      return;
    }

    setMicrophoneAvailable(true);
    setVoiceWarning(plan.warning ?? "");

    if (mutedRef.current) {
      return;
    }

    if (preferencesRef.current.voiceMode === "voice-activation") {
      await startVoiceActivationMonitor(room);
    }
  }

  async function startVoiceActivationMonitor(room = roomRef.current) {
    if (!room || mutedRef.current) return;

    stopVoiceMonitor();

    const plan = await buildMicrophonePlan(preferencesRef.current);

    if (!plan.canPublish) {
      await disableLocalMicrophone(room);
      setMicrophoneAvailable(false);
      setVoiceWarning(plan.warning ?? "No microphone detected. Listen-only mode is active.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: plan.constraints
      });

      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;

      if (!AudioContextClass) {
        stream.getTracks().forEach((track) => track.stop());
        setVoiceWarning("Voice activation is not supported in this browser. Use Push-to-Talk instead.");
        return;
      }

      const audioContext = new AudioContextClass();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);

      analyser.fftSize = performanceModeRef.current ? 256 : 512;
      const dataArray = new Uint8Array(analyser.fftSize);
      source.connect(analyser);

      const analyze = () => {
        if (roomRef.current !== room || preferencesRef.current.voiceMode !== "voice-activation") {
          return;
        }

        const now = Date.now();
        const analysisInterval = performanceModeRef.current
          ? PERFORMANCE_ANALYSIS_INTERVAL_MS
          : STANDARD_ANALYSIS_INTERVAL_MS;

        if (now - lastAnalyzerRunAtRef.current < analysisInterval) {
          const frame = requestAnimationFrame(analyze);

          if (monitorRef.current) {
            monitorRef.current.animationFrame = frame;
          }

          return;
        }

        lastAnalyzerRunAtRef.current = now;

        analyser.getByteTimeDomainData(dataArray);

        let sum = 0;

        for (const value of dataArray) {
          const normalized = (value - 128) / 128;
          sum += normalized * normalized;
        }

        const rms = Math.sqrt(sum / dataArray.length);
        const rawLevel = Math.min(100, Math.round(rms * 220));
        const gainMultiplier = Math.max(0.2, preferencesRef.current.inputGain / 100);
        const level = Math.min(100, Math.round(rawLevel * gainMultiplier));
        const threshold = preferencesRef.current.voiceActivationThreshold;
        const levelDelta = performanceModeRef.current
          ? PERFORMANCE_LEVEL_DELTA
          : STANDARD_LEVEL_DELTA;
        const levelUiInterval = performanceModeRef.current
          ? PERFORMANCE_LEVEL_UI_INTERVAL_MS
          : STANDARD_LEVEL_UI_INTERVAL_MS;
        const shouldUpdateLevelUi =
          Math.abs(level - lastVoiceInputLevelRef.current) >= levelDelta ||
          now - lastLevelUiUpdateAtRef.current >= levelUiInterval;

        if (shouldUpdateLevelUi) {
          lastVoiceInputLevelRef.current = level;
          lastLevelUiUpdateAtRef.current = now;
          setVoiceInputLevel(level);
        }

        if (!mutedRef.current && level >= threshold) {
          silenceStartedAtRef.current = null;

          if (!transmittingRef.current) {
            void setTransmitEnabled(true, room);
          }
        } else if (transmittingRef.current) {
          if (!silenceStartedAtRef.current) {
            silenceStartedAtRef.current = now;
          }

          if (now - silenceStartedAtRef.current >= VOICE_ACTIVATION_HOLD_MS) {
            void setTransmitEnabled(false, room);
            silenceStartedAtRef.current = null;
          }
        }

        const frame = requestAnimationFrame(analyze);

        if (monitorRef.current) {
          monitorRef.current.animationFrame = frame;
        }
      };

      const firstFrame = requestAnimationFrame(analyze);

      monitorRef.current = {
        stream,
        audioContext,
        animationFrame: firstFrame
      };

      setMicrophoneAvailable(true);
      setVoiceWarning(plan.warning ?? "");
    } catch (error) {
      await disableLocalMicrophone(room);
      setMicrophoneAvailable(false);
      setVoiceWarning(getMicrophoneFriendlyMessage(error));

      if (!mutedRef.current) {
        onMutedChange(true);
      }
    }
  }

  async function retryMicrophone() {
    setVoiceWarning("");
    setErrorMessage("");

    if (muted) {
      onMutedChange(false);
    }

    await initializeVoiceBehavior(roomRef.current);
  }

  async function joinVoice() {
    if (!channel || isConnecting || isReconnecting) return;

    const connectionAttempt = connectionAttemptRef.current + 1;
    connectionAttemptRef.current = connectionAttempt;
    leavingRef.current = false;

    setConnectionState("connecting");
    setErrorMessage("");
    setVoiceWarning("");

    try {
      if (roomRef.current) {
        await disconnectCurrentRoom({ keepMessages: true });
      }

      if (connectionAttemptRef.current !== connectionAttempt || leavingRef.current) {
        return;
      }

      const { data, error } =
        await supabase.functions.invoke<LiveKitTokenResponse>("livekit-token", {
          body: {
            teamId,
            channelId: channel.id
          }
        });

      if (connectionAttemptRef.current !== connectionAttempt || leavingRef.current) {
        return;
      }

      if (error) {
        throw new Error(error.message);
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      if (!data?.url || !data.token) {
        throw new Error("LiveKit token response was incomplete.");
      }

      const nextConnectedChannel = channel;
      const room = new Room({
        adaptiveStream: false,
        dynacast: false
      });

      room
        .on(RoomEvent.ParticipantConnected, () => {
          if (roomRef.current === room) refreshParticipants(room);
        })
        .on(RoomEvent.ParticipantDisconnected, () => {
          if (roomRef.current === room) refreshParticipants(room);
        })
        .on(RoomEvent.ActiveSpeakersChanged, () => {
          if (roomRef.current === room) refreshParticipants(room);
        })
        .on(RoomEvent.TrackMuted, () => {
          if (roomRef.current === room) refreshParticipants(room);
        })
        .on(RoomEvent.TrackUnmuted, () => {
          if (roomRef.current === room) refreshParticipants(room);
        })
        .on(RoomEvent.Reconnecting, () => {
          if (roomRef.current === room) {
            setConnectionState("reconnecting");
          }
        })
        .on(RoomEvent.Reconnected, () => {
          if (roomRef.current === room) {
            setConnectionState("connected");
            void initializeVoiceBehavior(room);
            refreshParticipants(room);
          }
        })
        .on(
          RoomEvent.TrackSubscribed,
          (track, _publication: RemoteTrackPublication, participant) => {
            if (roomRef.current !== room) return;
            attachRemoteAudioTrack(track, participant);
            refreshParticipants(room);
          }
        )
        .on(
          RoomEvent.TrackUnsubscribed,
          (track, _publication: RemoteTrackPublication, participant) => {
            if (roomRef.current !== room) return;
            detachRemoteAudioTrack(track, participant);
            refreshParticipants(room);
          }
        )
        .on(RoomEvent.Disconnected, () => {
          if (roomRef.current !== room) return;

          roomRef.current = null;
          resetVoiceState();
          forceClearPresence();
        });

      await room.connect(data.url, data.token);

      if (connectionAttemptRef.current !== connectionAttempt || leavingRef.current) {
        await room.disconnect();
        return;
      }

      roomRef.current = room;
      setConnectedChannelId(nextConnectedChannel.id);
      setConnectedChannelName(nextConnectedChannel.name);
      setConnectionState("connected");

      await initializeVoiceBehavior(room);
      refreshParticipants(room);
    } catch (error) {
      if (connectionAttemptRef.current !== connectionAttempt) return;

      const message =
        error instanceof Error ? error.message : "Could not join voice room.";
      setErrorMessage(message);
      setConnectionState("error");
      setConnectedChannelId(null);
      setConnectedChannelName(null);
      forceClearPresence();
    }
  }

  async function leaveVoice() {
    leavingRef.current = true;
    connectionAttemptRef.current += 1;
    await disconnectCurrentRoom();
  }

  useEffect(() => {
    async function applyModeChange() {
      if (connectionState !== "connected") return;
      await initializeVoiceBehavior(roomRef.current);
    }

    void applyModeChange();
  }, [muted, audioPreferences.voiceMode, audioPreferences.inputDeviceId, audioPreferences.noiseSuppression, audioPreferences.echoCancellation, audioPreferences.autoGainControl]);

  useEffect(() => {
    if (!isConnected || !isPushToTalk || muted || !microphoneAvailable) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.code !== preferencesRef.current.pushToTalkKey) return;
      if (event.repeat) return;
      if (isTypingTarget(event.target)) return;

      event.preventDefault();
      pushToTalkPressedRef.current = true;
      setPushToTalkPressed(true);
      void setTransmitEnabled(true, roomRef.current);
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (event.code !== preferencesRef.current.pushToTalkKey) return;

      event.preventDefault();
      pushToTalkPressedRef.current = false;
      setPushToTalkPressed(false);
      void setTransmitEnabled(false, roomRef.current);
    }

    function handleWindowBlur() {
      pushToTalkPressedRef.current = false;
      setPushToTalkPressed(false);
      void setTransmitEnabled(false, roomRef.current);
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleWindowBlur);
      pushToTalkPressedRef.current = false;
      setPushToTalkPressed(false);
      void setTransmitEnabled(false, roomRef.current);
    };
  }, [isConnected, isPushToTalk, muted, microphoneAvailable, audioPreferences.pushToTalkKey]);

  useEffect(() => {
    remoteAudioElementsRef.current.forEach((element) => {
      element.muted = deafened;
    });
  }, [deafened]);

  useEffect(() => {
    async function applySavedOutputDevice() {
      await Promise.all(
        Array.from(remoteAudioElementsRef.current.values()).map((element) =>
          applyOutputDevice(element, audioPreferences)
        )
      );
    }

    applySavedOutputDevice();
  }, [audioPreferences]);

  useEffect(() => {
    remoteAudioElementsRef.current.forEach((element, key) => {
      const participantIdentity = key.split(":")[0];
      const volume = getStoredRemoteVolume(
        participantVolumes,
        participantIdentity
      );

      element.volume = Math.min(1, volume / 100);
    });
  }, [participantVolumes]);

  useEffect(() => {
    function handleAudioSettingsUpdated() {
      setAudioPreferences(loadAudioPreferences());
    }

    window.addEventListener(
      "voiceclub:audio-settings-updated",
      handleAudioSettingsUpdated
    );

    return () => {
      window.removeEventListener(
        "voiceclub:audio-settings-updated",
        handleAudioSettingsUpdated
      );
    };
  }, []);

  useEffect(() => {
    if (!navigator.mediaDevices?.addEventListener) return;

    function handleDeviceChange() {
      setAudioPreferences(loadAudioPreferences());

      if (roomRef.current && connectionState === "connected") {
        void initializeVoiceBehavior(roomRef.current);
      }
    }

    navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);

    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", handleDeviceChange);
    };
  }, [connectionState, audioPreferences]);

  useEffect(() => {
    if (!channel && roomRef.current) {
      void leaveVoice();
    }
  }, [channel?.id]);

  useEffect(() => {
    return () => {
      connectionAttemptRef.current += 1;
      const room = roomRef.current;
      roomRef.current = null;
      forceClearPresence();
      stopVoiceMonitor();
      clearRemoteAudioElements();
      setTransmittingState(false);

      if (room) {
        try {
          void room.localParticipant.setMicrophoneEnabled(false);
        } catch {
          // Ignore cleanup errors.
        }

        void room.disconnect();
      }
    };
  }, []);

  useEffect(() => {
    const hasLiveConnection =
      (connectionState === "connected" || connectionState === "reconnecting") &&
      Boolean(connectedChannelId);

    if (!hasLiveConnection || !connectedChannelId) {
      emitPresenceChange(null);
      return;
    }

    emitPresenceChange({
      voiceChannelId: connectedChannelId,
      muted: muted || !microphoneAvailable || !localTransmitting,
      deafened,
      speaking:
        connectionState === "connected"
          ? localTransmitting && (localParticipantState?.isSpeaking ?? false)
          : false,
      listenOnly: !microphoneAvailable,
      connected: true
    });
  }, [
    connectedChannelId,
    connectionState,
    deafened,
    localParticipantState?.isSpeaking,
    localTransmitting,
    microphoneAvailable,
    muted
  ]);

  return (
    <div className={voicePanelClassName}>
      <div className="panel-header">
        <div>
          <h3>{channel?.name ?? "Voice Room"}</h3>
        </div>

        <div
          className={
            connectionState === "error"
              ? "quality-pill voice-status-pill error"
              : isReconnecting
                ? "quality-pill voice-status-pill reconnecting"
                : localTransmitting
                  ? "quality-pill voice-status-pill transmitting"
                  : "quality-pill voice-status-pill"
          }
        >
          <Activity size={16} />
          <span>{statusLabel}</span>
        </div>
      </div>

      {(isConnected || isReconnecting) && (
        <div
          className={
            selectedChannelDiffers
              ? "voice-room-context-card switching"
              : "voice-room-context-card"
          }
        >
          <div>
            <span>Connected room</span>
            <strong>{currentConnectionLabel}</strong>
          </div>

          {selectedChannelDiffers && (
            <div>
              <span>Selected room</span>
              <strong>{channel?.name ?? "Voice room"}</strong>
            </div>
          )}
        </div>
      )}

      <div className="voice-live-actions">
        <button
          type="button"
          className="voice-join-button"
          onClick={joinVoice}
          disabled={!channel || isConnecting || isReconnecting}
        >
          {isConnecting || isReconnecting ? <Loader2 size={16} /> : <LogIn size={16} />}
          {isConnecting
            ? "Connecting..."
            : isReconnecting
              ? "Reconnecting..."
              : isConnected
                ? selectedChannelIsConnected
                  ? "Reconnect"
                  : `Switch to ${channel?.name ?? "Room"}`
                : connectionState === "error"
                  ? "Retry Join"
                  : "Join Voice"}
        </button>

        <button
          type="button"
          className="voice-leave-button"
          onClick={() => void leaveVoice()}
          disabled={!isConnected && !isConnecting && !isReconnecting}
        >
          <LogOut size={16} />
          Leave Voice
        </button>
      </div>

      {errorMessage && (
        <div className="voice-live-error">
          <AlertTriangle size={15} />
          <span>{errorMessage}</span>
        </div>
      )}

      {voiceWarning && (
        <div className="voice-live-warning">
          <AlertTriangle size={15} />
          <span>{voiceWarning}</span>
          {isConnected && (
            <button type="button" onClick={retryMicrophone}>
              <RefreshCw size={14} />
              Retry Mic
            </button>
          )}
        </div>
      )}


      {(isConnected || isReconnecting) && microphoneAvailable && (
        <div
          className={
            localTransmitting
              ? "voice-transmission-card transmitting"
              : "voice-transmission-card"
          }
        >
          <div className="voice-transmission-info">
            {isPushToTalk ? <Keyboard size={16} /> : <Zap size={16} />}
            <div>
              <strong>{isPushToTalk ? "Push-to-Talk" : "Voice Activation"}</strong>
              <span>{micModeLabel}</span>
            </div>
          </div>

          {isVoiceActivation && (
            <div className="voice-transmission-meter">
              <div className="voice-transmission-meter-top">
                <span>Input</span>
                <strong>{voiceInputLevel}%</strong>
              </div>
              <div className="voice-transmission-track">
                <div
                  className="voice-transmission-fill"
                  style={{ width: `${voiceInputLevel}%` }}
                />
                <span
                  className="voice-threshold-marker"
                  style={{ left: `${audioPreferences.voiceActivationThreshold}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="voice-live-grid">
        {isConnected || isReconnecting ? (
          participants.map((participant) => (
            <div
              key={participant.identity}
              className={
                participant.isSpeaking
                  ? "voice-live-card speaking"
                  : "voice-live-card"
              }
            >
              <div className="voice-live-card-top">
                {participant.isLocal ? (
                  <LocalAvatar
                    name={currentUsername}
                    avatarUrl={currentAvatarUrl}
                  />
                ) : (
                  <div className="voice-live-avatar">
                    {getInitials(participant.name)}
                  </div>
                )}

                <span
                  className={
                    participant.isSpeaking
                      ? "status-dot speaking"
                      : "status-dot online"
                  }
                />
              </div>

              <strong>{participant.name}</strong>
              <span>
                {participant.isLocal ? "You" : "Teammate"}
                {participant.isMuted ? " · Mic closed" : " · Transmitting"}
              </span>

              <div className="audio-meter">
                <div
                  className={
                    participant.isSpeaking ? "audio-fill speaking" : "audio-fill"
                  }
                />
              </div>

              {!participant.isLocal && (
                <div className="voice-participant-volume">
                  <div className="voice-participant-volume-top">
                    {getStoredRemoteVolume(participantVolumes, participant.identity) === 0 ? (
                      <VolumeX size={13} />
                    ) : (
                      <Volume2 size={13} />
                    )}
                    <span>Volume</span>
                    <strong>
                      {getStoredRemoteVolume(participantVolumes, participant.identity)}%
                    </strong>
                  </div>

                  <div className="voice-participant-volume-row">
                    <input
                      type="range"
                      min="0"
                      max={MAX_REMOTE_VOLUME}
                      step="5"
                      value={getStoredRemoteVolume(
                        participantVolumes,
                        participant.identity
                      )}
                      onChange={(event) =>
                        updateParticipantVolume(
                          participant.identity,
                          Number(event.target.value)
                        )
                      }
                      aria-label={`Volume for ${participant.name}`}
                    />

                    <button
                      type="button"
                      onClick={() => resetParticipantVolume(participant.identity)}
                      disabled={
                        getStoredRemoteVolume(
                          participantVolumes,
                          participant.identity
                        ) === DEFAULT_REMOTE_VOLUME
                      }
                    >
                      Reset
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="voice-live-empty">
            <Radio size={28} />
            <h3>{channel?.name ?? "No voice room selected"}</h3>

          </div>
        )}
      </div>

      <div className="voice-live-footer">
        <button
          type="button"
          className={
            !microphoneAvailable && (isConnected || isReconnecting)
              ? "voice-control danger"
              : muted
                ? "voice-control danger"
                : localTransmitting
                  ? "voice-control active transmitting"
                  : "voice-control active"
          }
          onClick={() => onMutedChange(!muted)}
        >
          {!microphoneAvailable && (isConnected || isReconnecting) ? (
            <MicOff size={15} />
          ) : muted ? (
            <MicOff size={15} />
          ) : (
            <Mic size={15} />
          )}
          {!microphoneAvailable && (isConnected || isReconnecting)
            ? "Listen-only"
            : muted
              ? "Muted"
              : localTransmitting
                ? "Transmitting"
                : isPushToTalk
                  ? "PTT Ready"
                  : "Voice Ready"}
        </button>

        <div className={deafened ? "voice-control danger" : "voice-control active"}>
          <Headphones size={15} />
          {deafened ? "Deafened" : "Audio Active"}
        </div>

        <div className="voice-control passive">
          <Users size={15} />
          {participants.length || 0} connected
        </div>

        <div className={performanceMode ? "voice-control active" : "voice-control passive"}>
          <Zap size={15} />
          {performanceMode ? "Performance" : "Standard"}
        </div>

        <div className="voice-control passive">
          <Volume2 size={15} />
          {audioPreferences.outputDeviceId === "default"
            ? "Default output"
            : "Custom output"}
        </div>
      </div>

      <div ref={remoteAudioContainerRef} className="voice-audio-sink" />
    </div>
  );
}
