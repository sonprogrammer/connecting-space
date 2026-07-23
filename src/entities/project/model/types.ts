import type { Database } from "@/shared/types/database.generated";

export type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];
export type ProjectStatus = Database["public"]["Enums"]["project_status"];
