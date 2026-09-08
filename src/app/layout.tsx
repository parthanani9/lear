import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lear Inventory Planning Cockpit",
  description: "Inventory Planning & MRP Platform — Lear Corporation",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased bg-lear-gray-050 text-lear-black">{children}</body>
    </html>
  );
}
