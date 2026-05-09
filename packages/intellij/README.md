# SpecKit IntelliJ Plugin

Java plugin for JetBrains IntelliJ IDEA that provides a SpecKit Tool Window.

## Architecture

The plugin communicates with the SpecKit Core Server (`packages/core-server/`) via HTTP on `localhost:4815`.

## Requirements

- IntelliJ IDEA 2024.1+
- Java 17+
- Node.js 18+ (for the Core Server)
- SpecKit Core Server built: `cd packages/core-server && npm install && npm run build`

## Building

```bash
cd packages/intellij
./gradlew buildPlugin
```

The `.zip` file will be in `build/distributions/`. Install via **Settings → Plugins → Install from Disk**.

## Development

```bash
cd packages/intellij
./gradlew runIde
```

## Adding the icon

Place a 16x16 PNG at `src/main/resources/icons/speckit_16.png`.

> **Note:** Run `gradle wrapper` to generate the `gradlew` script, or use your system Gradle installation.
