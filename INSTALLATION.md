# Installation and iPhone testing

## Local development

Use Node.js 20 or newer:

```powershell
Set-Location 'D:\Solo Leveling'
npm.cmd install
npm.cmd run dev
npm.cmd test
npm.cmd run build
```

In PowerShell, `npm` may resolve to `npm.ps1`, which can be blocked by the machine's script execution policy. Calling `npm.cmd` avoids changing that policy. Run commands in the project directory (the directory containing `package.json`), not your home directory. If `npm.cmd` is not on `PATH`, call it by its full path, for example `& 'C:\Program Files\nodejs\npm.cmd' test`.

The development server binds to `0.0.0.0` to allow a phone on the same trusted local network to reach it. Use the URL printed by Vite. Network access may expose the development app to devices on that network; use only a trusted network and never enter sensitive information into an untrusted deployment.

## iPhone Home Screen

1. Build and deploy the app to an HTTPS host you control.
2. Open that HTTPS address in Safari on the iPhone.
3. Tap Share, choose **Add to Home Screen**, and confirm.
4. Open it once while online so the service worker can cache the app shell.

An ordinary desktop `localhost` session does not install an iPhone app. iOS installation uses Safari's Add to Home Screen workflow and a supported secure context. IndexedDB data is local to the browser/origin and should be backed up before browser data is removed. iOS may suspend web apps; this application does not promise reliable background work or notifications.
