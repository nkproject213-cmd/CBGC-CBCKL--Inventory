import { redirect, notFound } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import AdminConsole from "@/components/AdminConsole";
import QRManagement from "@/components/QRManagement";
import type { Organization } from "@/lib/types";

export const dynamic = "force-dynamic";
export default async function AdminOrgPage({ params }: { params: Promise<{ org: string; section?: string[] }> }) {
  if (!(await isAdmin())) redirect("/admin/login");
  const p = await params;
  const orgUpper = p.org.toUpperCase();
  if (orgUpper !== "CBGC" && orgUpper !== "CBCKL") notFound();
  const section = p.section?.[0] || "dashboard";
  if (!["dashboard", "items", "qr"].includes(section)) notFound();
  if (section === "qr") return <QRManagement key={orgUpper} org={orgUpper as Organization}/>;
  return <AdminConsole org={orgUpper as Organization} section={section as "dashboard" | "items"}/>;
}
