import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth";

export default async function Home() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  const userId = token ? await verifySessionToken(token) : null;
  redirect(userId ? "/dashboard" : "/login");
}
