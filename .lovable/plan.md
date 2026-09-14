# Animated Auction Search Progress

## Goal
Replace the plain Auction Radar loading message with a branded progress experience that shows the SGC logo gradually taking shape while a scan runs.

## Changes
- Add a focused loading panel inside Auction Radar using the existing SGC logo asset and brand colors.
- Animate the logo reveal from faint outline to fully visible as progress advances.
- Show a smooth progress bar, percentage, and changing search-stage message.
- Use real market sweep completion when available; use staged progress for a single-area scan without falsely reaching 100% before completion.
- Keep the existing scan, results, save/delete prompt, and business logic unchanged.
- Respect reduced-motion settings and ensure the panel fits mobile and desktop screens.

## Technical details
- Scope changes to `src/components/AuctionRadar.tsx` and, only if needed for keyframes, `src/index.css`.
- Drive progress from component state and the existing `loading` / `batch` status.
- Verify the project build and inspect the loading state in the browser at the current mobile viewport.
