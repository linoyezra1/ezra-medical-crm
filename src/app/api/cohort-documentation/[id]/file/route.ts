import { readFile } from "fs/promises"
import { prisma } from "@/lib/db"
import {
  cohortDocStoredPath,
  mimeTypeForFileName,
} from "@/lib/cohort-documentation"

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  const row = await prisma.cohortDocumentation.findUnique({
    where: { id },
    select: { fileName: true, fileUrl: true },
  })
  if (!row) {
    return new Response("לא נמצא", { status: 404 })
  }

  try {
    const buffer = await readFile(cohortDocStoredPath(row.fileUrl))
    const encoded = encodeURIComponent(row.fileName)
    return new Response(buffer, {
      headers: {
        "Content-Type": mimeTypeForFileName(row.fileName),
        "Content-Disposition": `attachment; filename*=UTF-8''${encoded}`,
        "Cache-Control": "private, no-cache",
      },
    })
  } catch {
    return new Response("הקובץ לא נמצא בשרת", { status: 404 })
  }
}
