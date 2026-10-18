import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container prose">
      <h1>Page not found</h1>
      <p>That page doesn’t exist.</p>
      <p>
        <Link className="btn" href="/">
          Go to the home page
        </Link>
      </p>
    </div>
  );
}
