/** The app's own name and closed-eye logo (D-019); never the university's branding. */
export function Brand() {
  return (
    <span className="brand">
      <img src="/logo.svg" alt="" />
      <span>
        <strong>Peer review</strong>
        <small>evaluare între colegi</small>
      </span>
    </span>
  );
}
