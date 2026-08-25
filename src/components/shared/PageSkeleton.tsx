/**
 * What a page segment shows while its server render is in flight.
 *
 * Without a `loading.tsx` boundary a navigation just sits on the old screen
 * until the server answers — with the database in Sydney that reads as a frozen
 * app. This paints the shell's shape immediately and streams the real page in
 * behind it.
 */
export function PageSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>

      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="skeleton h-7 w-52" />
          <div className="skeleton h-3.5 w-72 max-w-full" />
        </div>
        <div className="skeleton h-9 w-32 hidden sm:block" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="skeleton h-3 w-20" />
              <div className="skeleton h-8 w-8 rounded-lg" />
            </div>
            <div className="skeleton h-7 w-24" />
            <div className="skeleton h-3 w-28" />
          </div>
        ))}
      </div>

      <div className="grid xl:grid-cols-2 gap-4 items-start">
        {[0, 1].map((col) => (
          <div key={col} className="card p-5 flex flex-col gap-4">
            <div className="skeleton h-4 w-36" />
            <div className="flex flex-col gap-3">
              {[0, 1, 2, 3].map((row) => (
                <div key={row} className="flex items-center gap-3">
                  <div className="skeleton h-8 w-8 rounded-full shrink-0" />
                  <div className="flex-1 flex flex-col gap-1.5">
                    <div className="skeleton h-3.5 w-1/2" />
                    <div className="skeleton h-3 w-1/3" />
                  </div>
                  <div className="skeleton h-5 w-16 shrink-0" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
