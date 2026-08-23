import AppShell from "@/components/app-shell";
import { ScheduleProvider } from "@/lib/schedule-context";
import { loadPublicSchedule } from "@/lib/public-schedule";

export const dynamic = "force-dynamic";

export default async function Page() {
  const initialData = await loadPublicSchedule();
  return (
    <ScheduleProvider initialData={initialData}>
      <AppShell />
    </ScheduleProvider>
  );
}
