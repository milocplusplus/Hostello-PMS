import { LegalDocument } from "@/components/public/PublicShell";
import { LEGAL } from "@/lib/legal";

export const metadata = { title: "Privacy policy · Hostello" };

const li = "list-disc pl-5 flex flex-col gap-1";

export default function PrivacyPage() {
  return (
    <LegalDocument
      title="Privacy policy"
      intro={
        <p>
          This explains what {LEGAL.name} (&quot;{LEGAL.brand}&quot;, &quot;we&quot;) collects when you use{" "}
          {LEGAL.brand}, why, who can see it, and what control you have. It is written to be read, not skimmed
          past.
        </p>
      }
      sections={[
        {
          heading: "Whose data is whose",
          body: (
            <>
              <p>
                For your own account details we decide how they are used, so we are responsible for them. For the
                information you put in about your guests and bookings, you decide what to collect and why;
                {" "}
                {LEGAL.brand} stores and processes it for you, on your instructions, and does not use it for
                anything else.
              </p>
            </>
          ),
        },
        {
          heading: "What we collect",
          body: (
            <ul className={li}>
              <li>
                <strong>Your account:</strong> name, email, phone number (optional), password (stored scrambled,
                never readable) and the plan you are on.
              </li>
              <li>
                <strong>Your properties and bookings:</strong> property names and addresses, calendar links,
                bookings, dates, prices, guest names, phone numbers, number of guests, notes, and payments you
                record.
              </li>
              <li>
                <strong>Files you upload:</strong> property photos, bill and receipt photos, and guest ID scans if
                you choose to add them.
              </li>
              <li>
                <strong>Emails you forward:</strong> if you forward Airbnb booking emails to us, we store the
                email and what we read from it. Mail that does not come from Airbnb or Booking.com is discarded.
              </li>
              <li>
                <strong>Your expenses:</strong> bills, vendors, amounts, budgets and recurring costs.
              </li>
              <li>
                <strong>Payments to us:</strong> what you paid for your plan, how, and when.
              </li>
              <li>
                <strong>Security and device information:</strong> your browser or device type and IP address when
                you sign in, so you can see and end your own sessions and so we can spot misuse. If you turn on
                alerts, the address your device gives us to send them.
              </li>
            </ul>
          ),
        },
        {
          heading: "Why we use it",
          body: (
            <ul className={li}>
              <li>to run the service you asked for: your calendars, bookings, expenses and statistics;</li>
              <li>to send you notices about your account, your trial or plan, and your bookings;</li>
              <li>to keep the service secure and to prevent misuse;</li>
              <li>to help you when you contact us for support;</li>
              <li>to keep records we are required to keep, such as payments.</li>
            </ul>
          ),
        },
        {
          heading: "Who can see it",
          body: (
            <>
              <p>
                <strong>You</strong>, and nobody else who uses {LEGAL.brand}. Each host&apos;s data is separated from
                every other host&apos;s by the database itself.
              </p>
              <p>
                <strong>Our staff</strong> can open your account only to give you support or keep the service
                working. When they do, it is read-only and the access is logged.
              </p>
              <p>
                <strong>Companies that help us run the service</strong> process data for us and may not use it for
                their own purposes:
              </p>
              <ul className={li}>
                <li>Supabase: database, sign-in, file storage and background jobs;</li>
                <li>Vercel: hosting the app;</li>
                <li>Cloudflare: receiving the emails you forward;</li>
                <li>Resend: sending you emails about your account;</li>
                <li>
                  the push services of your browser or phone (Google, Apple, Mozilla) if you turn on alerts, which
                  carry only the alert itself.
                </li>
              </ul>
              <p>We do not sell your data and we do not show advertising.</p>
            </>
          ),
        },
        {
          heading: "Where it is processed",
          body: (
            <p>
              The companies above run servers in several countries, so your data may be processed outside
              Pakistan. We choose providers that protect data in transit and at rest.
            </p>
          ),
        },
        {
          heading: "How long we keep it",
          body: (
            <>
              <p>
                We keep your data while your account exists. When you delete your account from the Account page,
                your properties, bookings, guest details, files, expenses and login are removed.
              </p>
              <p>
                Two things stay: a record of what you paid us (with your name and email), and the internal
                activity log we keep for security, which can mention changes made on your account. Copies held in
                our providers&apos; backups expire on their own schedule.
              </p>
            </>
          ),
        },
        {
          heading: "Your choices",
          body: (
            <>
              <ul className={li}>
                <li>
                  <strong>See and take your data:</strong> download a spreadsheet of your bookings, guest
                  payments, expenses and properties from the Account page.
                </li>
                <li>
                  <strong>Correct it:</strong> edit anything you entered, in the app.
                </li>
                <li>
                  <strong>Delete it:</strong> delete your account from the Account page.
                </li>
                <li>
                  <strong>Stop emails and alerts:</strong> switch off alerts in the app. Notices about your
                  account and plan are part of the service.
                </li>
              </ul>
              <p>
                If you cannot do something yourself, write to{" "}
                <a href={`mailto:${LEGAL.email}`} className="text-hostello-gold hover:underline">
                  {LEGAL.email}
                </a>
                .
              </p>
            </>
          ),
        },
        {
          heading: "Your guests' information",
          body: (
            <p>
              You decide what to collect about your guests. Collect only what you need, tell guests what you hold
              and why, and follow the laws that apply to you. Guest ID scans are kept in private storage that only
              you can open (and our staff, if you ask them for support); remove them when you no longer need them.
            </p>
          ),
        },
        {
          heading: "How we protect it",
          body: (
            <p>
              Connections are encrypted. Each host can reach only their own records. Uploaded files are private and
              opened through links that expire. No system is perfectly secure; if something happens that affects
              your data, we will tell you.
            </p>
          ),
        },
        {
          heading: "Cookies",
          body: (
            <p>
              {LEGAL.brand} uses only the cookies it needs to keep you signed in. It uses no advertising or
              tracking cookies, and no analytics service.
            </p>
          ),
        },
        {
          heading: "Children",
          body: <p>{LEGAL.brand} is for adults. It is not meant for anyone under 18.</p>,
        },
        {
          heading: "Changes",
          body: (
            <p>
              If we change this policy in a way that matters, we will tell you by email or in the app. The date at
              the top shows when it last changed.
            </p>
          ),
        },
        {
          heading: "Contact",
          body: (
            <p>
              {LEGAL.name} ·{" "}
              <a href={`mailto:${LEGAL.email}`} className="text-hostello-gold hover:underline">
                {LEGAL.email}
              </a>{" "}
              · {LEGAL.phone}
            </p>
          ),
        },
      ]}
    />
  );
}
