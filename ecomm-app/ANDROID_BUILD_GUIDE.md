# Android Build & Installation Guide

This guide will help you build and install the app on your Android device.

## Prerequisites

1. **EAS Account**: You need an Expo account (free)
2. **Android Device**: Physical Android device with USB debugging enabled
3. **USB Cable**: To connect your device to your computer

## Step 1: Enable USB Debugging on Your Android Device

1. Go to **Settings** → **About Phone**
2. Tap **Build Number** 7 times to enable Developer Options
3. Go back to **Settings** → **Developer Options**
4. Enable **USB Debugging**
5. Connect your device to your computer via USB

## Step 2: Login to EAS

Run this command in your terminal:

```bash
cd ecomm-app
eas login
```

Follow the prompts to log in (or create a new account if needed).

## Step 3: Build the Android APK

You have two options:

### Option A: Cloud Build (Recommended - Easier)

This builds the app in Expo's cloud and gives you a download link:

```bash
cd ecomm-app
eas build --profile preview --platform android
```

This will:

- Build the app in the cloud (takes ~10-15 minutes)
- Generate an APK file
- Provide you with a download link
- You can download the APK directly to your phone or computer

### Option B: Local Build (Faster, but requires Android SDK)

If you have Android Studio and Android SDK installed:

```bash
cd ecomm-app
pnpm run build:android:device
```

This builds locally and generates an APK in the `android/app/build/outputs/apk/`
directory.

## Step 4: Install the APK on Your Device

### If you used Cloud Build:

1. Download the APK from the link provided by EAS
2. Transfer it to your Android device (via email, USB, or cloud storage)
3. On your device, open the APK file
4. You may need to enable "Install from Unknown Sources" in Settings
5. Tap "Install"

### If you used Local Build:

1. Find the APK file in `android/app/build/outputs/apk/debug/` or
   `android/app/build/outputs/apk/release/`
2. Transfer it to your device via USB:
   ```bash
   adb install android/app/build/outputs/apk/debug/app-debug.apk
   ```

   Or manually:
   - Copy the APK to your device
   - Open it on your device and install

### Using ADB (Alternative):

If you have ADB installed and your device is connected:

```bash
# Find the APK file
cd ecomm-app
find . -name "*.apk" -type f

# Install via ADB (replace with actual path)
adb install path/to/your-app.apk
```

## Step 5: Run the App

1. Open the app on your device
2. Make sure your device is connected to the internet
3. The app should connect to your Convex backend automatically

## Troubleshooting

### "Install from Unknown Sources" Error

1. Go to **Settings** → **Security** (or **Apps** → **Special Access**)
2. Enable **Install Unknown Apps** or **Unknown Sources**
3. Select the app/file manager you're using to install

### Build Fails

- Make sure you're logged in: `eas whoami`
- Check your internet connection
- Verify your `eas.json` and `app.json` are correct

### App Crashes on Launch

- Check that your `.env.local` file has the correct environment variables
- Verify your Convex deployment is running: `npx convex dev`
- Check device logs: `adb logcat | grep -i error`

### Can't Connect to Backend

- Ensure your device has internet access
- Verify `EXPO_PUBLIC_CONVEX_URL` is set correctly
- Check that Convex deployment is active

## Quick Reference Commands

```bash
# Login to EAS
eas login

# Build APK (cloud)
eas build --profile preview --platform android

# Build APK (local)
pnpm run build:android:device

# Check build status
eas build:list

# Install via ADB
adb install path/to/app.apk

# View device logs
adb logcat
```

## Alternative: Development Build

If you want to test during development, you can also use:

```bash
# Start development server
pnpm start

# Run on connected Android device
pnpm android
```

This requires:

- Android device connected via USB
- USB debugging enabled
- Development server running on your computer
