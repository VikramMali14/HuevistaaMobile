# Running the app — a beginner's guide (Windows)

Two ways to see the app. You need no mobile-development knowledge for either.

| | Way 1: install the APK on your phone | Way 2: run it on your computer |
| --- | --- | --- |
| What you get | The real app on a real Android phone | The app in an emulator (a phone on your screen), reloading as code changes |
| Needs | An Android phone, a GitHub account | Node 22, Android Studio, about 10 GB of disk |
| Google sign-in and payments | Work | Don't come back to the app (an Expo Go limit, see below) |
| Best for | Trying the app, showing it to people | Changing the code |

Both talk to the live server, `https://api.huevistaa.com`.

---

## Way 1 — the APK on your phone (easiest)

GitHub builds the APK for you; nothing is installed on your computer.

1. Open <https://github.com/VikramMali14/HuevistaaMobile> → **Actions** → **Android APK**
   (left-hand list) → **Run workflow**. Check the two addresses: the first must be
   `https://api.huevistaa.com` and the second `https://huevistaa.com`. Correct them if
   they differ (an older copy of this workflow suggested `https://api.huevista.org`),
   then press **Run workflow**.
2. Wait for the run to finish (green tick). It takes about 20–40 minutes.
3. Open the finished run, scroll to **Artifacts**, download **huevistaa-apk** (a zip).
4. Unzip it on your computer: inside is `huevistaa-xxxxxxx.apk`.
5. Send the APK to your phone (WhatsApp to yourself, Google Drive, or a USB cable) and
   tap it. Android asks to **allow installing unknown apps** from that app: allow it,
   then **Install**.

A newer APK installs over the older one, so repeat this whenever the code changes.

---

## Way 2 — run it on your computer

### One-time setup

1. **Node.js 22** — <https://nodejs.org> → download the **22.x LTS** Windows installer and
   run it with the default options. Check it in a new **Command Prompt**:
   ```
   node -v
   ```
   It should print `v22.something`.

2. **Android Studio's SDK location** — Expo needs to know where Android Studio put the
   Android tools. In Command Prompt:
   ```
   setx ANDROID_HOME "%LOCALAPPDATA%\Android\Sdk"
   setx PATH "%PATH%;%LOCALAPPDATA%\Android\Sdk\platform-tools"
   ```
   Close Command Prompt and open a new one, then check:
   ```
   adb version
   ```
   It should print "Android Debug Bridge". If it says *not recognized*, open Android
   Studio → **More Actions → SDK Manager** → tab **SDK Tools** → tick **Android SDK
   Platform-Tools** → **Apply**, then try again.

3. **An emulator (a virtual phone)** — Android Studio → **More Actions → Virtual Device
   Manager** → **+** (Create device) → **Pixel 8** → **Next** → pick the newest system
   image whose ABI is **x86_64** (download it if asked) → **Next** → **Finish**.

### Every time

1. Start the emulator: Virtual Device Manager → the ▶ button next to the Pixel. Wait until
   the phone's home screen appears.
2. In Command Prompt, go to the folder you cloned (change the path to yours):
   ```
   cd C:\Users\<you>\HuevistaaMobile
   ```
3. The first time only:
   ```
   npm install
   copy .env.example .env
   notepad .env
   ```
   In Notepad, change the first setting to the live server and save:
   ```
   EXPO_PUBLIC_API_ORIGIN=https://api.huevistaa.com
   ```
4. Start the app:
   ```
   npm start
   ```
   When the menu appears, press **a**. The first time, it installs **Expo Go** on the
   emulator and opens the app in it. Leave the Command Prompt window open — closing it
   stops the app.

Editing a file under `app/` or `src/` and saving it updates the emulator within a second.
Press **r** in the Command Prompt window to reload by hand.

### What doesn't work in Expo Go

Google sign-in and Razorpay payments send you back to the app through its own link
(`huevista://…`), and Expo Go can't receive those links, so you end up stuck in the
browser. Sign in with **email** in the emulator, and use the APK (Way 1) to try Google
sign-in and payments. Push notifications don't work in Expo Go either.

Expo Go also has no Google Play Billing, which an Android build uses to sell rooms and
credits unless told otherwise: Checkout says it can't reach Google Play. To see the
website's checkout instead, add this line to `.env` and restart with `npm start -- --clear`:
```
EXPO_PUBLIC_PAYMENTS=web
```

### When something goes wrong

| You see | Do this |
| --- | --- |
| `'node' is not recognized` | Node isn't installed, or Command Prompt was open during the install. Reinstall Node 22 and open a new Command Prompt |
| `Failed to resolve the Android SDK path` / `adb not found` | Redo setup step 2, then open a new Command Prompt |
| Pressing **a** says no devices | Start the emulator first and wait for its home screen |
| The app opens but says it can't reach the server | Check `.env` says `https://api.huevistaa.com`, then stop (`Ctrl+C`) and run `npm start -- --clear` |
| A red error screen | Copy its first lines and ask for help |
