import {
  Inbox,
  Calendar,
  Users,
  Settings,
  ShieldCheck,
  Filter,
  CheckSquare,
  FileText,
  Zap,
  Clock,
  BarChart3,
  AlarmClock,
  Send,
  AlertTriangle,
  Trash2,
  Newspaper,
  FolderOpen,
  ShieldOff,
  Brain,
  BookOpen,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export interface NavSection {
  id: string;
  label: string;
  items: NavItem[];
  /** If true, section is always expanded and has no toggle */
  alwaysOpen?: boolean;
  /** If true, section is collapsed by default */
  defaultCollapsed?: boolean;
}

/** Primary items always visible at the top — no section header */
export const navSections: NavSection[] = [
  {
    id: "core",
    label: "Core",
    alwaysOpen: true,
    items: [
      { href: "/inbox", label: "Inbox", icon: Inbox },
      { href: "/catch-me-up", label: "Catch Me Up", icon: Zap },
      { href: "/calendar", label: "Calendar", icon: Calendar },
      { href: "/contacts", label: "Contacts", icon: Users },
    ],
  },
  {
    id: "action",
    label: "Action Required",
    items: [
      { href: "/approvals", label: "Approvals", icon: ShieldCheck },
      { href: "/tasks", label: "Tasks", icon: CheckSquare },
      { href: "/waiting", label: "Waiting On", icon: Clock },
      { href: "/alerts", label: "Alerts", icon: AlertTriangle },
    ],
  },
  {
    id: "organize",
    label: "Organize",
    items: [
      { href: "/snoozed", label: "Snoozed", icon: AlarmClock },
      { href: "/scheduled", label: "Scheduled", icon: Send },
      { href: "/rules", label: "Rules", icon: Filter },
      { href: "/trash", label: "Trash", icon: Trash2 },
    ],
  },
  {
    id: "insights",
    label: "Insights",
    defaultCollapsed: true,
    items: [
      { href: "/summary", label: "Summary", icon: FileText },
      { href: "/analytics", label: "Analytics", icon: BarChart3 },
      { href: "/briefs", label: "Meeting Briefs", icon: FileText },
    ],
  },
  {
    id: "manage",
    label: "Manage",
    defaultCollapsed: true,
    items: [
      { href: "/newsletters", label: "Newsletters", icon: Newspaper },
      { href: "/filing", label: "Filing", icon: FolderOpen },
      { href: "/cold-emails", label: "Cold Emails", icon: ShieldOff },
      { href: "/knowledge", label: "Knowledge", icon: Brain },
      { href: "/digests", label: "Digests", icon: BookOpen },
    ],
  },
  {
    id: "system",
    label: "System",
    alwaysOpen: true,
    items: [
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];
