import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "HydroSite 2.0 — Nepal hydro feasibility intelligence",
  description: "A deterministic, multimodal screening workspace for hydropower feasibility in Nepal.",
  applicationName: "HydroSite 2.0",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <body>
        <a className="skip-link" href="#main-content">Skip to main content</a>
        {children}
      </body>
    </html>
  );
}
