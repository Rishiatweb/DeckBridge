// POST /api/upload — Accept PDF, extract text, return chunks
// Does NOT store anything — extraction only

import { NextRequest, NextResponse } from "next/server";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse");
import { chunkText } from "@/lib/chunker";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.type !== "application/pdf") {
      return NextResponse.json({ error: "File must be a PDF" }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });
    }

    console.log("[upload] parsing PDF:", file.name, file.size, "bytes");
    const buffer = Buffer.from(await file.arrayBuffer());
    const data = await pdfParse(buffer);
    console.log("[upload] parsed OK, pages:", data.numpages, "chars:", data.text.length);

    if (!data.text || data.text.trim().length < 100) {
      return NextResponse.json(
        { error: "Could not extract text from PDF. Try a text-based PDF (not scanned)." },
        { status: 422 }
      );
    }

    const chunks = chunkText(data.text);

    return NextResponse.json({
      fileName: file.name,
      pageCount: data.numpages,
      textLength: data.text.length,
      chunks: chunks,
      chunkCount: chunks.length,
    });
  } catch (err) {
    console.error("[upload] error:", err);
    return NextResponse.json({ error: "Failed to process PDF" }, { status: 500 });
  }
}
