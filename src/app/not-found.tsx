import Link from "next/link";

export default function NotFound() {
  return (
    <main className="error-page">
      <div className="error-page-mark">404</div>
      <p className="eyebrow">HydroSite · Not found</p>
      <h1>This river reach isn’t on the map.</h1>
      <p>The page may have moved, or the address may be incomplete.</p>
      <div className="error-page-actions"><Link className="button button-primary" href="/">Return to overview</Link><Link className="button button-secondary" href="/">Open candidate map</Link></div>
    </main>
  );
}
