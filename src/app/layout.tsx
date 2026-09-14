import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "صيانة | Apartment Maintenance Marketplace",
  description: "A trusted marketplace for apartment maintenance.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ar" dir="rtl">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
