export function BrandMark() {
  return (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-white text-[#0b0b0d]"
      aria-hidden="true"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <rect x="3.5" y="3.5" width="7" height="7" rx="2" fill="currentColor" />
        <rect x="13.5" y="3.5" width="7" height="7" rx="3.5" fill="currentColor" />
        <rect x="3.5" y="13.5" width="7" height="7" rx="3.5" fill="currentColor" />
        <path
          d="M13.5 15.5C13.5 14.3954 14.3954 13.5 15.5 13.5H18.5C19.6046 13.5 20.5 14.3954 20.5 15.5V18.5C20.5 19.6046 19.6046 20.5 18.5 20.5H15.5C14.3954 20.5 13.5 19.6046 13.5 18.5V15.5Z"
          stroke="currentColor"
          strokeWidth="2.2"
        />
      </svg>
    </div>
  );
}
