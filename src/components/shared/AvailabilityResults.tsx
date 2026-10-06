import { EmptyState } from "@/components/shared/PageHeader";
import Link from "next/link";
import { CalendarPlus, CalendarCheck, TriangleAlert, Users, SearchX } from "lucide-react";
import { formatPKR } from "@/lib/payout";
import { formatDayMonth, todayISO } from "@/lib/calendar";
import { propertyTypeLabel } from "@/lib/property-types";
import { unitArt } from "@/lib/unit-tint";
import { CopyLinkButton } from "@/components/admin/CopyLinkButton";
import {
  stayNights,
  stayCheckOut,
  type AvailabilityCriteria,
  type AvailabilityMatch,
  type AvailabilityResult,
} from "@/lib/availability-search";

/**
 * The answer to an enquiry. Shared by both portals — staff see the free units
 * under each client, the owner sees their own as one list.
 */
export function AvailabilityResults({
  result,
  criteria,
  base,
  showClient,
  canEditProperties,
}: {
  result: AvailabilityResult;
  criteria: AvailabilityCriteria;
  /** Portal root, so the Book link lands in the right place. */
  base: "/admin" | "/client";
  showClient: boolean;
  /** Only the owner can fill a missing rate in, so only they get the link. */
  canEditProperties: boolean;
}) {
  const { first, nights } = stayNights(criteria.stay);
  const isShort = criteria.stay.kind === "short";
  const found = result.matches.length;

  const window = isShort
    ? `${formatDayMonth(first)} · short stay`
    : `${formatDayMonth(first)} → ${formatDayMonth(stayCheckOut(criteria.stay))} · ${nights} ${
        nights === 1 ? "night" : "nights"
      }`;
  const tonight = !isShort && nights === 1 && first === todayISO();

  const row = (m: AvailabilityMatch, withClient: boolean) => (
    <MatchRow
      key={m.id}
      match={m}
      criteria={criteria}
      base={base}
      showClient={withClient}
      canEditProperties={canEditProperties}
    />
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-col gap-0.5">
          <p className="text-lg font-bold">
            <span className="num text-hostello-gold">{found}</span>
            <span className="num text-ink-muted font-semibold"> of {result.units}</span>{" "}
            {result.units === 1 ? "unit" : "units"} free{tonight && " tonight"}
          </p>
          <p className="text-xs text-ink-secondary">
            {window}
            {result.ruledOut > 0 && ` · ${result.ruledOut} more free but outside your filters`}
          </p>
        </div>
        {found > 0 && (
          <CopyLinkButton
            value={guestList(result.matches, criteria)}
            label="Copy list for guest"
            className="btn btn-ghost btn-sm"
          />
        )}
      </div>

      {found === 0 && result.needsDetails.length === 0 ? (
        <EmptyState icon={SearchX} title={<>{result.freeOnDates === 0 ? "Nothing is free on those dates. Try other dates or another city." : `${result.freeOnDates} ${ result.freeOnDates === 1 ? "unit is" : "units are" } free on those dates, but none meet the guest count or budget you set.`}</>} />
      ) : (
        byClient(result.matches, showClient).map((g) => (
          <section key={g.label ?? "all"} className="flex flex-col gap-2.5">
            {g.label && (
              <h2 className="text-sm font-semibold text-ink-secondary">
                {g.label} <span className="num text-ink-muted font-normal">· {g.units.length} free</span>
              </h2>
            )}
            <ul className="grid grid-cols-1 xl:grid-cols-2 gap-3">{g.units.map((m) => row(m, false))}</ul>
          </section>
        ))
      )}

      {result.needsDetails.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <div className="flex items-start gap-2">
            <TriangleAlert size={14} className="text-status-pending mt-0.5 shrink-0" />
            {/* Three audiences read this — the owner, ops and the property's
                owner — so it stays in nobody's voice. "Hostello has not
                recorded it" is wrong in front of ops, who are Hostello. */}
            <p className="text-xs text-ink-secondary">
              Free on those dates, but nobody has recorded the figure your filter asked
              about yet, so these are not ranked with the rest.
            </p>
          </div>
          <ul className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {result.needsDetails.map((m) => row(m, showClient))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Staff read the free units client by client; an owner has one client, so one list. */
function byClient(
  matches: AvailabilityMatch[],
  showClient: boolean
): { label: string | null; units: AvailabilityMatch[] }[] {
  if (!showClient) return [{ label: null, units: matches }];

  const groups = new Map<string, AvailabilityMatch[]>();
  for (const m of matches) groups.set(m.clientName, [...(groups.get(m.clientName) ?? []), m]);
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, units]) => ({ label, units }));
}

/**
 * The free units as plain text for a guest, by city. Whose unit it is stays
 * out of it — that is Hostello's business, not the guest's.
 */
function guestList(matches: AvailabilityMatch[], criteria: AvailabilityCriteria): string {
  const { first, nights } = stayNights(criteria.stay);
  const isShort = criteria.stay.kind === "short";
  const lines = [
    isShort
      ? `Available on ${formatDayMonth(first)} (short stay)`
      : `Available ${formatDayMonth(first)} to ${formatDayMonth(stayCheckOut(criteria.stay))} (${nights} ${
          nights === 1 ? "night" : "nights"
        })`,
  ];

  const cities = [...new Set(matches.map((m) => m.city ?? m.location))].sort();
  for (const city of cities) {
    lines.push("", city);
    for (const m of matches.filter((x) => (x.city ?? x.location) === city)) {
      const parts = [m.name, propertyTypeLabel(m.type)];
      if (m.maxGuests !== null) parts.push(`sleeps ${m.maxGuests}`);
      if (m.rate !== null) {
        parts.push(
          isShort || nights === 1
            ? formatPKR(m.rate)
            : `${formatPKR(m.rate)}/night (${formatPKR(m.total ?? 0)} total)`
        );
      }
      lines.push(`• ${parts.join(" · ")}`);
    }
  }
  return lines.join("\n");
}

function MatchRow({
  match,
  criteria,
  base,
  showClient,
  canEditProperties,
}: {
  match: AvailabilityMatch;
  criteria: AvailabilityCriteria;
  base: "/admin" | "/client";
  showClient: boolean;
  canEditProperties: boolean;
}) {
  const { first } = stayNights(criteria.stay);
  const isShort = criteria.stay.kind === "short";

  const bookParams = new URLSearchParams({ property: match.id, date: first });
  // A short stay's check-out is derived on the form from its date, so only a
  // nightly stay hands one over.
  if (!isShort) bookParams.set("checkout", stayCheckOut(criteria.stay));

  const place = [propertyTypeLabel(match.type), match.city ?? match.location]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="card overflow-hidden flex">
      <Link
        href={
          base === "/admin" ? `/admin/photos/${match.id}` : `/client/properties/${match.id}/photos`
        }
        aria-label={`Photos of ${match.name}`}
        className="w-24 sm:w-28 shrink-0"
        style={{ background: unitArt(match.name, match.photoPath) }}
      />

      <div className="flex-1 min-w-0 p-3 flex flex-col gap-1">
        <p className="font-semibold truncate">{match.name}</p>
        <p className="text-xs text-ink-secondary truncate">
          {place}
          {showClient && ` · ${match.clientName}`}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs">
          <span className="inline-flex items-center gap-1 text-ink-secondary">
            <Users size={12} />
            {match.maxGuests === null ? (
              <span className="text-ink-muted">Sleeps not set</span>
            ) : (
              `Sleeps ${match.maxGuests}`
            )}
          </span>
          {match.rate === null ? (
            <span className="text-ink-muted">No rate set</span>
          ) : (
            <span className="num text-ink-secondary">
              {formatPKR(match.rate)}
              {isShort ? " per stay" : " / night"}
            </span>
          )}
        </div>
        <p className="inline-flex items-center gap-1 text-xs text-status-available">
          <CalendarCheck size={12} />
          {match.freeUntil ? `Free until ${formatDayMonth(match.freeUntil)}` : "Nothing booked after"}
        </p>
      </div>

      <div className="p-3 flex flex-col items-end justify-between gap-2 shrink-0">
        {match.total === null ? (
          <p className="text-xs text-ink-muted">Total unknown</p>
        ) : (
          <div className="text-right">
            <p className="num text-base font-bold">{formatPKR(match.total)}</p>
            <p className="text-[11px] text-ink-muted">for the stay</p>
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <Link href={`${base}/bookings/new?${bookParams}`} className="btn btn-gold btn-sm">
            <CalendarPlus size={14} />
            Book
          </Link>
          {canEditProperties && match.missing.length > 0 && (
            <Link
              href={`/admin/clients/${match.clientId}/properties/${match.id}/edit`}
              className="btn btn-ghost btn-sm"
            >
              Add details
            </Link>
          )}
        </div>
      </div>
    </li>
  );
}
