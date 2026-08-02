import { PublicParticipantForm } from "@/components/public/public-participant-form"
import { prisma } from "@/lib/db"
import { formatLeadCourseType } from "@/lib/course-type"
import { mapLead, mapSettings } from "@/lib/mappers"
import { dbStatusToUi } from "@/lib/types"

export const dynamic = "force-dynamic"

export default async function PublicParticipantPage({
  params,
}: {
  params: Promise<{ leadId: string }>
}) {
  const { leadId } = await params

  const [leadDb, settingsDb, assets] = await Promise.all([
    prisma.lead.findUnique({ where: { id: leadId } }),
    prisma.settings.findUnique({ where: { id: "default" } }),
    prisma.courseAsset.findMany(),
  ])

  if (!leadDb) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-6 text-center">
        <div>
          <h1 className="text-lg font-bold">ההדרכה לא נמצאה</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            ייתכן שהקישור אינו תקין או שפג תוקפו.
          </p>
        </div>
      </div>
    )
  }

  const uiStatus = dbStatusToUi(leadDb.courseStatus)
  const allowed = uiStatus === "closed" || uiStatus === "done" || uiStatus === "pending_certificates"
  if (!allowed && leadDb.courseStatus !== "closed_won") {
    return (
      <div className="flex min-h-dvh items-center justify-center px-6 text-center">
        <div>
          <h1 className="text-lg font-bold">ההרשמה אינה פתוחה כרגע</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            ניתן להירשם רק להדרכות שנסגרו או שבוצעו.
          </p>
        </div>
      </div>
    )
  }

  const settings = mapSettings(settingsDb, assets)
  const lead = mapLead(leadDb)
  const courseLabel = formatLeadCourseType(lead, settings.courses)

  return (
    <PublicParticipantForm
      leadId={lead.id}
      businessName={settings.businessName}
      courseLabel={courseLabel}
      courseDateDefault={lead.date}
      organizerDefault={lead.contactName || lead.name}
      collectShipping={Boolean(lead.collectCertificateShipping)}
    />
  )
}
