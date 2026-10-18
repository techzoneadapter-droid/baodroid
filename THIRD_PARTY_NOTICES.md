# Third-party notices

## Androidbox (MIT)

Upstream project: https://github.com/Wolklaw/Androidbox
Source reviewed and adapted: `androidbox/emulator.py`, `androidbox/instances.py`.
Baodroid contains a JavaScript adaptation of Androidbox's emulator-console
liveness probing, AVD lock ownership checks and quick-boot discovery in
`src/main/androidbox-runtime.js`. It does **not** bundle Androidbox's Python
GUI or claim to redistribute its compiled installer. The Android virtual machine
continues to run through Google's official SDK Android Emulator already installed
on the user's Windows computer. We preserve the upstream copyright and MIT
license below.

MIT License

Copyright (c) 2026 Wolklaw

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


## Android Emulator / Android SDK

Google Android Emulator, Android SDK tools and system images are distinct
components installed from Google's official repository, under their own applicable
licenses. Baodroid neither repackages them into the Windows installer nor
replaces the Android virtualization engine with scrcpy.
