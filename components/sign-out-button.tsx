"use client";

import { PAGE_COPY } from "@/lib/constants";
import { signOut } from "@/app/actions/auth";

export function SignOutButton() {
  return (
    <form action={signOut}>
      <button
        type="submit"
        className="flex w-full items-center justify-between px-5 py-4 text-sm text-red-500 transition-colors hover:bg-accent/50"
      >
        <span>{PAGE_COPY.profile.signOut}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M9 6l6 6-6 6"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </form>
  );
}
