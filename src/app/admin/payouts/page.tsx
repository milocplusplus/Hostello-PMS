import { redirect } from "next/navigation";

/** Settlements absorbed this page. Old links and bookmarks still land right. */
export default function AdminPayoutsRedirect() {
  redirect("/admin/settlements?tab=to-hostello");
}
