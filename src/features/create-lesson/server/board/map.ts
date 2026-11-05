import { z } from "zod";

import type { FigurePart } from "@/entities/lesson";

import { penColor } from "./colors";
import turkey from "./maps/turkey.json";
import world from "./maps/world.json";
import {
  circle,
  dashedLine,
  FigureError,
  type FigureRender,
  type Pt,
  path,
  text,
} from "./svg";

/**
 * Maps for geography and history: Türkiye (81 provinces, 7 regions, major
 * rivers and lakes) or the world (countries, continents, key parallels).
 * The first draw picks the area and draws the outlines; every draw can fill
 * places, trace rivers and lakes, and mark points or write labels.
 *
 * Data: provinces © OpenStreetMap contributors (geoBoundaries), CC BY-SA 2.0;
 * everything else Natural Earth (public domain). Built by scripts/build-maps.py.
 */
export const mapSpec = z.object({
  area: z.enum(["turkey", "world"]).optional(),
  fill: z
    .array(
      z.object({
        places: z.array(z.string()).min(1),
        color: penColor.optional(),
      }),
    )
    .default([]),
  rivers: z.array(z.string()).default([]),
  lakes: z.array(z.string()).default([]),
  points: z
    .array(
      z.object({
        place: z.string().optional(),
        at: z.tuple([z.number(), z.number()]).optional(),
        label: z.string().optional(),
        color: penColor.optional(),
      }),
    )
    .default([]),
  lines: z
    .array(z.enum(["equator", "tropics", "polarCircle", "primeMeridian"]))
    .default([]),
});

type MapSpec = z.infer<typeof mapSpec>;

export function renderMap(specs: MapSpec[]): FigureRender {
  const area = specs[0].area;
  if (!area) {
    throw new FigureError(
      'the first map draw must set "area": "turkey" or "world"',
    );
  }
  const atlas = area === "turkey" ? turkeyAtlas() : worldAtlas();
  const parts = specs.map((spec, index): FigurePart[] => [
    ...(index === 0 ? [path(atlas.outlines, { width: 1.6 })] : []),
    ...spec.lines.flatMap((line) => atlas.line(line)),
    ...spec.fill.flatMap(({ places, color }) =>
      places.map((place) =>
        path(atlas.shape(place), { color: color ?? "red", fill: "shade" }),
      ),
    ),
    ...spec.lakes.map((lake) =>
      path(atlas.lake(lake), { color: "blue", fill: "shade" }),
    ),
    ...spec.rivers.map((river) =>
      path(atlas.river(river), { color: "blue", width: 4 }),
    ),
    ...spec.points.flatMap((point) => {
      const color = point.color ?? "red";
      const p = point.at
        ? atlas.project(point.at[0], point.at[1])
        : point.place
          ? atlas.center(point.place)
          : null;
      if (!p)
        throw new FigureError('a map point needs "place" or "at": [lat, lon]');
      return [
        path(circle(p, 7), { color, fill: "solid" }),
        ...(point.label
          ? [
              text(p.x + 12, p.y - 10, point.label, {
                color,
                size: 26,
                anchor: "start",
              }),
            ]
          : []),
      ];
    }),
  ]);
  return { height: atlas.height, parts };
}

// ── Atlases ──────────────────────────────────────────────────────────────────

interface Atlas {
  height: number;
  outlines: string;
  shape: (place: string) => string;
  center: (place: string) => Pt;
  project: (lat: number, lon: number) => Pt;
  river: (name: string) => string;
  lake: (name: string) => string;
  line: (line: MapSpec["lines"][number]) => FigurePart[];
}

function turkeyAtlas(): Atlas {
  const [lon0, , , lat1, k, scale, pad] = turkey.bounds;
  const byName = new Map(turkey.provinces.map((p) => [norm(p.name), p]));
  const regions = new Map<string, typeof turkey.provinces>();
  for (const p of turkey.provinces) {
    const key = norm(p.region);
    regions.set(key, [...(regions.get(key) ?? []), p]);
  }
  const provincesOf = (place: string) => {
    const key = norm(place).replace(/ (bolgesi|ili)$/, "");
    const province = byName.get(key);
    if (province) return [province];
    const region = regions.get(key);
    if (region) return region;
    throw new FigureError(
      `unknown place "${place}" on the Türkiye map; use a province (e.g. "Konya") or a region (e.g. "İç Anadolu", "Güneydoğu Anadolu")`,
    );
  };
  const named = (table: Record<string, string>, name: string, what: string) => {
    const key = norm(name).replace(/ (golu|nehri|irmagi)$/, "");
    const hit = Object.entries(table).find(
      ([n]) => norm(n).replace(/ (golu|nehri|irmagi)$/, "") === key,
    );
    if (!hit) {
      throw new FigureError(
        `unknown ${what} "${name}"; available: ${Object.keys(table).join(", ")}`,
      );
    }
    return hit[1];
  };

  return {
    height: turkey.height,
    outlines: turkey.provinces.map((p) => p.d).join(" "),
    shape: (place) =>
      provincesOf(place)
        .map((p) => p.d)
        .join(" "),
    center: (place) => {
      const ps = provincesOf(place);
      return {
        x: ps.reduce((s, p) => s + p.center[0], 0) / ps.length,
        y: ps.reduce((s, p) => s + p.center[1], 0) / ps.length,
      };
    },
    project: (lat, lon) => ({
      x: pad + (lon - lon0) * k * scale,
      y: pad + (lat1 - lat) * scale,
    }),
    river: (name) => named(turkey.rivers, name, "river"),
    lake: (name) => named(turkey.lakes, name, "lake"),
    line: () => {
      throw new FigureError(
        "parallels and meridians are only drawn on the world map",
      );
    },
  };
}

