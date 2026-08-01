import { AppProvider } from "@/lib/store";
import { emptyAppData, loadAppData } from "@/lib/load-app-data";
import { AppShell } from "@/components/app-shell";

export const dynamic = "force-dynamic";

export async function AppProviders({ children }: { children: React.ReactNode }) {
  // Skip DB during Next.js production build (Railway private host is unreachable there)
  const isBuild = process.env.NEXT_PHASE === "phase-production-build";
  const initial = isBuild ? emptyAppData() : await loadAppData();

  return (
    <AppProvider initial={initial}>
      <AppShell>{children}</AppShell>
    </AppProvider>
  );
}
