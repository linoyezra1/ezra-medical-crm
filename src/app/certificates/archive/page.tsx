import { CertificatesHubView } from "@/components/certificates-hub/certificates-hub-view"

export const metadata = { title: "ארכיון תעודות" }
export const dynamic = "force-dynamic"

export default function CertificatesArchivePage() {
  return <CertificatesHubView archive />
}