function worldAtlas(): Atlas {
  const [latTop, latBottom, scale, pad] = world.bounds;
  const project = (lat: number, lon: number): Pt => ({
    x: pad + (lon + 180) * scale,
    y: pad + (latTop - lat) * scale,
  });
  const countriesOf = (place: string) => {
    const key = norm(place);
    const continent = CONTINENTS[key];
    if (continent)
      return world.countries.filter((c) => c.continent === continent);
    const country = world.countries.find(
      (c) =>
        norm(c.nameTr) === key ||
        norm(c.name) === key ||
        c.iso?.toLowerCase() === key,
    );
    if (country) return [country];
    throw new FigureError(
      `unknown place "${place}" on the world map; use a country (Turkish or English name, or ISO code like "BRA") or a continent (e.g. "Afrika")`,
    );
  };
  const parallel = (lat: number, label: string): FigurePart[] => {
    if (lat < latBottom || lat > latTop) return [];
    const a = project(lat, -180);
    const b = project(lat, 180);
    return [
      path(dashedLine(a, b, 14, 10), { color: "blue", width: 2.5 }),
      text(a.x + 6, a.y - 8, label, {
        color: "blue",
        size: 20,
        anchor: "start",
      }),
    ];
  };

  return {
    height: world.height,
    outlines: world.countries.map((c) => c.d).join(" "),
    shape: (place) =>
      countriesOf(place)
        .map((c) => c.d)
        .join(" "),
    center: (place) => {
      const cs = countriesOf(place);
      const [x, y] =
        cs.length === 1 ? cs[0].center : CONTINENT_CENTERS[norm(place)];
      return { x, y };
    },
    project,
    river: () => {
      throw new FigureError("rivers are only drawn on the Türkiye map");
    },
    lake: () => {
      throw new FigureError("lakes are only drawn on the Türkiye map");
    },
    line: (line) => {
      switch (line) {
        case "equator":
          return parallel(0, "Ekvator (0°)");
        case "tropics":
          return [
            ...parallel(23.44, "Yengeç Dönencesi"),
            ...parallel(-23.44, "Oğlak Dönencesi"),
          ];
        case "polarCircle":
          return parallel(66.56, "Kuzey Kutup Dairesi");
        case "primeMeridian": {
          const a = project(latTop, 0);
          const b = project(latBottom, 0);
          return [
            path(dashedLine(a, b, 14, 10), { color: "blue", width: 2.5 }),
            text(b.x + 6, b.y - 8, "Başlangıç Meridyeni", {
              color: "blue",
              size: 20,
              anchor: "start",
            }),
          ];
        }
      }
    },
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Case- and accent-insensitive key, Turkish-aware (İ/ı). */
function norm(text: string): string {
  return text
    .replace(/İ/g, "i")
    .replace(/I/g, "ı")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/ı/g, "i")
    .trim();
}

const CONTINENTS: Record<string, string> = {
  afrika: "Africa",
  africa: "Africa",
  asya: "Asia",
  asia: "Asia",
  avrupa: "Europe",
  europe: "Europe",
  "kuzey amerika": "North America",
  "north america": "North America",
  "guney amerika": "South America",
  "south america": "South America",
  okyanusya: "Oceania",
  oceania: "Oceania",
};

/** Label anchors for whole continents (world figure units). */
const CONTINENT_CENTERS: Record<string, [number, number]> = Object.fromEntries(
  Object.entries({
    afrika: [20, 5],
    asya: [90, 45],
    avrupa: [15, 50],
    "kuzey amerika": [-100, 45],
    "guney amerika": [-60, -15],
    okyanusya: [135, -25],
  }).flatMap(([name, [lon, lat]]) => {
    const [latTop, , scale, pad] = world.bounds;
    const point: [number, number] = [
      pad + (lon + 180) * scale,
      pad + (latTop - lat) * scale,
    ];
    const english = CONTINENTS[name];
    return [
      [name, point],
      [norm(english), point],
    ];
  }),
);
