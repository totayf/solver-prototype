# Usage: python3 -I scripts/build-maps.py <source-dir>
# Builds the board's map data from open datasets, already projected into
# figure units (1000 wide) and simplified, so the server only picks and draws:
#   src/features/create-lesson/server/board/maps/turkey.json
#   src/features/create-lesson/server/board/maps/world.json
#
# Sources (download into <source-dir>):
#   tur-adm1.geojson — geoBoundaries TUR ADM1 (simplified), © OpenStreetMap
#     contributors, CC BY-SA 2.0. The derived turkey.json carries the same license.
#   ne_50m_admin_0_countries.geojson, ne_10m_rivers_lake_centerlines.geojson,
#   ne_10m_lakes.geojson — Natural Earth, public domain.
import json
import math
import os
import sys
import unicodedata

SRC = sys.argv[1]
OUT = os.path.join(os.path.dirname(__file__), "..", "src", "features", "create-lesson", "server", "board", "maps")
WIDTH = 1000
PAD = 30

REGIONS = {
    "Marmara": ["Edirne", "Kırklareli", "Tekirdağ", "İstanbul", "Kocaeli", "Sakarya", "Yalova", "Bursa", "Bilecik", "Balıkesir", "Çanakkale"],
    "Ege": ["İzmir", "Manisa", "Aydın", "Denizli", "Muğla", "Afyonkarahisar", "Kütahya", "Uşak"],
    "Akdeniz": ["Antalya", "Isparta", "Burdur", "Mersin", "Adana", "Osmaniye", "Hatay", "Kahramanmaraş"],
    "İç Anadolu": ["Ankara", "Konya", "Kayseri", "Eskişehir", "Sivas", "Yozgat", "Kırşehir", "Kırıkkale", "Nevşehir", "Niğde", "Aksaray", "Karaman", "Çankırı"],
    "Karadeniz": ["Bolu", "Düzce", "Zonguldak", "Karabük", "Bartın", "Kastamonu", "Sinop", "Samsun", "Çorum", "Amasya", "Tokat", "Ordu", "Giresun", "Trabzon", "Rize", "Artvin", "Gümüşhane", "Bayburt"],
    "Doğu Anadolu": ["Erzurum", "Erzincan", "Malatya", "Elazığ", "Tunceli", "Bingöl", "Muş", "Bitlis", "Van", "Hakkari", "Ağrı", "Iğdır", "Kars", "Ardahan"],
    "Güneydoğu Anadolu": ["Gaziantep", "Kilis", "Adıyaman", "Şanlıurfa", "Diyarbakır", "Mardin", "Batman", "Siirt", "Şırnak"],
}

# Natural Earth river names (some are transliterated or garbled) → Turkish names.
RIVERS = {
    "Firat": "Fırat", "Al Furat": "Fırat", "Dicle": "Dicle", "Tigris": "Dicle",
    "Kiz?lirmak": "Kızılırmak", "Sakarya": "Sakarya", "Byk Menderes": "Büyük Menderes",
    "Ceyhan": "Ceyhan", "Aras": "Aras", "Evros": "Meriç", "Kelkit": "Kelkit",
    "Murat": "Murat", "Simav": "Simav",
}
LAKES = {"Van": "Van Gölü", "Tuz": "Tuz Gölü", "Beyşehir": "Beyşehir Gölü", "Eğirdir": "Eğirdir Gölü",
         "Keban Barajı": "Keban Barajı", "Atatürk Barajı": "Atatürk Barajı"}


def main():
    os.makedirs(OUT, exist_ok=True)
    build_turkey()
    build_world()


# ── Türkiye ─────────────────────────────────────────────────────────────────

def build_turkey():
    lon0, lon1, lat0, lat1 = 25.6, 44.9, 35.75, 42.15
    k = math.cos(math.radians((lat0 + lat1) / 2))
    scale = (WIDTH - 2 * PAD) / ((lon1 - lon0) * k)
    height = round((lat1 - lat0) * scale + 2 * PAD)

    def project(lon, lat):
        return (PAD + (lon - lon0) * k * scale, PAD + (lat1 - lat) * scale)

    region_of = {norm(p): r for r, ps in REGIONS.items() for p in ps}
    provinces = []
    for f in load("tur-adm1.geojson")["features"]:
        name = f["properties"]["shapeName"].replace("Hakkâri", "Hakkari")
        rings = [simplify([project(*c) for c in ring], 1.2) for ring in polygon_rings(f["geometry"])]
        rings = [r for r in rings if len(r) >= 4]
        provinces.append({
            "name": name,
            "region": region_of[norm(name)],
            "d": path(rings, closed=True),
            "center": rounded(centroid(max(rings, key=area_abs))),
        })
    assert len(provinces) == 81, len(provinces)

    rivers = {}
    for f in load("ne_10m_rivers_lake_centerlines.geojson")["features"]:
        name = RIVERS.get(f["properties"].get("name"))
        if not name:
            continue
        for line in line_parts(f["geometry"]):
            pts = [project(*c) for c in line if 25.4 <= c[0] <= 45.2 and 35.5 <= c[1] <= 42.4]
            if len(pts) >= 2:
                rivers.setdefault(name, []).append(simplify(pts, 1.0))
    lakes = {}
    for f in load("ne_10m_lakes.geojson")["features"]:
        name = LAKES.get(f["properties"].get("name_tr") or "")
        if not name:
            continue
        rings = [simplify([project(*c) for c in ring], 0.8) for ring in polygon_rings(f["geometry"])]
        lakes[name] = path([r for r in rings if len(r) >= 4], closed=True)

    save("turkey.json", {
        "license": "Provinces © OpenStreetMap contributors (geoBoundaries), CC BY-SA 2.0; rivers and lakes: Natural Earth (public domain).",
        "height": height,
        "bounds": [lon0, lon1, lat0, lat1, k, scale, PAD],
        "provinces": provinces,
        "rivers": {n: path(ls, closed=False) for n, ls in rivers.items()},
        "lakes": lakes,
    })


