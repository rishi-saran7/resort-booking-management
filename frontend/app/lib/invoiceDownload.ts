/**
 * Shared invoice download helper.
 * Uses the same token key as lib/api.ts → "resort_token"
 * Never throws — invoice failure must never block the main action.
 */
export async function triggerInvoiceDownload(
  downloadPath: string,
  bookingId:    string
): Promise<void> {
  try {
    if (typeof window === "undefined") return;

    // ── Same key used in lib/api.ts ───────────────────────────────────────
    const token = localStorage.getItem("resort_token");

    if (!token) {
      console.warn("[invoice] No auth token found (resort_token) — skipping download");
      return;
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!apiUrl) {
      console.warn("[invoice] NEXT_PUBLIC_API_URL not set — skipping download");
      return;
    }

    const res = await fetch(`${apiUrl}${downloadPath}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(`[invoice] Server returned ${res.status}:`, text.slice(0, 200));
      return;
    }

    // Guard — ensure we got a PDF back, not a JSON error body
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("application/pdf")) {
      const text = await res.text().catch(() => "");
      console.warn("[invoice] Expected PDF, got:", contentType, text.slice(0, 200));
      return;
    }

    const blob    = await res.blob();
    const url     = URL.createObjectURL(blob);
    const link    = document.createElement("a");
    link.href     = url;
    link.download = `INV-${bookingId.slice(0, 8).toUpperCase()}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    console.log("[invoice] Downloaded: INV-" + bookingId.slice(0, 8).toUpperCase() + ".pdf");
  } catch (err) {
    // NEVER block the main action because of invoice failure
    console.warn("[invoice] Download error (non-fatal):", err);
  }
}