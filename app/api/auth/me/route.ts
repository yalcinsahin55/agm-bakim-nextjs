import { usersCollection } from "@/lib/dbCollections";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { normalizeTechnicianPermissions, normalizeTechnicianType } from "@/lib/technicians";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const db = await getDb();
  const usersCol = usersCollection(db);
  const user = await getCurrentUser(req, usersCol);

  if (!user) {
    return NextResponse.json({ error: "Giriş yapılmamış" }, { status: 401 });
  }

  const isTechnician = user.role === "teknisyen" || user.role === "planlamaci";
  const technician_type = isTechnician ? normalizeTechnicianType(user.technician_type) : undefined;
  const technicianPermissions = isTechnician ? normalizeTechnicianPermissions(user, technician_type) : undefined;
  return NextResponse.json({
    id: user._id,
    full_name: user.full_name,
    email: user.email || "",
    phone: user.phone || user.phone_normalized || "",
    role: user.role,
    technician_type,
    ...(technicianPermissions || {}),
    approved: user.approved !== false,
  });
}
