# eslint-plugin-tailwind-canonical-classes

ESLint plugin to enforce canonical Tailwind CSS class names using Tailwind CSS v4's canonicalization API.

## Overview

This plugin helps maintain consistent Tailwind CSS class names across your codebase by automatically detecting and fixing non-canonical class names. It uses Tailwind CSS v4's `canonicalizeCandidates` API to ensure your classes follow the canonical format.

For example, it can convert:
- `p-4px` → `p-1` (if 4px equals 1rem at your root font size)
- `m-2rem` → `m-8` (if 2rem equals 8 at your scale)

## Installation

```bash
npm install --save-dev eslint-plugin-tailwind-canonical-classes @tailwindcss/node
```

## Requirements

- Node.js >= 18.0.0
- ESLint >= 8.0.0
- Tailwind CSS v4
- `@tailwindcss/node` package

## Configuration

Add the plugin to your ESLint configuration file (e.g., `eslint.config.mjs` or `.eslintrc.js`):

### Flat Config (ESLint 9+)

```javascript
import tailwindCanonicalClasses from 'eslint-plugin-tailwind-canonical-classes';

export default [
  {
    plugins: {
      'tailwind-canonical-classes': tailwindCanonicalClasses,
    },
    rules: {
      'tailwind-canonical-classes/tailwind-canonical-classes': [
        'warn',
        {
          cssPath: './app/styles/globals.css', // Path to your Tailwind CSS file
          rootFontSize: 16, // Optional: root font size in pixels (default: 16)
        },
      ],
    },
  },
];
```

### Legacy Config (.eslintrc.js)

```javascript
module.exports = {
  plugins: ['tailwind-canonical-classes'],
  rules: {
    'tailwind-canonical-classes/tailwind-canonical-classes': [
      'warn',
      {
        cssPath: './app/styles/globals.css',
        rootFontSize: 16,
      },
    ],
  },
};
```

## Options

### `cssPath` (required)

Type: `string`

Path to your Tailwind CSS file. Can be:
- **Relative path**: Resolved relative to your project root (where ESLint config is located)
- **Absolute path**: Full filesystem path to your CSS file

Example:
```javascript
cssPath: './app/styles/globals.css'  // Relative to project root
cssPath: '/absolute/path/to/styles.css'  // Absolute path
```

### `rootFontSize` (optional)

Type: `number`  
Default: `16`

Root font size in pixels for rem calculations. This should match your CSS root font size setting.

## Usage

Once configured, ESLint will automatically check your JSX `className` attributes and suggest canonical alternatives.

### Example

**Before:**
```tsx
<div className="p-4px m-2rem">Content</div>
```

**After auto-fix:**
```tsx
<div className="p-1 m-8">Content</div>
```

The plugin supports:
- String literals: `className="p-4"`
- Template literals (without expressions): `className={`p-4 ${someVar}`}` (only static parts are checked)
- JSX expression containers with static values

## How It Works

1. The plugin loads your Tailwind CSS file using `@tailwindcss/node`'s `__unstable__loadDesignSystem` API
2. It extracts class names from JSX `className` attributes
3. For each class, it uses Tailwind's `canonicalizeCandidates` to find the canonical form
4. If a non-canonical class is found, it reports an error/warning and can auto-fix it

## Limitations

- Only works with static class names (no dynamic expressions)
- Requires Tailwind CSS v4
- CSS file must be accessible from the ESLint process
- Template literals with expressions are skipped

## Release Process

This project uses [semantic-release](https://github.com/semantic-release/semantic-release) for automated version management and npm publishing. Releases are automatically triggered when commits are pushed to the `main` branch.

### How It Works

1. **Automatic Versioning**: Version numbers are automatically determined based on commit messages using [Conventional Commits](https://www.conventionalcommits.org/)
2. **Changelog Generation**: A `CHANGELOG.md` file is automatically generated and updated
3. **npm Publishing**: New versions are automatically published to npm
4. **GitHub Releases**: GitHub releases are automatically created with release notes

### Commit Message Format

To trigger a release, use conventional commit messages:

- **Patch release** (1.0.8 → 1.0.9): `fix: description` or `fix(scope): description`
- **Minor release** (1.0.8 → 1.1.0): `feat: description` or `feat(scope): description`
- **Major release** (1.0.8 → 2.0.0): `feat!: description` or `fix!: description` or include `BREAKING CHANGE:` in the commit body

Examples:
```
fix: resolve issue with template literals
feat: add support for dynamic class names
feat!: change API structure

BREAKING CHANGE: The cssPath option is now required
```

### Setup Requirements

For maintainers, the following setup is required:

1. **npm Access Token**: Create an npm access token with publish permissions at [npmjs.com](https://www.npmjs.com/settings/YOUR_USERNAME/tokens)
2. **GitHub Secret**: Add the npm token as a secret named `NPM_TOKEN` in your GitHub repository settings:
   - Go to Settings → Secrets and variables → Actions
   - Click "New repository secret"
   - Name: `NPM_TOKEN`
   - Value: Your npm access token

Once set up, simply push commits with conventional commit messages to the `main` branch, and releases will happen automatically!

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT

## Related

- [Tailwind CSS v4](https://tailwindcss.com/)
- [ESLint](https://eslint.org/)

