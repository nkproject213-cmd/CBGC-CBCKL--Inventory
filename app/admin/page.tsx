import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";

export default async function AdminIndex() {
  if (!(await isAdmin())) redirect("/admin/login");
  redirect("/admin/cbgc/dashboard");
}
