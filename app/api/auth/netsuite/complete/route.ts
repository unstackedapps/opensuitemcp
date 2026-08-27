import { completeNetSuiteLogin } from "@/lib/auth/netsuite-login-routes";

export async function GET(request: Request) {
  return completeNetSuiteLogin(request);
}
