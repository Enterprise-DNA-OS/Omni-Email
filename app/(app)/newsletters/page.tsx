import { NewsletterManager } from "@/components/NewsletterManager";

export const metadata = {
  title: "Newsletter Manager — Omni Email",
};

export default function NewslettersPage() {
  return (
    <div className="flex h-full flex-col">
      <NewsletterManager />
    </div>
  );
}
