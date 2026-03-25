import { createHmac } from "crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "naktal_admin";

export async function verifyAdminSession(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return false;

    const [payloadStr, sig] = token.split(".");
    if (!payloadStr || !sig) return false;

    const secret = process.env.ADMIN_SECRET_KEY ?? "";
    const expected = createHmac("sha256", secret).update(payloadStr).digest("hex");
    if (sig !== expected) return false;

    const expiry = parseInt(payloadStr, 10);
    return Date.now() < expiry;
  } catch {
    return false;
  }
}
