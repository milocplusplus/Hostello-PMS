import { redirect } from "next/navigation";
import { currentClient, currentUser } from "@/lib/auth";
import { loadSettings } from "@/lib/settings";
import { CHANNEL_INBOX_ON_HOLD } from "@/lib/ota";
import { PageHeader } from "@/components/shared/PageHeader";
import { ChannelForwardingGuide } from "@/components/shared/ChannelForwardingGuide";
import { ChannelInboxComingSoon } from "@/components/shared/ChannelInboxComingSoon";

/**
 * The owner's half of the channel inbox: how to get their Airbnb and
 * Booking.com emails to Hostello. Staff send owners here from Inbox setup;
 * the steps are the same component staff read, so the two cannot disagree.
 * While the inbox is on hold, it is the owners' Coming Soon screen instead.
 */
export default async function ChannelSetupPage() {
  const [user, clientRecord, settings] = await Promise.all([currentUser(), currentClient(), loadSettings()]);
  if (!user) redirect("/login");
  if (!clientRecord) redirect("/client");

  if (CHANNEL_INBOX_ON_HOLD) {
    return (
      <div className="max-w-3xl mx-auto flex flex-col gap-4">
        <PageHeader title="Booking updates" back={{ href: "/client", label: "Home" }} />
        <ChannelInboxComingSoon audience="owner" />
      </div>
    );
  }

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
