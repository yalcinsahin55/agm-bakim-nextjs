import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const db = await getDb();
  const usersCol = db.collection("users");
  const user = await getCurrentUser(req, usersCol);
  if (!user) {
    return NextResponse.json({ error: "Giriş yapılmamış" }, { status: 401 });
  }
  return NextResponse.json({
    id: user._id, full_name: user.full_name, email: user.email, role: user.role,
  });
}
