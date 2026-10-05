import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listPropertyPhotos, propertyPhotoUrl } from "@/lib/property-photos";
import { PageHeader } from "@/components/shared/PageHeader";
import { PhotoGallery } from "@/components/shared/PhotoGallery";

export default async function UnitPhotosPage({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = await params;
  const supabase = await createClient();

  const [{ data: property }, photos] = await Promise.all([
    supabase
      .from("properties_v")
      .select("id, name, photo_path, clients:clients_v(name)")
      .eq("id", propertyId)
      .maybeSingle(),
    listPropertyPhotos(supabase, propertyId),
  ]);
  if (!property) notFound();

  const owner = (property.clients as unknown as { name: string } | null)?.name;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={property.name} sub={owner} back={{ href: "/admin/photos", label: "Photos" }} />
      <PhotoGallery
        propertyId={property.id}
        unitName={property.name}
        photos={photos}
        canEdit
        legacyCoverUrl={photos.some((p) => p.isCover) ? null : propertyPhotoUrl(property.photo_path)}
      />
    </div>
  );
}
