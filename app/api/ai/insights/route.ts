import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { usersCollection } from "@/lib/dbCollections";
import { recordsCollection } from "@/lib/dbCollections";
import { getOrBuildMaintenancePanelServerPayload } from "@/lib/maintenancePanelServer";
import { enforceApiRateLimit } from "@/lib/apiRateLimit";

export const dynamic = "force-dynamic";
type RiskRow = { engine_id: string; engine: string; score: number; level: "low" | "watch" | "high" | "critical"; reasons: string[]; attention: number };
function riskLevel(score: number): RiskRow["level"] { return score >= 75 ? "critical" : score >= 50 ? "high" : score >= 25 ? "watch" : "low"; }
export async function GET(req: NextRequest) {
  try {
    const db = await getDb(); const user = await getCurrentUser(req, usersCollection(db));
    if (!user) return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    const limited = await enforceApiRateLimit(req, "ai-insights", 60, 10 * 60 * 1000, user._id); if (limited) return limited;
    const panel = await getOrBuildMaintenancePanelServerPayload(db);
    const since = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
    const rows = await recordsCollection(db).aggregate<{ _id?: string; count?: number; delayed?: number }>([
      { $match: { created_at: { $gte: since } } },
      { $group: { _id: "$engine_id", count: { $sum: 1 }, delayed: { $sum: { $cond: [{ $and: [{ $ne: ["$delay_reason", null] }, { $ne: ["$delay_reason", ""] }] }, 1, 0] } } } },
    ]).toArray();
    const activity = new Map(rows.map((row) => [String(row._id), { count: Number(row.count || 0), delayed: Number(row.delayed || 0) }]));
    const grouped = new Map<string, { engine: string; score: number; reasons: string[]; attention: number }>();
    for (const item of panel.items) {
      const current = grouped.get(item.engine_id) || { engine: item.engine_name, score: 0, reasons: [], attention: 0 };
      if (item.status === "gecikmis") { current.score += Math.min(45, 25 + Math.abs(item.remaining) / 10); current.reasons.push(`${item.type_label} bakımında ${Math.abs(Math.round(item.remaining))} saat gecikme`); current.attention += 1; }
      else if (item.status === "kritik") { current.score += 18; current.reasons.push(`${item.type_label} kritik eşikte`); current.attention += 1; }
      else if (item.status === "yaklasiyor") { current.score += 8; current.reasons.push(`${item.type_label} bakım aralığı yaklaşıyor`); }
      const recent = activity.get(item.engine_id); if (recent?.delayed) current.score += Math.min(12, recent.delayed * 2);
      grouped.set(item.engine_id, current);
    }
    const risks: RiskRow[] = [...grouped.entries()].map(([engine_id, row]) => { const score = Math.min(100, Math.round(row.score)); return { engine_id, engine: row.engine, score, level: riskLevel(score), reasons: [...new Set(row.reasons)].slice(0, 3), attention: row.attention }; }).sort((a, b) => b.score - a.score).slice(0, 8);
    const overdue = panel.items.filter((item) => item.status === "gecikmis").sort((a, b) => a.remaining - b.remaining).slice(0, 3);
    const recommendations = overdue.map((item) => `${item.engine_name} / ${item.type_label} için plan tarihini ve parça hazırlığını doğrula.`);
    if (!recommendations.length) recommendations.push("Kritik bakım görünmüyor; planlanan işleri takvimden takip etmeye devam et.");
    return NextResponse.json({ generated_at: new Date().toISOString(), methodology: "Açıklanabilir kural tabanlı risk skoru; otomatik teşhis değildir.", summary: `${panel.items.filter((item) => item.status === "gecikmis").length} gecikmiş, ${panel.items.filter((item) => item.status === "kritik").length} kritik bakım maddesi izleniyor.`, risks, recommendations });
  } catch { return NextResponse.json({ error: "AI içgörüleri oluşturulamadı." }, { status: 500 }); }
}
