import { NextResponse } from "next/server";
import {
  buildAirtableFields,
  createListingRecord,
  getRecordAttachments,
  resolveFeaturesColumn,
  resolveTableTarget,
  setAttachmentUrls,
  uploadAttachmentToField,
  type ListingPayload,
} from "@/lib/airtable";
import {
  formatAirtableEnvError,
  getAirtableEnv,
} from "@/lib/airtable-env";
import { publishFilesForAirtable } from "@/lib/attachment-staging";
import {
  diagnosePhotoUploadForm,
  parseAttachmentsFromForm,
  parseEvBrandFromForm,
  parseFeaturesFromForm,
  parseFinanceFromForm,
  parseNotesFromForm,
  readSubmissionFormData,
  reconcileFinanceAndNotes,
} from "@/lib/form-payload-parse";

function validationError(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function parseListingPayload(
  form: FormData,
): Promise<ListingPayload | null> {
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
  const { finance, notes } = reconcileFinanceAndNotes(
    parseFinanceFromForm(form),
    parseNotesFromForm(form),
    form,
  );
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

  const features = await parseFeaturesFromForm(form);

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
    notes,
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
    form = await readSubmissionFormData(request);
  } catch {
    return validationError("Invalid form data");
  }

  const payload = await parseListingPayload(form);
  if (!payload) {
    return validationError("Please fill in all required fields.");
  }

  const { documents: docFiles, photos: photoFiles } =
    await parseAttachmentsFromForm(form);

  try {
    const tableTarget = await resolveTableTarget();
    const { columnName: featuresAirtableColumn } = resolveFeaturesColumn(
      tableTarget.selectChoices,
    );
    const fields = buildAirtableFields(payload, tableTarget);
    const recordId = await createListingRecord(fields);
    const { attachmentFieldNames, attachmentFieldIds } = tableTarget;

    const uploadFailures: string[] = [];

    const uploadGroup = async (
      files: File[],
      fieldName: string | undefined,
      fieldId: string | undefined,
      missingLabel: string,
    ) => {
      if (files.length === 0) return;
      const fieldRef = fieldId ?? fieldName;
      if (!fieldRef || !fieldName) {
        uploadFailures.push(
          ...files.map((f) => `${f.name} (${missingLabel})`),
        );
        return;
      }

      for (const file of files) {
        try {
          await uploadAttachmentToField(recordId, fieldRef, file);
        } catch (directErr) {
          if (fieldId && fieldName && fieldRef === fieldId) {
            try {
              await uploadAttachmentToField(recordId, fieldName, file);
              continue;
            } catch {
              /* try URL fallback below */
            }
          }
          try {
            const [url] = await publishFilesForAirtable([file], request);
            let existing: Awaited<ReturnType<typeof getRecordAttachments>> = [];
            try {
              existing = await getRecordAttachments(recordId, fieldName);
            } catch {
              // Record read failed; still try URL-only upload.
            }
            await setAttachmentUrls(recordId, fieldName, [url], existing);
          } catch (fallbackErr) {
            const directMsg =
              directErr instanceof Error ? directErr.message : "Upload failed";
            const fallbackMsg =
              fallbackErr instanceof Error
                ? fallbackErr.message
                : "Upload failed";
            uploadFailures.push(`${file.name}: ${directMsg}; ${fallbackMsg}`);
          }
        }
      }
    };

    await uploadGroup(
      docFiles,
      attachmentFieldNames.documents,
      attachmentFieldIds.documents,
      "no document field in Airtable",
    );
    await uploadGroup(
      photoFiles,
      attachmentFieldNames.photos,
      attachmentFieldIds.photos,
      "no photo field in Airtable",
    );

    const photoDiagnostic = diagnosePhotoUploadForm(form, photoFiles.length);
    const photoNames = new Set(photoFiles.map((f) => f.name));
    const photoUploadFailed = uploadFailures.some((msg) => {
      const name = msg.split(":")[0]?.trim();
      return name && photoNames.has(name);
    });

    if (photoFiles.length > 0 && photoUploadFailed) {
      photoDiagnostic.likelyFault = "airtable";
      photoDiagnostic.hint =
        "Photos reached the server but Airtable rejected the upload. Check API token (data.records:write), field name, and file size (max 5 MB).";
    } else if (
      photoFiles.length > 0 &&
      !attachmentFieldNames.photos
    ) {
      photoDiagnostic.likelyFault = "server";
      photoDiagnostic.hint =
        "Photos were parsed but no photo attachment column was found in the Airtable table.";
    }

    const responseBody = {
      ok: true as const,
      recordId,
      received: {
        evBrand: payload.evBrand,
        features: payload.features,
        featuresAirtableColumn,
        attachments: { documents: docFiles.length, photos: photoFiles.length },
      },
      photoUpload: photoDiagnostic,
    };

    if (uploadFailures.length > 0) {
      return NextResponse.json({
        ...responseBody,
        warning: `Saved, but these files could not be uploaded: ${uploadFailures.join(", ")}`,
      });
    }

    return NextResponse.json(responseBody);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to submit listing";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
