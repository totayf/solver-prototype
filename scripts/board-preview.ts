/**
 * Renders sample board figures to an HTML file for eyeballing the renderers.
 * Usage: bun scripts/board-preview.ts <out.html>
 */
import { writeFileSync } from "node:fs";

import type { FigurePart } from "@/entities/lesson";
import {
  type DrawRequest,
  renderFigures,
} from "@/features/create-lesson/server/board/render-figures";

const COLORS: Record<string, string> = {
  ink: "#27272a",
  red: "#E5292F",
  blue: "#2563EB",
  green: "#16A34A",
  purple: "#9333EA",
  orange: "#EA580C",
};

const samples: Array<Omit<DrawRequest, "key">> = [
  {
    figure: "tr",
    kind: "map",
    spec: JSON.stringify({
      area: "turkey",
      fill: [
        { places: ["İç Anadolu"], color: "blue" },
        { places: ["Konya"], color: "red" },
      ],
    }),
  },
  {
    figure: "tr",
    kind: "map",
    spec: JSON.stringify({
      rivers: ["Kızılırmak", "Fırat"],
      lakes: ["Tuz Gölü", "Van"],
      points: [
        { place: "Ankara", label: "Ankara" },
        { at: [41.0, 29.0], label: "İstanbul" },
      ],
    }),
  },
  {
    figure: "world",
    kind: "map",
    spec: JSON.stringify({
      area: "world",
      lines: ["equator", "tropics", "polarCircle"],
      fill: [
        { places: ["Brezilya"], color: "green" },
        { places: ["Afrika"], color: "orange" },
      ],
      points: [{ place: "Türkiye", label: "TR" }],
    }),
  },
  {
    figure: "box",
    kind: "solid",
    spec: JSON.stringify({
      shape: "box",
      size: [6, 4, 3],
      segments: [{ from: "A", to: "G", label: "√61", color: "red" }],
      edgeLabels: [
        { edge: ["A", "B"], text: "6" },
        { edge: ["B", "C"], text: "4" },
        { edge: ["C", "G"], text: "3" },
      ],
    }),
  },
  {
    figure: "box",
    kind: "solid",
    spec: JSON.stringify({
      faces: [{ vertices: ["A", "C", "G", "E"], color: "blue" }],
    }),
  },
  {
    figure: "pyr",
    kind: "solid",
    spec: JSON.stringify({
      shape: "pyramid",
      base: [
        [0, 0],
        [4, 0],
        [4, 4],
        [0, 4],
      ],
      height: 5,
      points: [{ name: "H", at: [2, 2, 0] }],
      segments: [{ from: "T", to: "H", dashed: true, label: "h" }],
    }),
  },
  {
    figure: "cyl",
    kind: "solid",
    spec: JSON.stringify({
      shape: "cylinder",
      radius: 3,
      height: 6,
      radiusLabel: "r = 3",
      heightLabel: "h = 6",
    }),
  },
  {
    figure: "cone",
    kind: "solid",
    spec: JSON.stringify({
      shape: "cone",
      radius: 3,
      height: 5,
      radiusLabel: "3",
      heightLabel: "4",
    }),
  },
  {
    figure: "sph",
    kind: "solid",
    spec: JSON.stringify({ shape: "sphere", radius: 3, radiusLabel: "r" }),
  },
  {
    figure: "tree",
    kind: "tree",
    spec: JSON.stringify({
      root: "Torba",
      branches: [
        {
          label: "K",
          p: "3/5",
          children: [
            { label: "K", p: "2/4", result: "6/20" },
            { label: "B", p: "2/4", result: "6/20" },
          ],
        },
        {
          label: "B",
          p: "2/5",
          children: [
            { label: "K", p: "3/4", result: "6/20" },
            { label: "B", p: "1/4", result: "2/20" },
          ],
        },
      ],
    }),
  },
  {
    figure: "tree",
    kind: "tree",
    spec: JSON.stringify({
      highlight: [{ path: ["K", "B"] }, { path: ["B", "K"], color: "blue" }],
    }),
  },
  {
    figure: "bar",
    kind: "chart",
    spec: JSON.stringify({
      type: "bar",
      labels: ["2021", "2022", "2023", "2024"],
      series: [
        { name: "Erkek", values: [30, 45, 50, 40] },
        { name: "Kız", values: [25, 40, 55, 60] },
      ],
      unit: "kişi",
    }),
  },
  {
    figure: "bar",
    kind: "chart",
    spec: JSON.stringify({
      highlight: [{ label: "2023", series: 1, note: "en çok" }],
    }),
  },
  {
    figure: "pie",
    kind: "chart",
    spec: JSON.stringify({
      type: "pie",
      labels: ["Koşu", "Yüzme", "İp"],
      series: [{ values: [170, 110, 80] }],
      unit: "°",
    }),
  },
  {
    figure: "pie",
    kind: "chart",
    spec: JSON.stringify({ highlight: [{ label: "Koşu", color: "blue" }] }),
  },
  {
    figure: "line",
    kind: "chart",
    spec: JSON.stringify({
      type: "line",
      labels: ["Oca", "Şub", "Mar", "Nis", "May"],
      series: [{ values: [5, 8, 6, 12, 15] }],
      unit: "°C",
    }),
  },
  {
    figure: "circuit",
    kind: "circuit",
    spec: JSON.stringify({
      nodes: {
        A: [2, 2],
        B: [2, 0],
        _1: [0, 2],
        _2: [0, 0],
        _3: [4, 2],
        _4: [4, 0],
      },
      elements: [
        { type: "battery", from: "_2", to: "_1", label: "ε₁ = 24 V" },
        { type: "resistor", from: "_1", to: "A", label: "R" },
        { type: "resistor", from: "A", to: "B", label: "2R" },
        { type: "resistor", from: "_3", to: "A", label: "R" },
        { type: "battery", from: "_4", to: "_3", label: "ε₂ = 12 V" },
        { type: "wire", from: "_2", to: "B" },
        { type: "wire", from: "B", to: "_4" },
      ],
    }),
  },
  {
    figure: "circuit",
    kind: "circuit",
    spec: JSON.stringify({
      currents: [
        { from: "_1", to: "A", label: "I₁" },
        { from: "A", to: "B", label: "I₂", color: "green" },
      ],
      highlight: [{ from: "A", to: "B", color: "orange" }],
    }),
  },
  {
    figure: "parts",
    kind: "circuit",
    spec: JSON.stringify({
      nodes: { P: [0, 1], Q: [3, 1], _a: [0, 0], _b: [3, 0], _c: [1.5, 0] },
      elements: [
        { type: "switch", from: "P", to: "Q", label: "S" },
        { type: "bulb", from: "Q", to: "_b", label: "L" },
        { type: "capacitor", from: "_b", to: "_c", label: "C" },
        { type: "ammeter", from: "_c", to: "_a" },
        { type: "voltmeter", from: "_a", to: "P" },
      ],
    }),
  },
];

