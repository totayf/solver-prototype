import { catalogForApp } from "@/entities/example/server";

/** The example catalog: questions, their photos and the lessons made so far. */
export async function GET() {
  return Response.json(await catalogForApp());
}
