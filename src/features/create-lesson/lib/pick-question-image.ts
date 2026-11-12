import * as ImagePicker from "expo-image-picker";

import { UserFacingError } from "@/shared/api/request-json";

import { workingCopy } from "./crop-image";
import type { QuestionImage } from "./crop-rect";

/**
 * Photo of a question from the camera or gallery, as a downscaled working
 * copy with its size; null when the student cancels.
 */
export async function pickQuestionImage(
  source: "camera" | "library",
): Promise<QuestionImage | null> {
  const permission =
    source === "camera"
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new UserFacingError(
      source === "camera"
        ? "Soruyu çekebilmek için kamera izni gerekli. Ayarlar'dan izin verebilirsin."
        : "Soru seçebilmek için galeri izni gerekli. Ayarlar'dan izin verebilirsin.",
      "permission",
    );
  }

  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["images"],
    // iOS's built-in editor only crops squares, which cuts tall questions.
    allowsEditing: false,
    quality: 1,
  };
  const result =
    source === "camera"
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);

  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;
  return workingCopy(asset.uri, { width: asset.width, height: asset.height });
}
