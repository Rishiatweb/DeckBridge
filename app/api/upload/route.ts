import { NextRequest, NextResponse } from "next/server";
import { chunkText } from "@/lib/chunker";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse");

export const runtime = "nodejs";
export const maxDuration = 60;

const AZURE_ENDPOINT = "https://contracto1729-resource.services.ai.azure.com/models/chat/completions?api-version=2024-05-01-preview";

const JOKES = [
  "A .exe file walks into a bar. The bartender says 'We don't serve your type here.' Neither do I.",
  "Nice try. Did you just upload your entire Steam library? Bold study strategy.",
  "A virus file and a flashcard app walk into a server... only one of them left.",
  "Error 418: I'm a teapot, not a file converter. Also, what is that?",
  "I asked for notes. You gave me chaos. Respect, but no.",
  "That file type is so rare I had to Google it. Still not supported.",
  "Uploading a .zip? Are you compressing your academic anxiety into one file?",
  "My therapist said to set boundaries. This file is a boundary.",
  "404: Educational content not found. 200: Confusion found.",
  "I've seen bolder file choices in a /tmp folder at 3am.",
];

const SUPPORTED_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "image/jpeg": "image",
  "image/png": "image",
  "image/webp": "image",
  "image/gif": "image",
};

async function extractPptxText(buffer: Buffer): Promise<string> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const na = parseInt(a.match(/slide(\d+)/)?.[1] ?? "0");
      const nb = parseInt(b.match(/slide(\d+)/)?.[1] ?? "0");
      return na - nb;
    });

  let text = "";
  for (const slideName of slideFiles) {
    const content = await zip.files[slideName].async("text");
    const matches = content.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) ?? [];
    const slideText = matches.map((m) => m.replace(/<[^>]+>/g, "")).join(" ");
    if (slideText.trim()) text += slideText.trim() + "\n\n";
  }
  return text;
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

async function extractViaAzureVision(buffer: Buffer, mimeType: string): Promise<string> {
  const base64 = buffer.toString("base64");
  const res = await fetch(AZURE_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": process.env.AZURE_API_KEY ?? "",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract all readable text content from this document or image. Return only the raw text, preserving structure where possible.",
            },
            {
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${base64}` },
            },
          ],
        },
      ],
      max_tokens: 4000,
    }),
  });

  if (!res.ok) throw new Error(`Azure vision failed: ${res.status}`);
  const json = await res.json();
  return json.choices?.[0]?.message?.content ?? "";
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const fileType = SUPPORTED_TYPES[file.type];

    if (!fileType) {
      const joke = JOKES[Math.floor(Math.random() * JOKES.length)];
      return NextResponse.json(
        { error: `Unsupported file type (${file.type || "unknown"}). ${joke}` },
        { status: 415 }
      );
    }

    if (file.type === "application/pdf" && file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "PDF too large (max 10MB)" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let extractedText = "";

    if (fileType === "pdf") {
      console.log("[upload] parsing PDF:", file.name);
      const data = await pdfParse(buffer);
      if (!data.text || data.text.trim().length < 100) {
        return NextResponse.json(
          { error: "Could not extract text from PDF. It may be scanned — try uploading as an image instead." },
          { status: 422 }
        );
      }
      extractedText = data.text;
    } else if (fileType === "pptx") {
      console.log("[upload] parsing PPTX:", file.name);
      extractedText = await extractPptxText(buffer);
    } else if (fileType === "docx") {
      console.log("[upload] parsing DOCX:", file.name);
      extractedText = await extractDocxText(buffer);
    } else if (fileType === "image") {
      console.log("[upload] sending image to Azure Vision:", file.name);
      extractedText = await extractViaAzureVision(buffer, file.type);
    }

    if (!extractedText || extractedText.trim().length < 50) {
      return NextResponse.json(
        { error: "Could not extract meaningful text from this file." },
        { status: 422 }
      );
    }

    const chunks = chunkText(extractedText);

    return NextResponse.json({
      fileName: file.name,
      textLength: extractedText.length,
      chunks,
      chunkCount: chunks.length,
    });
  } catch (err) {
    console.error("[upload] error:", err);
    return NextResponse.json({ error: "Failed to process file" }, { status: 500 });
  }
}
