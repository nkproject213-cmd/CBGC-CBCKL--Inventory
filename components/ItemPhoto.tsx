import Image, { type ImageProps } from "next/image";
import { isPhotoUrl } from "@/lib/flexible-fields";

export default function ItemPhoto({ src, ...props }: Omit<ImageProps, "src"> & { src: string }) {
  if (!isPhotoUrl(src)) return null;
  const url = new URL(src);
  const inBlobStore = url.protocol === "https:" && !url.port && url.hostname.endsWith(".blob.vercel-storage.com");
  return <Image {...props} src={src} unoptimized={!inBlobStore} referrerPolicy="no-referrer"/>;
}
