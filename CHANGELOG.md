# Changelog

What each version of `botmaker-pilot` changes, in a few bullets. The top section becomes the GitHub Release
notes (`tools/changelog-section.sh`), and the release refuses a version with no notes here.

Sections are `## [x.y.z] — YYYY-MM-DD`, newest first. Releases up to 0.5.0 have their notes on their GitHub
Release only.

## [Unreleased]

### Added

- The golden wire file gained the host's `thumb` message and an `instance` on each `runs` entry (pilot in core phase
  6a); the app ignores `thumb` until its overview (phase 6b) draws it.
- The wire carries a list of the PC's live runs (`runs`), a `select` command and a `runId` on state, video, trace and
  notice (pilot in core phase 4a). `usePilot` holds `runs` and `shownRun`; the screen that picks a run comes with the
  phone redesign.

- The release attaches `web.zip`, the page the SDK serves to a browser.
- The screen stays on while connected.
- Android's Back closes the keyboard, then the log, then the connection, instead of leaving the app.
- The phone says why there is no picture (the game window is closed, for example).

### Changed

- A refused pairing code says to scan the QR again, and is not retried.
- The app drops the connection while hidden or offline and takes a new one when it is back. With an SDK that
  sends heartbeats, a dead link is noticed within about 15 s.
- Interact is disarmed, and Start, Stop, Pause and Resume are off, while not connected.
- The app is no longer part of Android's backup, which held the pairing codes.
- A browser no longer offers the APK as an update. A local build shows the last tag as its version.

### Fixed

- A mistyped address no longer leaves a blank screen on every launch.
- A back swipe or a notification over the picture no longer taps in the game.
- Switching PCs no longer reconnects to the previous one or shows its run state.
- A pinch no longer presses a button in the game, and a finger held still is not let go after 30 s.
- A composing keyboard no longer types words twice, and the special keys keep the keyboard up.
- The empty part of the tool strip no longer swallows taps.
- Pictures that finish decoding late no longer overwrite newer ones.

## [0.6.1] — 2026-11-16

### Fixed

- The release carries its APK again. v0.6.0 published none: the tag's job found the release page sluice had
  written and refused to add to it. It now attaches the APK and leaves the notes.

## [0.6.0] — 2026-11-10

### Changed

- The GitHub Release notes come from this file's section for the version, as in every other BotMaker
  repository, no longer from the commit log.
