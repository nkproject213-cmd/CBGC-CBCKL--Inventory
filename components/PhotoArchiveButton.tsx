"use client";
import type { Organization } from "@/lib/types";
import PhotoArchiveButtonCore from "./PhotoArchiveButtonCore";
import AssetCardButton from "./AssetCardButton";

/** Export toolbar; the existing photo backup implementation is kept unchanged. */
export default function PhotoArchiveButton({ org }: { org: Organization }) {
  return <><PhotoArchiveButtonCore org={org}/><AssetCardButton org={org}/></>;
}
