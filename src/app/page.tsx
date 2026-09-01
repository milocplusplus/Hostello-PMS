import { redirect } from "next/navigation";
import { currentProfile, currentUser, isStaffRole } from "@/lib/auth";

export default async function Home() {
  const user = await currentUser();

  if (!user) {
    redirect("/login");
  }

  const profile = await currentProfile();

  redirect(isStaffRole(profile?.role) ? "/admin" : "/client");
}
