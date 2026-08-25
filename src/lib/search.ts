/** Shape of one global-search hit. Both portals return these. */
export type SearchResult = {
  kind: "client" | "property" | "booking";
  id: string;
  title: string;
  subtitle: string;
  href: string;
};
