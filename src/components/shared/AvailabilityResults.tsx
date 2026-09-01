import Link from "next/link";
import { CalendarPlus, TriangleAlert, Users } from "lucide-react";
import { formatPKR } from "@/lib/payout";
import { formatDayMonth } from "@/lib/calendar";
import { propertyTypeLabel } from "@/lib/property-types";
import {
  stayNights,
  stayCheckOut,
  type AvailabilityCriteria,
  type AvailabilityMatch,
  type AvailabilityResult,
} from "@/lib/availability-search";

/**
 * The answer to an enquiry. Shared by both portals — the owner sees the same
 * rows for their own units, without the client column.
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
  const { first, last, nights } = stayNights(criteria.stay);
  const isShort = criteria.stay.kind === "short";
  const window = isShort
    ? formatDayMonth(first)
    : `${formatDayMonth(first)} → ${formatDayMonth(last)}`;
  const found = result.matches.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
        <span className="font-medium">
          {found} {found === 1 ? "unit" : "units"} available
        </span>
        <span className="text-ink-muted">·</span>
        <span className="text-ink-secondary">{window}</span>
        <span className="text-ink-muted">·</span>
        <span className="text-ink-secondary">
          {isShort ? "short stay" : `${nights} ${nights === 1 ? "night" : "nights"}`}
        </span>
        {result.ruledOut > 0 && (
          <span className="text-ink-muted">
            · {result.ruledOut} free but outside your requirements
          </span>
        )}
      </div>

      {found === 0 && result.needsDetails.length === 0 ? (
        <div className="card p-8 text-center text-sm text-ink-secondary">
          {result.freeOnDates === 0
            ? "Nothing is free on those dates. Try another window, or widen the location filter."
            : `${result.freeOnDates} ${
                result.freeOnDates === 1 ? "unit is" : "units are"
              } free on those dates, but none meet the guest count or budget you set.`}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {result.matches.map((m) => (
            <MatchRow
              key={m.id}
              match={m}
              criteria={criteria}
              base={base}
              showClient={showClient}
              canEditProperties={canEditProperties}
            />
          ))}
        </ul>
      )}

      {result.needsDetails.length > 0 && (
        <div className="flex flex-col gap-2">
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
          <ul className="flex flex-col gap-2">
            {result.needsDetails.map((m) => (
              <MatchRow
                key={m.id}
                match={m}
                criteria={criteria}
                base={base}
                showClient={showClient}
                canEditProperties={canEditProperties}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
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
    <li className="card p-4 flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="font-medium truncate">{match.name}</p>
        <p className="text-xs text-ink-secondary mt-0.5 truncate">
          {place}
          {showClient && ` · ${match.clientName}`}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs">
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
            <span className="text-ink-secondary">
              {formatPKR(match.rate)}
              {isShort ? " per stay" : " / night"}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <div className="text-right">
          {match.total === null ? (
            <p className="text-xs text-ink-muted">Total unknown</p>
          ) : (
            <>
              <p className="text-base font-medium">{formatPKR(match.total)}</p>
              <p className="text-xs text-ink-muted">for the stay</p>
            </>
          )}
        </div>
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
