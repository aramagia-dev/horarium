import { supabase, supabaseConfigured } from "@/lib/supabase";
import type { Comision } from "@/lib/schedule-data";

export const DEFAULT_COMISIONES: Comision[] = [
  { id: "4K1", label: "4K1", shift: "Noche" },
  { id: "4K2", label: "4K2", shift: "Noche" },
  { id: "4K3", label: "4K3", shift: "Noche" },
  { id: "4K6", label: "4K6", shift: "Noche" },
  { id: "4K7", label: "4K7", shift: "Noche" },
  { id: "4K8", label: "4K8", shift: "Noche" },
];

export async function loadComisiones(): Promise<Comision[]> {
  if (!supabaseConfigured || !supabase) return DEFAULT_COMISIONES;
  try {
    const { data, error } = await supabase.from("comisiones").select("id, label, shift").order("id");
    if (error || !data || data.length === 0) return DEFAULT_COMISIONES;
    return data as Comision[];
  } catch {
    return DEFAULT_COMISIONES;
  }
}
