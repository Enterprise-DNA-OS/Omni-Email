import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ApprovalQueue } from "@/components/ApprovalQueue";
import { ShieldCheck } from "lucide-react";

export const metadata = {
  title: "Approvals — Omni Email",
};

export default async function ApprovalsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 animate-fade-in">
        <div className="flex items-center gap-2.5">
          <ShieldCheck size={24} className="text-accent" strokeWidth={1.8} />
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">Approvals</h1>
        </div>
        <p className="mt-1 text-sm text-text-muted">
          Review AI-suggested actions before they are applied to your email.
        </p>
      </div>
      <ApprovalQueue />
    </div>
  );
}
