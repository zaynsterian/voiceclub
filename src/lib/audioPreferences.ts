export type VoiceMode = "voice-activation" | "push-to-talk";

export type AudioPreferences = {
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

export const AUDIO_STORAGE_KEY = "voiceclub_audio_settings_v1";

export const defaultAudioPreferences: AudioPreferences = {
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

export function loadAudioPreferences(): AudioPreferences {
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

export function saveAudioPreferences(preferences: AudioPreferences) {
  localStorage.setItem(AUDIO_STORAGE_KEY, JSON.stringify(preferences));
  window.dispatchEvent(new Event("voiceclub:audio-settings-updated"));
}

export function buildAudioCaptureOptions(preferences: AudioPreferences) {
  const audioOptions: MediaTrackConstraints = {
    noiseSuppression: preferences.noiseSuppression,
    echoCancellation: preferences.echoCancellation,
    autoGainControl: preferences.autoGainControl
  };

  if (preferences.inputDeviceId !== "default") {
    audioOptions.deviceId = {
      exact: preferences.inputDeviceId
    };
  }

  return audioOptions;
}
