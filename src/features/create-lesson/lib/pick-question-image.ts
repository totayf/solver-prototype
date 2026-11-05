import * as ImagePicker from "expo-image-picker";

/** Photo of a question from the camera or gallery; null when the user cancels. */
export async function pickQuestionImage(
  source: "camera" | "library",
): Promise<string | null> {
  const permission =
    source === "camera"
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error(
      source === "camera"
        ? "Soruyu çekebilmek için kamera izni gerekli."
        : "Soru seçebilmek için galeri izni gerekli.",
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

  return result.canceled ? null : (result.assets[0]?.uri ?? null);
}
