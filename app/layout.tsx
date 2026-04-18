import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DeckForge — AI Flashcard Engine",
  description: "Upload a PDF. Get a smart flashcard deck. Master it with spaced repetition.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className="h-full antialiased"
    >
      <head>
        {/* Prevent flash on page load — apply dark class before first paint */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var t = localStorage.getItem('theme');
                if (t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                  document.documentElement.classList.add('dark');
                }
              } catch(e) {}
            `,
          }}
        />
      </head>
      <body suppressHydrationWarning className="min-h-full flex flex-col bg-stone-50 dark:bg-stone-900">{children}</body>
    </html>
  );
}
