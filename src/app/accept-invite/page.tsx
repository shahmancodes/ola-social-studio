import { AuthForm } from "@/components/auth-form";
export default async function AcceptInvitePage({ searchParams }: { searchParams: Promise<{ token?: string; email?: string }> }) {
  const { token, email } = await searchParams;
  return <AuthForm inviteToken={token} email={email} />;
}
