import { handleVehicleListingSubmission } from "@/lib/submit-vehicle-listing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleVehicleListingSubmission(request);
}
