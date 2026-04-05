import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { callOpenRouter, CORS_HEADERS } from "../_shared/openrouter.ts";

interface ThreadContext {
  subject: string;
  senderName: string;
  priority: string | null;
  intent: string | null;
}

interface TaskContext {
  description: string;
  deadline: string | null;
  overdue: boolean;
}

interface EventContext {
  title: string;
  startTime: string | null;
  endTime: string | null;
}

interface AuditStat {
  action: string;
  count: number;
}

interface SummaryContext {
  summaryDate: string;
  urgentThreads: ThreadContext[];
  awaitingReplyCount: number;
  pendingTasks: TaskContext[];
  overdueTaskCount: number;
  todayEvents: EventContext[];
  autoArchivedCount: number;
  pendingApprovalCount: number;
  auditStats: AuditStat[];
}

interface DailySummaryRequest {
  context: SummaryContext;
}

const SYSTEM_PROMPT =
  `You are an executive assistant writing a concise daily briefing for a busy professional. ` +
  `Your summary should be actionable, scannable, and written in plain prose — no bullet lists. ` +
  `Prioritize urgency: lead with anything requiring immediate attention. ` +
  `Keep the summary under 200 words. Use concrete numbers where available. ` +
  `Do not repeat raw data — synthesize it into insight (e.g. "3 urgent emails need your attention today, ` +
  `including a high-priority message from Acme Corp"). ` +
  `Write in second person ("you have", "your inbox"). ` +
  `Do not use headers, bullet points, or markdown formatting. ` +
  `Return only the summary text — no preamble, no sign-off.`;

function formatContext(ctx: SummaryContext): string {
  const lines: string[] = [];

  lines.push(`Date: ${ctx.summaryDate}`);
  lines.push(`Urgent/high-priority threads: ${ctx.urgentThreads.length}`);

  if (ctx.urgentThreads.length > 0) {
    const examples = ctx.urgentThreads
      .slice(0, 5)
      .map((t) => `  - "${t.subject}" from ${t.senderName} [${t.priority ?? "?"}]`)
      .join("\n");
    lines.push(`Examples:\n${examples}`);
  }

  lines.push(`Threads awaiting your reply: ${ctx.awaitingReplyCount}`);
  lines.push(`Pending tasks: ${ctx.pendingTasks.length}`);
  lines.push(`Overdue tasks: ${ctx.overdueTaskCount}`);

  if (ctx.pendingTasks.length > 0) {
    const taskExamples = ctx.pendingTasks
      .slice(0, 5)
      .map((t) => {
        const deadlineNote = t.overdue
          ? " (OVERDUE)"
          : t.deadline
          ? ` (due ${t.deadline.slice(0, 10)})`
          : "";
        return `  - ${t.description}${deadlineNote}`;
      })
      .join("\n");
    lines.push(`Task details:\n${taskExamples}`);
  }

  lines.push(`Calendar events today: ${ctx.todayEvents.length}`);
  if (ctx.todayEvents.length > 0) {
    const eventExamples = ctx.todayEvents
      .slice(0, 5)
      .map((e) => `  - ${e.title}${e.startTime ? ` at ${e.startTime.slice(11, 16)}` : ""}`)
      .join("\n");
    lines.push(`Events:\n${eventExamples}`);
  }

  lines.push(`Auto-archived by system in last 24h: ${ctx.autoArchivedCount}`);
  lines.push(`Pending approval queue items: ${ctx.pendingApprovalCount}`);

  if (ctx.auditStats.length > 0) {
    const statsStr = ctx.auditStats
      .map((s) => `${s.action}: ${s.count}`)
      .join(", ");
    lines.push(`System activity (24h): ${statsStr}`);
  }

  return lines.join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  let payload: DailySummaryRequest;
  try {
    payload = (await req.json()) as DailySummaryRequest;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers: CORS_HEADERS });
  }

  if (!payload.context) {
    return Response.json(
      { error: "context is required" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const formattedContext = formatContext(payload.context);

  try {
    const narrative = await callOpenRouter({
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Here is the current state of my inbox and schedule:\n\n${formattedContext}\n\nWrite my daily executive summary.`,
        },
      ],
      max_tokens: 400,
    });

    return Response.json({ narrative }, { headers: CORS_HEADERS });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI error";
    const status = msg.includes("rate limit") ? 429 : 500;
    return Response.json({ error: msg }, { status, headers: CORS_HEADERS });
  }
});
