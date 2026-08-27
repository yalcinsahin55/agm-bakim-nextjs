import type { NextRequest } from "next/server";
import { getRecords } from "./_lib/recordsQuery";
import { postRecord } from "./_lib/recordCreate";
import { withApiTiming } from "@/lib/performance";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return withApiTiming("GET /api/records", () => getRecords(req), { request: req });
}

export async function POST(req: NextRequest) {
  return withApiTiming("POST /api/records", () => postRecord(req), { request: req });
}
