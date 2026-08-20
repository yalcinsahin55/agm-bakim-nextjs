// 🎬 Videoyu parça parça yükler (kütüphanesiz, garantili yöntem)
export async function uploadVideoChunked(file) {
  const CHUNK = 2.5 * 1024 * 1024; // 2.5MB parçalar
  const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const total = Math.ceil(file.size / CHUNK);

  for (let i = 0; i < total; i++) {
    const piece = file.slice(i * CHUNK, (i + 1) * CHUNK);
    const b64 = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1]);
      r.onerror = reject;
      r.readAsDataURL(piece);
    });

    const res = await fetch("/api/upload-chunk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ upload_id: uploadId, index: i, chunk_b64: b64 }),
    });
    if (!res.ok) throw new Error(`Parça ${i + 1} yüklenemedi (${res.status})`);
  }

  const fin = await fetch("/api/upload-chunk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      upload_id: uploadId, finalize: true,
      filename: file.name, mime: file.type || "video/mp4", total,
    }),
  });
  const data = await fin.json();
  if (!fin.ok) throw new Error(data.error || "Video birleştirilemedi");
  return data.url;
}
