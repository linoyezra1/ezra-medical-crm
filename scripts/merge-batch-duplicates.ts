import "dotenv/config"
import { prisma } from "../src/lib/db.js"
import { normalizeBatchName } from "../src/lib/certificates-hub.js"

async function main() {
  const batches = await prisma.certificateBatch.findMany({
    include: { _count: { select: { participants: true } } },
    orderBy: { createdAt: "asc" },
  })

  const groups = new Map<string, typeof batches>()
  for (const batch of batches) {
    const key = normalizeBatchName(batch.name)
    if (!key) continue
    const list = groups.get(key) ?? []
    list.push(batch)
    groups.set(key, list)
  }

  let merged = 0
  for (const [name, group] of groups) {
    if (group.length <= 1) continue
    group.sort(
      (a, b) =>
        b._count.participants - a._count.participants ||
        a.createdAt.getTime() - b.createdAt.getTime(),
    )
    const keeper = group[0]!
    console.log(`Merging "${name}" → keeping ${keeper.id} (${keeper._count.participants} participants)`)
    for (const dupe of group.slice(1)) {
      console.log(`  - delete ${dupe.id} (${dupe._count.participants} participants → reassign)`)
      await prisma.participant.updateMany({
        where: { certificateBatchId: dupe.id },
        data: { certificateBatchId: keeper.id },
      })
      await prisma.certificateBatch.delete({ where: { id: dupe.id } })
      merged++
    }
  }

  console.log(merged > 0 ? `Done. Merged ${merged} duplicate batch(es).` : "No duplicates found.")
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