# ── World ───────────────────────────────────────────────────────────────────

def build_world():
    lat_top, lat_bottom = 84, -58
    scale = (WIDTH - 2 * PAD) / 360
    height = round((lat_top - lat_bottom) * scale + 2 * PAD)

    def project(lon, lat):
        return (PAD + (lon + 180) * scale, PAD + (lat_top - max(lat, lat_bottom)) * scale)

    countries = []
    for f in load("ne_50m_admin_0_countries.geojson")["features"]:
        p = f["properties"]
        if p.get("CONTINENT") == "Antarctica":
            continue
        rings = [simplify([project(*c) for c in ring], 0.6) for ring in polygon_rings(f["geometry"])]
        rings = [r for r in rings if len(r) >= 4 and area_abs(r) > 1.5]
        if not rings:
            continue
        countries.append({
            "iso": p.get("ISO_A3") if p.get("ISO_A3") not in (None, "-99") else p.get("ADM0_A3"),
            "name": p.get("NAME"),
            "nameTr": p.get("NAME_TR") or p.get("NAME"),
            "continent": p.get("CONTINENT"),
            "d": path(rings, closed=True),
            "center": rounded(centroid(max(rings, key=area_abs))),
        })
    save("world.json", {
        "license": "Natural Earth (public domain).",
        "height": height,
        "bounds": [lat_top, lat_bottom, scale, PAD],
        "countries": countries,
    })


# ── Geometry ────────────────────────────────────────────────────────────────

def polygon_rings(geometry):
    if geometry["type"] == "Polygon":
        return [geometry["coordinates"][0]]
    return [poly[0] for poly in geometry["coordinates"]]


def line_parts(geometry):
    return [geometry["coordinates"]] if geometry["type"] == "LineString" else geometry["coordinates"]


def simplify(points, tolerance):
    """Ramer–Douglas–Peucker in figure units."""
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = points[a]
        bx, by = points[b]
        dx, dy = bx - ax, by - ay
        length = math.hypot(dx, dy) or 1e-9
        best, index = 0.0, -1
        for i in range(a + 1, b):
            px, py = points[i]
            # A closed ring starts and ends on the same point: use distance to it.
            d = (abs(dy * px - dx * py + bx * ay - by * ax) / length
                 if length > 1e-6 else math.hypot(px - ax, py - ay))
            if d > best:
                best, index = d, i
        if best > tolerance and index != -1:
            keep[index] = True
            stack += [(a, index), (index, b)]
    return [p for p, k in zip(points, keep) if k]


def area_abs(ring):
    return abs(sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]))) / 2


def centroid(ring):
    a = cx = cy = 0.0
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        cross = x1 * y2 - x2 * y1
        a += cross
        cx += (x1 + x2) * cross
        cy += (y1 + y2) * cross
    if abs(a) < 1e-9:
        return ring[0]
    return (cx / (3 * a), cy / (3 * a))


def path(rings, closed):
    parts = []
    for r in rings:
        pts = " L".join(f"{x:.1f} {y:.1f}" for x, y in r)
        parts.append(f"M{pts}{' Z' if closed else ''}")
    return " ".join(parts)


def rounded(p):
    return [round(p[0], 1), round(p[1], 1)]


# ── IO ──────────────────────────────────────────────────────────────────────

def load(name):
    with open(os.path.join(SRC, name), encoding="utf-8") as f:
        return json.load(f)


def save(name, data):
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    print(name, os.path.getsize(os.path.join(OUT, name)) // 1024, "KB")


def norm(text):
    text = text.replace("İ", "i").replace("I", "ı").lower()
    return "".join(c for c in unicodedata.normalize("NFD", text) if unicodedata.category(c) != "Mn")


if __name__ == "__main__":
    main()
