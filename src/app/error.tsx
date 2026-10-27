"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(JSON.stringify({ level: "error", event: "route.error", digest: error.digest ?? "unknown", message: error.message }));
  }, [error]);
  return (
    <main className="error-page">
      <div className="error-page-mark">!</div>
      <p className="eyebrow">HydroSite · Recovery</p>
      <h1>That screen hit a rough patch.</h1>
      <p>The workspace is still safe. Retry the view, or return to the HydroSite overview.</p>
      {error.digest ? <code>Reference {error.digest}</code> : null}
      <div className="error-page-actions"><button className="button button-primary" onClick={() => reset()} type="button">Try again</button><Link className="button button-secondary" href="/">Back to overview</Link></div>
    </main>
  );
}
