# sniplit

Stream. Search. Explore. One uncluttered player for phone, desktop and TV. It runs entirely in the browser, with no backend and no sign-up.

## Build it (one click)

1. Install **Node.js LTS** from nodejs.org (once).
2. Double-click the launcher for your computer:
   - **Windows:** `BUILD.bat`
   - **Mac:** `BUILD.command` (the first time, right-click it and choose Open)
   - **Linux:** run `./build.sh`
3. When it asks where you'll host sniplit, paste the address (for example `https://you.github.io/sniplit/`), or press Enter to skip.

It fetches anything it needs the first time, including the Android toolchain and the desktop app builder. Then it rebuilds everything into **`dist/`**:

| File | What it is |
|---|---|
| `sniplit.html` | the whole app in one file; upload it anywhere |
| `site/` | landing page + app + downloads; upload the folder to any static host (GitHub Pages, Netlify, …) |
| `sniplit.mobileconfig` | iPhone/iPad install profile (needs the hosting address) |
| `sniplit.apk` | Android app |
| `sniplit-Setup-*.exe` / `sniplit-Portable-*.exe` | Windows app (built when you run it on Windows) |
| `sniplit-*.dmg` | Mac app (built when you run it on a Mac) |
| `ads/9x16`, `ads/16x9` | the voiced ads |

At the end it offers to open sniplit at `http://localhost:8080`. Run the launcher again any time: it pulls updates (in a git checkout) and rebuilds every file.

Opening `sniplit.html` straight from your disk works for music, lyrics and everything stored on the device. YouTube refuses to play inside pages opened from disk, though, so host the file or use the desktop app for video and full songs.

```
www/               the app (static files, host anywhere)
  index.html       the player (layout auto-detects; ?tv=1 forces TV)
  landing.html     landing page (WebGL chrome logo, real screenshots)
  ads/             the film the landing page plays (written by the ads build)
  clips/           real screen recordings + tap/drag logs the ads are cut from (not shipped in builds)
mobile/            Capacitor project → Android .apk (iOS app optional)
desktop/           Electron project → Windows .exe, macOS .dmg, Linux AppImage
ios-profile/       make_profile.py → iPhone install profile for your URL (also built by the compiler)
marketing/PLAYBOOK.md  the ad slate, posting playbook, five reasons to switch
tools/
  compile.mjs      THE COMPILER — see below
  ads/             automated ad pipeline (spots.mjs slate · render.html virtual camera · score.py music · tts.mjs online voices)
  capture.js       re-shoots every screenshot (node tools/capture.js https://your-site/ --live)
  record-clips.js  re-records the app screen clips with a visible finger (same flags)
  fixture.js       offline press data used when capturing without internet
  dev-broker.js    self-hostable relay for Friends (MQTT over WebSocket)
.github/workflows/build.yml   CI: runs the compiler for every target, voices the ads, deploys to Pages
```

## Run it

```bash
cd www && python3 -m http.server 8080          # http://localhost:8080/landing.html
node tools/dev-broker.js 8883                  # optional: your own Friends relay
```

## Compile

```bash
node tools/compile.mjs web                         # dist/sniplit.html — the whole app in ONE file, ready to host (no landing page)
node tools/compile.mjs profile --url https://you/sniplit.html   # dist/sniplit.mobileconfig (iPhone home-screen app; signs if SNIPLIT_SIGN_CERT/KEY set)
node tools/compile.mjs apk                         # dist/sniplit.apk   (JDK 17+ and ANDROID_HOME; release-signed if SNIPLIT_KEYSTORE is set)
node tools/compile.mjs exe                         # dist/sniplit-Setup-*.exe + portable (Windows, or Wine)
node tools/compile.mjs dmg                         # dist/sniplit-*.dmg (macOS)
node tools/compile.mjs ads [--only 01,08]          # dist/ads/9x16 + dist/ads/16x9, voiced and captioned
node tools/compile.mjs all --url https://you/      # everything this machine can build, with a summary of anything skipped
```

Push to `main` and the workflow runs every target on the right OS and publishes the site, apps and ads to Pages.

### Ads build

All automatic. There is no manual step:

1. Records the app with a logged finger (`tools/record-clips.js`).
2. Cuts it with a virtual camera that follows the finger, punches in on taps, racks focus, and uses whip / zoom-through / match / flash transitions.
3. Scores it with original synthesized music. The bass slider, Karaoke tap, presets and EQ audibly change the music on cue.
4. Voices every line with an **online** neural voice. Microsoft Edge neural voices need no key. ElevenLabs or OpenAI are used instead when `ELEVENLABS_API_KEY` / `OPENAI_API_KEY` are set, and StreamElements and Google are fallbacks.
5. Silences the music under each line and burns in word-timed captions from the voice service's own timings.

