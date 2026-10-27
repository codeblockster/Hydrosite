"use client";

import Link from "next/link";
import "./globals.css";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en" data-theme="dark">
      <body>
        <main className="error-page">
          <div className="error-page-mark">!</div>
          <p className="eyebrow">HydroSite · Recovery</p>
          <h1>We couldn’t load the workspace.</h1>
          <p>A temporary issue interrupted this view. Your saved screening data is not affected.</p>
          <div className="error-page-actions"><button className="button button-primary" onClick={() => reset()} type="button">Reload workspace</button><Link className="button button-secondary" href="/">Return to overview</Link></div>
        </main>
      </body>
    </html>
  );
}