const draws = samples.map((s, i) => ({ ...s, key: `d${i}` }));
const { layouts, parts, errors } = renderFigures(draws);
const svg = (id: string, height: number) => {
  const items = draws
    .filter((d) => d.figure === id)
    .flatMap((d) => parts.get(d.key) ?? []);
  const body = items.map((p: FigurePart) =>
    p.kind === "path"
      ? `<path d="${p.d}" stroke="${COLORS[p.color]}" stroke-width="${p.width}" fill="${p.fill ? COLORS[p.color] : "none"}" fill-opacity="${p.fill === "solid" ? 1 : 0.2}" stroke-linecap="round" stroke-linejoin="round"/>`
      : `<text x="${p.x}" y="${p.y}" fill="${COLORS[p.color]}" font-size="${p.size}" text-anchor="${p.anchor}" font-family="sans-serif">${p.text}</text>`,
  );
  return `<div><b>${id}</b><svg viewBox="0 0 1000 ${height}" style="width:300px;border:1px solid #ddd;display:block">${body.join("")}</svg></div>`;
};
writeFileSync(
  process.argv[2],
  `<html><head><meta charset="utf-8"></head><body style="display:grid;grid-template-columns:repeat(3,300px);gap:10px;font-family:sans-serif;margin:8px"><pre>${errors.join("\n")}</pre>${layouts.map((l) => svg(l.id, l.height)).join("")}</body></html>`,
);
console.log({ figures: layouts.length, errors });
