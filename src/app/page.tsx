import { redirect } from "next/navigation";
import { currentProfile, currentUser } from "@/lib/auth";

export default async function Home() {
  const user = await currentUser();

  if (!user) {
    redirect("/login");
  }

  const profile = await currentProfile();

  redirect(profile?.role === "admin" ? "/admin" : "/client");
}
