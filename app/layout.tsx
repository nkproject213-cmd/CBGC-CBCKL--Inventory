import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CBGC · CBCKL 물품관리 시스템",
  description: "CBGC 및 CBCKL 통합 물품관리 시스템",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
