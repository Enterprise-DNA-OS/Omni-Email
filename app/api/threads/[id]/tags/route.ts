import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/audit/log";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  const { id: threadId } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: th } = await supabase
    .from("threads")
    .select("id")
    .eq("id", threadId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!th) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let tagId = "";
  try {
    const body = (await request.json()) as { tagId?: string };
    tagId = body.tagId ?? "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!tagId) {
    return NextResponse.json({ error: "tagId required" }, { status: 400 });
  }

  const { data: tag } = await supabase
    .from("tags")
    .select("id")
    .eq("id", tagId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!tag) {
    return NextResponse.json({ error: "Tag not found" }, { status: 404 });
  }

  const { error } = await supabase.from("thread_tags").insert({ thread_id: threadId, tag_id: tagId });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  void logAuditEvent({
    userId: user.id,
    actor: "user",
    action: "thread.tag.add",
    targetType: "thread",
    targetId: threadId,
    details: { tagId },
    reversible: true,
  }).catch(() => undefined);

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, ctx: Ctx): Promise<Response> {
  const { id: threadId } = await ctx.params;
  const url = new URL(request.url);
  const tagId = url.searchParams.get("tagId");
  if (!tagId) {
    return NextResponse.json({ error: "tagId query required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: th } = await supabase
    .from("threads")
    .select("id")
    .eq("id", threadId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!th) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { error } = await supabase
    .from("thread_tags")
    .delete()
    .eq("thread_id", threadId)
    .eq("tag_id", tagId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  void logAuditEvent({
    userId: user.id,
    actor: "user",
    action: "thread.tag.remove",
    targetType: "thread",
    targetId: threadId,
    details: { tagId },
    reversible: true,
  }).catch(() => undefined);

  return NextResponse.json({ ok: true });
}
