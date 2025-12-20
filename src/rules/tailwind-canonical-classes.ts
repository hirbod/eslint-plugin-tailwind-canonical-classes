import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSyncFn } from 'synckit';
import type { Rule } from 'eslint';

interface RuleOptions {
  cssPath: string;
  rootFontSize?: number;
  calleeFunctions?: string[];
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

function getCalleeName(node: any): string | null {
  if (node.type === 'Identifier') {
    return node.name;
  }
  if (node.type === 'MemberExpression' && node.property.type === 'Identifier') {
    return node.property.name;
  }
  return null;
}

interface StringArg {
  value: string;
  index: number;
  node: any;
  classes: string[];
}

function extractStringArgsFromCallExpression(
  node: any,
  calleeFunctions: string[]
): { calleeName: string; args: StringArg[] } | null {
  if (node.type !== 'CallExpression') {
    return null;
  }

  const calleeName = getCalleeName(node.callee);
  if (!calleeName || !calleeFunctions.includes(calleeName)) {
    return null;
  }

  const args: StringArg[] = [];

  node.arguments.forEach((arg: any, index: number) => {
    if (arg.type === 'Literal' && typeof arg.value === 'string') {
      const classes = splitClasses(arg.value);
      if (classes.length > 0) {
        args.push({
          value: arg.value,
          index,
          node: arg,
          classes,
        });
      }
    }
  });

  return args.length > 0 ? { calleeName, args } : null;
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
          calleeFunctions: {
            type: 'array',
            items: {
              type: 'string',
            },
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
    const calleeFunctions = options.calleeFunctions ?? [
      'cn',
      'clsx',
      'classNames',
      'twMerge',
      'cva',
    ];

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

        const sourceCode = context.getSourceCode();
        const sourceText = sourceCode.getText();

        const staticValue = extractStaticValue(node.value);
        if (staticValue !== null) {
          const classes = splitClasses(staticValue);
          if (classes.length === 0) {
            return;
          }

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
          return;
        }

        if (node.value?.type === 'JSXExpressionContainer') {
          const expr = node.value.expression;
          const callExprData = extractStringArgsFromCallExpression(
            expr,
            calleeFunctions
          );

          if (!callExprData) {
            return;
          }

          const { args } = callExprData;
          const allClasses: string[] = [];
          const argClassMap: Map<number, { start: number; end: number }> = new Map();

          args.forEach((arg) => {
            const startIndex = allClasses.length;
            allClasses.push(...arg.classes);
            const endIndex = allClasses.length;
            argClassMap.set(arg.index, { start: startIndex, end: endIndex });
          });

          if (allClasses.length === 0) {
            return;
          }

          try {
            const canonicalized = canonicalizeClasses(cssPath, allClasses, rootFontSize);
            
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

            const errorsByArg: Map<
              number,
              Array<{
                original: string;
                canonical: string;
                classIndex: number;
              }>
            > = new Map();

            allClasses.forEach((className, classIndex) => {
              const canonical = canonicalized[classIndex];
              if (canonical && canonical !== className) {
                for (const [argIndex, range] of argClassMap.entries()) {
                  if (classIndex >= range.start && classIndex < range.end) {
                    if (!errorsByArg.has(argIndex)) {
                      errorsByArg.set(argIndex, []);
                    }
                    errorsByArg.get(argIndex)!.push({
                      original: className,
                      canonical,
                      classIndex,
                    });
                    break;
                  }
                }
              }
            });

            if (errorsByArg.size > 0) {
              errorsByArg.forEach((errors, argIndex) => {
                const arg = args.find((a) => a.index === argIndex);
                if (!arg) return;

                const argRange = argClassMap.get(argIndex)!;
                const fixedClasses = [...arg.classes];
                
                errors.forEach((error) => {
                  const localIndex = error.classIndex - argRange.start;
                  fixedClasses[localIndex] = error.canonical;
                });

                const fixedValue = joinClasses(fixedClasses);
                const quoteChar = getQuoteChar(
                  sourceText,
                  arg.node.range[0],
                  arg.node.range[1]
                );

                errors.forEach((error, errorIndex) => {
                  context.report({
                    node: arg.node,
                    messageId: 'nonCanonical',
                    data: {
                      original: error.original,
                      canonical: error.canonical,
                    },
                    fix:
                      errorIndex === 0
                        ? (fixer) => {
                            return fixer.replaceTextRange(
                              [arg.node.range[0], arg.node.range[1]],
                              `${quoteChar}${fixedValue}${quoteChar}`
                            );
                          }
                        : undefined,
                  });
                });
              });
            }
          } catch (error) {
            return;
          }
        }
      },
    };
  },
};

export default rule;

