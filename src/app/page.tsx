import { redirect } from "next/navigation";
import { currentProfile, currentUser, isStaffRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Landing } from "@/components/public/Landing";

export const metadata = {
  title: "Hostello: run your rental properties from one place",
  description:
    "Keep your Airbnb and Booking.com calendars in step, add bookings from your Airbnb emails, and track expenses and profit. Free for 14 days.",
};

export default async function Home() {
  const user = await currentUser();

  // Signed in: straight to the right portal. Signed out: the public front door.
  if (user) {
    const profile = await currentProfile();
    redirect(isStaffRole(profile?.role) ? "/admin" : "/client");
  }

  const supabase = await createClient();
  const [{ data: signupOpen }, { data: emailLive }] = await Promise.all([
    supabase.rpc("host_signup_open"),
    supabase.rpc("channel_inbox_live"),
  ]);

  return <Landing signupOpen={Boolean(signupOpen)} emailLive={Boolean(emailLive)} />;
}
