import {
  Headphones,
  Keyboard,
  Mic,
  RefreshCw,
  Save,
  SlidersHorizontal,
  Volume2,
  Zap
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

type VoiceMode = "voice-activation" | "push-to-talk";

type AudioPreferences = {
  inputDeviceId: string;
  outputDeviceId: string;
  inputGain: number;
  voiceMode: VoiceMode;
  pushToTalkKey: string;
  voiceActivationThreshold: number;
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
};

type AudioSettingsPanelProps = {
  muted: boolean;
  deafened: boolean;
  onMutedChange: (value: boolean) => void;
  onDeafenedChange: (value: boolean) => void;
};

const AUDIO_STORAGE_KEY = "voiceclub_audio_settings_v1";

const defaultAudioPreferences: AudioPreferences = {
  inputDeviceId: "default",
  outputDeviceId: "default",
  inputGain: 100,
  voiceMode: "voice-activation",
  pushToTalkKey: "KeyV",
  voiceActivationThreshold: 35,
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true
};

function loadSavedAudioPreferences(): AudioPreferences {
  try {
    const raw = localStorage.getItem(AUDIO_STORAGE_KEY);

    if (!raw) {
      return defaultAudioPreferences;
    }

    return {
      ...defaultAudioPreferences,
      ...(JSON.parse(raw) as Partial<AudioPreferences>)
    };
  } catch {
    return defaultAudioPreferences;
  }
}

function getReadableKey(code: string): string {
  if (!code) return "Not set";

  return code
    .replace("Key", "")
    .replace("Digit", "")
    .replace("Arrow", "Arrow ");
}

export default function AudioSettingsPanel({
  muted,
  deafened,
  onMutedChange,
  onDeafenedChange
}: AudioSettingsPanelProps) {
  const [preferences, setPreferences] = useState<AudioPreferences>(
    loadSavedAudioPreferences
  );

  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([]);
  const [hasMicPermission, setHasMicPermission] = useState(false);

  const [testingMic, setTestingMic] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [listeningForKey, setListeningForKey] = useState(false);

  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  function updatePreference<K extends keyof AudioPreferences>(
    key: K,
    value: AudioPreferences[K]
  ) {
    setPreferences((current) => ({
      ...current,
      [key]: value
    }));
  }

  async function loadDevices() {
    setErrorMessage("");

    if (!navigator.mediaDevices?.enumerateDevices) {
      setErrorMessage("Audio device detection is not supported in this browser.");
      return;
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();

      setAudioInputs(devices.filter((device) => device.kind === "audioinput"));
      setAudioOutputs(devices.filter((device) => device.kind === "audiooutput"));

      const hasVisibleLabels = devices.some((device) => device.label.length > 0);
      setHasMicPermission(hasVisibleLabels);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not load audio devices.";
      setErrorMessage(message);
    }
  }

  async function requestMicrophonePermission() {
    setErrorMessage("");
    setStatusMessage("");

    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMessage("Microphone access is not supported in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true
      });

      stream.getTracks().forEach((track) => track.stop());

      setHasMicPermission(true);
      setStatusMessage("Microphone permission granted.");
      await loadDevices();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Microphone permission was denied.";
      setErrorMessage(message);
    }
  }

  function stopMicTest() {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    setTestingMic(false);
    setMicLevel(0);
  }

  async function startMicTest() {
    if (testingMic) {
      stopMicTest();
      return;
    }

    setErrorMessage("");
    setStatusMessage("");

    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMessage("Microphone testing is not supported in this browser.");
      return;
    }

    try {
      const audioConstraints: MediaTrackConstraints = {
        noiseSuppression: preferences.noiseSuppression,
        echoCancellation: preferences.echoCancellation,
        autoGainControl: preferences.autoGainControl
      };

      if (preferences.inputDeviceId !== "default") {
        audioConstraints.deviceId = {
          exact: preferences.inputDeviceId
        };
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints
      });

      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;

      if (!AudioContextClass) {
        stream.getTracks().forEach((track) => track.stop());
        setErrorMessage("AudioContext is not supported in this browser.");
        return;
      }

      const audioContext = new AudioContextClass();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);

      analyser.fftSize = 512;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.fftSize);

      streamRef.current = stream;
      audioContextRef.current = audioContext;

      setTestingMic(true);
      setHasMicPermission(true);

      function analyze() {
        analyser.getByteTimeDomainData(dataArray);

        let sum = 0;

        for (const value of dataArray) {
          const normalized = (value - 128) / 128;
          sum += normalized * normalized;
        }

        const rms = Math.sqrt(sum / dataArray.length);
        const level = Math.min(100, Math.round(rms * 220));

        setMicLevel(level);
        animationFrameRef.current = requestAnimationFrame(analyze);
      }

      analyze();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not start microphone test.";
      setErrorMessage(message);
      stopMicTest();
    }
  }

  async function playOutputTest() {
    setErrorMessage("");
    setStatusMessage("");

    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;

      if (!AudioContextClass) {
        setErrorMessage("Audio output test is not supported in this browser.");
        return;
      }

      const audioContext = new AudioContextClass();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();

      oscillator.type = "sine";
      oscillator.frequency.value = 880;

      gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.08, audioContext.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        audioContext.currentTime + 0.22
      );

      oscillator.connect(gain);
      gain.connect(audioContext.destination);

      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.24);

      window.setTimeout(() => {
        audioContext.close();
      }, 350);

      setStatusMessage(
        "Output test played. Selected output will be used by the voice engine where supported."
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not play output test.";
      setErrorMessage(message);
    }
  }

  function saveAudioSettings() {
    localStorage.setItem(AUDIO_STORAGE_KEY, JSON.stringify(preferences));
    window.dispatchEvent(new Event("voiceclub:audio-settings-updated"));
    setStatusMessage("Audio settings saved on this device.");
    setErrorMessage("");
  }

  useEffect(() => {
    loadDevices();

    if (!navigator.mediaDevices?.addEventListener) return;

    navigator.mediaDevices.addEventListener("devicechange", loadDevices);

    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", loadDevices);
    };
  }, []);

  useEffect(() => {
    if (!listeningForKey) return;

    function handleKeyDown(event: KeyboardEvent) {
      event.preventDefault();

      setPreferences((current) => ({
        ...current,
        pushToTalkKey: event.code
      }));

      setListeningForKey(false);
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [listeningForKey]);

  useEffect(() => {
    return () => {
      stopMicTest();
    };
  }, []);

  return (
    <div className="audio-settings-card settings-inner-card">
      <div className="audio-settings-header">
        <div>
          <h3>Audio Settings</h3>
          <p>Prepare microphone and headset settings for real voice rooms.</p>
        </div>

        <SlidersHorizontal size={20} />
      </div>

      <div className="audio-permission-card">
        <div>
          <strong>
            {hasMicPermission ? "Microphone permission ready" : "Microphone access"}
          </strong>
          <span>
            {hasMicPermission
              ? "VoiceClub can read your microphone devices."
              : "Allow microphone access to show real device names and test your mic."}
          </span>
        </div>

        <button type="button" onClick={requestMicrophonePermission}>
          <Mic size={15} />
          {hasMicPermission ? "Re-check" : "Allow Mic"}
        </button>
      </div>

      <div className="audio-device-grid">
        <label>
          <span>
            <Mic size={14} />
            Input device
          </span>

          <select
            value={preferences.inputDeviceId}
            onChange={(event) => {
              stopMicTest();
              updatePreference("inputDeviceId", event.target.value);
            }}
          >
            <option value="default">Default microphone</option>

            {audioInputs.map((device, index) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Microphone ${index + 1}`}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>
            <Headphones size={14} />
            Output device
          </span>

          <select
            value={preferences.outputDeviceId}
            onChange={(event) =>
              updatePreference("outputDeviceId", event.target.value)
            }
          >
            <option value="default">Default output</option>

            {audioOutputs.map((device, index) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Output ${index + 1}`}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="audio-test-row">
        <button
          type="button"
          className={testingMic ? "audio-test-button active" : "audio-test-button"}
          onClick={startMicTest}
        >
          <Mic size={15} />
          {testingMic ? "Stop Mic Test" : "Start Mic Test"}
        </button>

        <button type="button" className="audio-test-button" onClick={playOutputTest}>
          <Volume2 size={15} />
          Test Output
        </button>

        <button type="button" className="audio-refresh-button" onClick={loadDevices}>
          <RefreshCw size={15} />
        </button>
      </div>

      <div className="mic-meter-card">
        <div className="mic-meter-header">
          <strong>Mic Activity</strong>
          <span>{micLevel}%</span>
        </div>

        <div className="mic-meter-track">
          <div className="mic-meter-fill" style={{ width: `${micLevel}%` }} />
        </div>
      </div>

      <div className="audio-mode-card">
        <div className="audio-mode-header">
          <Zap size={15} />
          <strong>Voice Mode</strong>
        </div>

        <div className="audio-mode-tabs">
          <button
            type="button"
            className={
              preferences.voiceMode === "voice-activation" ? "active" : ""
            }
            onClick={() => updatePreference("voiceMode", "voice-activation")}
          >
            Voice Activation
          </button>

          <button
            type="button"
            className={preferences.voiceMode === "push-to-talk" ? "active" : ""}
            onClick={() => updatePreference("voiceMode", "push-to-talk")}
          >
            Push to Talk
          </button>
        </div>

        {preferences.voiceMode === "voice-activation" && (
          <label className="audio-range-label">
            <div>
              <span>Activation threshold</span>
              <strong>{preferences.voiceActivationThreshold}%</strong>
            </div>

            <input
              type="range"
              min={1}
              max={100}
              value={preferences.voiceActivationThreshold}
              onChange={(event) =>
                updatePreference(
                  "voiceActivationThreshold",
                  Number(event.target.value)
                )
              }
            />
          </label>
        )}

        {preferences.voiceMode === "push-to-talk" && (
          <div className="push-to-talk-row">
            <div>
              <span>Push-to-talk key</span>
              <strong>{getReadableKey(preferences.pushToTalkKey)}</strong>
            </div>

            <button
              type="button"
              className={listeningForKey ? "listening" : ""}
              onClick={() => setListeningForKey(true)}
            >
              <Keyboard size={15} />
              {listeningForKey ? "Press any key..." : "Record Key"}
            </button>
          </div>
        )}
      </div>

      <div className="audio-toggle-list">
        <label className="audio-toggle-row">
          <div>
            <strong>Noise suppression</strong>
            <span>Reduce keyboard and background noise.</span>
          </div>

          <input
            type="checkbox"
            checked={preferences.noiseSuppression}
            onChange={(event) =>
              updatePreference("noiseSuppression", event.target.checked)
            }
          />
        </label>

        <label className="audio-toggle-row">
          <div>
            <strong>Echo cancellation</strong>
            <span>Reduce speaker echo picked up by your microphone.</span>
          </div>

          <input
            type="checkbox"
            checked={preferences.echoCancellation}
            onChange={(event) =>
              updatePreference("echoCancellation", event.target.checked)
            }
          />
        </label>

        <label className="audio-toggle-row">
          <div>
            <strong>Automatic gain control</strong>
            <span>Let the system balance microphone volume.</span>
          </div>

          <input
            type="checkbox"
            checked={preferences.autoGainControl}
            onChange={(event) =>
              updatePreference("autoGainControl", event.target.checked)
            }
          />
        </label>
      </div>

      <div className="audio-global-controls">
        <button
          type="button"
          className={muted ? "danger" : "active"}
          onClick={() => onMutedChange(!muted)}
        >
          <Mic size={15} />
          {muted ? "Muted" : "Mic Active"}
        </button>

        <button
          type="button"
          className={deafened ? "danger" : "active"}
          onClick={() => onDeafenedChange(!deafened)}
        >
          <Headphones size={15} />
          {deafened ? "Deafened" : "Audio Active"}
        </button>
      </div>

      {statusMessage && <div className="audio-settings-status">{statusMessage}</div>}
      {errorMessage && <div className="audio-settings-error">{errorMessage}</div>}

      <button type="button" className="audio-settings-save" onClick={saveAudioSettings}>
        <Save size={15} />
        Save Audio Settings
      </button>
    </div>
  );
}