# SpeakUp

An AI delivery coach for creators. Practise the first 3 seconds of a video, get your pace, filler words, pauses and dead air measured, then get specific fixes from Claude and go again.

## Setup

1. `cp .env.example .env.local`, then add your keys:
   - `ANTHROPIC_API_KEY`: https://console.anthropic.com/settings/keys
   - `DEEPGRAM_API_KEY`: https://console.deepgram.com
2. `npm install`
3. `npm run dev`, then open http://localhost:3000

The app lives under `/speakup` (see `basePath` in `next.config.ts`), so locally it's http://localhost:3000/speakup.

## Deployment

SpeakUp is its own Netlify site (`zina-speakup`, on the zinanyarko team). The main website (ZinaWebsite project) proxies `zinanyarko.com/speakup/*` to it, so visitors stay on zinanyarko.com.

In Netlify → this site → Site configuration → Environment variables, set `ANTHROPIC_API_KEY`, `DEEPGRAM_API_KEY`, `SESSION_SECRET` and `KIT_API_KEY` (see `.env.example`).

## Sign-up and limits

Visitors sign up with name and email (added to Kit, tagged `SpeakUp`) and get a signed cookie. Each person gets 10 takes a day, each IP 20, and the whole app 300, all adjustable with environment variables. Emails in `UNLIMITED_EMAILS` skip all caps. Counts are kept in Netlify Blobs. Feedback is limited to one per recorded take.

## How it works

- `src/components/useRecorder.ts`: records a take from the mic (3-2-1 countdown, 30s max).
- `src/app/api/transcribe`: sends the audio to Deepgram and returns word-level timestamps. The audio is not stored.
- `src/lib/analysis.ts`: works out pace, fillers, crutch words, pauses, dead air and what's said in the first 3 seconds.
- `src/app/api/feedback`: Claude scores the hook and returns fixes, a rewrite and one focus for the next take.
- `src/lib/history.ts`: past takes, saved in this browser for now.

## Testing changes to the hook rating

`evals/hooks.json` holds hooks with known outcomes: real hooks that performed well must rate Strong, and weak hooks must not. Add every new real example there. To check a change before it goes live:

1. Deploy a free draft (no deploy credits, not the live site): `npx netlify-cli deploy`. Use an unnamed draft: drafts with `--alias` don't get the deploy-preview keys.
2. Run the test set against it (macOS, uses `say`): `node scripts/eval-hooks.mts <draft-url>/speakup <test-email>`. The test email should be in `UNLIMITED_EMAILS`.
3. Only when every case passes: `npx netlify-cli deploy --prod`.
