import { NextResponse } from "next/server";
import { currentUser, updateDisplayName } from "@/lib/platform-auth";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  try {
    const body = await request.json() as { displayName?: unknown };
    if (typeof body.displayName !== "string") throw new Error("Enter a name.");
    const displayName = updateDisplayName(user.id, body.displayName);
    return NextResponse.json({ displayName });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save your profile." }, { status: 400 });
  }
}
