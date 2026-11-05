import type { Subject } from "../ai/solution.schema";
import type { FigureKind } from "./render-figures";

/**
 * How to write each board figure's spec, as shown to the teacher model. Only
 * the kinds that suit the question's subject are sent (`boardGuideFor`), so
 * the prompt stays short and the model isn't tempted by irrelevant tools.
 */
export function boardGuideFor(subject: Subject): string {
  return KINDS_BY_SUBJECT[subject]
    .map((kind) => `<kind name="${kind}">\n${GUIDE[kind]}\n</kind>`)
    .join("\n");
}

const GUIDE: Record<FigureKind, string> = {
  construct: `Geometry by construction (coordinates with y up; use the real lengths and angles so the figure is to scale; names starting with "_" are hidden helpers).
{"steps":[{"point":"A","at":[0,0]},{"point":"B","at":[8,0]},{"point":"C","polar":["A",5,60]},{"polygon":["A","B","C"]}]}
Point rules: "at":[x,y] | "polar":[from, length, degrees ccw] | "midpoint":["A","B"] | "foot":["C","A","B"] (foot of the perpendicular from C to line AB) | "along":["A","B",0.25] | "intersect":[["A","C"],["B","D"]]
Draw steps: {"segment":["A","B"],"label":"8","dashed":true} {"polygon":[…]} {"circle":"O","radius":5} or {"circle":"O","through":"A"} {"angle":["B","A","C"],"label":"40°"} {"angle":["A","H","C"],"right":true} {"equal":[["A","B"],["A","C"]],"ticks":1} {"parallel":[["A","B"],["D","C"]]} {"fill":["A","B","C"]} {"label":"A","text":"S₁"}`,
  solid: `3D solid in a textbook oblique view; hidden edges come out dashed. Coordinates: x right, y depth, z up, in the problem's units.
{"shape":"box","size":[6,4,3]} → vertices A,B,C,D (bottom, counter-clockwise from front-left) and E,F,G,H above them
{"shape":"prism","base":[[0,0],[4,0],[2,3]],"height":5} (bottom vertices, then the top ones) | {"shape":"pyramid","base":[[0,0],[4,0],[4,4],[0,4]],"height":5} (apex "T", or "apex":[x,y])
{"shape":"cylinder"|"cone","radius":3,"height":5,"radiusLabel":"r = 3","heightLabel":"h"} | {"shape":"sphere","radius":3,"radiusLabel":"r"}
Optional "names":[…] renames the vertices in order. Any draw may add: "points":[{"name":"M","mid":["A","B"]},{"name":"P","along":["A","G",0.5]},{"name":"K","at":[x,y,z]}], "segments":[{"from":"A","to":"G","label":"√61","dashed":false}], "faces":[{"vertices":["A","C","G","E"]}] (a filled section), "edgeLabels":[{"edge":["A","B"],"text":"6"}]`,
  plot: `Coordinate plane (the first draw sets the window; later draws only add "items").
{"x":[-2,5],"y":[-2,6],"items":[{"fn":"x^2-4x+3","label":"f"}]}
Items: {"fn":"…","from":0,"to":3} (mathjs syntax in x) {"point":[2,-1],"label":"T(2, −1)","dashed":true,"open":false} {"segment":[[0,0],[2,4]]} {"vline":2,"label":"x = 2"} {"hline":1} {"tangent":"x^2","at":1} {"shade":"x^2","fn2":"x","from":0,"to":1} (without fn2: down to y = 0) {"text":"A","at":[1,2]}`,
  table: `Table (later draws append "rows" or fill "cells"; row 0 = first data row; a Punnett square is a table whose first column holds the gametes).
{"columns":["","A","a"],"rows":[["A","",""],["a","",""]]}   then   {"cells":[{"row":0,"col":1,"text":"AA"}]}`,
  numberLine: `Number line (null end = ∞).
{"range":[-5,5],"points":[{"at":-2,"label":"−2","open":true}],"intervals":[{"from":-2,"to":null,"openFrom":true}]}`,
  signTable: `Sign table: one sign per interval (roots + 1); "atRoots" per root ("0" default, "" none, "∄" undefined); later draws add rows.
{"variable":"x","roots":["−2","1"],"rows":[{"label":"x + 2","signs":["-","+","+"]}]}`,
  venn: `Venn diagram (regions onlyA onlyB onlyC AB AC BC ABC out; shade A B C AB AC BC ABC).
{"sets":["İngilizce","Almanca"],"labels":[{"region":"onlyA","text":"7"},{"region":"AB","text":"x"}],"shade":[{"region":"AB"}]}`,
  tree: `Probability or counting tree, left to right (at most 4 levels, 12 leaves); later draws highlight paths by their branch labels.
{"root":"Torba","branches":[{"label":"K","p":"3/5","children":[{"label":"B","p":"2/4","result":"6/20"}]},{"label":"B","p":"2/5"}]}   then   {"highlight":[{"path":["K","B"]}]}`,
  chart: `Data chart; later draws highlight a label (and may write a note).
{"type":"bar","labels":["2021","2022"],"series":[{"name":"Kız","values":[25,40]},{"name":"Erkek","values":[30,45]}],"unit":"kişi"}
{"type":"pie","labels":["Koşu","Yüzme"],"series":[{"values":[170,190]}],"unit":"°"} | {"type":"line",…}
then {"highlight":[{"label":"2022","series":1,"note":"en çok"}]}`,
  motion: `Motion along a road (positions in the problem's unit).
{"points":[{"at":0,"label":"A"},{"at":360,"label":"B"}],"movers":[{"from":0,"to":200,"label":"50 km/sa"}],"meet":{"at":200,"label":"C"}}`,
  forces: `Free-body diagram (angle in degrees ccw from +x, 270 = down; size relative, 1 = normal).
{"body":"box","label":"m","incline":30,"forces":[{"angle":270,"label":"mg"},{"angle":120,"label":"N"}]}`,
  timeline: `Timeline (later draws add events).
{"events":[{"at":1071,"text":"Malazgirt"},{"at":1176,"text":"Miryokefalon"}]}`,
  circuit: `Electric circuit: nodes on a grid (x right, y up, small integers), elements between two nodes; three-way junctions get dots. Names starting with "_" are hidden corner nodes.
{"nodes":{"A":[2,2],"B":[2,0],"_1":[0,2],"_2":[0,0],"_3":[4,2],"_4":[4,0]},"elements":[{"type":"battery","from":"_2","to":"_1","label":"ε₁ = 24 V"},{"type":"resistor","from":"_1","to":"A","label":"R"},{"type":"resistor","from":"A","to":"B","label":"2R"},{"type":"wire","from":"_2","to":"B"}]}
Element types: wire, resistor, battery (+ terminal at "to"), capacitor, bulb, switch ("closed": true), ammeter, voltmeter. Later draws: {"currents":[{"from":"_1","to":"A","label":"I₁"}]} (arrow along that branch), {"highlight":[{"from":"A","to":"B"}]}, or more elements.`,
  map: `Map. The first draw sets "area"; any draw may fill places, trace rivers and lakes, mark points.
Türkiye: {"area":"turkey","fill":[{"places":["İç Anadolu"],"color":"blue"},{"places":["Konya","Karaman"]}],"rivers":["Kızılırmak"],"lakes":["Tuz Gölü"],"points":[{"place":"Ankara","label":"A"},{"at":[41.0,29.0],"label":"B"}]}
  places = province names or regions (Marmara, Ege, Akdeniz, İç Anadolu, Karadeniz, Doğu Anadolu, Güneydoğu Anadolu); rivers: Fırat, Dicle, Kızılırmak, Sakarya, Büyük Menderes, Ceyhan, Aras, Meriç, Murat, Kelkit, Simav; lakes: Van Gölü, Tuz Gölü, Beyşehir Gölü, Eğirdir Gölü, Keban Barajı, Atatürk Barajı.
World: {"area":"world","lines":["equator","tropics","polarCircle","primeMeridian"],"fill":[{"places":["Brezilya","Afrika"]}],"points":[{"at":[-33.9,18.4],"label":"X"}]}
  places = countries (Turkish or English name, or ISO code) or continents (Afrika, Asya, Avrupa, Kuzey Amerika, Güney Amerika, Okyanusya).`,
};

const KINDS_BY_SUBJECT: Record<Subject, FigureKind[]> = {
  matematik: [
    "plot",
    "numberLine",
    "signTable",
    "table",
    "tree",
    "chart",
    "venn",
    "construct",
    "motion",
  ],
  geometri: ["construct", "solid", "plot", "table"],
  fizik: [
    "forces",
    "motion",
    "circuit",
    "plot",
    "construct",
    "solid",
    "chart",
    "table",
  ],
  kimya: ["plot", "chart", "table"],
  biyoloji: ["table", "chart", "tree", "plot"],
  turkce: ["table", "venn"],
  edebiyat: ["timeline", "table"],
  tarih: ["timeline", "map", "table"],
  cografya: ["map", "chart", "plot", "table", "timeline"],
  felsefe: ["table", "venn"],
  din: ["table", "timeline"],
  ingilizce: ["table"],
  diger: [
    "construct",
    "solid",
    "plot",
    "table",
    "numberLine",
    "signTable",
    "venn",
    "tree",
    "chart",
    "motion",
    "forces",
    "timeline",
    "map",
    "circuit",
  ],
};
