import { NextResponse } from "next/server";
   import { getDb } from "@/lib/mongodb";

   export const dynamic = "force-dynamic";

   export async function GET() {
     try {
       const db = await getDb();
       const recordsCol = db.collection("maintenance_records");
       
       await recordsCol.createIndex({ engine_id: 1, type_key: 1 });
       await recordsCol.createIndex({ created_at: -1 });
       
       return NextResponse.json({ 
         ok: true, 
         message: "İndeksler başarıyla oluşturuldu! Bu dosyayı artık silebilirsin." 
       });
     } catch (error) {
       console.error("İndeks oluşturma hatası:", error);
       return NextResponse.json({ error: "Hata oluştu." }, { status: 500 });
     }
   }
