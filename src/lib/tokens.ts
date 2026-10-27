export const colorTokens = {
  brand: "#0284c7",
  brandStrong: "#0369a1",
  teal: "#0d9488",
  scoreLow: "#dc2626",
  scoreModerate: "#d97706",
  scoreHigh: "#0284c7",
  scoreExcellent: "#16a34a",
  mapRiver: "#63c6dd",
  mapBoundary: "#b9c9d5",
  mapProtected: "#68b89d",
  mapTransmission: "#e7af69",
  mapHalo: "rgba(14,165,233,0.18)",
  chart: ["#0284c7", "#0d9488", "#7c3aed", "#d97706", "#dc2626", "#65a30d", "#db2777", "#475569"],
} as const;

export function scoreToken(score: number): string {
  if (score < 45) return colorTokens.scoreLow;
  if (score < 60) return colorTokens.scoreModerate;
  if (score < 75) return colorTokens.scoreHigh;
  return colorTokens.scoreExcellent;
}
