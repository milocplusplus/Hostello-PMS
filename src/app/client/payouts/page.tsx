import { redirect } from "next/navigation";

/** Settlements absorbed this page. Old links and bookmarks still land right. */
export default function ClientPayoutsRedirect() {
  redirect("/client/settlements?tab=to-hostello");
}
