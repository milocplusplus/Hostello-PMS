import { redirect } from "next/navigation";
import { currentClient, currentUser } from "@/lib/auth";
import { loadSettings } from "@/lib/settings";
import { PageHeader } from "@/components/shared/PageHeader";
import { ChannelForwardingGuide } from "@/components/shared/ChannelForwardingGuide";

/**
 * The owner's half of the channel inbox: how to get their Airbnb and
 * Booking.com emails to Hostello. Staff send owners here from Inbox setup;
 * the steps are the same component staff read, so the two cannot disagree.
 */
export default async function ChannelSetupPage() {
  const [user, clientRecord, settings] = await Promise.all([currentUser(), currentClient(), loadSettings()]);
  if (!user) redirect("/login");
  if (!clientRecord) redirect("/client");

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      <PageHeader
        title="Booking emails"
        back={{ href: "/client/properties", label: "Properties" }}
        info={
          <p>
            Airbnb and Booking.com email the account a listing is on. Getting those emails to
            Hostello is what puts the guest&apos;s name and the price on your bookings without
            anyone typing them in.
          </p>
        }
      />
      {settings.channelInboxAddress ? (
        <ChannelForwardingGuide
          address={settings.channelInboxAddress}
          cohostEmail={settings.channelCohostEmail}
          audience="owner"
        />
      ) : (
        <p className="card p-8 text-center text-sm text-ink-secondary">
          Hostello hasn&apos;t switched this on yet — nothing to do for now.
        </p>
      )}
    </div>
  );
}
