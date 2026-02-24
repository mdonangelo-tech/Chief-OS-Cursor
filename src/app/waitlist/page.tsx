import { WaitlistClient } from "./waitlist-client";

export default async function WaitlistPage({ searchParams }: any) {
  const sp = await Promise.resolve(searchParams ?? {});
  const initialEmail = typeof sp?.email === "string" ? sp.email : "";
  return <WaitlistClient initialEmail={initialEmail} />;
}

