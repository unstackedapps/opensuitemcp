import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { deleteNetSuiteToken } from "@/lib/netsuite/tokens";

export async function POST() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await deleteNetSuiteToken(session.user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[NetSuite Disconnect] Error:", error);
    return NextResponse.json(
      { error: "Failed to disconnect NetSuite account" },
      { status: 500 },
    );
  }
}
