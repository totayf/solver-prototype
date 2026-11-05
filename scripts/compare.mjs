// Usage: node compare.mjs   (after running ocr.mjs for each question)
// Builds out/compare.html: Google Vision vs Mistral OCR side by side, with clickable boxes
// and sample annotations (highlight / underline / circle / strike) drawn from their coordinates.
import fs from "fs";
import path from "path";

const root = path.dirname(new URL(import.meta.url).pathname);
const outDir = path.join(root, "out");
const questions = ["turkish", "history", "sets", "physics"];

const data = questions
  .filter(
    (q) =>
      fs.existsSync(path.join(outDir, `${q}.google.json`)) &&
      fs.existsSync(path.join(outDir, `${q}.mistral.json`)),
  )
  .map((q) => ({
    name: q,
    image: `data:image/png;base64,${fs.readFileSync(path.join(root, "questions", `${q}.png`)).toString("base64")}`,
    google: JSON.parse(
      fs.readFileSync(path.join(outDir, `${q}.google.json`), "utf8"),
    ),
    mistral: JSON.parse(
      fs.readFileSync(path.join(outDir, `${q}.mistral.json`), "utf8"),
    ),
  }));

const html = fs
  .readFileSync(path.join(root, "compare.template.html"), "utf8")
  .replace("__DATA__", JSON.stringify(data));
fs.writeFileSync(path.join(outDir, "compare.html"), html);
console.log(path.join(outDir, "compare.html"));
