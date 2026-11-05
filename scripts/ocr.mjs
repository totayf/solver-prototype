// Usage: node ocr.mjs questions/turkish.png
// Runs every OCR engine whose key is set (GOOGLE_VISION_API_KEY, MISTRAL_API_KEY),
// prints what each one extracted and writes an overlay viewer to out/<name>.html.
import fs from "fs";
import path from "path";

const imagePath = process.argv[2];
if (!imagePath) {
  console.error("Usage: node ocr.mjs <image>");
  process.exit(1);
}

const name = path.basename(imagePath, path.extname(imagePath));
const mediaType =
  path.extname(imagePath).toLowerCase() === ".png" ? "image/png" : "image/jpeg";
const imageBase64 = fs.readFileSync(imagePath).toString("base64");
const outDir = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  "out",
);
fs.mkdirSync(outDir, { recursive: true });

const results = {};

const engines = {
  google: [process.env.GOOGLE_VISION_API_KEY, runGoogleVision],
  mistral: [process.env.MISTRAL_API_KEY, runMistral],
};
for (const [engine, [key, run]] of Object.entries(engines)) {
  if (!key) continue;
  try {
    results[engine] = await run();
  } catch (error) {
    console.error(`\n=== ${engine} failed ===\n${error.message}`);
  }
}

if (Object.keys(results).length === 0) {
  console.error("Set GOOGLE_VISION_API_KEY and/or MISTRAL_API_KEY.");
  process.exit(1);
}

for (const [engine, result] of Object.entries(results)) {
  fs.writeFileSync(
    path.join(outDir, `${name}.${engine}.json`),
    JSON.stringify(result, null, 2),
  );
}
fs.writeFileSync(path.join(outDir, `${name}.html`), renderOverlay(results));
console.log(`\nOverlay: ${path.join(outDir, `${name}.html`)}`);

// ── Google Vision ───────────────────────────────────────────────

async function runGoogleVision() {
  const start = Date.now();
  const res = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${process.env.GOOGLE_VISION_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            image: { content: imageBase64 },
            features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
            imageContext: { languageHints: ["tr"] },
          },
        ],
      }),
    },
  );
  const json = await res.json();
  const response = json.responses?.[0];
  if (!res.ok || response?.error)
    throw new Error(JSON.stringify(json.error ?? response.error));

  const words = [];
  let line = 0;
  for (const page of response.fullTextAnnotation?.pages ?? []) {
    for (const block of page.blocks) {
      for (const paragraph of block.paragraphs) {
        for (const word of paragraph.words) {
          words.push({
            id: `w${words.length + 1}`,
            text: word.symbols.map((s) => s.text).join(""),
            line,
            polygon: word.boundingBox.vertices.map((v) => [v.x ?? 0, v.y ?? 0]),
          });
          const lastBreak = word.symbols.at(-1)?.property?.detectedBreak?.type;
          if (["EOL_SURE_SPACE", "LINE_BREAK", "HYPHEN"].includes(lastBreak))
            line++;
        }
      }
    }
  }

  console.log(
    `\n=== Google Vision (${Date.now() - start}ms, ${words.length} words) ===`,
  );
  const lines = Object.groupBy(words, (w) => w.line);
  for (const [lineNo, lineWords] of Object.entries(lines)) {
    console.log(
      `L${lineNo}: ${lineWords.map((w) => `[${w.id}]${w.text}`).join(" ")}`,
    );
  }
  return { words };
}

// ── Mistral OCR ─────────────────────────────────────────────────

async function runMistral() {
  const start = Date.now();
  const res = await fetch("https://api.mistral.ai/v1/ocr", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
    },
    body: JSON.stringify({
      model: "mistral-ocr-latest",
      document: {
        type: "image_url",
        image_url: `data:${mediaType};base64,${imageBase64}`,
      },
      include_blocks: true,
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json));

  const page = json.pages[0];
  const blocks = (page.blocks ?? []).map((b, i) => ({
    id: `b${i + 1}`,
    type: b.type,
    content: b.content,
    polygon: [
      [b.top_left_x, b.top_left_y],
      [b.bottom_right_x, b.top_left_y],
      [b.bottom_right_x, b.bottom_right_y],
      [b.top_left_x, b.bottom_right_y],
    ],
  }));

  console.log(
    `\n=== Mistral OCR (${Date.now() - start}ms, ${blocks.length} blocks) ===`,
  );
  console.log(page.markdown);
  for (const b of blocks)
    console.log(`[${b.id}] ${b.type}: ${b.content?.slice(0, 60)}`);
  return { markdown: page.markdown, dimensions: page.dimensions, blocks };
}

// ── Overlay viewer ──────────────────────────────────────────────

function renderOverlay(results) {
  const shapes = [];
  for (const w of results.google?.words ?? []) {
    shapes.push({
      engine: "google",
      id: w.id,
      label: w.text,
      polygon: w.polygon,
    });
  }
  for (const b of results.mistral?.blocks ?? []) {
    shapes.push({
      engine: "mistral",
      id: b.id,
      label: b.type,
      polygon: b.polygon,
    });
  }

  return `<!doctype html>
<meta charset="utf-8">
<title>OCR ${name}</title>
<style>
  body { font: 14px system-ui; margin: 16px; background: #fafafa; }
  .stage { position: relative; display: inline-block; }
  .stage img { display: block; max-width: 100%; }
  svg { position: absolute; inset: 0; width: 100%; height: 100%; }
  .google { fill: rgba(255, 200, 0, .25); stroke: #e0a800; }
  .mistral { fill: none; stroke: #2563eb; stroke-width: 3; stroke-dasharray: 8 4; }
  text { font-size: 11px; fill: #b91c1c; }
</style>
<p>
  <label><input type="checkbox" checked data-engine="google"> Google words (yellow)</label>
  <label><input type="checkbox" checked data-engine="mistral"> Mistral blocks (blue)</label>
  <label><input type="checkbox" data-labels> word ids</label>
</p>
<div class="stage">
  <img src="data:${mediaType};base64,${imageBase64}">
  <svg></svg>
</div>
<script>
  const shapes = ${JSON.stringify(shapes)};
  const img = document.querySelector("img");
  const svg = document.querySelector("svg");
  const draw = () => {
    svg.setAttribute("viewBox", \`0 0 \${img.naturalWidth} \${img.naturalHeight}\`);
    const showLabels = document.querySelector("[data-labels]").checked;
    const enabled = [...document.querySelectorAll("[data-engine]")].filter((c) => c.checked).map((c) => c.dataset.engine);
    svg.innerHTML = shapes
      .filter((s) => enabled.includes(s.engine))
      .map((s) => {
        const points = s.polygon.map((p) => p.join(",")).join(" ");
        const label = showLabels && s.engine === "google" ? \`<text x="\${s.polygon[0][0]}" y="\${s.polygon[0][1] - 2}">\${s.id}</text>\` : "";
        return \`<polygon class="\${s.engine}" points="\${points}"><title>\${s.id}: \${s.label}</title></polygon>\${label}\`;
      })
      .join("");
  };
  img.complete ? draw() : img.addEventListener("load", draw);
  document.querySelectorAll("input").forEach((i) => i.addEventListener("change", draw));
</script>`;
}
