import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { currentClient, viewingAs } from "@/lib/auth";
import { listPropertyPhotos, propertyPhotoUrl } from "@/lib/property-photos";
import { PageHeader } from "@/components/shared/PageHeader";
import { PhotoGallery } from "@/components/shared/PhotoGallery";

export default async function OwnPropertyPhotosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [clientRecord, viewAs] = await Promise.all([currentClient(), viewingAs()]);
  if (!clientRecord) redirect("/client");

  const supabase = await createClient();
  // Filtered by client here, not left to the view: an admin viewing as this
  // owner reads every client's units.
  const { data: property } = await supabase
    .from("properties_v")
    .select("id, name, photo_path")
    .eq("id", id)
    .eq("client_id", clientRecord.id)
    .maybeSingle();
  if (!property) notFound();

  const photos = await listPropertyPhotos(supabase, property.id);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={property.name} sub="Photos" back={{ href: "/client/properties", label: "Properties" }} />
      <PhotoGallery
        propertyId={property.id}
        unitName={property.name}
        photos={photos}
        // Viewing as an owner is read-only; saving a photo still works.
        canEdit={!viewAs}
        legacyCoverUrl={photos.some((p) => p.isCover) ? null : propertyPhotoUrl(property.photo_path)}
      />
    </div>
  );
}
