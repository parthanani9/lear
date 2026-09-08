"use client";
import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Notification } from "@/types";
import Link from "next/link";
import clsx from "clsx";

const TYPE_STYLES = {
  error:   "bg-red-50 border-l-2 border-lear-red",
  warning: "bg-amber-50 border-l-2 border-warning",
  success: "bg-green-50 border-l-2 border-success",
  info:    "bg-blue-50 border-l-2 border-info",
};

export default function NotificationBell() {
  const supabase        = createClient();
  const { authUser }    = useAuth();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<Notification[]>([]);
  const ref             = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!authUser) return;
    supabase
      .from("notifications")
      .select("*")
      .eq("user_id", authUser.id)
      .order("created_at", { ascending: false })
      .limit(10)
      .then(({ data }) => setNotes((data as Notification[]) ?? []));
  }, [authUser, supabase]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const unread = notes.filter(n => !n.read).length;

  async function markRead(id: string) {
    await supabase.from("notifications").update({ read: true }).eq("id", id);
    setNotes(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }

  async function markAllRead() {
    if (!authUser) return;
    await supabase.from("notifications").update({ read: true }).eq("user_id", authUser.id);
    setNotes(prev => prev.map(n => ({ ...n, read: true })));
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)}
        className="relative p-2 rounded hover:bg-lear-gray-100 transition-colors">
        <Bell className="w-5 h-5 text-lear-gray-600" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-lear-red text-white text-xs
                           rounded-full flex items-center justify-center font-bold leading-none">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-80 bg-white border border-lear-gray-200
                        rounded shadow-lg z-50">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-lear-gray-200">
            <span className="text-sm font-bold text-lear-black">Notifications</span>
            {unread > 0 && (
              <button onClick={markAllRead}
                className="text-xs text-lear-gray-600 hover:text-lear-red">
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-lear-gray-100">
            {notes.length === 0 ? (
              <p className="px-4 py-6 text-sm text-lear-gray-400 text-center">No notifications</p>
            ) : notes.map(n => (
              <div key={n.id}
                className={clsx("px-4 py-3 cursor-pointer transition-colors",
                  !n.read ? TYPE_STYLES[n.type] : "hover:bg-lear-gray-050")}
                onClick={() => markRead(n.id)}>
                <div className="flex items-start justify-between gap-2">
                  <p className={clsx("text-xs font-semibold", !n.read ? "text-lear-black" : "text-lear-gray-600")}>
                    {n.title}
                  </p>
                  {!n.read && <span className="w-2 h-2 rounded-full bg-lear-red flex-shrink-0 mt-1" />}
                </div>
                <p className="text-xs text-lear-gray-600 mt-0.5">{n.message}</p>
                {n.link && (
                  <Link href={n.link} onClick={() => setOpen(false)}
                    className="text-xs text-lear-red hover:underline mt-1 inline-block">
                    View →
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
