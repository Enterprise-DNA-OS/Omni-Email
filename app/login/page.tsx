import { Suspense } from "react";
import { LoginForm } from "@/components/LoginForm";
import { Loader2 } from "lucide-react";

export default function LoginPage() {
  return (
    <div className="flex min-h-full">
      {/* Brand panel */}
      <div className="hidden flex-col justify-between bg-gradient-to-br from-indigo-600 via-indigo-500 to-violet-500 p-10 lg:flex lg:w-[55%]">
        <div>
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="Omni Email" width={40} height={40} className="rounded-xl" />
            <span className="text-xl font-bold text-white">Omni Email</span>
          </div>
        </div>
        <div className="max-w-md">
          <h2 className="text-3xl font-bold leading-tight text-white">
            Your unified inbox
            <br />
            for email &amp; calendar.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-indigo-100">
            Connect Gmail and Outlook accounts, sync conversations, manage tags, and stay on top of your schedule — all in one place.
          </p>
        </div>
        <p className="text-sm text-indigo-200">
          Secure authentication powered by Supabase
        </p>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center bg-surface-0 p-6">
        <Suspense
          fallback={
            <div className="flex items-center gap-2 text-sm text-text-muted">
              <Loader2 size={16} className="animate-spin" />
              Loading...
            </div>
          }
        >
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
