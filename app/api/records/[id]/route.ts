import type { NextRequest } from "next/server";
import { withApiTiming } from "@/lib/performance";
import { getRecord } from "./_lib/recordRead";
import { patchRecord } from "./_lib/recordPatch";
import { deleteRecord } from "./_lib/recordDelete";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  return withApiTiming("GET /api/records/[id]", () => getRecord(req, context), { request: req });
}
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  return withApiTiming("PATCH /api/records/[id]", () => patchRecord(req, context), { request: req });
}
export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  return withApiTiming("DELETE /api/records/[id]", () => deleteRecord(req, context), { request: req });
}
