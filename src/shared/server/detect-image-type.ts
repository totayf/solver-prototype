/**
 * Media type from the file's magic bytes. Model APIs reject an image whose
 * declared type disagrees with its bytes, so never trust a client-sent type.
 */
export function detectImageType(bytes: Uint8Array): ImageType | null {
  const starts = (...signature: number[]) =>
    signature.every((byte, i) => bytes[i] === byte);

  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (starts(0x89, 0x50, 0x4e, 0x47)) return "image/png";
  // "RIFF" … "WEBP"
  if (
    starts(0x52, 0x49, 0x46, 0x46) &&
    bytes[8] === 0x57 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

export type ImageType = "image/jpeg" | "image/png" | "image/webp";