If no voice service is reachable, the build stops rather than shipping a silent ad. `SNIPLIT_ADS_PREVIEW=1` renders picture and music only, for look-dev.

Needs: Node 22, ffmpeg, python3 with numpy and scipy, and `cd tools && npm i && npx playwright install chromium`.

## Friends (peer-to-peer, no accounts)

- **Identity:** each device creates a random id and an inbox key. Your friend link (`…#add-<code>`) carries both. Nothing is registered anywhere.
- **Signalling and mailbox:** encrypted messages go over MQTT-over-WebSocket. By default that's public relays (HiveMQ, EMQX, Mosquitto). For launch, run `tools/dev-broker.js` on your own server and put its URL in Settings → Connections → Friends relay. Topics are hashes and every payload is AES-GCM encrypted, so a relay never sees names, songs or playlists.
- **Live:** when both friends are online, a WebRTC data channel opens and carries presence, now playing, playlists and sent songs directly between devices. Encrypted "last active" presence is retained, so friends see when you were last around.
- **Stories:** each person's story is their daily recap. It appears after 3 days of use and at least 10 minutes of listening that day. From Dec 31 to Jan 14 it becomes the full year in review, which needs 20+ active days that year and an account older than November 1.
- **Tested:** two separate browser profiles through the local relay. They connected over WebRTC and exchanged live now-playing, playlists and a sent song.

## Data sources

| Feature | Source | Needs |
|---|---|---|
| Catalog, artwork, previews, discography, podcasts | Apple iTunes Search API (JSONP) | nothing |
| Synced lyrics | LRCLIB | nothing |
| Radio | radio-browser.info | nothing |
| Video / full-length | YouTube IFrame player (always visible) | nothing (a Data API key is optional) |
| Account links | Spotify (PKCE), Last.fm, Deezer | your Spotify Client ID / Last.fm key |
| Charts, related artists, artist photos, more previews | Deezer API (JSONP) | nothing |
| Independent & unreleased tracks (full streams) | Audius | nothing |
| Live concert recordings | Internet Archive (Live Music Archive) | nothing |
| Credits, first release, ISRC, cover art | MusicBrainz + Cover Art Archive | nothing |
| Similar artists | ListenBrainz + Deezer | nothing |
| Bios, facts, photos | Wikipedia + TheAudioDB | nothing |
| Tour dates | Bandsintown | nothing |
| "Also on" links | Odesli (song.link) | nothing |
| Lyrics fallback | lyrics.ovh | nothing |
| Video without a key | Piped / Invidious | nothing |
| Popular chart | Apple Marketing RSS | nothing |
| Discord "Listening to" | Discord Rich Presence (desktop app) | an application id in `desktop/discord.json` |
| Imports | Spotify / Apple Music / YouTube exports, CSV, M3U, XSPF, text, audio folders | nothing |

There's no built-in music. When the catalog can't be reached, sniplit shows what's on the device (downloads, your files, recently played and cached results) with a clear offline notice.

## Notes

- **Background audio on iPhone:** playback stays on a plain `<audio>` element until studio effects are on, and hands back to it when the phone locks. Lock-screen controls use Media Session. Wake Lock stops the screen sleeping while playing.
- **Lyrics sync:** a vocal-activity envelope is matched against LRC line starts, refined coarse to fine, then checked on each half of the clip separately. On synthetic tests it lands within about ±0.02 s. A tap corrects it and the fix is saved per song.
- **Ads in the app:** sniplit shows none. YouTube-sourced songs play YouTube's own ads, and sniplit's skip and seek controls lock while one runs.
- **Discord:** the desktop app shows what you're playing on your Discord profile ("Listening to …", with artwork, a timer and a "Listen on sniplit" button). Create an application at discord.com/developers, upload an art asset named `sniplit`, and put its id in `desktop/discord.json` or `SNIPLIT_DISCORD_ID`. Phones can't talk to Discord directly, so Settings → Discord on the desktop can mirror a friend's phone instead.
- **Legal:** Terms of Use (`#terms`) and the Privacy Policy (`#privacy`) live in the app and are linked from Settings and the landing page. Have counsel review them before launch.
- **Before launch:**
  - Connect billing (the Premium toggle is local only).
  - Register your own YouTube, Spotify and Last.fm apps.
  - Self-host the Friends relay.
  - Sign the desktop and Android builds.
  - Re-shoot screenshots on the live site with `tools/capture.js --live`.
