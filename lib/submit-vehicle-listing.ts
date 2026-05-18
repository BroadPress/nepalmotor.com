import { NextResponse } from "next/server";
import {
  buildAirtableFields,
  createListingRecord,
  type ListingPayload,
  resolveTableTarget,
  setAttachmentUrls,
} from "@/lib/airtable";
import {
  formatAirtableEnvError,
  getAirtableEnv,
} from "@/lib/airtable-env";
import { publishFilesForAirtable } from "@/lib/attachment-staging";
import {
  parseEvBrandFromForm,
  parseFeaturesFromForm,
} from "@/lib/form-payload-parse";

function validationError(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function parseListingPayload(form: FormData): ListingPayload | null {
  const fullName = String(form.get("fullName") ?? "").trim();
  const phone = String(form.get("phone") ?? "").trim();
  const city = String(form.get("city") ?? "").trim();
  const year = String(form.get("year") ?? "").trim();
  const vehicleType = String(form.get("vehicleType") ?? "").trim();
  const vehicleBrand = String(form.get("vehicleBrand") ?? "").trim();
  const vehicleModel = String(form.get("vehicleModel") ?? "").trim();
  const vehicleColor = String(form.get("vehicleColor") ?? "").trim();
  const kmDriven = String(form.get("kmDriven") ?? "").trim();
  const evBrand = parseEvBrandFromForm(form);
  const finance = String(form.get("finance") ?? "").trim();
  const transmission = String(form.get("transmission") ?? "").trim();
  const fuelType = String(form.get("fuelType") ?? "").trim();

  if (!fullName) return null;
  if (!phone) return null;
  if (!city) return null;
  if (!year) return null;
  if (!vehicleType) return null;
  if (!vehicleBrand) return null;
  if (!vehicleModel) return null;
  if (!vehicleColor) return null;
  if (!kmDriven) return null;
  if (!evBrand) return null;
  if (!finance) return null;
  if (!transmission) return null;
  if (!fuelType) return null;

  const features = parseFeaturesFromForm(form);

  return {
    fullName,
    email: String(form.get("email") ?? ""),
    phone,
    city,
    year,
    vehicleType,
    vehicleBrand,
    vehicleModel,
    vehicleColor,
    kmDriven,
    evBrand,
    finance,
    transmission,
    accidents: String(form.get("accidents") ?? ""),
    fuelType,
    features,
    notes: String(form.get("notes") ?? ""),
  };
}

export async function handleVehicleListingSubmission(
  request: Request,
): Promise<NextResponse> {
  const env = getAirtableEnv();
  if (!env.ok) {
    return NextResponse.json(
      { error: formatAirtableEnvError(env.missing) },
      { status: 500 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return validationError("Invalid form data");
  }

  const payload = parseListingPayload(form);
  if (!payload) {
    return validationError("Please fill in all required fields.");
  }

  const docFiles = form
    .getAll("documents")
    .filter((f): f is File => f instanceof File && f.size > 0);
  const photoFiles = form
    .getAll("photos")
    .filter((f): f is File => f instanceof File && f.size > 0);

  try {
    const tableTarget = await resolveTableTarget();
    const fields = buildAirtableFields(payload, tableTarget);
    const recordId = await createListingRecord(fields);
    const { attachmentFieldNames } = tableTarget;

    const uploadFailures: string[] = [];

    const uploadGroup = async (
      files: File[],
      fieldName: string | undefined,
      missingLabel: string,
    ) => {
      if (files.length === 0) return;
      if (!fieldName) {
        uploadFailures.push(
          ...files.map((f) => `${f.name} (${missingLabel})`),
        );
        return;
      }

      try {
        const urls = await publishFilesForAirtable(files, request);
        await setAttachmentUrls(recordId, fieldName, urls);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Upload failed";
        uploadFailures.push(...files.map((f) => `${f.name}: ${msg}`));
      }
    };

    await uploadGroup(
      docFiles,
      attachmentFieldNames.documents,
      "no document field in Airtable",
    );
    await uploadGroup(
      photoFiles,
      attachmentFieldNames.photos,
      "no photo field in Airtable",
    );

    if (uploadFailures.length > 0) {
      return NextResponse.json({
        ok: true,
        recordId,
        received: {
          evBrand: payload.evBrand,
          featuresCount: payload.features.length,
        },
        warning: `Saved, but these files could not be uploaded: ${uploadFailures.join(", ")}`,
      });
    }

    return NextResponse.json({
      ok: true,
      recordId,
      received: {
        evBrand: payload.evBrand,
        featuresCount: payload.features.length,
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to submit listing";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
