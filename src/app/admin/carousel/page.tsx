import Link from "next/link";
import { CarouselForm } from "@/components/admin/CarouselForm";
import { getCarouselImages, MAX_CAROUSEL_IMAGES } from "@/lib/db/carousel";

export default async function AdminCarousel() {
  const { images, isDefault } = await getCarouselImages();

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-3xl font-semibold tracking-tight">Carousel</h1>
      <p className="mt-2 mb-8 text-stone">
        The &ldquo;peek at the closet&rdquo; photos on the{" "}
        <Link href="/" className="link">
          home page
        </Link>{" "}
        and{" "}
        <Link href="/signup" className="link">
          signup page
        </Link>
        , in the order shown here.
      </p>

      <CarouselForm
        initialImages={images}
        initialIsDefault={isDefault}
        maxImages={MAX_CAROUSEL_IMAGES}
      />
    </div>
  );
}
