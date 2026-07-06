export function PrimaryCTA({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="
        w-full py-4 rounded-full text-lg font-medium
        bg-[var(--cta-primary)] text-[var(--cta-primary-text)]
        active:scale-[0.98] transition
      "
    >
      {label}
    </button>
  );
}
