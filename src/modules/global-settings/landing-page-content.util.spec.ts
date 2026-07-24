import { sanitizeLandingContentHtml } from './landing-page-content.util';

describe('sanitizeLandingContentHtml', () => {
  it('keeps supported formatting', () => {
    expect(
      sanitizeLandingContentHtml(
        '<h2>Heading</h2><p><strong>Safe</strong> content</p><ul><li>Item</li></ul>',
      ),
    ).toBe(
      '<h2>Heading</h2><p><strong>Safe</strong> content</p><ul><li>Item</li></ul>',
    );
  });

  it('removes executable markup and unsafe attributes', () => {
    expect(
      sanitizeLandingContentHtml(
        '<script>alert(1)</script><p onclick="alert(1)">Text</p><a href="javascript:alert(1)">Link</a>',
      ),
    ).toBe('<p>Text</p><a target="_blank" rel="noopener noreferrer">Link</a>');
  });

  it('keeps safe links and editor font formatting', () => {
    expect(
      sanitizeLandingContentHtml(
        '<font color="#C1121F" size="5">Text</font><a href="https://delivery-way.de">Site</a>',
      ),
    ).toBe(
      '<font color="#C1121F" size="5">Text</font><a href="https://delivery-way.de" target="_blank" rel="noopener noreferrer">Site</a>',
    );
  });
});
