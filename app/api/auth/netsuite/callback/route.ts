import { handleNetSuiteLoginCallback } from "@/lib/auth/netsuite-login-routes";

export async function GET(request: Request) {
  return handleNetSuiteLoginCallback(request);
}
