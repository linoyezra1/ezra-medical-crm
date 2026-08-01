import { AppProvider } from "@/lib/store";
import { loadAppData } from "@/lib/load-app-data";
import { AppShell } from "@/components/app-shell";

export async function AppProviders({ children }: { children: React.ReactNode }) {
  const initial = await loadAppData();
  return (
    <AppProvider initial={initial}>
      <AppShell>{children}</AppShell>
    </AppProvider>
  );
}
