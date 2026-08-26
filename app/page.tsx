import { usersCollection } from "@/lib/dbCollections";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getCurrentUser, SESSION_COOKIE } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import { defaultRouteForRole } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function Home() {
  const cookieStore = await cookies();
  if (!cookieStore.get(SESSION_COOKIE)?.value) redirect("/login");

  const db = await getDb();
  const usersCol = usersCollection(db);
  const user = await getCurrentUser({ cookies: cookieStore }, usersCol);

  if (!user) redirect("/login");
  redirect(defaultRouteForRole(user.role));
}
