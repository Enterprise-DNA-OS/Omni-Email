import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/email/sync";

type RouteParams = { params: Promise<{ messageId: string; attachmentId: string }> };

export async function GET(_request: Request, route: RouteParams): Promise<Response> {
  const { messageId, attachmentId } = await route.params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Look up message → thread → verify user owns thread → get account
  const { data: msg } = await supabase
    .from("messages")
    .select("account_id, provider_message_id, thread_id")
    .eq("id", messageId)
    .maybeSingle();

  if (!msg) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  const { data: thread } = await supabase
    .from("threads")
    .select("id")
    .eq("id", msg.thread_id as string)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!thread) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { data: account } = await supabase
    .from("accounts")
    .select("id, provider")
    .eq("id", msg.account_id as string)
    .maybeSingle();

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const token = await getValidAccessToken(account.id as string);
  const provider = account.provider as string;

  if (provider === "gmail") {
    const providerMsgId = msg.provider_message_id as string;
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${providerMsgId}/attachments/${attachmentId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) {
      return NextResponse.json({ error: "Failed to fetch attachment" }, { status: 502 });
    }
    const json = (await res.json()) as { data?: string };
    if (!json.data) {
      return NextResponse.json({ error: "No attachment data" }, { status: 404 });
    }
    const buffer = Buffer.from(json.data.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment`,
      },
    });
  } else {
    // Outlook
    const providerMsgId = msg.provider_message_id as string;
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/me/messages/${providerMsgId}/attachments/${attachmentId}/$value`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) {
      return NextResponse.json({ error: "Failed to fetch attachment" }, { status: 502 });
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": res.headers.get("Content-Type") ?? "application/octet-stream",
        "Content-Disposition": `attachment`,
      },
    });
  }
}
