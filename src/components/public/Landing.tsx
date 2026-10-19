import Link from "next/link";
import {
  BarChart3,
  CalendarSync,
  Check,
  Download,
  Mail,
  Receipt,
  Smartphone,
} from "lucide-react";
import { PublicFooter, PublicHeader } from "@/components/public/PublicShell";

/**
 * The public front door at "/" for anyone who is not signed in. Plain server markup,
 * no client code: it has to load instantly on a phone. It claims only what is built.
 * Sign-ups are a switch the owner flips in Settings, so the buttons follow it rather
 * than promise an open door.
 */
export function Landing({ signupOpen, emailLive }: { signupOpen: boolean; emailLive: boolean }) {
  const features = [
    {
      icon: CalendarSync,
      title: "Calendars that agree",
      body: "Bring your Airbnb and Booking.com dates in, and send yours back out, so a night sold on one is closed on the other. Checked every minute.",
    },
    {
      icon: Mail,
      title: "Bookings that add themselves",
      body: "Forward your Airbnb emails and each new booking, change and cancellation lands on your calendar with the guest, dates and price filled in.",
      soon: !emailLive,
    },
    {
      icon: Receipt,
      title: "Expenses and profit",
      body: "Log bills with a photo, repeat the regular ones, set monthly budgets, and see what each property really earns after costs.",
    },
    {
      icon: BarChart3,
      title: "Stats and statements",
      body: "Income, nights and busy months at a glance, plus a monthly statement you can download as a PDF.",
    },
    {
      icon: Smartphone,
      title: "On your phone",
      body: "Install it like an app. New bookings, check-ins and reminders reach your phone as alerts.",
    },
    {
      icon: Download,
      title: "Your data stays yours",
      body: "Download everything as a spreadsheet, or delete your account, whenever you like. No lock-in.",
    },
  ];

  const steps = [
    { n: "1", title: "Sign up", body: "Your email and a password. No card needed." },
    { n: "2", title: "Add your properties", body: "Paste each property's Airbnb calendar link. Your dates appear within a minute." },
    { n: "3", title: "Forward your Airbnb emails", body: "Optional, and it takes a few minutes. Guests and prices fill in by themselves." },
  ];

  const faqs = [
    {
      q: "Does it connect to my Airbnb account?",
      a: "Not through Airbnb's own system: Airbnb does not offer one to individual hosts. Hostello reads the calendar link you paste and the booking emails you choose to forward. It never logs in to your Airbnb account and never changes your listing.",
    },
    {
      q: "What about Booking.com?",
      a: "Calendar links work for both. Adding bookings from emails is for Airbnb at the moment.",
    },
    {
      q: "What happens when the trial ends?",
      a: "Your account becomes read-only for 14 days: you can still see everything and download your data. After that it pauses. Nothing is deleted.",
    },
    {
      q: "Who can see my guests' details?",
      a: "You. Hostello staff can open your account only to help you, it is read-only, and each time is logged.",
    },
  ];

  return (
    <main className="relative min-h-screen flex flex-col overflow-x-clip bg-surface-0 text-ink-primary">
      <span aria-hidden className="orb w-[26rem] h-[26rem] -top-28 -left-32 bg-hostello-purple-glow/40" />
      <span
        aria-hidden
        className="orb w-[22rem] h-[22rem] top-72 -right-40 bg-hostello-magenta/25"
        style={{ animationDelay: "-6s" }}
      />

      <PublicHeader showSignUp={signupOpen} />

      <section className="relative z-10 w-full max-w-5xl mx-auto px-5 md:px-8 pt-10 md:pt-20 pb-14 md:pb-24">
        <p className="eyebrow text-hostello-gold-bright">FOR HOSTS WHO MANAGE THEIR OWN PROPERTIES</p>
        <h1 className="display-lg text-4xl md:text-6xl mt-4 max-w-3xl">
          Run your rental properties from one calm place.
        </h1>
        <p className="text-base md:text-lg text-ink-secondary mt-5 max-w-2xl leading-relaxed">
          Hostello keeps your Airbnb and Booking.com calendars in step, adds bookings from your Airbnb emails,
          and tracks your expenses and profit. Free for 14 days. No card needed.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          {signupOpen ? (
            <Link href="/signup" className="btn btn-gold h-12 px-6 rounded-2xl text-[15px]">
              Start free trial
            </Link>
          ) : (
            <p className="rounded-2xl border border-hostello-gold/30 bg-hostello-gold/10 px-5 py-3 text-sm text-hostello-gold-bright">
              Sign-ups open soon.
            </p>
          )}
          <Link href="/login" className="btn btn-ghost h-12 px-6 rounded-2xl text-[15px]">
            Sign in
          </Link>
        </div>
      </section>

      <section className="relative z-10 w-full max-w-5xl mx-auto px-5 md:px-8 pb-16">
        <h2 className="text-2xl md:text-3xl">Everything in one place</h2>
        <ul className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          {features.map(({ icon: Icon, title, body, soon }) => (
            <li key={title} className="card p-5 flex flex-col gap-3">
              <span className="w-10 h-10 rounded-2xl gradient-brand flex items-center justify-center text-white">
                <Icon size={18} aria-hidden />
              </span>
              <h3 className="text-base flex items-center gap-2 flex-wrap">
                {title}
                {soon && (
                  <span className="text-[10px] uppercase tracking-[0.14em] text-hostello-gold-bright border border-hostello-gold/40 rounded-full px-2 py-0.5">
                    Coming soon
                  </span>
                )}
              </h3>
              <p className="text-sm text-ink-secondary leading-relaxed">{body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="relative z-10 w-full max-w-5xl mx-auto px-5 md:px-8 pb-16">
        <h2 className="text-2xl md:text-3xl">Set up in an evening</h2>
        <ol className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          {steps.map((s) => (
            <li key={s.n} className="card p-5 flex flex-col gap-2">
              <span className="w-8 h-8 rounded-full gradient-gold text-surface-0 flex items-center justify-center text-sm font-extrabold">
                {s.n}
              </span>
              <h3 className="text-base">{s.title}</h3>
              <p className="text-sm text-ink-secondary leading-relaxed">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="relative z-10 w-full max-w-5xl mx-auto px-5 md:px-8 pb-16">
        <div className="card-hero p-6 md:p-10 flex flex-col gap-3">
          <h2 className="text-2xl md:text-3xl">Free for 14 days</h2>
          <p className="text-sm md:text-base text-white/85 max-w-2xl leading-relaxed">
            Try everything with up to 3 properties. No card needed. We will tell you what it costs before your
            trial ends, and you can download your data whatever you decide.
          </p>
          <ul className="text-sm text-white/90 flex flex-col gap-1.5 mt-1">
            {["No card to start", "Cancel by simply not continuing", "Your data is always yours to download"].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <Check size={15} aria-hidden /> {t}
              </li>
            ))}
          </ul>
          {signupOpen && (
            <Link href="/signup" className="btn btn-gold h-12 px-6 rounded-2xl text-[15px] self-start mt-3">
              Start free trial
            </Link>
          )}
        </div>
      </section>

      <section className="relative z-10 w-full max-w-3xl mx-auto px-5 md:px-8 pb-16">
        <h2 className="text-2xl md:text-3xl">Questions</h2>
        <div className="mt-6 flex flex-col gap-3">
          {faqs.map((f) => (
            <details key={f.q} className="card p-4 group">
              <summary className="cursor-pointer list-none text-sm font-semibold flex items-center justify-between gap-3">
                {f.q}
                <span aria-hidden className="text-ink-muted group-open:rotate-45 transition-transform">
                  +
                </span>
              </summary>
              <p className="text-sm text-ink-secondary leading-relaxed mt-3">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <div className="flex-1" />
      <PublicFooter />
    </main>
  );
}
