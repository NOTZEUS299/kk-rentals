import type { CSSProperties } from "react";

/**
 * Tenant theme tokens -> CSS variables, applied on <html>.
 * Unknown keys are ignored; missing keys fall back to the
 * defaults declared in globals.css.
 */
const TOKEN_TO_VAR: Record<string, string> = {
  primary: "--primary",
  primaryForeground: "--primary-foreground",
  background: "--background",
  foreground: "--foreground",
  card: "--card",
  muted: "--muted",
  border: "--border",
  radius: "--radius",
};

export function themeVars(
  theme: Record<string, string> | null | undefined,
): CSSProperties {
  const style: Record<string, string> = {};
  if (theme) {
    for (const [token, cssVar] of Object.entries(TOKEN_TO_VAR)) {
      const value = theme[token];
      if (typeof value === "string" && value.length > 0) {
        style[cssVar] = value;
      }
    }
  }
  return style as CSSProperties;
}
