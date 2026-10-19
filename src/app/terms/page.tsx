import { LegalDocument } from "@/components/public/PublicShell";
import { LEGAL } from "@/lib/legal";

export const metadata = { title: "Terms of service · Hostello" };

const li = "list-disc pl-5 flex flex-col gap-1";

export default function TermsPage() {
  return (
    <LegalDocument
      title="Terms of service"
      intro={
        <p>
          These terms are an agreement between you and {LEGAL.name} (&quot;{LEGAL.brand}&quot;, &quot;we&quot;,
          &quot;us&quot;). By creating an account or using {LEGAL.brand} you accept them. If you do not agree,
          do not use the service.
        </p>
      }
      sections={[
        {
          heading: "What Hostello is",
          body: (
            <>
              <p>
                {LEGAL.brand} is software for people who manage their own short-term-rental properties. It keeps
                your calendars together, records your bookings and guests, tracks your expenses and shows your
                income and statistics.
              </p>
              <p>
                {LEGAL.brand} is not a booking channel and not a payment service. We do not take, hold or move
                money between you and your guests, and we do not list, price or manage your properties on any
                platform. {LEGAL.brand} is not affiliated with, endorsed by or sponsored by Airbnb or
                Booking.com.
              </p>
            </>
          ),
        },
        {
          heading: "Your account",
          body: (
            <>
              <p>You must be at least 18 and able to enter into a contract. When you sign up you agree to:</p>
              <ul className={li}>
                <li>give accurate details and keep them up to date;</li>
                <li>keep your password private, and use one login for one person;</li>
                <li>tell us straight away if you think someone else has used your account.</li>
              </ul>
              <p>You are responsible for what happens under your account.</p>
            </>
          ),
        },
        {
          heading: "Free trial and plans",
          body: (
            <>
              <p>
                New accounts start with a 14-day free trial. No card is needed, and the trial covers a limited
                number of properties. After the trial you need a paid plan to keep adding and changing things.
              </p>
              <p>
                We will tell you the price, what it covers and how to pay before you are asked to pay anything.
                If your trial or plan ends and is not renewed, your account becomes read-only for 14 days: you
                can still see everything and download your data. After that it is paused. Nothing is deleted
                because a plan ended.
              </p>
            </>
          ),
        },
        {
          heading: "Payments",
          body: (
            <>
              <p>
                Prices are in Pakistani rupees. The price, the billing period and the way to pay are shown to you
                before you pay, and a payment starts or extends your plan for the period you paid for.
              </p>
              <p>Refunds, if any, are described at the time you buy.</p>
            </>
          ),
        },
        {
          heading: "Your data",
          body: (
            <>
              <p>
                What you enter is yours: your properties, bookings, guest details, files, expenses and notes. You
                give us permission to store and process it only so we can provide the service to you.
              </p>
              <p>
                You are responsible for having the right to enter your guests&apos; details, including any ID
                scans, and for following the laws that apply to collecting and keeping them. You can download
                your data and delete your account yourself, any time, from the Account page.
              </p>
            </>
          ),
        },
        {
          heading: "Airbnb, Booking.com and your calendars",
          body: (
            <>
              <p>
                {LEGAL.brand} connects to those platforms only in ways you set up: a calendar link you paste, and
                booking emails you choose to forward. We never log in to your account on a platform and never
                change your listing. You stay responsible for following each platform&apos;s own rules.
              </p>
              <p>
                Calendar links and emails can be delayed, can stop working if a platform changes them, and can
                be wrong. {LEGAL.brand} cannot promise that two bookings for the same nights will never
                happen. Check important dates on the platform itself.
              </p>
              <p>
                Bookings added from forwarded emails are read automatically and can contain mistakes. You should
                check them, and you can edit or delete any booking.
              </p>
            </>
          ),
        },
        {
          heading: "What you must not do",
          body: (
            <ul className={li}>
              <li>use the service for anything unlawful, or to store data you have no right to hold;</li>
              <li>try to see another person&apos;s data, or to break or bypass the service&apos;s protections;</li>
              <li>overload the service, scrape it, or resell access to it;</li>
              <li>upload files that contain malicious code.</li>
            </ul>
          ),
        },
        {
          heading: "The service as we provide it",
          body: (
            <>
              <p>
                We work to keep {LEGAL.brand} available and accurate, but it is provided &quot;as is&quot;. It may be
                unavailable from time to time, for example during maintenance. We may change or remove features;
                if a change would seriously affect you, we will tell you in advance where we reasonably can.
              </p>
              <p>
                Statistics, profit figures and statements are only as good as the information entered or read
                into the service. They are for your own records and are not tax, legal or accounting advice.
              </p>
            </>
          ),
        },
        {
          heading: "Ending your account",
          body: (
            <>
              <p>
                You can delete your account at any time from the Account page. Doing so permanently removes your
                properties, bookings, guest details, files and login. We keep a record of what you paid us, and
                the internal activity log we keep for security.
              </p>
              <p>
                We may suspend or close an account that breaks these terms, is used to harm others or the
                service, or has an unpaid balance. Where reasonable we will warn you first and give you a chance
                to download your data.
              </p>
            </>
          ),
        },
        {
          heading: "Our responsibility to you",
          body: (
            <>
              <p>
                To the extent the law allows, {LEGAL.brand} is not liable for indirect or consequential loss,
                including lost bookings, lost income or lost profit, or for loss caused by a platform, a
                provider or something outside our control.
              </p>
              <p>
                To the extent the law allows, our total liability to you for anything connected with the service
                is limited to the fees you paid us in the 12 months before the claim.
              </p>
              <p>Nothing here limits a liability that cannot lawfully be limited.</p>
            </>
          ),
        },
        {
          heading: "Law and disputes",
          body: (
            <p>
              These terms are governed by the laws of {LEGAL.law}. The courts of {LEGAL.court} have jurisdiction
              over any dispute about them or the service.
            </p>
          ),
        },
        {
          heading: "Changes to these terms",
          body: (
            <p>
              We may update these terms. If a change matters, we will tell you by email or in the app before it
              applies. If you keep using {LEGAL.brand} after a change takes effect, you accept the new terms.
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
