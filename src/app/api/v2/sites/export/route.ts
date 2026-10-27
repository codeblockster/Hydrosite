import { getSitesPage } from "@/lib/server/data";
import { ApiError, route } from "@/lib/server/http";

export const dynamic = "force-dynamic";

function csvCell(value: string | number): string {
  const text = String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function makePdf(lines: string[]): ArrayBuffer {
  const safe = lines.slice(0, 42).map((line) => line.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)"));
  const commands = ["BT", "/F1 10 Tf", "40 800 Td", ...safe.flatMap((line, index) => [index === 0 ? `(${line}) Tj` : "0 -17 Td", ...(index === 0 ? [] : [`(${line}) Tj`])]), "ET"].join("\n");
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    `5 0 obj\n<< /Length ${commands.length} >>\nstream\n${commands}\nendstream\nendobj\n`,
  ];
  let document = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(new TextEncoder().encode(document).length);
    document += object;
  }
  const xrefOffset = new TextEncoder().encode(document).length;
  document += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) document += `${String(offset).padStart(10, "0")} 00000 n \n`;
  document += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  const encoded = new TextEncoder().encode(document);
  const output = new ArrayBuffer(encoded.byteLength);
  new Uint8Array(output).set(encoded);
  return output;
}

export function GET(request: Request): Promise<Response> {
  return route(request, async () => {
    const format = new URL(request.url).searchParams.get("format") ?? "csv";
    if (format !== "csv" && format !== "pdf") throw new ApiError(400, "BAD_PARAM", "Choose csv or pdf as the export format.");
    const page = await getSitesPage({ page: 1, pageSize: 100, sort: "score", order: "desc" });
    if (format === "csv") {
      const header = ["code", "name", "river", "province", "district", "latitude", "longitude", "power_kw", "plant_type", "score", "environmental_risk", "status"];
      const rows = page.items.map((site) => [site.code, site.name, site.river, site.province, site.district, site.lat, site.lng, site.powerKw, site.plantType, site.score, site.envRisk, site.status]);
      const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
      return new Response(`\uFEFF${csv}`, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": "attachment; filename=hydrosite-candidates.csv",
        },
      });
    }
    const lines = [
      "HYDROSITE 2.0 | NEPAL FEASIBILITY SCREENING",
      `Candidate sites: ${page.total}`,
      "Code   Candidate / river                           Score    Power (kW)",
      ...page.items.map((site) => `${site.code}   ${site.name} / ${site.river}   ${site.score.toFixed(1)}   ${Math.round(site.powerKw).toLocaleString("en-US")}`),
      "",
      "Deterministic simulation for early-stage planning. Field verification required.",
    ];
    return new Response(makePdf(lines), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=hydrosite-screening.pdf",
      },
    });
  });
}
