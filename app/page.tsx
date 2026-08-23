import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import { defaultRouteForRole } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function Home() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const userId = token ? await verifySessionToken(token) : null;
  if (!userId) redirect("/login");

  const db = await getDb();
  const usersCol = db.collection("users") as any;
  const user = await usersCol.findOne(
    { _id: userId },
    { projection: { role: 1, active: 1, approved: 1 } },
  );

  if (!user || user.active === false || user.approved === false) redirect("/login");
  redirect(defaultRouteForRole(typeof user.role === "string" ? user.role : undefined));
}
