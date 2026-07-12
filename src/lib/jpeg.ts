import { toJpeg } from "html-to-image";

/**
 * Capture a DOM node as a JPEG and trigger a download. Waits for
 * webfonts (Noto Sans + Devanagari/Gujarati) so glyphs don't fall back
 * in the capture.
 */
export async function downloadNodeAsJpeg(
  node: HTMLElement,
  filename: string,
): Promise<void> {
  await document.fonts.ready;
  const dataUrl = await toJpeg(node, {
    quality: 0.95,
    pixelRatio: 2,
    backgroundColor: "#ffffff",
    cacheBust: true,
  });
  const link = document.createElement("a");
  link.download = filename.endsWith(".jpg") ? filename : `${filename}.jpg`;
  link.href = dataUrl;
  link.click();
}

/** Safe filename chunk: strip path/marker chars, collapse spaces. */
export function fileSlug(s: string): string {
  return s.replace(/[\\/:*?"<>|#%]/g, "").replace(/\s+/g, "_") || "download";
}
