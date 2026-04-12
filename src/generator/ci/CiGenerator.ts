import { Language, Story } from '../../story/Story';

const testCommands: Record<Language, string> = {
  typescript:
    'npx vitest run --coverage --coverage.thresholds.statements=80 --coverage.thresholds.lines=80',
  javascript:
    'npx vitest run --coverage --coverage.thresholds.statements=80 --coverage.thresholds.lines=80',
  java: './mvnw verify -Djacoco.haltOnFailure=true -Djacoco.minimum.coverage=0.80',
  csharp: 'dotnet test --collect:"XPlat Code Coverage" /p:CoverageThreshold=80',
  python: 'pytest --cov=src --cov-fail-under=80 --cov-report=xml',
};

const lintCommands: Record<Language, string> = {
  typescript: 'npx eslint . --max-warnings=0',
  javascript: 'npx eslint . --max-warnings=0',
  java: './mvnw checkstyle:check',
  csharp: 'dotnet format --verify-no-changes',
  python: 'ruff check . && mypy src',
};

const buildCommands: Record<Language, string> = {
  typescript: 'npm run build',
  javascript: 'npm run build',
  java: './mvnw package -DskipTests',
  csharp: 'dotnet build --configuration Release',
  python: 'pip install -e .',
};

const setupSteps: Partial<Record<Language, string>> = {
  typescript: `      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - name: Install dependencies
        run: npm ci`,
  javascript: `      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - name: Install dependencies
        run: npm ci`,
  java: `      - name: Setup Java
        uses: actions/setup-java@v4
        with:
          java-version: '21'
          distribution: 'temurin'
          cache: 'maven'`,
  csharp: `      - name: Setup .NET
        uses: actions/setup-dotnet@v4
        with:
          dotnet-version: '8.0.x'
      - name: Restore dependencies
        run: dotnet restore`,
  python: `      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.12'
          cache: 'pip'
      - name: Install dependencies
        run: pip install -r requirements.txt -r requirements-dev.txt`,
};

export function generateCiQualityGate(story: Story): string {
  const lang = story.technicalSpec.language || 'typescript';
  const setup = setupSteps[lang] ?? setupSteps['typescript']!;
  const lint = lintCommands[lang] ?? lintCommands['typescript']!;
  const test = testCommands[lang] ?? testCommands['typescript']!;
  const build = buildCommands[lang] ?? buildCommands['typescript']!;

  return `name: Quality Gate

on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main]

jobs:
  quality-gate:
    name: Lint → Build → Test + Coverage
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write

    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

${setup}

      - name: Lint
        run: ${lint}

      - name: Build
        run: ${build}

      - name: Test with coverage enforcement (≥80%)
        run: ${test}

      - name: Upload coverage report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: coverage-report
          path: |
            coverage/
            target/site/jacoco/
            TestResults/
          retention-days: 7
`;
}

export function generateCiSecurityScan(): string {
  return `name: Security Scan

on:
  pull_request:
    branches: [main, develop]
  schedule:
    - cron: '0 6 * * 1'

jobs:
  secret-detection:
    name: Secret Detection (trufflehog)
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: TruffleHog OSS
        uses: trufflesecurity/trufflehog@main
        with:
          path: ./
          base: \${{ github.event.repository.default_branch }}
          head: HEAD
          extra_args: --only-verified

  sast:
    name: Static Analysis (Semgrep)
    runs-on: ubuntu-latest
    permissions:
      security-events: write
    container:
      image: returntocorp/semgrep
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Semgrep SAST scan (SARIF)
        run: semgrep ci --config=auto --sarif --output=semgrep.sarif
        env:
          SEMGREP_APP_TOKEN: \${{ secrets.SEMGREP_APP_TOKEN }}

      - name: Upload SARIF to GitHub Security tab
        if: always()
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: semgrep.sarif
`;
}
