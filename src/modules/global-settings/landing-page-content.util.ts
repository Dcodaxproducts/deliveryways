const ALLOWED_LANDING_CONTENT_TAGS = new Set([
  'a',
  'b',
  'blockquote',
  'br',
  'div',
  'em',
  'font',
  'h1',
  'h2',
  'h3',
  'h4',
  'i',
  'li',
  'ol',
  'p',
  'strong',
  'u',
  'ul',
]);

const ALLOWED_LANDING_CONTENT_ATTRIBUTES = new Set([
  'color',
  'href',
  'rel',
  'size',
  'target',
]);

export const sanitizeLandingContentHtml = (value: string): string => {
  let sanitized = value
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(
      /<\s*(script|style|iframe|object|embed|svg|math|form)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi,
      '',
    )
    .replace(
      /<\/?(script|style|iframe|object|embed|svg|math|form|input|button|textarea|select|meta|link)[^>]*>/gi,
      '',
    )
    .replace(
      /\s(on[a-z]+|style|src|srcset)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,
      '',
    )
    .replace(/\s(href)\s*=\s*(["'])\s*(javascript:|data:)[^"']*\2/gi, '');

  sanitized = sanitized.replace(
    /<\/?([a-z][a-z0-9-]*)([^>]*)>/gi,
    (match, tagName: string, rawAttributes: string) => {
      const tag = tagName.toLowerCase();

      if (!ALLOWED_LANDING_CONTENT_TAGS.has(tag)) {
        return '';
      }

      if (match.startsWith('</')) {
        return `</${tag}>`;
      }

      const attributes = Array.from(
        rawAttributes.matchAll(
          /\s([a-z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
        ),
      )
        .map(
          ([, name, doubleQuotedValue, singleQuotedValue, unquotedValue]) => {
            const attributeName = name.toLowerCase();
            const attributeValue =
              doubleQuotedValue ?? singleQuotedValue ?? unquotedValue ?? '';

            if (!ALLOWED_LANDING_CONTENT_ATTRIBUTES.has(attributeName)) {
              return null;
            }

            if (
              attributeName === 'href' &&
              /^(javascript:|data:)/i.test(attributeValue.trim())
            ) {
              return null;
            }

            if (
              attributeName === 'color' &&
              !/^#[0-9a-f]{3,8}$/i.test(attributeValue.trim())
            ) {
              return null;
            }

            if (
              attributeName === 'size' &&
              !/^[1-7]$/.test(attributeValue.trim())
            ) {
              return null;
            }

            return `${attributeName}="${attributeValue.replace(/"/g, '&quot;')}"`;
          },
        )
        .filter((attribute): attribute is string => attribute !== null)
        .join(' ');
      const safeAttributes = attributes ? ` ${attributes}` : '';

      if (tag === 'a') {
        const hasTarget = /\starget=/.test(safeAttributes);
        const hasRel = /\srel=/.test(safeAttributes);

        return `<a${safeAttributes}${hasTarget ? '' : ' target="_blank"'}${hasRel ? '' : ' rel="noopener noreferrer"'}>`;
      }

      return `<${tag}${safeAttributes}>`;
    },
  );

  return sanitized.trim();
};
