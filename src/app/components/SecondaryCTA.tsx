export function SecondaryCTA({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="
        w-full py-3 rounded-full text-base
        bg-[var(--cta-secondary)] text-[var(--cta-secondary-text)]
      "
    >
      {label}
    </button>
  );
}
