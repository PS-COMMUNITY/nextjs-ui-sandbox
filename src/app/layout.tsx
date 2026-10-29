import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "PC Repair 3D Studio — مختبر صيانة الحاسوب الافتراضي",
  description:
    "بيئة تعليمية تفاعلية ثلاثية الأبعاد لطلاب صيانة أجهزة الحاسوب: التعرف على القطع، الفك والتركيب، التشخيص، والتقارير — مكمل للتدريب العملي الحقيقي وليس بديلاً عنه.",
  keywords: [
    "صيانة الحاسوب",
    "مختبر افتراضي",
    "PC Repair",
    "تعليمي",
    "Three.js",
    "محاكاة",
  ],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b0f14",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" className="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased bg-background text-foreground">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          {children}
          <Toaster position="bottom-left" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
