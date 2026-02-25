import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "凑凑！？逼？！",
  description: "梗图生成器 - 凑凑逼",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh">
      <body>{children}</body>
    </html>
  );
}
