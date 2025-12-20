import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RuleTester } from 'eslint';
import { getTestCssPath, mockCanonicalizations } from './test-utils.js';

const mockDesignSystem = vi.hoisted(() => ({
  canonicalizeCandidates: vi.fn((candidates, options = {}) => {
    return candidates.map((candidate) => {
      if (mockCanonicalizations[candidate]) {
        return mockCanonicalizations[candidate];
      }
      return candidate;
    });
  }),
}));

const mockLoadDesignSystem = vi.hoisted(() => {
  const fn = vi.fn();
  fn.mockResolvedValue(mockDesignSystem);
  return fn;
});

vi.mock('@tailwindcss/node', () => ({
  __unstable__loadDesignSystem: (...args) => mockLoadDesignSystem(...args),
}));

import tailwindCanonicalClasses, { __setDesignSystemCacheForTesting } from '../lib/tailwind-canonical-classes.js';

describe('tailwind-canonical-classes', () => {
  const cssPath = getTestCssPath();

  beforeEach(() => {
    mockLoadDesignSystem.mockReset();
    mockLoadDesignSystem.mockResolvedValue(mockDesignSystem);
    mockDesignSystem.canonicalizeCandidates.mockClear();
    mockDesignSystem.canonicalizeCandidates.mockImplementation((candidates, options = {}) => {
      return candidates.map((candidate) => {
        if (mockCanonicalizations[candidate]) {
          return mockCanonicalizations[candidate];
        }
        return candidate;
      });
    });
    __setDesignSystemCacheForTesting(mockDesignSystem, cssPath);
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
        code: '<div className="w-4 h-8">Content</div>',
        options: [{ cssPath }],
      },
      {
        code: '<div className="bg-white text-black">Content</div>',
        options: [{ cssPath }],
      },
      {
        code: '<div className="">Content</div>',
        options: [{ cssPath }],
      },
      {
        code: '<div>Content</div>',
        options: [{ cssPath }],
      },
      {
        code: '<div id="test" data-test="value">Content</div>',
        options: [{ cssPath }],
      },
      {
        code: '<div className={`w-4 ${someVar}`}>Content</div>',
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
            data: {
              original: 'w-[16px]',
              canonical: 'w-4',
            },
          },
        ],
      },
      {
        code: '<div className="w-[16px] h-[32px]">Content</div>',
        output: '<div className="w-4 h-8">Content</div>',
        options: [{ cssPath }],
        errors: [
          {
            messageId: 'nonCanonical',
            data: {
              original: 'w-[16px]',
              canonical: 'w-4',
            },
          },
          {
            messageId: 'nonCanonical',
            data: {
              original: 'h-[32px]',
              canonical: 'h-8',
            },
          },
        ],
      },
      {
        code: '<div className={`w-[16px]`}>Content</div>',
        output: '<div className={`w-4`}>Content</div>',
        options: [{ cssPath }],
        errors: [
          {
            messageId: 'nonCanonical',
            data: {
              original: 'w-[16px]',
              canonical: 'w-4',
            },
          },
        ],
      },
      {
        code: "<div className='w-[16px]'>Content</div>",
        output: "<div className='w-4'>Content</div>",
        options: [{ cssPath }],
        errors: [
          {
            messageId: 'nonCanonical',
            data: {
              original: 'w-[16px]',
              canonical: 'w-4',
            },
          },
        ],
      },
      {
        code: '<div className="w-4 w-[16px] h-8">Content</div>',
        output: '<div className="w-4 w-4 h-8">Content</div>',
        options: [{ cssPath }],
        errors: [
          {
            messageId: 'nonCanonical',
            data: {
              original: 'w-[16px]',
              canonical: 'w-4',
            },
          },
        ],
      },
      {
        code: '<div className="w-[20px]">Content</div>',
        output: '<div className="w-5">Content</div>',
        options: [{ cssPath, rootFontSize: 20 }],
        errors: [
          {
            messageId: 'nonCanonical',
            data: {
              original: 'w-[20px]',
              canonical: 'w-5',
            },
          },
        ],
      },
      {
        code: '<div className="w-4">Content</div>',
        options: [{ cssPath: '' }],
        errors: [
          {
            messageId: 'cssNotFound',
            data: {
              path: 'not specified',
            },
          },
        ],
      },
      {
        code: '<div className="w-4">Content</div>',
        options: [{ cssPath: '/non/existent/path.css' }],
        errors: [
          {
            messageId: 'cssNotFound',
            data: {
              path: '/non/existent/path.css',
            },
          },
        ],
      },
    ],
  });
});
