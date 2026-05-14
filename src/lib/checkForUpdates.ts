let hasCheckedForUpdates = false;

function isTauriRuntime() {
  return (
    typeof window !== "undefined" &&
    "__TAURI_INTERNALS__" in window
  );
}

function formatUpdateMessage(version: string, notes?: string | null) {
  const cleanNotes = notes?.trim();

  if (!cleanNotes) {
    return `VoiceClub v${version} is available.

Update now?`;
  }

  return `VoiceClub v${version} is available.

${cleanNotes}

Update now?`;
}

export async function checkForVoiceClubUpdatesOnce() {
  if (hasCheckedForUpdates) return;

  hasCheckedForUpdates = true;

  if (!import.meta.env.PROD || !isTauriRuntime()) {
    return;
  }

  try {
    const [{ check }, { confirm, message }, { relaunch }] = await Promise.all([
      import("@tauri-apps/plugin-updater"),
      import("@tauri-apps/plugin-dialog"),
      import("@tauri-apps/plugin-process")
    ]);

    const update = await check();

    if (!update) {
      return;
    }

    const shouldUpdate = await confirm(
      formatUpdateMessage(update.version, update.body),
      {
        title: "VoiceClub Update",
        kind: "info"
      }
    );

    if (!shouldUpdate) {
      return;
    }

    await update.downloadAndInstall();

    await message("VoiceClub has been updated and will restart now.", {
      title: "VoiceClub Update",
      kind: "info"
    });

    await relaunch();
  } catch (error) {
    console.warn("VoiceClub update check failed:", error);
  }
}
