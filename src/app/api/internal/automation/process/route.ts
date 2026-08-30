import { processAutomationRequest } from "@/shared/lib/automation/process-route";

export async function GET(request: Request) {
  return processAutomationRequest(request, false);
}

export async function POST(request: Request) {
  return processAutomationRequest(request, true);
}
