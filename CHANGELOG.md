# Changelog

What each version of `botmaker-pilot` changes, in a few bullets. The top section becomes the GitHub Release
notes (`tools/changelog-section.sh`), and the release refuses a version with no notes here.

Sections are `## [x.y.z] — YYYY-MM-DD`, newest first. Releases up to 0.5.0 have their notes on their GitHub
Release only.

## [0.7.0] — 2026-11-27

### Added

- A new screen: the run's state, reason and name on top, three buttons below (Start or Stop, Pause or Resume,
  Touch), and the rest in a `⋯` menu. In landscape the buttons are a rail beside the picture.
- Several runs at once: swipe the top line to move between the runs of one bot, or open "▦ N runs" to see every run,
  grouped by bot, with a small live picture of each. The golden wire file gained the host's `thumb` message and an
  `instance` on each `runs` entry for it.
- A red mark stays on the picture while touches control the PC.
- A light theme, following the phone.

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
