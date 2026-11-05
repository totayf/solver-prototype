import { z } from "zod";

/** Pen colors the model may pick. Red is the default; colors are for matching or telling items apart. */
export const PEN_COLORS = ["red", "blue", "green", "purple", "orange"] as const;

export const penColor = z.enum(PEN_COLORS);

/** Board strokes can also use plain dark ink (the default for figure outlines). */
export const inkColor = z.enum([...PEN_COLORS, "ink"]);
