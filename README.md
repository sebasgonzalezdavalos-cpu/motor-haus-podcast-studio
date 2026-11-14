# Motor Haus Podcast Studio 🎙️

A 1-click podcast enhancer that transforms phone-recorded audio (`.mpeg`, `.mp3`, `.m4a`, `.wav`) into a warm, close-up **Shure SM7B Pro Studio Microphone** in a treated room.

---

## 1. Using It on Your Mac (Fastest — Uses Local Python + FFmpeg)

- Double-click **[Start Podcast Studio.command](file:///Users/sebastian/Antigravity/Start%20Podcast%20Studio.command)** in Finder anytime.
- It opens **http://127.0.0.1:8765** in your browser.
- Drop any podcast episode, click **✨ Make It Sound Like a Pro Studio**, compare **📱 Original Phone** vs **🎙️ Pro Studio**, and download **MP3** (small ~50 MB file for Spotify/WhatsApp) or **WAV** (24-bit Studio Master).

---

## 2. How to Get a Free Permanent Public Web Link (Share with Anyone)

We built a standalone browser version inside the **`web-share/`** folder ([index.html](file:///Users/sebastian/Antigravity/web-share/index.html) + [studio-worker.js](file:///Users/sebastian/Antigravity/web-share/studio-worker.js)) that runs the exact same **Pro Mic & Treated Room** DSP engine directly inside any visitor's web browser (Mac, Windows, or phone) at **$0 cost forever**:

### Option A: 10-Second Drag & Drop on Netlify Drop (Easiest)
1. Open **[https://app.netlify.com/drop](https://app.netlify.com/drop)** in your browser.
2. Drag the **`/Users/sebastian/Antigravity/web-share`** folder from Finder onto the page.
3. It immediately gives you a permanent public `https://...netlify.app` link you can send on WhatsApp to anyone!

### Option B: GitHub Pages (100% Free Forever)
1. Upload `index.html` and `studio-worker.js` from `web-share/` to any GitHub repository.
2. Enable **Settings → Pages** to get `https://<your-username>.github.io/<repo-name>/`.
