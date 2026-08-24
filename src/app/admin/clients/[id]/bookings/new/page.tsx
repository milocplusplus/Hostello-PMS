import { redirect } from "next/navigation";

export default async function LegacyNewBookingRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/admin/bookings/new?client=${id}`);
}
