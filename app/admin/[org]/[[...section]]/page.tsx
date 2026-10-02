import { redirect, notFound } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import AdminConsole from "@/components/AdminConsole";
import type { Organization } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminOrgPage({ params }: { params: Promise<{ org: string; section?: string[] }> }) {
  if (!(await isAdmin())) redirect("/admin/login");
  const p = await params;
  const orgUpper = p.org.toUpperCase();
  if (orgUpper !== "CBGC" && orgUpper !== "CBCKL") notFound();
  const section = p.section?.[0] || "dashboard";
  if (!["dashboard", "items", "qr"].includes(section)) notFound();
  return <AdminConsole org={orgUpper as Organization} section={section as "dashboard" | "items" | "qr"} />;
}
