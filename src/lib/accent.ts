export function isValidHexColor(value: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(value);
}

export function hexToRgb(hex: string) {
  const clean = hex.replace("#", "");

  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16)
  };
}

export function lightenHex(hex: string, amount = 28): string {
  const { r, g, b } = hexToRgb(hex);

  const nextR = Math.min(255, r + amount);
  const nextG = Math.min(255, g + amount);
  const nextB = Math.min(255, b + amount);

  return `#${nextR.toString(16).padStart(2, "0")}${nextG
    .toString(16)
    .padStart(2, "0")}${nextB.toString(16).padStart(2, "0")}`;
}

export function applyAccentColor(color: string) {
  if (!isValidHexColor(color)) return;

  const { r, g, b } = hexToRgb(color);
  const light = lightenHex(color);

  document.documentElement.style.setProperty("--accent", color);
  document.documentElement.style.setProperty("--accent-light", light);
  document.documentElement.style.setProperty(
    "--accent-soft",
    `rgba(${r}, ${g}, ${b}, 0.12)`
  );
  document.documentElement.style.setProperty(
    "--accent-border",
    `rgba(${r}, ${g}, ${b}, 0.35)`
  );
}