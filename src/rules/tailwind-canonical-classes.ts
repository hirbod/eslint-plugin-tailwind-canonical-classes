import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSyncFn } from 'synckit';
import type { Rule } from 'eslint';

interface RuleOptions {
  cssPath: string;
  rootFontSize?: number;
}

const workerPath = fileURLToPath(
  new URL('./tailwind-worker.js', import.meta.url)
);

const canonicalizeSync = createSyncFn(workerPath) as (
  cssContent: string,
  basePath: string,
  candidates: string[],
  options: { rem?: number }
) => string[];

function canonicalizeClasses(
  cssPath: string,
  candidates: string[],
  rootFontSize: number = 16
): string[] | null {
  if (!fs.existsSync(cssPath)) {
    return null;
  }

  const cssContent = fs.readFileSync(cssPath, 'utf-8');
  const basePath = path.dirname(cssPath);

  return canonicalizeSync(cssContent, basePath, candidates, { rem: rootFontSize });
}

function splitClasses(className: string): string[] {
  return className.trim().split(/\s+/).filter(Boolean);
}

function joinClasses(classes: string[]): string {
  return classes.join(' ');
}

function hasTemplateExpressions(node: any): boolean {
  if (node.type !== 'TemplateLiteral') {
    return false;
  }
  return node.expressions && node.expressions.length > 0;
}

function extractStaticValue(node: any): string | null {
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }
  if (node.type === 'JSXExpressionContainer') {
    return extractStaticValue(node.expression);
  }
  if (node.type === 'TemplateLiteral' && !hasTemplateExpressions(node)) {
    return node.quasis.map((q: any) => q.value.cooked).join('');
  }
  return null;
}

function getQuoteChar(source: string, start: number, end: number): string {
  const quoteChars = ['"', "'", '`'];
  for (const char of quoteChars) {
    if (source[start] === char && source[end - 1] === char) {
      return char;
    }
  }
  return '"';
}

const rule: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce canonical Tailwind CSS class names using Tailwind CSS v4 canonicalization API',
    },
    fixable: 'code',
    messages: {
      nonCanonical:
        "Class '{{original}}' should be '{{canonical}}'",
      cssNotFound: 'Could not load Tailwind CSS file: {{path}}',
    },
    schema: [
      {
        type: 'object',
        properties: {
          cssPath: {
            type: 'string',
          },
          rootFontSize: {
            type: 'number',
          },
        },
        required: ['cssPath'],
        additionalProperties: false,
      },
    ],
  },
  create(context: Rule.RuleContext) {
    const options = context.options[0] as RuleOptions | undefined;

    if (!options || !options.cssPath) {
      context.report({
        node: context.getSourceCode().ast,
        messageId: 'cssNotFound',
        data: {
          path: 'not specified',
        },
      });
      return {};
    }

    let cssPath: string;
    if (path.isAbsolute(options.cssPath)) {
      cssPath = path.normalize(options.cssPath);
    } else {
      cssPath = path.normalize(path.resolve(process.cwd(), options.cssPath));
    }

    const rootFontSize = options.rootFontSize ?? 16;

    if (!fs.existsSync(cssPath)) {
      context.report({
        node: context.getSourceCode().ast,
        messageId: 'cssNotFound',
        data: {
          path: cssPath,
        },
      });
      return {};
    }

    return {
      JSXAttribute(node: any) {
        if (
          node.name.type !== 'JSXIdentifier' ||
          node.name.name !== 'className'
        ) {
          return;
        }

        const staticValue = extractStaticValue(node.value);
        if (staticValue === null) {
          return;
        }

        const classes = splitClasses(staticValue);
        if (classes.length === 0) {
          return;
        }

        const sourceCode = context.getSourceCode();
        const sourceText = sourceCode.getText();
        const errors: Array<{
          node: any;
          original: string;
          canonical: string;
          index: number;
        }> = [];

        try {
          const canonicalized = canonicalizeClasses(cssPath, classes, rootFontSize);
          
          if (canonicalized === null) {
            context.report({
              node,
              messageId: 'cssNotFound',
              data: {
                path: cssPath,
              },
            });
            return;
          }

          classes.forEach((className, index) => {
            const canonical = canonicalized[index];
            if (canonical && canonical !== className) {
              errors.push({
                node,
                original: className,
                canonical,
                index,
              });
            }
          });
        } catch (error) {
          return;
        }

        if (errors.length > 0) {
          const valueNode = node.value;
          let fullRangeStart: number;
          let fullRangeEnd: number;
          let replacementText: string;

          if (valueNode.type === 'Literal') {
            fullRangeStart = valueNode.range[0];
            fullRangeEnd = valueNode.range[1];
            const quoteChar = getQuoteChar(
              sourceText,
              valueNode.range[0],
              valueNode.range[1]
            );
            const fixedClasses = [...classes];
            errors.forEach((error) => {
              fixedClasses[error.index] = error.canonical;
            });
            const fixedValue = joinClasses(fixedClasses);
            replacementText = `${quoteChar}${fixedValue}${quoteChar}`;
          } else if (valueNode.type === 'JSXExpressionContainer') {
            const expr = valueNode.expression;
            if (expr.type === 'TemplateLiteral') {
              fullRangeStart = valueNode.range[0];
              fullRangeEnd = valueNode.range[1];
              const fixedClasses = [...classes];
              errors.forEach((error) => {
                fixedClasses[error.index] = error.canonical;
              });
              const fixedValue = joinClasses(fixedClasses);
              replacementText = `{\`${fixedValue}\`}`;
            } else {
              return;
            }
          } else {
            return;
          }

          errors.forEach((error, errorIndex) => {
            context.report({
              node: error.node,
              messageId: 'nonCanonical',
              data: {
                original: error.original,
                canonical: error.canonical,
              },
              fix:
                errorIndex === 0
                  ? (fixer) => {
                      return fixer.replaceTextRange(
                        [fullRangeStart, fullRangeEnd],
                        replacementText
                      );
                    }
                  : undefined,
            });
          });
        }
      },
    };
  },
};

export default rule;

