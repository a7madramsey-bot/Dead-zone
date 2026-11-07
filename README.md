# Dead Zone: Survival

A fully offline Android zombie-survival game with an original hand-painted tactical battlefield, touch movement, auto-aim, zombie waves, health and ammo pickups, a shrinking safe zone, and locally saved best wave.

## Controls

- Drag the left stick to move.
- Hold the orange fire control to shoot; the game targets the nearest zombie.
- Tap reload to refill the magazine.
- Stay inside the marked safe zone.

## Download the Android APK

Every push to `main` builds an installable debug-signed APK and publishes it as a GitHub Release. Download the latest `DeadZone.apk` from [Releases](https://github.com/a7madramsey-bot/Dead-zone/releases). The APK is for direct installation on Android; it is not a Google Play signing package.

## Run from source

Requires Node.js 22 and pnpm 10.

```sh
pnpm install
pnpm start
```

To build locally, run `pnpm exec expo prebuild --platform android` and then `android/gradlew -p android assembleDebug`. Gameplay and score storage work without an internet connection after installation.
