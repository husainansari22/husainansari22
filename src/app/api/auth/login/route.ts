import { NextRequest, NextResponse } from "next/server";

const ACCESS_CODE = process.env.ACCESS_CODE || "@535846.oZ";
const COOKIE_NAME = "kelvinoz_access";
const MAX_AGE = 60 * 60 * 24 * 30;

async function verifyLogin(code: string | undefined) {
  if (!code?.trim() || code.trim() !== ACCESS_CODE) {
    return NextResponse.json({ error: "Wrong access code." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, ACCESS_CODE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: MAX_AGE,
    path: "/",
  });
  return response;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { code?: string };
    return verifyLogin(body.code);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
