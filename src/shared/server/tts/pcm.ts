// Helpers for 16-bit little-endian mono PCM, the format every provider is asked for.

const BYTES_PER_SAMPLE = 2;

export function pcmDurationMs(pcm: Uint8Array, sampleRate: number): number {
  return (pcm.byteLength / BYTES_PER_SAMPLE / sampleRate) * 1000;
}

export function silence(ms: number, sampleRate: number): Uint8Array {
  const samples = Math.round((ms / 1000) * sampleRate);
  return new Uint8Array(samples * BYTES_PER_SAMPLE);
}

export function concatBytes(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

/** Prepends a 44-byte RIFF/WAVE header so players can read the PCM directly. */
export function encodeWav(pcm: Uint8Array, sampleRate: number): Uint8Array {
  const header = new DataView(new ArrayBuffer(44));
  const ascii = (offset: number, text: string) => {
    for (const [i, char] of [...text].entries()) {
      header.setUint8(offset + i, char.charCodeAt(0));
    }
  };

  ascii(0, "RIFF");
  header.setUint32(4, 36 + pcm.byteLength, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  header.setUint32(16, 16, true); // fmt chunk size
  header.setUint16(20, 1, true); // linear PCM
  header.setUint16(22, 1, true); // mono
  header.setUint32(24, sampleRate, true);
  header.setUint32(28, sampleRate * BYTES_PER_SAMPLE, true); // byte rate
  header.setUint16(32, BYTES_PER_SAMPLE, true); // block align
  header.setUint16(34, 16, true); // bits per sample
  ascii(36, "data");
  header.setUint32(40, pcm.byteLength, true);

  return concatBytes([new Uint8Array(header.buffer), pcm]);
}
