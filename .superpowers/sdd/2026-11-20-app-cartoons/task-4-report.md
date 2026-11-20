BASE: 05d9ba7e54799c969f5aa42ff5640d9be2b5e13c

## Task 4 report
Implemented: Toast.moment (momentFor), showToast 4th arg, isNewest to ToastCard, AppArt in place of the icon in app mode (icon box 56px in app, icon kept on web); a kind on all ~95 showToast calls (mapping per brief; warnings that mean "could not" -> failed); result panels: QuickCheckInScanner (checkedIn / failed), PaymentStatusPage (paid / failed), FreeTrialModal (saved), useGiftCelebration (app-only milestone toast alongside confetti); ResetPasswordPage success toasts -> saved. New e2e/app-art-moments.spec.ts (mobile only; 5 tests).
Tests: moments spec 5 passed on mobile (5 desktop skipped). Wider run (flows, rewards, rewards-desk, app-art, app-art-pages, fix-core-ui, app-motion-extras): 89 passed, 27 skipped. client tsc passes (part of build).
TDD: implementation was written before the spec, so no RED run was recorded (honest gap).
Concerns: (1) a failed class booking shows an inline card issue, not a toast, so the "booking 500 -> moment.failed" test uses a refused cancel (DELETE /api/bookings/* 500) instead. (2) ResetPasswordPage navigates away on success, so its "done" scene is the saved toast, no separate panel. (3) useGiftCelebration adds a new app-only toast text "A new gift is waiting for you under Rewards." (4) AuthModal picks signedUp vs signedIn from the greeting text. (5) Trainer note saved uses 'shared' per the brief. (6) rg check: error calls rely on default failed.

FIX BASE (round 1): a01f04e9cbcb138dcb0e40de128ee55fca42d7a3

## Fix report (round 1)
- Scanner replay: OutcomePanel is keyed by a per-scan counter (a log id can repeat for an already-checked-in scan), so every result remounts and plays. Scene moved off the header text with shrink-0. New e2e test: two consecutive scans plus a denied/failed scan.
- useGiftCelebration: removed the unrequested toast and its copy (confetti unchanged). The hook has no UI host, so the milestone scene is not rendered anywhere yet; needs a controller ruling. No test.
- FreeTrialModal: Ticket icon hidden in app mode; test for the pass scene. PaymentStatusPage: new paid and failed scene test.
- RewardsPage 'Choose a size first.' now 'info'.
- Booking failure (spec issue 1): not changed; a failed booking is an inline card, so the refused-cancel substitution stays for the controller to accept.
- Not done: no RED run against the old code; toast 56px icon box not checked on 390x800 by a screenshot.
- Command: npx playwright test e2e/app-art-moments.spec.ts --project=mobile -> 8 passed.

FIX BASE (round 2): c4223a043fa6bf5c8a264dff33e25a0a4f2d2b72

## Fix report (round 2)
- Spec issues (milestone scene, booking-failure test): no controller reachable. Milestone: the confetti host is canvas-confetti (no DOM host), the toast was rejected as extra behaviour, so the scene is dropped; no test. Booking failure: a failed booking is an inline card, not a toast; refused-cancel substitution stays. Both need controller acceptance.
- Rescan test: waits for the second check-in POST response, then asserts not still (1200 ms).
- Scanner setScanNo indentation fixed; blank line added before the website test.
- Command: npx playwright test e2e/app-art-moments.spec.ts --project=mobile -> 8 passed.

FIX BASE (round 3): 1a838319e192c44f4c04b5afcbf83fc4fa0c7556

## Fix round 3
- useGiftCelebration.ts: the celebration now also shows a toast with kind 'milestone' (scene moment.milestone in app mode, plain icon on the website), added beside the confetti. Closes the spec issue.
- e2e/app-art-moments.spec.ts: added a milestone test (rewards list answered with a ready milestone claim). A booking-500 test was tried and removed: the schedule page shows a booking error as an inline alert, not a toast, so there is no moment.failed to assert; the refused-cancel test stays as the failed-toast cover. The controller should accept this.
- Minor findings: none required.
- Command: npx playwright test e2e/app-art-moments.spec.ts --project=mobile -> 9 passed (incl. milestone).
