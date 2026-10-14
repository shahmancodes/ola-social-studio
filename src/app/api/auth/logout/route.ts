import { NextResponse } from "next/server";
import { endSession } from "@/lib/platform-auth";
export async function POST() { await endSession(); return NextResponse.json({ ok: true }); }
