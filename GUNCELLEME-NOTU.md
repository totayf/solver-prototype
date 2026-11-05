# Güncelleme notu

## İlk commit: Solver prototipi repoya alındı

Repo: `totayf/solver-prototype` (private)

### Değişenler
- `.gitignore`: `.wrangler/` eklendi (yerel Wrangler durumu ve build çıktısı).
- `eas.json`: `EXPO_PUBLIC_SOLVER_KEY` çıkarıldı, `preview` profiline `"environment": "preview"` eklendi. Anahtar artık EAS ortam değişkeninden gelecek.

### Repoya girmeyenler
`.env.local`, `.data/`, `.wrangler/`, `android/`, `dist/`, `node_modules/`, `scripts/questions/yks-2026/`, `scripts/questions/tubitak-2024/`

### Senin yapman gerekenler
- Bir sonraki EAS build'inden önce `EXPO_PUBLIC_SOLVER_KEY` değerini EAS'ta `preview` ortamına tanımla.

### Açık riskler
- Anahtar mevcut `solver.apk` içinde açık duruyor. APK paylaşıldıysa anahtarı yenile.
- `scripts/questions/` altındaki 4 PNG'nin kaynağı doğrulanmadı. Repo public olacaksa önce kontrol et.
- `scripts/examples.json`, repoda olmayan `yks-2026` görsellerine işaret ediyor.
