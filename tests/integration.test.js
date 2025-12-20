import { describe, beforeAll } from 'vitest';
import { RuleTester } from 'eslint';
import fs from 'node:fs';
import path from 'node:path';
import { __unstable__loadDesignSystem } from '@tailwindcss/node';
import { getTestCssPath } from './test-utils.js';
import tailwindCanonicalClasses, { __setDesignSystemCacheForTesting } from '../lib/rules/tailwind-canonical-classes.js';

describe('tailwind-canonical-classes (Integration)', () => {
  const cssPath = getTestCssPath();

  beforeAll(async () => {
    const cssContent = fs.readFileSync(cssPath, 'utf-8');
    const basePath = path.dirname(cssPath);
    const designSystem = await __unstable__loadDesignSystem(cssContent, {
      base: basePath,
    });
    __setDesignSystemCacheForTesting(designSystem, cssPath);
  });

  const ruleTester = new RuleTester({
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
  });

  ruleTester.run('tailwind-canonical-classes', tailwindCanonicalClasses, {
    valid: [
      {
        code: '<div className="flex items-center">Content</div>',
        options: [{ cssPath }],
      },
      {
        code: '<div className="w-4 h-8">Content</div>',
        options: [{ cssPath }],
      },
    ],

    invalid: [
      {
        code: '<div className="w-[16px]">Content</div>',
        output: '<div className="w-4">Content</div>',
        options: [{ cssPath }],
        errors: [
          {
            messageId: 'nonCanonical',
          },
        ],
      },
    ],
  });
}, 30000);

